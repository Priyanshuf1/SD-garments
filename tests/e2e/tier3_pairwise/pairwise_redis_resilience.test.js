/**
 * ALLEYRICH — Tier 3 Cross-Feature Pairwise Tests: Redis Offline Resilience
 * File: tests/e2e/tier3_pairwise/pairwise_redis_resilience.test.js
 * 
 * Verifies combinatorial interactions between:
 * - F9 (Catalog Caching) + F12 (Redis Offline Fallback Resilience)
 * - F10 (Distributed Rate Limiting) + F12 (In-Memory Sliding Window Fallback)
 * - F11 (Active Cart & Admin Sessions) + F12 (Fallback Storage Persistence)
 */

'use strict';

const { defineSuite } = require('../helpers/suite.js');
const redisHelper = require('../helpers/redis_helper.js');
const security = require('../../../lib/security.js');

module.exports = defineSuite({
  tier: 3,
  feature: 'F9+F10+F11+F12',
  title: 'Pairwise: Redis Offline Fallback Resilience Across Caching, Rate Limits & Sessions',
  description: 'Validates that simulated Redis outages fail open gracefully to PostgreSQL, local JSON, and in-memory maps without HTTP 500 errors.'
}, ({ test, afterEach }) => {

  afterEach(() => {
    // Ensure Redis state is restored even if a test throws
    redisHelper.restoreOnline();
  });

  test('TC-T3-12', 'F9 (Catalog Caching) + F12 (Redis Fallback): Catalog requests succeed with HTTP 200 during simulated Redis outage', async ({ client, assert }) => {
    // 1. Simulate Redis outage
    const restore = redisHelper.simulateOffline();
    try {
      assert.strictEqual(redisHelper.isRedisAvailable(), false, 'Redis must report unavailable during simulation');

      // 2. Fetch catalog while Redis is offline
      const res = await client.get('/api/products');
      assert.assertStatus(res, 200);
      assert.strictEqual(res.data.success, true);
      assert.ok(Array.isArray(res.data.products), 'Products must be returned from fallback store');
      assert.ok(res.data.products.length > 0, 'Fallback store must return product catalog');

      // 3. Search query fallback
      const searchRes = await client.get('/api/products?search=shirt');
      assert.assertStatus(searchRes, 200);
      assert.strictEqual(searchRes.data.success, true);
    } finally {
      restore();
    }
  });

  test('TC-T3-13', 'F10 (Rate Limiting) + F12 (Redis Fallback): In-memory sliding window enforces rate limits during Redis outage', async ({ client, assert, env }) => {
    const restore = redisHelper.simulateOffline();
    try {
      const testEmail = `redis_resilience_${Date.now()}@sdgarments.in`;
      const testIp = '198.51.100.88';
      const ipHeaders = env.getForwardedIpHeaders(testIp);

      // First OTP send should succeed with HTTP 200
      const firstRes = await client.post('/api/auth/send-otp', { email: testEmail }, { headers: ipHeaders });
      assert.assertStatus(firstRes, 200);
      assert.strictEqual(firstRes.data.success, true);

      // Immediate second OTP request for same email must trigger 60s cooldown limit (HTTP 429)
      const secondRes = await client.post('/api/auth/send-otp', { email: testEmail }, { headers: ipHeaders });
      assert.assertRateLimited(secondRes, 'In-memory fallback rate limiter must return HTTP 429 on OTP cooldown breach');
      assert.strictEqual(secondRes.data.success, false);
      assert.ok(secondRes.data.message.includes('wait') || secondRes.data.message.includes('cooldown'),
        'Cooldown message must be returned during Redis outage');
    } finally {
      restore();
    }
  });

  test('TC-T3-14', 'F11 (Session & Cart Persistence) + F12 (Redis Fallback): Active carts and admin authentication persist during Redis outage', async ({ client, assert, env }) => {
    const restore = redisHelper.simulateOffline();
    try {
      // 1. Admin authentication fallback
      const adminHeaders = env.getAdminHeaders();
      const statsRes = await client.get('/api/admin/stats', { headers: adminHeaders });
      assert.assertStatus(statsRes, 200);
      assert.strictEqual(statsRes.data.success, true);
      assert.ok(statsRes.data.stats, 'Admin stats must return valid object during Redis outage');

      // 2. Customer cart sync fallback
      const customerId = 'cust_1792772970127';
      const customerEmail = 'reliability_audit@allyrich.com';
      const sessionToken = security.createCustomerSession(customerId, customerEmail);

      const customerHeaders = {
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json'
      };

      const testCart = [
        { id: '1793648108932', title: 'FallBack Hoodie', size: 'XL', quantity: 1, price: 1999 }
      ];

      // Save cart via POST
      const saveRes = await client.post('/api/cart/sync', { cart: testCart }, { headers: customerHeaders });
      assert.assertStatus(saveRes, 200);
      assert.strictEqual(saveRes.data.success, true);

      // Retrieve cart via GET
      const retrieveRes = await client.get('/api/cart/sync', { headers: customerHeaders });
      assert.assertStatus(retrieveRes, 200);
      assert.strictEqual(retrieveRes.data.success, true);
      assert.ok(Array.isArray(retrieveRes.data.cart), 'Cart must be an array');
      assert.strictEqual(retrieveRes.data.cart.length, 1);
      assert.strictEqual(retrieveRes.data.cart[0].title, 'FallBack Hoodie');
    } finally {
      restore();
    }
  });

});
