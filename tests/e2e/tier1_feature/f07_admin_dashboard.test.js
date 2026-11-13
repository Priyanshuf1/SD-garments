/**
 * ALLEYRICH — Tier 1 Feature Coverage: Feature F7
 * File: tests/e2e/tier1_feature/f07_admin_dashboard.test.js
 * 
 * Tests for Admin Revenue Dashboard:
 * - TC-T1-F7-01: Authenticated Executive Stats Request (x-admin-key returns 200 and KPI object)
 * - TC-T1-F7-02: Total Revenue Calculation (totalRevenue is valid non-negative number)
 * - TC-T1-F7-03: Average Order Value (AOV) Calculation (AOV equals totalRevenue / totalOrders)
 * - TC-T1-F7-04: Order Status Breakdown (deliveredOrders and processingOrders counts)
 * - TC-T1-F7-05: Recent Orders Slice (Array of max 5 orders, descending order by createdAt)
 */

'use strict';

const { defineSuite } = require('../helpers/suite.js');

module.exports = defineSuite({
  tier: 1,
  feature: 'F7',
  title: 'Feature 7 Coverage: Admin Revenue Dashboard',
  description: 'Verifies authenticated executive KPI retrieval, total revenue math, AOV calculation, order status breakdown, and recent orders slice.'
}, ({ test }) => {

  test('TC-T1-F7-01', 'Authenticated Executive Stats Request: Requires admin authorization and returns complete KPI metrics', async ({ client, env, assert }) => {
    // 1. Unauthenticated request must be rejected with 401
    const unauthRes = await client.get('/api/admin/stats');
    assert.assertStatus(unauthRes, 401);
    assert.strictEqual(unauthRes.data.success, false);
    assert.assertHtmlContains(unauthRes, 'Unauthorized');

    // 2. Authenticated request with x-admin-key must return 200
    const authRes = await client.get('/api/admin/stats', {
      headers: env.getAdminHeaders()
    });
    assert.assertStatus(authRes, 200);
    assert.strictEqual(authRes.data.success, true);
    assert.ok(authRes.data.stats, 'Response must include stats object');

    // Verify all primary KPI fields
    const stats = authRes.data.stats;
    assert.ok(typeof stats.totalProducts === 'number', 'totalProducts must be a number');
    assert.ok(typeof stats.totalOrders === 'number', 'totalOrders must be a number');
    assert.ok(typeof stats.totalRevenue === 'number', 'totalRevenue must be a number');
    assert.ok(typeof stats.averageOrderValue === 'number', 'averageOrderValue must be a number');
    assert.ok(typeof stats.deliveredOrders === 'number', 'deliveredOrders must be a number');
    assert.ok(typeof stats.processingOrders === 'number', 'processingOrders must be a number');
  });

  test('TC-T1-F7-02', 'Total Revenue Calculation: Aggregates order totals into non-negative finite currency sum', async ({ client, env, assert }) => {
    const res = await client.get('/api/admin/stats', {
      headers: env.getAdminHeaders()
    });
    assert.assertStatus(res, 200);
    const totalRevenue = res.data.stats.totalRevenue;

    assert.ok(typeof totalRevenue === 'number');
    assert.ok(!isNaN(totalRevenue), 'totalRevenue must not be NaN');
    assert.ok(totalRevenue >= 0, `totalRevenue must be >= 0, got ${totalRevenue}`);
  });

  test('TC-T1-F7-03', 'Average Order Value (AOV) Calculation: AOV reflects revenue divided by total orders without NaN', async ({ client, env, assert }) => {
    const res = await client.get('/api/admin/stats', {
      headers: env.getAdminHeaders()
    });
    assert.assertStatus(res, 200);
    const { totalOrders, totalRevenue, averageOrderValue } = res.data.stats;

    assert.ok(!isNaN(averageOrderValue), 'averageOrderValue must not be NaN');
    if (totalOrders > 0) {
      const expectedAov = Math.round(totalRevenue / totalOrders);
      assert.strictEqual(
        averageOrderValue,
        expectedAov,
        `AOV should equal Math.round(totalRevenue / totalOrders) -> ${expectedAov}, got ${averageOrderValue}`
      );
    } else {
      assert.strictEqual(averageOrderValue, 0, 'AOV should be 0 when totalOrders is 0');
    }
  });

  test('TC-T1-F7-04', 'Order Status Breakdown: Categorizes orders into delivered and processing fulfillment buckets', async ({ client, env, assert }) => {
    const res = await client.get('/api/admin/stats', {
      headers: env.getAdminHeaders()
    });
    assert.assertStatus(res, 200);
    const { totalOrders, deliveredOrders, processingOrders } = res.data.stats;

    assert.ok(deliveredOrders >= 0, 'deliveredOrders must be >= 0');
    assert.ok(processingOrders >= 0, 'processingOrders must be >= 0');
    assert.ok(
      deliveredOrders + processingOrders <= totalOrders,
      `Status sum (${deliveredOrders} + ${processingOrders}) cannot exceed total orders (${totalOrders})`
    );
  });

  test('TC-T1-F7-05', 'Recent Orders Slice: Returns at most 5 orders sorted in descending chronological order', async ({ client, env, assert }) => {
    const res = await client.get('/api/admin/stats', {
      headers: env.getAdminHeaders()
    });
    assert.assertStatus(res, 200);
    const recentOrders = res.data.recentOrders;

    assert.ok(Array.isArray(recentOrders), 'recentOrders must be an array');
    assert.ok(recentOrders.length <= 5, `recentOrders must contain at most 5 orders, got ${recentOrders.length}`);

    // Verify descending sort order by createdAt
    if (recentOrders.length > 1) {
      for (let i = 0; i < recentOrders.length - 1; i++) {
        const timeA = new Date(recentOrders[i].createdAt).getTime();
        const timeB = new Date(recentOrders[i + 1].createdAt).getTime();
        assert.ok(
          timeA >= timeB,
          `Orders must be sorted descending: order[${i}] (${timeA}) should be >= order[${i+1}] (${timeB})`
        );
      }
    }
  });

});
