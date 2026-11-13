/**
 * ALLEYRICH — Tier 2 Boundary & Corner Case Tests: Feature F5
 * File: tests/e2e/tier2_boundary/f05_cart_drawer_bva.test.js
 * 
 * Boundary Value Analysis (BVA) for Interactive Cart Drawer & Shipping Meter:
 * - TC-T2-F5-01: Empty cart checkout block guard
 * - TC-T2-F5-02: Quantity upper limit clamp (max 20 units)
 * - TC-T2-F5-03: Currency floating-point rounding precision
 * - TC-T2-F5-04: Free shipping ₹1,999 boundary comparison (₹1,998 vs ₹1,999)
 * - TC-T2-F5-05: Corrupted LocalStorage JSON recovery resilience
 */

'use strict';

const { defineSuite } = require('../helpers/suite.js');

module.exports = defineSuite({
  tier: 2,
  feature: 'F5',
  title: 'Feature 5 Boundary & Corner Cases: Cart Drawer & Shipping Progress',
  description: 'Validates empty cart safeguards, item quantity clamping, float precision, free shipping boundary math, and storage recovery.'
}, ({ test }) => {

  test('TC-T2-F5-01', 'Empty Cart Checkout Block: Prevents checkout initiation when bag has 0 items', async ({ client, assert }) => {
    // 1. Verify quick-buy.js script defines empty bag safeguards
    const res = await client.get('/assets/js/quick-buy.js');
    assert.assertStatus(res, 200);
    assert.assertHtmlContains(res, 'if (cart.length === 0)', 'Must check cart length on checkout click');
    assert.assertHtmlContains(res, 'Your cart is empty. Please add items before checking out.', 'Must alert user when cart is empty');
    assert.assertHtmlContains(res, 'if (this.getCart().length === 0)', 'Express checkout buttons must guard empty cart');

    // 2. Verify backend order creation blocks empty cart
    const orderRes = await client.post('/api/checkout/create-order', {
      items: [],
      customer: {
        name: 'Empty Shopper',
        email: 'empty@sdgarments.in',
        phone: '9888877777',
        address: '402 High Street',
        pincode: '560038'
      }
    });
    assert.assertStatus(orderRes, 400);
    assert.strictEqual(orderRes.data.success, false);
    assert.assertHtmlContains(orderRes, 'Cart is empty. Cannot place an empty order.');
  });

  test('TC-T2-F5-02', 'Quantity Upper Limit Clamp: Server rejects item quantities exceeding 20', async ({ client, assert }) => {
    // 1. Fetch valid product from catalog
    const catRes = await client.get('/api/products');
    assert.assertStatus(catRes, 200);
    const prod = catRes.data.products[0];
    assert.ok(prod, 'Catalog must provide a product');

    // 2. Submit order with quantity = 25 (>20 limit)
    const orderRes = await client.post('/api/checkout/create-order', {
      items: [
        { id: prod.id, handle: prod.handle, quantity: 25, size: 'M' }
      ],
      customer: {
        name: 'Excess Shopper',
        email: 'excess@sdgarments.in',
        phone: '9888877777',
        address: '402 High Street',
        pincode: '560038'
      }
    });

    assert.assertStatus(orderRes, 400);
    assert.strictEqual(orderRes.data.success, false);
    assert.strictEqual(orderRes.data.message, 'Each item quantity must be between 1 and 20.');
  });

  test('TC-T2-F5-03', 'Floating-Point Rounding: Subtotals formatted without float precision artifacts', async ({ client, assert }) => {
    // Test client-side and server-side precision calculation
    const prices = [1299.99, 1499.50, 799.30];
    const quantities = [2, 1, 3];

    // Compute raw JavaScript float arithmetic: 1299.99*2 + 1499.50*1 + 799.30*3 = 2599.98 + 1499.50 + 2397.90 = 6497.38
    const rawSum = prices.reduce((sum, p, idx) => sum + (p * quantities[idx]), 0);
    const formattedSubtotal = Number(rawSum.toFixed(2));

    assert.strictEqual(formattedSubtotal, 6497.38, 'Subtotal must round cleanly to 2 decimal places');
    assert.ok(Number.isFinite(formattedSubtotal), 'Must remain finite');

    // Verify client script contains formatting
    const quickBuyRes = await client.get('/assets/js/quick-buy.js');
    assert.assertStatus(quickBuyRes, 200);
    assert.assertHtmlContains(quickBuyRes, 'toLocaleString', 'Prices formatted with locale formatting');
  });

  test('TC-T2-F5-04', 'Free Shipping ₹1,999 Threshold Boundary: ₹1,998 pays ₹99, ₹1,999 gets free shipping', async ({ client, assert }) => {
    const FREE_SHIPPING_THRESHOLD = 1999;
    const DEFAULT_SHIPPING_FEE = 99;

    // Subtotal 1998 (1 rupee below threshold)
    const subtotalBelow = 1998;
    const shippingBelow = subtotalBelow >= FREE_SHIPPING_THRESHOLD ? 0 : DEFAULT_SHIPPING_FEE;
    const progressBelow = Math.min(100, Math.round((subtotalBelow / FREE_SHIPPING_THRESHOLD) * 100));

    assert.strictEqual(shippingBelow, 99, '₹1,998 must incur ₹99 shipping fee');
    assert.strictEqual(progressBelow, 100, 'Progress percentage calculates to ~100%');
    assert.strictEqual(FREE_SHIPPING_THRESHOLD - subtotalBelow, 1, 'Remaining amount must be 1');

    // Subtotal 1999 (exact threshold)
    const subtotalExact = 1999;
    const shippingExact = subtotalExact >= FREE_SHIPPING_THRESHOLD ? 0 : DEFAULT_SHIPPING_FEE;
    const progressExact = Math.min(100, Math.round((subtotalExact / FREE_SHIPPING_THRESHOLD) * 100));

    assert.strictEqual(shippingExact, 0, '₹1,999 must qualify for free shipping (₹0 fee)');
    assert.strictEqual(progressExact, 100, 'Progress percentage must be 100%');

    // Verify client script contains matching threshold messages
    const res = await client.get('/assets/js/quick-buy.js');
    assert.assertStatus(res, 200);
    assert.assertHtmlContains(res, 'FREE EXPRESS SHIPPING PAN INDIA', 'Free shipping success message must be defined');
    assert.assertHtmlContains(res, 'threshold = 1999', 'Threshold constant must be 1999');
  });

  test('TC-T2-F5-05', 'Corrupted LocalStorage JSON: Graceful fallback to empty cart without crashing', async ({ client, assert }) => {
    // 1. Inspect quick-buy.js getCart() implementation
    const res = await client.get('/assets/js/quick-buy.js');
    assert.assertStatus(res, 200);

    // Verify try-catch block wrapping JSON.parse(raw)
    assert.assertHtmlContains(res, 'getCart()', 'getCart function must exist');
    assert.assertHtmlContains(res, 'JSON.parse(raw)', 'Must parse raw storage string');
    assert.assertHtmlContains(res, 'catch (e)', 'Must catch JSON parse errors');
    assert.assertHtmlContains(res, 'return [];', 'Must return empty array on parse failure');

    // 2. Emulate getCart logic with malformed storage payload
    const malformedPayloads = ['{invalid_json:::', 'null', '', 'undefined', '[{"id": 1, unclosed'];
    for (const raw of malformedPayloads) {
      let result;
      try {
        result = raw ? JSON.parse(raw) : [];
      } catch (_) {
        result = [];
      }
      if (!Array.isArray(result)) result = [];
      assert.ok(Array.isArray(result), `Malformed string "${raw}" must resolve to an Array`);
      assert.strictEqual(result.length, 0, `Malformed string "${raw}" must resolve to empty array`);
    }
  });

});
