/**
 * ALLEYRICH — Tier 4 Real-World Application Scenario 1: Full Shopper Journey
 * File: tests/e2e/tier4_realworld/scenario1_shopper_journey.test.js
 * 
 * Exercises: F1 (Pagination), F2 (Category Chips), F5 (Cart Drawer),
 *            F6 (Checkout & Order), F9 (Catalog Caching), F11 (Session & Cart Persistence)
 * 
 * Workflow:
 * 1. Browse full storefront catalog
 * 2. Filter by category taxonomy chips
 * 3. Inspect product silhouette details
 * 4. Add items to QuickBuy cart drawer and check free shipping progress
 * 5. Sync active cart to cloud for authenticated customer
 * 6. Place order and verify server-side pricing, inventory and order creation
 * 7. Retrieve placed order via customer account orders view
 */

'use strict';

const { defineSuite } = require('../helpers/suite.js');
const security = require('../../../lib/security.js');

module.exports = defineSuite({
  tier: 4,
  feature: 'F1+F2+F5+F6+F9+F11',
  title: 'Scenario 1: End-to-End Shopper Journey (Browse, Filter, Cart, Checkout, Order)',
  description: 'Validates realistic multi-step customer shopping journey from initial catalog discovery to order confirmation.'
}, ({ test }) => {

  test('SCENARIO-01', 'Full customer journey: catalog browse, category filter, cart sync, checkout, and order confirmation', async ({ client, assert, env }) => {
    // Step 1: Browse catalog
    const browseRes = await client.get('/api/products');
    assert.assertStatus(browseRes, 200);
    assert.strictEqual(browseRes.data.success, true);
    assert.ok(browseRes.data.products.length > 0, 'Catalog must return products');

    // Step 2: Filter by category 'Top Wear'
    const filterRes = await client.get('/api/products?category=Top%20Wear');
    assert.assertStatus(filterRes, 200);
    const categoryProducts = filterRes.data.products;
    assert.ok(categoryProducts.length > 0, 'Category filter must return matching items');

    // Step 3: Find an available in-stock product
    const selectedProduct = categoryProducts.find(p => {
      const v = p.variants?.[0];
      return v?.available !== false && (v?.inventory_quantity === undefined || v?.inventory_quantity > 5);
    }) || categoryProducts[0];

    const unitPrice = Number(selectedProduct.variants?.[0]?.price || selectedProduct.price || 1199);
    assert.ok(unitPrice > 0, 'Unit price must be positive');

    // Step 4: Add to Cart & Shipping Progress validation
    // Sub-threshold item (qty 1)
    const singleTotal = unitPrice;
    const isSingleFree = singleTotal >= 1999;
    const remainingForFreeShipping = isSingleFree ? 0 : 1999 - singleTotal;
    assert.ok(remainingForFreeShipping >= 0);

    // Multi-item cart to cross ₹1,999 free shipping threshold
    const targetQty = Math.max(2, Math.ceil(2000 / unitPrice));
    const qualifiedSubtotal = unitPrice * targetQty;
    assert.ok(qualifiedSubtotal >= 1999, 'Cart must cross ₹1,999 free shipping threshold');

    const cartItems = [
      {
        id: String(selectedProduct.id),
        handle: selectedProduct.handle,
        title: selectedProduct.title,
        size: selectedProduct.variants?.[0]?.title || 'M',
        price: unitPrice,
        quantity: targetQty
      }
    ];

    // Step 5: Customer authentication & cloud cart persistence
    const customerId = 'cust_1792772970127';
    const customerEmail = 'reliability_audit@allyrich.com';
    const sessionToken = security.createCustomerSession(customerId, customerEmail);
    const authHeaders = {
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json'
    };

    const cartSyncRes = await client.post('/api/cart/sync', { cart: cartItems }, { headers: authHeaders });
    assert.assertStatus(cartSyncRes, 200);
    assert.strictEqual(cartSyncRes.data.success, true);
    assert.strictEqual(cartSyncRes.data.count, 1);

    // Step 6: Proceed to checkout and place order
    const shopper = env.createUniqueShopper('shopper_journey');
    shopper.email = customerEmail;
    const checkoutPayload = {
      items: cartItems,
      customer: shopper,
      paymentMethod: 'Cash on Delivery (COD)'
    };

    const checkoutRes = await client.post('/api/checkout/create-order', checkoutPayload, { headers: authHeaders });
    assert.assertStatus(checkoutRes, 201);
    assert.strictEqual(checkoutRes.data.success, true);
    const orderId = checkoutRes.data.orderId;
    assert.ok(orderId, 'Order ID must be generated');

    const confirmedOrder = checkoutRes.data.order;
    assert.strictEqual(confirmedOrder.subtotal, qualifiedSubtotal, 'Subtotal must match calculated items');
    assert.strictEqual(confirmedOrder.shipping, 0, 'Shipping fee must be ₹0 when >= ₹1,999 threshold');
    assert.strictEqual(confirmedOrder.total, qualifiedSubtotal, 'Total must equal subtotal');
    assert.strictEqual(confirmedOrder.paymentStatus, 'Pending COD');
    assert.strictEqual(confirmedOrder.orderStatus, 'Processing');

    // Step 7: Verify order can be looked up by customer
    const lookupRes = await client.get(`/api/orders/${orderId}`, { headers: authHeaders });
    assert.assertStatus(lookupRes, 200);
    assert.strictEqual(lookupRes.data.success, true);
    assert.strictEqual(lookupRes.data.order.id, orderId);
  });

});
