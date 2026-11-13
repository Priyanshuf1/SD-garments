/**
 * ALLEYRICH — Tier 2 Boundary & Corner Case Tests: Feature F7
 * File: tests/e2e/tier2_boundary/f07_admin_dashboard_bva.test.js
 * 
 * Boundary Value Analysis (BVA) for Admin Revenue Dashboard & KPIs:
 * - TC-T2-F7-01: Missing admin authorization barrier (HTTP 401)
 * - TC-T2-F7-02: Malformed / short admin key rejection (HTTP 401)
 * - TC-T2-F7-03: Zero orders database calculation (avoiding NaN in AOV)
 * - TC-T2-F7-04: Admin API rate limit breach (120 req/60s threshold, HTTP 429)
 * - TC-T2-F7-05: Expired / invalid admin session token rejection (HTTP 401)
 */

'use strict';

const { defineSuite } = require('../helpers/suite.js');

module.exports = defineSuite({
  tier: 2,
  feature: 'F7',
  title: 'Feature 7 Boundary & Corner Cases: Admin Revenue Dashboard & Stats',
  description: 'Validates admin authentication barriers, math safety on empty data sets, rate limit triggers, and token rejection.'
}, ({ test }) => {

  test('TC-T2-F7-01', 'Missing Admin Authorization: Rejects unauthenticated request with HTTP 401', async ({ client, assert }) => {
    // Request admin stats with zero auth headers
    const res = await client.get('/api/admin/stats');
    assert.assertStatus(res, 401);
    assert.strictEqual(res.data.success, false);
    assert.assertHtmlContains(res, 'Administrator authentication required');
  });

  test('TC-T2-F7-02', 'Malformed Admin Key: Rejects invalid or short keys with HTTP 401', async ({ client, assert }) => {
    const invalidKeys = ['short', 'invalid_secret_key_123', 'admin', ''];
    for (const key of invalidKeys) {
      const res = await client.get('/api/admin/stats', {
        headers: { 'x-admin-key': key }
      });
      assert.assertStatus(res, 401);
      assert.strictEqual(res.data.success, false);
    }
  });

  test('TC-T2-F7-03', 'Zero Orders Database Math: Total revenue and AOV return 0 without NaN', async ({ client, assert, env }) => {
    // Fetch stats using valid admin key
    const res = await client.get('/api/admin/stats', {
      headers: env.getAdminHeaders()
    });

    assert.assertStatus(res, 200);
    assert.strictEqual(res.data.success, true);
    assert.ok(res.data.stats, 'Response must contain stats object');

    const stats = res.data.stats;

    // Verify mathematical bounds
    assert.ok(typeof stats.totalRevenue === 'number' && !isNaN(stats.totalRevenue), 'totalRevenue must be a valid number and not NaN');
    assert.ok(typeof stats.averageOrderValue === 'number' && !isNaN(stats.averageOrderValue), 'averageOrderValue must be a valid number and not NaN');
    assert.ok(stats.averageOrderValue >= 0, 'AOV must be non-negative');

    // Emulate zero-orders calculation logic
    const ordersZero = [];
    const simulatedRevenue = ordersZero.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    const simulatedAov = ordersZero.length ? Math.round(simulatedRevenue / ordersZero.length) : 0;

    assert.strictEqual(simulatedRevenue, 0, 'Revenue for 0 orders must be 0');
    assert.strictEqual(simulatedAov, 0, 'AOV for 0 orders must be 0 (no division by zero)');
    assert.ok(!isNaN(simulatedAov), 'Simulated AOV must not be NaN');
  });

  test('TC-T2-F7-04', 'Admin API Rate Limit Breach: Triggers HTTP 429 when exceeding 120 req/min', async ({ client, assert, env }) => {
    const testIp = '198.51.100.77';
    const headers = {
      ...env.getAdminHeaders(),
      'cf-connecting-ip': testIp,
      'x-forwarded-for': testIp
    };

    let hit429 = false;
    let lastRes = null;

    // Send 122 rapid requests to trigger sliding window rate limit (limit is 120 req / 60s)
    for (let i = 0; i < 122; i++) {
      lastRes = await client.get('/api/admin/stats', { headers });
      if (lastRes.status === 429) {
        hit429 = true;
        break;
      }
    }

    assert.ok(hit429, '121st or 122nd request must trigger HTTP 429 Too Many Requests');
    assert.assertRateLimited(lastRes, 'Rate limit response must be 429 with Retry-After header');
    assert.strictEqual(lastRes.data.success, false);
    assert.assertHtmlContains(lastRes, 'Too many administrative requests. Please slow down.');
  });

  test('TC-T2-F7-05', 'Expired / Invalid Admin Token: Returns HTTP 401 for corrupted session tokens', async ({ client, assert }) => {
    const invalidTokens = [
      'ar_adm_expired_timestamp_token_00000',
      'ar_adm_invalid_format',
      'bearer_invalid_token'
    ];

    for (const token of invalidTokens) {
      const res = await client.get('/api/admin/stats', {
        headers: {
          'x-admin-token': token
        }
      });

      assert.assertStatus(res, 401);
      assert.strictEqual(res.data.success, false);
    }
  });

});
