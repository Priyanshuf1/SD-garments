/**
 * ALLEYRICH — Tier 4 Real-World Application Scenario 2: Admin Order Lifecycle
 * File: tests/e2e/tier4_realworld/scenario2_admin_lifecycle.test.js
 * 
 * Exercises: F7 (Admin Dashboard), F8 (Delhivery AWB Dispatch),
 *            F9 (Catalog Cache Invalidation), F12 (Redis Offline Fallback)
 * 
 * Workflow:
 * 1. Admin inspects baseline dashboard metrics
 * 2. Admin creates a new streetwear silhouette in catalog
 * 3. Catalog cache is invalidated and fresh product is immediately visible to storefront
 * 4. A customer places an order for this newly created product
 * 5. Admin stats reflect the new order
 * 6. Admin manifests and dispatches shipment via Delhivery Logistics
 * 7. Order status mutates to 'Shipped' with allocated 12-digit waybill
 * 8. Admin fetches the official thermal shipping label
 * 9. Cleanup: test product is deleted
 */

'use strict';

const { defineSuite } = require('../helpers/suite.js');

module.exports = defineSuite({
  tier: 4,
  feature: 'F7+F8+F9+F12',
  title: 'Scenario 2: Complete Admin Lifecycle (Product Creation, Invalidation, Order Dispatch, Label)',
  description: 'Validates administrative lifecycle from adding inventory to dispatching live courier waybills and printing thermal labels.'
}, ({ test }) => {

  test('SCENARIO-02', 'Admin lifecycle: product creation, instant cache bust, customer purchase, AWB dispatch and thermal label generation', async ({ client, assert, env }) => {
    const adminHeaders = env.getAdminHeaders();

    // Step 1: Admin baseline KPI inspection
    const baselineStatsRes = await client.get('/api/admin/stats', { headers: adminHeaders });
    assert.assertStatus(baselineStatsRes, 200);
    assert.strictEqual(baselineStatsRes.data.success, true);
    const initialProductCount = Number(baselineStatsRes.data.stats.totalProducts || 0);
    const initialOrderCount = Number(baselineStatsRes.data.stats.totalOrders || 0);

    // Step 2: Admin creates new silhouette
    const uniqueTitle = `Admin Drop Capsule ${Date.now()}`;
    const newProductPayload = env.createTestProduct({
      title: uniqueTitle,
      category: 'Top Wear',
      price: '1999',
      stock: 25
    });

    const createProductRes = await client.post('/api/admin/products', newProductPayload, { headers: adminHeaders });
    assert.assertStatus(createProductRes, 201);
    assert.strictEqual(createProductRes.data.success, true);
    const createdProductId = createProductRes.data.product?.id || newProductPayload.id;
    assert.ok(createdProductId, 'Created product must have ID');

    try {
      // Step 3: Verify catalog cache invalidation — storefront queries catalog
      const storefrontCatalogRes = await client.get(`/api/products?search=${encodeURIComponent(uniqueTitle)}`);
      assert.assertStatus(storefrontCatalogRes, 200);
      assert.strictEqual(storefrontCatalogRes.data.success, true);
      const foundProduct = storefrontCatalogRes.data.products.find(p => p.title === uniqueTitle);
      assert.ok(foundProduct, 'New product must be visible on storefront immediately due to cache eviction');

      // Step 4: Customer purchases the new product
      const shopper = env.createUniqueShopper('admin_lifecycle');
      const orderPayload = {
        items: [
          {
            id: String(createdProductId),
            handle: foundProduct.handle,
            title: foundProduct.title,
            size: 'M',
            quantity: 1
          }
        ],
        customer: shopper,
        paymentMethod: 'Cash on Delivery (COD)'
      };

      const orderPlacementRes = await client.post('/api/checkout/create-order', orderPayload);
      assert.assertStatus(orderPlacementRes, 201);
      assert.strictEqual(orderPlacementRes.data.success, true);
      const placedOrderId = orderPlacementRes.data.orderId;
      assert.ok(placedOrderId, 'Order ID must be generated');

      // Step 5: Admin re-inspects dashboard stats
      const updatedStatsRes = await client.get('/api/admin/stats', { headers: adminHeaders });
      assert.assertStatus(updatedStatsRes, 200);
      const newOrderCount = Number(updatedStatsRes.data.stats.totalOrders || 0);
      assert.ok(newOrderCount >= initialOrderCount + 1, 'Total orders count in admin stats must increment');

      // Step 6: Admin executes Delhivery dispatch
      const dispatchRes = await client.post(`/api/admin/orders/${placedOrderId}/delhivery-awb`, {}, { headers: adminHeaders });
      assert.assertStatus(dispatchRes, 200);
      assert.strictEqual(dispatchRes.data.success, true);
      const assignedAwb = dispatchRes.data.awb;
      assert.ok(assignedAwb, 'AWB waybill must be allocated');
      assert.match(assignedAwb, /^14092\d{7}$/, 'Waybill must match Delhivery 12-digit format 14092...');

      // Step 7: Verify order status mutation
      const orderDetailsRes = await client.get(`/api/admin/orders/${placedOrderId}`, { headers: adminHeaders });
      assert.assertStatus(orderDetailsRes, 200);
      assert.strictEqual(orderDetailsRes.data.order.orderStatus, 'Shipped');
      assert.strictEqual(orderDetailsRes.data.order.trackingNumber, assignedAwb);

      // Step 8: Retrieve official thermal shipping label
      const labelRes = await client.get(`/api/admin/orders/${placedOrderId}/shipping-label`, { headers: adminHeaders });
      assert.ok(
        labelRes.status === 200 || labelRes.status === 302,
        `Shipping label must return HTTP 200 (HTML sticker) or HTTP 302 (S3 redirect), received ${labelRes.status}`
      );
      if (labelRes.status === 302) {
        assert.ok(labelRes.headers['location'], '302 shipping label response must contain Location header');
      } else {
        assert.assertHtmlContains(labelRes, placedOrderId, 'Shipping label HTML must contain order ID');
        assert.assertHtmlContains(labelRes, assignedAwb, 'Shipping label HTML must contain assigned AWB');
      }
    } finally {
      // Step 9: Cleanup test product
      await client.delete(`/api/admin/products/${createdProductId}`, { headers: adminHeaders }).catch(() => {});
    }
  });

});
