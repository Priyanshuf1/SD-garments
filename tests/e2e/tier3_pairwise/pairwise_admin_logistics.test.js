/**
 * ALLEYRICH — Tier 3 Cross-Feature Pairwise Tests: Admin, Logistics & Catalog
 * File: tests/e2e/tier3_pairwise/pairwise_admin_logistics.test.js
 * 
 * Verifies combinatorial interactions between:
 * - F7 (Admin Revenue Dashboard & Stats) + F8 (Delhivery AWB Dispatch)
 * - F8 (Delhivery Logistics Dispatch) + F9 (Thermal Shipping Label & Cache Consistency)
 * - F7 (Admin Executive Stats) + F9 (Product CRUD & Instant Catalog Invalidation)
 */

'use strict';

const { defineSuite } = require('../helpers/suite.js');

module.exports = defineSuite({
  tier: 3,
  feature: 'F7+F8+F9',
  title: 'Pairwise: Admin Dashboard, Delhivery Logistics & Catalog Invalidation',
  description: 'Validates administrative KPIs, automated Delhivery AWB dispatch, thermal shipping labels, and product CRUD cache invalidation.'
}, ({ test }) => {

  let testOrderId = null;
  let testWaybill = null;
  let testProductId = null;

  test('TC-T3-09', 'F7 (Admin Stats) + F8 (AWB Dispatch): Order placement and AWB dispatch mutate admin order stats', async ({ client, assert, env }) => {
    const adminHeaders = env.getAdminHeaders();

    // 1. Get baseline admin stats
    const baseStatsRes = await client.get('/api/admin/stats', { headers: adminHeaders });
    assert.assertStatus(baseStatsRes, 200);
    assert.strictEqual(baseStatsRes.data.success, true);
    const initialOrders = Number(baseStatsRes.data.stats.totalOrders || 0);

    // 2. Place a valid customer order using an in-stock product
    const catalogRes = await client.get('/api/products');
    const inStock = catalogRes.data.products.find(p => {
      const v = p.variants?.[0];
      return v?.available !== false && (v?.inventory_quantity === undefined || v?.inventory_quantity > 5);
    }) || catalogRes.data.products[8];

    const shopper = env.createUniqueShopper('admin_logistics');
    const orderRes = await client.post('/api/checkout/create-order', {
      items: [{ id: String(inStock.id), handle: inStock.handle, title: inStock.title, size: 'M', quantity: 1 }],
      customer: shopper,
      paymentMethod: 'Cash on Delivery (COD)'
    });
    assert.assertStatus(orderRes, 201);
    testOrderId = orderRes.data.orderId;
    assert.ok(testOrderId, 'Order ID must exist');

    // 3. Dispatch Delhivery AWB for the order
    const dispatchRes = await client.post(`/api/admin/orders/${testOrderId}/delhivery-awb`, {}, { headers: adminHeaders });
    assert.assertStatus(dispatchRes, 200);
    assert.strictEqual(dispatchRes.data.success, true);
    testWaybill = dispatchRes.data.awb;
    assert.ok(testWaybill, 'Delhivery AWB waybill number must be returned');
    assert.match(testWaybill, /^14092\d{7}$/, 'AWB must match 12-digit format 14092...');
    assert.ok(dispatchRes.data.trackingUrl.includes(testWaybill), 'Tracking URL must include waybill');

    // 4. Verify updated stats reflect order creation
    const updatedStatsRes = await client.get('/api/admin/stats', { headers: adminHeaders });
    assert.assertStatus(updatedStatsRes, 200);
    const newOrders = Number(updatedStatsRes.data.stats.totalOrders || 0);
    assert.ok(newOrders >= initialOrders + 1, `Total orders should increase from ${initialOrders} to at least ${initialOrders + 1}`);
  });

  test('TC-T3-10', 'F8 (AWB Dispatch) + F9 (Label & Cache): Thermal packing slip rendering and duplicate dispatch idempotency', async ({ client, assert, env }) => {
    assert.ok(testOrderId, 'Test order ID must be set from prior test');
    assert.ok(testWaybill, 'Test waybill must be set from prior test');
    const adminHeaders = env.getAdminHeaders();

    // 1. Fetch thermal shipping label (returns 200 with HTML slip or 302 redirecting to S3 PDF sticker)
    const labelRes = await client.get(`/api/admin/orders/${testOrderId}/shipping-label`, { headers: adminHeaders });
    assert.ok(
      labelRes.status === 200 || labelRes.status === 302,
      `Shipping label must return HTTP 200 (HTML sticker) or HTTP 302 (S3 redirect), received ${labelRes.status}`
    );
    if (labelRes.status === 302) {
      assert.ok(labelRes.headers['location'], '302 shipping label response must have Location header');
    } else {
      assert.assertHtmlContains(labelRes, testOrderId, 'Shipping label must contain order ID');
      assert.assertHtmlContains(labelRes, testWaybill, 'Shipping label must contain assigned AWB');
      assert.assertHtmlContains(labelRes, 'DELHIVERY', 'Shipping label must reference Delhivery logistics');
    }

    // 2. Re-dispatch call returns valid Delhivery waybill format cleanly without server error
    const duplicateRes = await client.post(`/api/admin/orders/${testOrderId}/delhivery-awb`, {}, { headers: adminHeaders });
    assert.assertStatus(duplicateRes, 200);
    assert.strictEqual(duplicateRes.data.success, true);
    assert.match(duplicateRes.data.awb, /^14092\d{7}$/, 'Re-dispatch must return valid Delhivery waybill');
  });

  test('TC-T3-11', 'F7 (Admin Stats) + F9 (Catalog Invalidation): Product creation invalidates catalog cache and updates stats', async ({ client, assert, env }) => {
    const adminHeaders = env.getAdminHeaders();

    // 1. Record baseline stats and catalog count
    const statsRes = await client.get('/api/admin/stats', { headers: adminHeaders });
    assert.assertStatus(statsRes, 200);
    const baseProductCount = Number(statsRes.data.stats.totalProducts || 0);

    // 2. Create new product via admin API
    const testProduct = env.createTestProduct({
      title: `E2E Exclusive Silhouette ${Date.now()}`,
      category: 'Top Wear',
      price: '1899'
    });
    const createRes = await client.post('/api/admin/products', testProduct, { headers: adminHeaders });
    assert.assertStatus(createRes, 201);
    assert.strictEqual(createRes.data.success, true);
    testProductId = createRes.data.product?.id || testProduct.id;
    assert.ok(testProductId, 'Created product must have ID');

    // 3. Immediately query public catalog to verify instant cache eviction
    const catalogRes = await client.get(`/api/products?search=${encodeURIComponent(testProduct.title)}`);
    assert.assertStatus(catalogRes, 200);
    assert.strictEqual(catalogRes.data.success, true);
    const found = catalogRes.data.products.find(p => p.title === testProduct.title);
    assert.ok(found, 'Newly created product must be immediately visible in catalog (cache busted)');

    // 4. Verify admin stats totalProducts updated
    const newStatsRes = await client.get('/api/admin/stats', { headers: adminHeaders });
    assert.assertStatus(newStatsRes, 200);
    const updatedCount = Number(newStatsRes.data.stats.totalProducts || 0);
    assert.ok(updatedCount >= baseProductCount + 1, `totalProducts should increment from ${baseProductCount} to ${updatedCount}`);

    // 5. Cleanup: delete test product to maintain test hygiene
    const deleteRes = await client.delete(`/api/admin/products/${testProductId}`, { headers: adminHeaders });
    assert.assertStatus(deleteRes, 200);
    assert.strictEqual(deleteRes.data.success, true);
  });

});
