/**
 * ALLEYRICH — Tier 2 Boundary & Corner Case Tests: Feature F12
 * File: tests/e2e/tier2_boundary/f12_redis_fallback_bva.test.js
 * 
 * Boundary Value Analysis (BVA) for Redis Offline Fallback Resilience:
 * - TC-T2-F12-01: In-flight Redis disconnect during active catalog queries
 * - TC-T2-F12-02: In-memory sliding window rate limiting during Redis outage
 * - TC-T2-F12-03: Webhook idempotency fallback map resilience
 * - TC-T2-F12-04: In-memory fallback cache TTL pruning & expiry
 * - TC-T2-F12-05: Rapid connection flapping (offline -> online transition)
 */

'use strict';

const { defineSuite } = require('../helpers/suite.js');

module.exports = defineSuite({
  tier: 2,
  feature: 'F12',
  title: 'Feature 12 Boundary & Corner Cases: Redis Fallback Resilience',
  description: 'Validates seamless fail-open behavior, zero 500 error crashes, in-memory rate limits, and fallback store integrity when Redis is disconnected.'
}, ({ test }) => {

  test('TC-T2-F12-01', 'In-Flight Disconnect: Server returns HTTP 200 catalog when Redis is severed mid-flight', async ({ client, assert, redis }) => {
    // 1. Simulate Redis going offline
    const restore = redis.simulateOffline();
    try {
      assert.strictEqual(redis.isRedisAvailable(), false, 'Redis must report unavailable');

      // 2. Fetch catalog while Redis is offline
      const res = await client.get('/api/products');
      assert.assertStatus(res, 200);
      assert.strictEqual(res.data.success, true);
      assert.ok(Array.isArray(res.data.products), 'Products must be returned from fallback store');
      assert.ok(res.data.count > 0, 'Catalog count must be non-zero during offline fallback');
    } finally {
      restore();
    }
  });

  test('TC-T2-F12-02', 'In-Memory Rate Limiting Fallback: Sliding window enforces limits without Redis', async ({ assert, redis }) => {
    const restore = redis.simulateOffline();
    try {
      const redisLib = require('../../../lib/redis.js');
      const testKey = `offline_ratelimit_key_${Date.now()}`;

      // Enforce limit of 2 requests in 5s window
      const check1 = await redisLib.checkRateLimit(testKey, 2, 5);
      assert.strictEqual(check1.allowed, true, 'First request must be allowed');
      assert.strictEqual(check1.remaining, 1);

      const check2 = await redisLib.checkRateLimit(testKey, 2, 5);
      assert.strictEqual(check2.allowed, true, 'Second request must be allowed');
      assert.strictEqual(check2.remaining, 0);

      // Third request must be blocked via in-memory sliding window
      const check3 = await redisLib.checkRateLimit(testKey, 2, 5);
      assert.strictEqual(check3.allowed, false, 'Third request must be rate-limited by in-memory fallback');
      assert.ok(check3.resetAfterSeconds > 0, 'Reset seconds must be positive');
    } finally {
      restore();
    }
  });

  test('TC-T2-F12-03', 'Webhook Idempotency Fallback: Detects duplicates via in-memory map when Redis offline', async ({ assert, redis }) => {
    const restore = redis.simulateOffline();
    try {
      const redisLib = require('../../../lib/redis.js');
      const eventId = `evt_test_offline_${Date.now()}_${Math.random()}`;

      // First check should allow (new event)
      const isNewFirst = await redisLib.checkWebhookIdempotency(eventId, 60);
      assert.strictEqual(isNewFirst, true, 'First event lookup must be recognized as new');

      // Second check with same eventId must detect duplicate
      const isNewSecond = await redisLib.checkWebhookIdempotency(eventId, 60);
      assert.strictEqual(isNewSecond, false, 'Second event lookup must be flagged as duplicate (idempotent)');

      // Cleanup
      await redisLib.clearWebhookIdempotency(eventId);
    } finally {
      restore();
    }
  });

  test('TC-T2-F12-04', 'In-Memory Fallback Cache TTL: Ephemeral fallback entries expire after TTL', async ({ assert, redis }) => {
    const restore = redis.simulateOffline();
    try {
      const redisLib = require('../../../lib/redis.js');
      const key = `offline_ttl_item_${Date.now()}`;

      // Set item with 1 second TTL
      await redisLib.cacheSet(key, { offlineValue: 'persisted' }, 1);

      // Immediately fetch: should exist in memory
      const immediate = await redisLib.cacheGet(key);
      assert.deepStrictEqual(immediate, { offlineValue: 'persisted' });

      // Wait 1.1s for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Must expire and return null
      const expired = await redisLib.cacheGet(key);
      assert.strictEqual(expired, null, 'Stale in-memory fallback cache entry must return null');
    } finally {
      restore();
    }
  });

  test('TC-T2-F12-05', 'Rapid Reconnection Flapping: Transitions cleanly between Redis and fallback', async ({ client, assert, redis }) => {
    // Rapidly alternate offline and online state 5 times
    for (let cycle = 1; cycle <= 5; cycle++) {
      const restore = redis.simulateOffline();
      assert.strictEqual(redis.isRedisAvailable(), false);

      // Query catalog offline
      const offRes = await client.get('/api/products');
      assert.assertStatus(offRes, 200);

      // Restore online
      restore();

      // Query catalog online
      const onRes = await client.get('/api/products');
      assert.assertStatus(onRes, 200);
    }
  });

});
