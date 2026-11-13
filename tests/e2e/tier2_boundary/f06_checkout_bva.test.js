/**
 * ALLEYRICH — Tier 2 Boundary & Corner Case Tests: Feature F6
 * File: tests/e2e/tier2_boundary/f06_checkout_bva.test.js
 * 
 * Boundary Value Analysis (BVA) for Checkout & Payment Verification:
 * - TC-T2-F6-01: Empty items array rejection (HTTP 400)
 * - TC-T2-F6-02: Forged/tampered HMAC checkoutToken rejection (HTTP 401)
 * - TC-T2-F6-03: Invalid Indian PIN code & phone boundary validation (HTTP 400)
 * - TC-T2-F6-04: Non-existent product in catalog rejection (HTTP 400)
 * - TC-T2-F6-05: Non-existent order payment verification lookup (HTTP 404)
 */

'use strict';

const { defineSuite } = require('../helpers/suite.js');

module.exports = defineSuite({
  tier: 2,
  feature: 'F6',
  title: 'Feature 6 Boundary & Corner Cases: Checkout & Payment Flow',
  description: 'Validates HMAC signature security, pincode/phone boundary checks, empty order barriers, and non-existent entity handling.'
}, ({ test }) => {

  test('TC-T2-F6-01', 'Empty Items Array: Rejects order submission with HTTP 400', async ({ client, assert, env }) => {
    const shopper = env.createUniqueShopper('empty_cart');
    const res = await client.post('/api/checkout/create-order', {
      items: [],
      customer: shopper,
      paymentMethod: 'Cash on Delivery (COD)'
    });

    assert.assertStatus(res, 400);
    assert.strictEqual(res.data.success, false);
    assert.strictEqual(res.data.message, 'Cart is empty. Cannot place an empty order.');
  });

  test('TC-T2-F6-02', 'Forged Checkout Token: Timing-safe HMAC rejection returns HTTP 401', async ({ client, assert, env }) => {
    // 1. Fetch an in-stock product from catalog
    const catRes = await client.get('/api/products?stock=in_stock');
    assert.assertStatus(catRes, 200);
    const prod = catRes.data.products.find(p => p.variants?.[0]?.available !== false && (p.variants?.[0]?.inventory_quantity ?? 0) > 0);
    assert.ok(prod, 'Must find an in-stock product');

    const shopper = env.createUniqueShopper('hmac_tamper');
    const createRes = await client.post('/api/checkout/create-order', {
      items: [
        { id: prod.id, handle: prod.handle, quantity: 1, size: prod.variants?.[0]?.title || 'Default' }
      ],
      customer: shopper,
      paymentMethod: 'Cash on Delivery (COD)'
    });

    assert.assertStatus(createRes, 201);
    const orderId = createRes.data.orderId || createRes.data.order?.id;
    assert.ok(orderId, 'Order must be created with ID');

    // 2. Submit payment verification with a tampered/bogus checkoutToken
    const tamperedToken = 'forged_tampered_hmac_checkout_token_12345';
    const verifyRes = await client.post('/api/checkout/verify-payment', {
      orderId,
      checkoutToken: tamperedToken
    });

    assert.assertStatus(verifyRes, 401);
    assert.strictEqual(verifyRes.data.success, false);
    assert.strictEqual(verifyRes.data.message, 'Invalid checkout verification credential.');
  });

  test('TC-T2-F6-03', 'Invalid Indian PIN & Phone: Rejects malformed contact credentials with HTTP 400', async ({ client, assert, env }) => {
    const catRes = await client.get('/api/products?stock=in_stock');
    assert.assertStatus(catRes, 200);
    const prod = catRes.data.products.find(p => p.variants?.[0]?.available !== false && (p.variants?.[0]?.inventory_quantity ?? 0) > 0);
    assert.ok(prod, 'Must find an in-stock product');

    // Invalid PIN codes (starts with 0, or too short, or non-numeric)
    const invalidPins = ['012345', '999', 'ABCDEF'];
    for (const pincode of invalidPins) {
      const shopper = env.createUniqueShopper('bad_pin');
      shopper.pincode = pincode;

      const res = await client.post('/api/checkout/create-order', {
        items: [{ id: prod.id, handle: prod.handle, quantity: 1, size: prod.variants?.[0]?.title || 'Default' }],
        customer: shopper
      });

      assert.assertStatus(res, 400);
      assert.strictEqual(res.data.success, false);
      assert.strictEqual(res.data.message, 'Valid name, email, Indian phone, address and 6-digit pincode are required.');
    }

    // Invalid Phone numbers (not starting with 6-9 or too short)
    const invalidPhones = ['12345', '1234567890'];
    for (const phone of invalidPhones) {
      const shopper = env.createUniqueShopper('bad_phone');
      shopper.phone = phone;

      const res = await client.post('/api/checkout/create-order', {
        items: [{ id: prod.id, handle: prod.handle, quantity: 1, size: prod.variants?.[0]?.title || 'Default' }],
        customer: shopper
      });

      assert.assertStatus(res, 400);
      assert.strictEqual(res.data.success, false);
      assert.strictEqual(res.data.message, 'Valid name, email, Indian phone, address and 6-digit pincode are required.');
    }
  });

  test('TC-T2-F6-04', 'Non-Existent Product: Rejects unavailable catalog items with HTTP 400', async ({ client, assert, env }) => {
    const shopper = env.createUniqueShopper('ghost_item');
    const res = await client.post('/api/checkout/create-order', {
      items: [
        { id: 'non_existent_sku_9999999', handle: 'ghost-hoodie-never-existed', quantity: 1 }
      ],
      customer: shopper
    });

    assert.assertStatus(res, 400);
    assert.strictEqual(res.data.success, false);
    assert.strictEqual(res.data.message, 'One or more cart items are no longer available.');
  });

  test('TC-T2-F6-05', 'Non-Existent Order Payment Verification: Returns HTTP 404', async ({ client, assert }) => {
    const res = await client.post('/api/checkout/verify-payment', {
      orderId: 'ORD-NONEXISTENT-GHOST-99999',
      checkoutToken: 'some_arbitrary_token'
    });

    assert.assertStatus(res, 404);
    assert.strictEqual(res.data.success, false);
    assert.strictEqual(res.data.message, 'Order not found');
  });

});
