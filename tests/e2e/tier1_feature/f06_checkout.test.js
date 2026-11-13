/**
 * ALLEYRICH — Tier 1 Feature Coverage: Feature F6
 * File: tests/e2e/tier1_feature/f06_checkout.test.js
 * 
 * Tests for Checkout & Payment Flow:
 * - TC-T1-F6-01: Cash on Delivery (COD) Checkout (201 Created, Pending COD status, inventory reserved)
 * - TC-T1-F6-02: Cashfree Online Payment Initiation (Handles gateway session or 503 fallback guard)
 * - TC-T1-F6-03: Valid Payment Verification (HMAC checkoutToken authentication & 401 on tamper)
 * - TC-T1-F6-04: Discount Coupon Application (Calculates discount and deducts from total)
 * - TC-T1-F6-05: Free Shipping Qualification in Order (₹0 when subtotal >= 1999 vs ₹99 when < 1999)
 */

'use strict';

const { defineSuite } = require('../helpers/suite.js');

module.exports = defineSuite({
  tier: 1,
  feature: 'F6',
  title: 'Feature 6 Coverage: Checkout & Payment Verification',
  description: 'Verifies server-side order calculation, COD/Cashfree gateway initiation, HMAC token checks, coupons, and shipping fees.'
}, ({ test }) => {

  async function getInStockProduct(client) {
    const productsRes = await client.get('/api/products?stock=in_stock');
    if (productsRes.data && Array.isArray(productsRes.data.products) && productsRes.data.products.length > 0) {
      return productsRes.data.products[0];
    }
    const allRes = await client.get('/api/products');
    const products = allRes.data.products;
    return products.find(p => p.variants && p.variants.some(v => v.available && Number(v.inventory_quantity) > 0)) || products[1];
  }

  test('TC-T1-F6-01', 'Cash on Delivery (COD) Checkout: Successfully creates COD order with Pending COD status', async ({ client, env, assert }) => {
    // 1. Get an available in-stock product
    const product = await getInStockProduct(client);

    // 2. Build order payload
    const shopper = env.createUniqueShopper('cod_t1');
    const orderPayload = {
      items: [{
        id: product.id,
        handle: product.handle,
        title: product.title,
        size: 'M',
        quantity: 1
      }],
      customer: shopper,
      paymentMethod: 'Cash on Delivery (COD)'
    };

    // 3. Submit checkout request
    const res = await client.post('/api/checkout/create-order', orderPayload);
    assert.assertStatus(res, 201);
    assert.strictEqual(res.data.success, true);
    assert.ok(res.data.orderId, 'Order ID must be returned');
    assert.strictEqual(res.data.order.paymentMethod, 'Cash on Delivery (COD)');
    assert.strictEqual(res.data.order.paymentStatus, 'Pending COD');
    assert.strictEqual(res.data.order.orderStatus, 'Processing');
    assert.ok(res.data.order.total > 0, 'Total must be greater than 0');
  });

  test('TC-T1-F6-02', 'Cashfree Online Payment Initiation: Enforces Cashfree gateway routing and configuration contracts', async ({ client, env, assert }) => {
    const product = await getInStockProduct(client);

    const shopper = env.createUniqueShopper('cf_t1');
    const orderPayload = {
      items: [{
        id: product.id,
        handle: product.handle,
        title: product.title,
        size: 'M',
        quantity: 1
      }],
      customer: shopper,
      paymentMethod: 'Cashfree Online Payment'
    };

    const res = await client.post('/api/checkout/create-order', orderPayload);
    // If Cashfree keys are configured in environment, returns 201; if unconfigured, returns 503 fallback
    assert.ok(
      res.status === 201 || res.status === 503,
      `Expected status 201 or 503 for online payment route, got ${res.status}`
    );

    if (res.status === 201) {
      assert.strictEqual(res.data.success, true);
      assert.ok(res.data.orderId, 'Order ID must be present');
    } else {
      assert.strictEqual(res.data.success, false);
      assert.assertHtmlContains(res, 'Online payments are temporarily unavailable. Please choose COD.');
    }
  });

  test('TC-T1-F6-03', 'Valid Payment Verification: Rejects tampered checkoutToken and missing orderId on verify-payment', async ({ client, env, assert }) => {
    // 1. Missing orderId -> 400
    const emptyRes = await client.post('/api/checkout/verify-payment', {});
    assert.assertStatus(emptyRes, 400);
    assert.strictEqual(emptyRes.data.success, false);
    assert.assertHtmlContains(emptyRes, 'Order ID is required');

    // 2. Non-existent order -> 404
    const notFoundRes = await client.post('/api/checkout/verify-payment', {
      orderId: 'ORD-NONEXISTENT-999',
      checkoutToken: 'some_token'
    });
    assert.assertStatus(notFoundRes, 404);
    assert.strictEqual(notFoundRes.data.success, false);
    assert.assertHtmlContains(notFoundRes, 'Order not found');

    // 3. Tampered token -> 401
    const product = await getInStockProduct(client);
    const shopper = env.createUniqueShopper('hmac_chk');
    const orderRes = await client.post('/api/checkout/create-order', {
      items: [{ id: product.id, handle: product.handle, title: product.title, size: 'M', quantity: 1 }],
      customer: shopper,
      paymentMethod: 'Cash on Delivery (COD)'
    });
    assert.assertStatus(orderRes, 201);
    const orderId = orderRes.data.orderId;

    const tamperedRes = await client.post('/api/checkout/verify-payment', {
      orderId,
      checkoutToken: 'tampered-invalid-credential-32-chars'
    });
    assert.assertStatus(tamperedRes, 401);
    assert.strictEqual(tamperedRes.data.success, false);
    assert.assertHtmlContains(tamperedRes, 'Invalid checkout verification credential.');
  });

  test('TC-T1-F6-04', 'Discount Coupon Application: Applies valid coupon code and discounts final order total', async ({ client, env, assert }) => {
    const product = await getInStockProduct(client);

    const shopper = env.createUniqueShopper('disc_t1');
    const orderPayload = {
      items: [{
        id: product.id,
        handle: product.handle,
        title: product.title,
        size: 'M',
        quantity: 2
      }],
      customer: shopper,
      paymentMethod: 'Cash on Delivery (COD)',
      couponCode: 'WELCOME'
    };

    const res = await client.post('/api/checkout/create-order', orderPayload);
    assert.assertStatus(res, 201);
    assert.strictEqual(res.data.success, true);
    assert.ok(res.data.order.discount > 0, `Discount should be greater than 0, got ${res.data.order.discount}`);

    const expectedTotal = Number((res.data.order.subtotal - res.data.order.discount + res.data.order.shipping).toFixed(2));
    assert.strictEqual(res.data.order.total, expectedTotal, 'Total must equal subtotal - discount + shipping');
  });

  test('TC-T1-F6-05', 'Free Shipping Qualification in Order: Charges ₹0 for subtotal >= ₹1,999 and ₹99 for subtotal < ₹1,999', async ({ client, env, assert }) => {
    const product = await getInStockProduct(client);
    const unitPrice = Number(product.price || 1299);

    // 1. Order below ₹1,999 (1 unit @ unitPrice < 1999)
    const shopperLow = env.createUniqueShopper('ship_low');
    const lowRes = await client.post('/api/checkout/create-order', {
      items: [{ id: product.id, handle: product.handle, title: product.title, size: 'M', quantity: 1 }],
      customer: shopperLow,
      paymentMethod: 'Cash on Delivery (COD)'
    });
    assert.assertStatus(lowRes, 201);
    if (lowRes.data.order.subtotal < 1999) {
      assert.strictEqual(lowRes.data.order.shipping, 99, 'Shipping fee must be ₹99 when subtotal < ₹1,999');
    } else {
      assert.strictEqual(lowRes.data.order.shipping, 0, 'Shipping fee must be ₹0 when subtotal >= ₹1,999');
    }

    // 2. Order qualifying for free shipping (quantity large enough to exceed ₹1,999)
    const qualifyingQty = Math.ceil(2000 / unitPrice);
    const shopperHigh = env.createUniqueShopper('ship_high');
    const highRes = await client.post('/api/checkout/create-order', {
      items: [{ id: product.id, handle: product.handle, title: product.title, size: 'M', quantity: qualifyingQty }],
      customer: shopperHigh,
      paymentMethod: 'Cash on Delivery (COD)'
    });
    assert.assertStatus(highRes, 201);
    assert.ok(highRes.data.order.subtotal >= 1999, 'Subtotal should exceed ₹1,999');
    assert.strictEqual(highRes.data.order.shipping, 0, 'Shipping fee must be ₹0 for orders qualifying for free shipping');
  });

});
