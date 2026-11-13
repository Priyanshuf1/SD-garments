/**
 * ALLEYRICH — Tier 4 Real-World Application Scenario 4: Redis Outage Simulation
 * File: tests/e2e/tier4_realworld/scenario4_redis_outage.test.js
 * 
 * Exercises: F5 (Cart Drawer), F9 (Catalog Caching),
 *            F11 (Active Cart & Sessions), F12 (Offline Fallback Resilience)
 * 
 * Workflow:
 * 1. Verify baseline operations online
 * 2. Sever/disconnect Redis connection to simulate unexpected outage
 * 3. Storefront catalog queries fail open to PostgreSQL / JSON storage without HTTP 500
 * 4. Active customer cart sync continues persisting to local database
 * 5. Administrative authentication and KPI monitoring operate without degradation
 * 6. Customer places an order during active outage
 * 7. Redis connectivity restored; normal operation resumes cleanly
 */

'use strict';

const { defineSuite } = require('../helpers/suite.js');
const redisHelper = require('../helpers/redis_helper.js');
const security = require('../../../lib/security.js');

module.exports = defineSuite({
  tier: 4,
  feature: 'F5+F9+F11+F12',
  title: 'Scenario 4: High-Availability Redis Outage Simulation & Fail-Open Recovery',
  description: 'Validates uninterrupted storefront and transactional operations during unexpected Redis failure and clean recovery upon reconnection.'
}, ({ test, afterEach }) => {

  afterEach(() => {
    redisHelper.restoreOnline();
  });

  test('SCENARIO-04', 'Redis outage resilience: catalog serving, cart sync, admin monitoring and checkout during simulated failure', async ({ client, assert, env }) => {
    // Step 1: Baseline catalog check online
    const onlineRes = await client.get('/api/products');
    assert.assertStatus(onlineRes, 200);
    assert.strictEqual(onlineRes.data.success, true);
    const initialProductCount = onlineRes.data.products.length;
    assert.ok(initialProductCount > 0);

    // Step 2: Trigger simulated Redis outage
    const restore = redisHelper.simulateOffline();
    try {
      assert.strictEqual(redisHelper.isRedisAvailable(), false, 'Redis must be offline');

      // Step 3: Catalog serving during outage (Fail-open to PostgreSQL / JSON)
      const outageCatalogRes = await client.get('/api/products');
      assert.assertStatus(outageCatalogRes, 200, 'Catalog must return HTTP 200 during Redis outage');
      assert.strictEqual(outageCatalogRes.data.success, true);
      assert.ok(Array.isArray(outageCatalogRes.data.products));
      assert.strictEqual(outageCatalogRes.data.products.length, initialProductCount, 'Product count must match baseline');

      // Search filtering during outage
      const outageSearchRes = await client.get('/api/products?search=shirt');
      assert.assertStatus(outageSearchRes, 200);
      assert.strictEqual(outageSearchRes.data.success, true);

      // Step 4: Active customer cart sync during outage
      const customerId = 'cust_1792772970127';
      const customerEmail = 'reliability_audit@allyrich.com';
      const customerToken = security.createCustomerSession(customerId, customerEmail);
      const customerHeaders = {
        'Authorization': `Bearer ${customerToken}`,
        'Content-Type': 'application/json'
      };

      const outageCart = [
        { id: String(outageCatalogRes.data.products[0].id), size: 'L', quantity: 2, price: 1499 }
      ];

      const cartSaveRes = await client.post('/api/cart/sync', { cart: outageCart }, { headers: customerHeaders });
      assert.assertStatus(cartSaveRes, 200, 'Cart sync save must return HTTP 200 during outage');
      assert.strictEqual(cartSaveRes.data.success, true);

      const cartGetRes = await client.get('/api/cart/sync', { headers: customerHeaders });
      assert.assertStatus(cartGetRes, 200, 'Cart sync retrieve must return HTTP 200 during outage');
      assert.strictEqual(cartGetRes.data.success, true);
      assert.strictEqual(cartGetRes.data.cart.length, 1);

      // Step 5: Admin monitoring during outage
      const adminHeaders = env.getAdminHeaders();
      const adminStatsRes = await client.get('/api/admin/stats', { headers: adminHeaders });
      assert.assertStatus(adminStatsRes, 200, 'Admin stats must return HTTP 200 during outage');
      assert.strictEqual(adminStatsRes.data.success, true);
      assert.ok(adminStatsRes.data.stats.totalOrders !== undefined);

      // Step 6: Checkout during outage
      const inStockProduct = outageCatalogRes.data.products.find(p => {
        const v = p.variants?.[0];
        return v?.available !== false && (v?.inventory_quantity === undefined || v?.inventory_quantity > 5);
      }) || outageCatalogRes.data.products[5];

      const shopper = env.createUniqueShopper('redis_outage');
      const orderPayload = {
        items: [{ id: String(inStockProduct.id), handle: inStockProduct.handle, title: inStockProduct.title, size: 'M', quantity: 1 }],
        customer: shopper,
        paymentMethod: 'Cash on Delivery (COD)'
      };

      const orderRes = await client.post('/api/checkout/create-order', orderPayload);
      assert.assertStatus(orderRes, 201, 'Order placement must succeed with HTTP 201 during outage');
      assert.strictEqual(orderRes.data.success, true);
    } finally {
      // Step 7: Restore Redis connectivity
      restore();
    }

    // Step 8: Post-restoration verification
    const recoveredRes = await client.get('/api/products');
    assert.assertStatus(recoveredRes, 200);
    assert.strictEqual(recoveredRes.data.success, true);
  });

});
