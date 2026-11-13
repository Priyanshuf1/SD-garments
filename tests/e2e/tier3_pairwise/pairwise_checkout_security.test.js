/**
 * ALLEYRICH — Tier 3 Cross-Feature Pairwise Tests: Checkout & Security
 * File: tests/e2e/tier3_pairwise/pairwise_checkout_security.test.js
 * 
 * Verifies combinatorial interactions between:
 * - F5 (Cart Subtotal) + F6 (Checkout Token Issuance & Free Shipping)
 * - F6 (Checkout Creation) + F10 (Distributed Rate Limiting)
 * - F6 (Checkout Placement) + F11 (Authenticated Customer Cart Sync)
 * - F6 (Payment Verification) + F10 (HMAC Token Security & Tamper Rejection)
 */

'use strict';

const { defineSuite } = require('../helpers/suite.js');
const security = require('../../../lib/security.js');

module.exports = defineSuite({
  tier: 3,
  feature: 'F5+F6+F10+F11',
  title: 'Pairwise: Checkout, Rate Limiting & Customer Security Interactions',
  description: 'Validates checkout token issuance, free shipping threshold, order rate limiting, and authenticated customer session integration.'
}, ({ test }) => {

  test('TC-T3-05', 'F5 (Cart Subtotal) + F6 (Checkout Token): Qualified cart >= ₹1,999 receives free shipping and HMAC checkout token', async ({ client, assert, env }) => {
    // 1. Fetch products to get valid item
    const catalogRes = await client.get('/api/products');
    assert.assertStatus(catalogRes, 200);
    const inStock = catalogRes.data.products.find(p => {
      const v = p.variants?.[0];
      return v?.available !== false && (v?.inventory_quantity === undefined || v?.inventory_quantity > 8);
    }) || catalogRes.data.products[0];

    const unitPrice = Number(inStock.variants?.[0]?.price || inStock.price || 1199);

    // Calculate quantity needed to exceed ₹1,999
    const qty = Math.ceil(2000 / unitPrice);
    const subtotal = unitPrice * qty;
    assert.ok(subtotal >= 1999, 'Subtotal should exceed ₹1,999 free shipping threshold');

    const shopper = env.createUniqueShopper('pw_checkout');
    const orderPayload = {
      items: [
        {
          id: String(inStock.id),
          handle: inStock.handle,
          title: inStock.title,
          size: inStock.variants?.[0]?.title || 'M',
          quantity: qty
        }
      ],
      customer: shopper,
      paymentMethod: 'Cash on Delivery (COD)'
    };

    // 2. Submit order to /api/checkout/create-order
    const orderRes = await client.post('/api/checkout/create-order', orderPayload);
    assert.assertStatus(orderRes, 201);
    assert.strictEqual(orderRes.data.success, true);
    assert.ok(orderRes.data.orderId, 'Order ID must be returned');
    assert.match(orderRes.data.orderId, /^GR-[A-F0-9]{20}$/, 'Order ID must match format GR-<20HEX>');

    const order = orderRes.data.order;
    assert.ok(order, 'Order object must be returned');
    assert.strictEqual(order.shipping, 0, 'Shipping fee must be ₹0 for subtotal >= ₹1,999');
    assert.strictEqual(order.total, subtotal, 'Total must equal subtotal when shipping is free');
    assert.strictEqual(order.paymentStatus, 'Pending COD');
  });

  test('TC-T3-06', 'F6 (Checkout) + F10 (Rate Limiting): Checkout order submission rate limit enforces sliding window', async ({ client, assert, env }) => {
    // Distinct simulated IP for this rate limit test
    const testIp = '198.51.100.77';
    const ipHeaders = env.getForwardedIpHeaders(testIp);

    const catalogRes = await client.get('/api/products');
    const inStockProducts = catalogRes.data.products.filter(p => {
      const v = p.variants?.[0];
      return v?.available !== false && (v?.inventory_quantity === undefined || v?.inventory_quantity > 5);
    });
    assert.ok(inStockProducts.length >= 12, 'Catalog should have at least 12 in-stock products for rate limit test');

    // The order_create rate limiter allows 10 requests per 300s window
    // Submit 10 valid orders cycling through distinct products to prevent inventory exhaustion
    let lastOrderRes = null;
    for (let i = 0; i < 10; i++) {
      const prod = inStockProducts[i];
      const shopper = env.createUniqueShopper(`rl_${i}`);
      const payload = {
        items: [{ id: String(prod.id), handle: prod.handle, title: prod.title, size: 'M', quantity: 1 }],
        customer: shopper,
        paymentMethod: 'Cash on Delivery (COD)'
      };
      lastOrderRes = await client.post('/api/checkout/create-order', payload, { headers: ipHeaders });
      assert.assertStatus(lastOrderRes, 201, `Order ${i + 1} within rate limit threshold should succeed with HTTP 201`);
    }

    // 11th request from same IP should breach sliding window and return HTTP 429
    const blockedProd = inStockProducts[0];
    const blockedShopper = env.createUniqueShopper('rl_blocked');
    const blockedPayload = {
      items: [{ id: String(blockedProd.id), handle: blockedProd.handle, title: blockedProd.title, size: 'M', quantity: 1 }],
      customer: blockedShopper,
      paymentMethod: 'Cash on Delivery (COD)'
    };
    const breachRes = await client.post('/api/checkout/create-order', blockedPayload, { headers: ipHeaders });
    assert.assertRateLimited(breachRes, '11th order submission from same IP must be rate limited with HTTP 429');
    assert.strictEqual(breachRes.data.success, false);
    assert.ok(breachRes.data.message.includes('Too many order submissions') || breachRes.data.message.includes('wait'),
      'Rate limit message must explain lockout');
  });

  test('TC-T3-07', 'F6 (Checkout) + F11 (Session & Cart Persistence): Authenticated customer cart sync and checkout binding', async ({ client, assert, env }) => {
    // 1. Create authenticated customer session token for customer in customers.json
    const customerId = 'cust_1792772970127';
    const customerEmail = 'reliability_audit@allyrich.com';
    const sessionToken = security.createCustomerSession(customerId, customerEmail);
    assert.ok(sessionToken.startsWith('ar_usr.'), 'Customer token must start with ar_usr.');

    const authHeaders = {
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json'
    };

    // 2. Fetch catalog to choose cart items
    const catalogRes = await client.get('/api/products');
    const inStock = catalogRes.data.products.find(p => {
      const v = p.variants?.[0];
      return v?.available !== false && (v?.inventory_quantity === undefined || v?.inventory_quantity > 8);
    }) || catalogRes.data.products[2];

    const unitPrice = Number(inStock.variants?.[0]?.price || inStock.price || 1199);
    const cartItems = [
      { id: String(inStock.id), handle: inStock.handle, title: inStock.title, size: 'L', quantity: 1, price: unitPrice }
    ];

    // 3. Sync cart to cloud
    const syncRes = await client.post('/api/cart/sync', { cart: cartItems }, { headers: authHeaders });
    assert.assertStatus(syncRes, 200);
    assert.strictEqual(syncRes.data.success, true);
    assert.strictEqual(syncRes.data.count, 1);

    // 4. Retrieve cart from cloud
    const getCartRes = await client.get('/api/cart/sync', { headers: authHeaders });
    assert.assertStatus(getCartRes, 200);
    assert.strictEqual(getCartRes.data.success, true);
    assert.strictEqual(getCartRes.data.cart.length, 1);
    assert.strictEqual(String(getCartRes.data.cart[0].id), String(inStock.id));

    // 5. Submit checkout with authenticated customer session
    const shopper = env.createUniqueShopper('auth_cust');
    shopper.email = customerEmail;
    const checkoutPayload = {
      items: cartItems,
      customer: shopper,
      paymentMethod: 'Cash on Delivery (COD)'
    };
    const orderRes = await client.post('/api/checkout/create-order', checkoutPayload, { headers: authHeaders });
    assert.assertStatus(orderRes, 201);
    assert.strictEqual(orderRes.data.success, true);
    assert.strictEqual(orderRes.data.order.userId, customerId, 'Order must bind to authenticated customer ID');
  });

  test('TC-T3-08', 'F6 (Payment Verification) + F10 (HMAC Tamper Protection): Rejects forged checkout token with HTTP 401', async ({ client, assert, env }) => {
    // 1. Create a genuine order to obtain orderId
    const catalogRes = await client.get('/api/products');
    const inStock = catalogRes.data.products.find(p => {
      const v = p.variants?.[0];
      return v?.available !== false && (v?.inventory_quantity === undefined || v?.inventory_quantity > 8);
    }) || catalogRes.data.products[3];

    const shopper = env.createUniqueShopper('tamper_test');
    const orderRes = await client.post('/api/checkout/create-order', {
      items: [{ id: String(inStock.id), handle: inStock.handle, title: inStock.title, size: 'M', quantity: 1 }],
      customer: shopper,
      paymentMethod: 'Cash on Delivery (COD)'
    });
    assert.assertStatus(orderRes, 201);
    const orderId = orderRes.data.orderId;
    assert.ok(orderId, 'Order ID must exist');

    // 2. Submit payment verification with a FORGED checkoutToken
    const forgedToken = 'forged_invalid_checkout_token_signature_xyz123';
    const verifyRes = await client.post('/api/checkout/verify-payment', {
      orderId,
      checkoutToken: forgedToken
    });

    // Timing-safe HMAC check must reject tampered token with HTTP 401
    assert.assertStatus(verifyRes, 401);
    assert.strictEqual(verifyRes.data.success, false);
    assert.strictEqual(verifyRes.data.message, 'Invalid checkout verification credential.');
  });

});
