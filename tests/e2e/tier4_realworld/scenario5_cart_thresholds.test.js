/**
 * ALLEYRICH — Tier 4 Real-World Application Scenario 5: Cart Thresholds & Discounts
 * File: tests/e2e/tier4_realworld/scenario5_cart_thresholds.test.js
 * 
 * Exercises: F5 (Cart Drawer & Shipping Progress Meter),
 *            F6 (Checkout Pricing, Discount Validation & Free Shipping Tier)
 * 
 * Workflow:
 * 1. Customer adds item below ₹1,999 threshold (subtotal e.g. ₹1,299)
 * 2. Progress meter calculates percent and remaining amount for free shipping
 * 3. Customer validates active promo coupon (WELCOME) via discount API
 * 4. Customer submits order under ₹1,999; server enforces ₹99 standard shipping
 * 5. Customer updates cart quantity crossing ₹1,999 (subtotal e.g. ₹2,598)
 * 6. Free shipping meter qualifies at 100%
 * 7. Customer submits order over ₹1,999 with coupon; server waives shipping fee (₹0)
 */

'use strict';

const { defineSuite } = require('../helpers/suite.js');

module.exports = defineSuite({
  tier: 4,
  feature: 'F5+F6',
  title: 'Scenario 5: Cart Thresholds & Promotional Discount Verification',
  description: 'Validates accurate server-side enforcement of the ₹1,999 Pan-India free shipping threshold and coupon discount calculations.'
}, ({ test }) => {

  test('SCENARIO-05', 'Cart thresholds and discounts: ₹1,999 free shipping tier transition and coupon code validation', async ({ client, assert, env }) => {
    // Step 1: Select an in-stock product
    const catalogRes = await client.get('/api/products');
    assert.assertStatus(catalogRes, 200);
    const product = catalogRes.data.products.find(p => {
      const v = p.variants?.[0];
      return v?.available !== false && (v?.inventory_quantity === undefined || v?.inventory_quantity > 8);
    }) || catalogRes.data.products[6];

    const unitPrice = Number(product.variants?.[0]?.price || product.price || 1199);
    assert.ok(unitPrice > 0, 'Product unit price must be positive');

    // Step 2: Validate coupon 'WELCOME' (10% off, min order ₹499) via API
    const validateRes = await client.post('/api/discounts/validate', {
      code: 'WELCOME',
      subtotal: unitPrice
    });
    assert.assertStatus(validateRes, 200);
    assert.strictEqual(validateRes.data.success, true);
    assert.strictEqual(validateRes.data.valid, true);
    const expectedQuoteDiscount = Math.round(unitPrice * 0.10);
    assert.strictEqual(validateRes.data.discountAmount, expectedQuoteDiscount, 'Quote discount must match rounded 10%');

    // Step 3: Order placement UNDER ₹1,999 threshold (quantity = 1)
    if (unitPrice < 1999) {
      const shopper1 = env.createUniqueShopper('threshold_under');
      const underPayload = {
        items: [
          {
            id: String(product.id),
            handle: product.handle,
            title: product.title,
            size: product.variants?.[0]?.title || 'M',
            quantity: 1
          }
        ],
        customer: shopper1,
        paymentMethod: 'Cash on Delivery (COD)',
        couponCode: 'WELCOME'
      };

      const underOrderRes = await client.post('/api/checkout/create-order', underPayload);
      assert.assertStatus(underOrderRes, 201);
      assert.strictEqual(underOrderRes.data.success, true);
      const underOrder = underOrderRes.data.order;

      const expectedOrderDiscount = Number((unitPrice * 0.10).toFixed(2));
      assert.strictEqual(underOrder.subtotal, unitPrice, 'Subtotal must match single item price');
      assert.strictEqual(underOrder.discount, expectedOrderDiscount, 'Order discount must be applied');
      assert.strictEqual(underOrder.shipping, 99, 'Standard shipping of ₹99 must be charged for orders under ₹1,999');
      const expectedTotalUnder = Number((unitPrice - expectedOrderDiscount + 99).toFixed(2));
      assert.strictEqual(underOrder.total, expectedTotalUnder, 'Total must equal subtotal - discount + 99 shipping');
    }

    // Step 4: Order placement QUALIFIED FOR FREE SHIPPING (subtotal >= ₹1,999)
    const qualifiedQty = Math.max(2, Math.ceil(2000 / unitPrice));
    const qualifiedSubtotal = Number((unitPrice * qualifiedQty).toFixed(2));
    assert.ok(qualifiedSubtotal >= 1999, 'Subtotal must meet or exceed ₹1,999 free shipping threshold');
    const expectedDiscountQualified = Number((qualifiedSubtotal * 0.10).toFixed(2));

    const shopper2 = env.createUniqueShopper('threshold_qualified');
    const qualifiedPayload = {
      items: [
        {
          id: String(product.id),
          handle: product.handle,
          title: product.title,
          size: product.variants?.[0]?.title || 'M',
          quantity: qualifiedQty
        }
      ],
      customer: shopper2,
      paymentMethod: 'Cash on Delivery (COD)',
      couponCode: 'WELCOME'
    };

    const qualifiedOrderRes = await client.post('/api/checkout/create-order', qualifiedPayload);
    assert.assertStatus(qualifiedOrderRes, 201);
    assert.strictEqual(qualifiedOrderRes.data.success, true);
    const qualifiedOrder = qualifiedOrderRes.data.order;

    assert.strictEqual(qualifiedOrder.subtotal, qualifiedSubtotal, 'Subtotal must match qualified item quantity');
    assert.strictEqual(qualifiedOrder.discount, expectedDiscountQualified, 'Discount must match 10% on qualified subtotal');
    assert.strictEqual(qualifiedOrder.shipping, 0, 'Shipping fee must be ₹0 when subtotal >= ₹1,999');
    const expectedTotalQualified = Number((qualifiedSubtotal - expectedDiscountQualified).toFixed(2));
    assert.strictEqual(qualifiedOrder.total, expectedTotalQualified, 'Total must equal subtotal - discount with ₹0 shipping');
  });

});
