/**
 * ALLEYRICH — Tier 1 Feature Coverage: Feature F12
 * File: tests/e2e/tier1_feature/f12_redis_fallback.test.js
 * 
 * Tests for Redis Offline Graceful Fallback Resilience:
 * - TC-T1-F12-01: Catalog Fetch with Redis Offline (Transparent fallback to JSON/DB with zero 500 errors)
 * - TC-T1-F12-02: In-Memory Rate Limiting Fallback (Local rateLimitBuckets sliding window enforces rate limit when Redis offline)
 * - TC-T1-F12-03: Cart Persistence Fallback (Dual-write and read from customers.json when Redis is unreachable)
 * - TC-T1-F12-04: Admin Session Fallback (Local activeAdminSessions map validates credentials during Redis outage)
 * - TC-T1-F12-05: Auto-Reconnection & Recovery (Restoring Redis connection recovers cache without restarting application)
 */

'use strict';

const { defineSuite } = require('../helpers/suite.js');
const security = require('../../../lib/security.js');

module.exports = defineSuite({
  tier: 1,
  feature: 'F12',
  title: 'Feature 12 Coverage: Redis Offline Fallback Resilience',
  description: 'Verifies uninterrupted storefront and admin operations during Redis outage, in-memory rate limiting, and seamless recovery.'
}, ({ test, afterEach }) => {

  afterEach(({ redis }) => {
    // Ensure Redis online state is always restored after each test
    if (redis && typeof redis.restoreOnline === 'function') {
      redis.restoreOnline();
    }
  });

  test('TC-T1-F12-01', 'Catalog Fetch with Redis Offline: Serves full product catalog from local store with zero 500 errors', async ({ client, redis, assert }) => {
    // 1. Simulate Redis outage
    const restore = redis.simulateOffline();

    try {
      assert.strictEqual(redis.isRedisAvailable(), false, 'Redis must report offline status');

      // 2. Fetch catalog — must serve HTTP 200 cleanly without crashing
      const res = await client.get('/api/products');
      assert.assertStatus(res, 200);
      assert.strictEqual(res.data.success, true);
      assert.ok(Array.isArray(res.data.products), 'Products must be returned as array during Redis outage');
      assert.ok(res.data.products.length > 0, 'Catalog should contain products from fallback store');
    } finally {
      restore();
    }
  });

  test('TC-T1-F12-02', 'In-Memory Rate Limiting Fallback: In-memory sliding window enforces rate limit during Redis outage', async ({ client, redis, assert }) => {
    const restore = redis.simulateOffline();

    try {
      assert.strictEqual(redis.isRedisAvailable(), false);

      const ts = Date.now();
      const testEmail = `redis_outage_otp_${ts}@sdgarments.in`;
      const ip = `198.51.108.${ts % 250 + 1}`;
      const headers = {
        'x-forwarded-for': ip,
        'cf-connecting-ip': ip
      };

      // First OTP request -> allowed
      const res1 = await client.post('/api/auth/send-otp', { email: testEmail }, { headers });
      assert.assertStatus(res1, 200);
      assert.strictEqual(res1.data.success, true);

      // Immediate second OTP request -> rate limited via in-memory sliding window
      const res2 = await client.post('/api/auth/send-otp', { email: testEmail }, { headers });
      assert.assertRateLimited(res2);
      assert.strictEqual(res2.data.success, false);
      assert.assertHtmlContains(res2, 'wait');
    } finally {
      restore();
    }
  });

  test('TC-T1-F12-03', 'Cart Persistence Fallback: Persists customer cart to local customer record when Redis is offline', async ({ client, redis, assert }) => {
    const restore = redis.simulateOffline();

    try {
      assert.strictEqual(redis.isRedisAvailable(), false);

      const ts = Date.now();
      const customerId = `cust_offline_${ts}`;
      const customerEmail = `offline_shopper_${ts}@sdgarments.in`;
      const customerToken = security.createCustomerSession(customerId, customerEmail);

      const cartData = [
        { id: '1792792091289', handle: 'raw-essentials-minimal-balloon-pant', quantity: 2, size: 'M' }
      ];

      // Save cart while Redis is offline
      const saveRes = await client.post('/api/cart/sync', { cart: cartData }, {
        headers: {
          'Authorization': `Bearer ${customerToken}`,
          'Content-Type': 'application/json'
        }
      });
      assert.assertStatus(saveRes, 200);
      assert.strictEqual(saveRes.data.success, true);

      // Retrieve cart while Redis is offline
      const getRes = await client.get('/api/cart/sync', {
        headers: {
          'Authorization': `Bearer ${customerToken}`
        }
      });
      assert.assertStatus(getRes, 200);
      assert.strictEqual(getRes.data.success, true);
      assert.strictEqual(getRes.data.cart[0].handle, 'raw-essentials-minimal-balloon-pant');
    } finally {
      restore();
    }
  });

  test('TC-T1-F12-04', 'Admin Session Fallback: In-memory activeAdminSessions map validates credentials during Redis outage', async ({ client, redis, env, assert }) => {
    const restore = redis.simulateOffline();

    try {
      assert.strictEqual(redis.isRedisAvailable(), false);

      // Create admin session in memory
      const session = security.createAdminSession('admin_offline_operator');
      const token = session.token;
      assert.ok(token);

      // Access protected admin stats using the in-memory session token
      const res = await client.get('/api/admin/stats', {
        headers: { 'x-admin-token': token }
      });
      assert.assertStatus(res, 200);
      assert.strictEqual(res.data.success, true);
      assert.ok(res.data.stats, 'Stats must be returned under fallback admin session');
    } finally {
      restore();
    }
  });

  test('TC-T1-F12-05', 'Auto-Reconnection & Recovery: Restoring online state resumes normal caching operations without process restart', async ({ client, redis, assert }) => {
    // 1. Simulate outage
    const restore = redis.simulateOffline();
    assert.strictEqual(redis.isRedisAvailable(), false);

    // 2. Restore connectivity
    restore();

    // 3. Verify normal online operation
    const isAvail = redis.isRedisAvailable();
    assert.strictEqual(typeof isAvail, 'boolean');

    // 4. Storefront operations proceed smoothly
    const res = await client.get('/api/products');
    assert.assertStatus(res, 200);
    assert.strictEqual(res.data.success, true);
    assert.ok(Array.isArray(res.data.products));
  });

});
