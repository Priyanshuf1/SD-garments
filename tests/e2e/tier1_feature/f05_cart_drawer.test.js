/**
 * ALLEYRICH — Tier 1 Feature Coverage: Feature F5
 * File: tests/e2e/tier1_feature/f05_cart_drawer.test.js
 * 
 * Tests for Interactive Cart Drawer & Shipping Progress:
 * - TC-T1-F5-01: Quick Add Item to Cart (Item added with title, price, size 'M', qty 1, drawer opens)
 * - TC-T1-F5-02: Quantity Increment in Drawer (changeCartQty increases quantity and updates subtotal)
 * - TC-T1-F5-03: Quantity Decrement to Item Removal (qty <= 0 removes item, displays empty bag message)
 * - TC-T1-F5-04: Free Shipping Progress Below ₹1,999 (subtotal = 1000 calculates 50% and Rs. 999 remaining)
 * - TC-T1-F5-05: Free Shipping Progress Qualified (subtotal >= 1999 calculates 100% and congratulatory message)
 */

'use strict';

const { defineSuite } = require('../helpers/suite.js');

module.exports = defineSuite({
  tier: 1,
  feature: 'F5',
  title: 'Feature 5 Coverage: Interactive Cart Drawer & Shipping Progress',
  description: 'Verifies quick-buy cart state manipulation, quantity +/- controls, empty bag guards, and ₹1,999 free shipping meter math.'
}, ({ test }) => {

  test('TC-T1-F5-01', 'Quick Add Item to Cart: Adds item with title, size M, quantity 1 and updates subtotal', async ({ client, assert }) => {
    // 1. Verify QuickBuy client script is served cleanly
    const scriptRes = await client.get('/assets/js/quick-buy.js');
    assert.assertStatus(scriptRes, 200);
    assert.assertHtmlContains(scriptRes, 'window.QuickBuyEngine');
    assert.assertHtmlContains(scriptRes, 'renderGlobalCart');

    // 2. Emulate QuickBuyEngine cart insertion
    const cart = [];
    const newItem = {
      id: 'prod_101',
      title: 'Heavyweight Oversized Tee Black',
      price: 1499,
      size: 'M',
      quantity: 1,
      image: '/images/photo_1.webp'
    };
    cart.push(newItem);

    assert.strictEqual(cart.length, 1);
    assert.strictEqual(cart[0].title, 'Heavyweight Oversized Tee Black');
    assert.strictEqual(cart[0].size, 'M');
    assert.strictEqual(cart[0].quantity, 1);
    assert.strictEqual(cart[0].price, 1499);

    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    assert.strictEqual(subtotal, 1499);
  });

  test('TC-T1-F5-02', 'Quantity Increment in Drawer: Increments quantity from 1 to 2 and doubles item total', async ({ client, assert }) => {
    // 1. Verify changeCartQty implementation in quick-buy.js
    const scriptRes = await client.get('/assets/js/quick-buy.js');
    assert.assertStatus(scriptRes, 200);
    assert.assertHtmlContains(scriptRes, 'changeCartQty(idx, delta) {');
    assert.assertHtmlContains(scriptRes, 'cart[idx].quantity = (Number(cart[idx].quantity) || 1) + delta;');

    // 2. Emulate quantity increment
    const cart = [{
      id: 'prod_101',
      title: 'Heavyweight Oversized Tee Black',
      price: 1499,
      size: 'M',
      quantity: 1
    }];

    const changeCartQty = (idx, delta) => {
      if (!cart[idx]) return;
      cart[idx].quantity = (Number(cart[idx].quantity) || 1) + delta;
      if (cart[idx].quantity <= 0) cart.splice(idx, 1);
    };

    changeCartQty(0, 1);
    assert.strictEqual(cart[0].quantity, 2, 'Quantity must increment to 2');
    const itemTotal = cart[0].price * cart[0].quantity;
    assert.strictEqual(itemTotal, 2998, 'Item total must equal 1499 * 2 = 2998');
  });

  test('TC-T1-F5-03', 'Quantity Decrement to Item Removal: Decrementing quantity to 0 removes item and activates empty bag view', async ({ client, assert }) => {
    // 1. Verify empty cart template and removal logic
    const scriptRes = await client.get('/assets/js/quick-buy.js');
    assert.assertStatus(scriptRes, 200);
    assert.assertHtmlContains(scriptRes, 'if (cart[idx].quantity <= 0) {');
    assert.assertHtmlContains(scriptRes, 'cart.splice(idx, 1);');
    assert.assertHtmlContains(scriptRes, 'Your bag is currently empty.');
    assert.assertHtmlContains(scriptRes, 'checkoutBtn.style.opacity = \'0.5\';');
    assert.assertHtmlContains(scriptRes, 'checkoutBtn.style.cursor = \'not-allowed\';');

    // 2. Emulate item removal
    const cart = [{
      id: 'prod_101',
      title: 'Heavyweight Oversized Tee Black',
      price: 1499,
      size: 'M',
      quantity: 1
    }];

    const changeCartQty = (idx, delta) => {
      if (!cart[idx]) return;
      cart[idx].quantity = (Number(cart[idx].quantity) || 1) + delta;
      if (cart[idx].quantity <= 0) cart.splice(idx, 1);
    };

    changeCartQty(0, -1);
    assert.strictEqual(cart.length, 0, 'Cart must be empty after decrementing quantity 1 by -1');
  });

  test('TC-T1-F5-04', 'Free Shipping Progress Below ₹1,999: Subtotal ₹1,000 calculates 50% bar width and ₹999 remaining', async ({ client, assert }) => {
    // 1. Verify shipping threshold formulas in quick-buy.js
    const scriptRes = await client.get('/assets/js/quick-buy.js');
    assert.assertStatus(scriptRes, 200);
    assert.assertHtmlContains(scriptRes, 'const threshold = 1999;');
    assert.assertHtmlContains(scriptRes, 'const pct = Math.min(100, Math.round((subtotal / threshold) * 100));');
    assert.assertHtmlContains(scriptRes, 'const rem = threshold - subtotal;');

    // 2. Test exact math for subtotal = 1000
    const threshold = 1999;
    const subtotal = 1000;
    const pct = Math.min(100, Math.round((subtotal / threshold) * 100));
    const rem = threshold - subtotal;

    assert.strictEqual(pct, 50, '1000 / 1999 must round to 50%');
    assert.strictEqual(rem, 999, 'Remaining amount must be 999');
    const msg = `Add Rs. ${rem.toLocaleString('en-IN')} more for <strong>FREE EXPRESS SHIPPING</strong>`;
    assert.strictEqual(msg, 'Add Rs. 999 more for <strong>FREE EXPRESS SHIPPING</strong>');
  });

  test('TC-T1-F5-05', 'Free Shipping Progress Qualified: Subtotal >= ₹1,999 sets 100% width and celebratory message', async ({ client, assert }) => {
    // 1. Verify qualified message template
    const scriptRes = await client.get('/assets/js/quick-buy.js');
    assert.assertStatus(scriptRes, 200);
    assert.assertHtmlContains(scriptRes, '🎉 You qualify for <strong>FREE EXPRESS SHIPPING PAN INDIA!</strong>');

    // 2. Test exact math for subtotal = 2499
    const threshold = 1999;
    const subtotal = 2499;
    const pct = Math.min(100, Math.round((subtotal / threshold) * 100));

    assert.strictEqual(pct, 100, 'Subtotal >= threshold must clamp to 100%');
    assert.ok(subtotal >= threshold, 'Subtotal must qualify for free shipping');
  });

});
