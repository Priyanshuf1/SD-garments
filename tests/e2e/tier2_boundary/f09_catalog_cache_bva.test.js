/**
 * ALLEYRICH — Tier 2 Boundary & Corner Case Tests: Feature F9
 * File: tests/e2e/tier2_boundary/f09_catalog_cache_bva.test.js
 * 
 * Boundary Value Analysis (BVA) for Catalog Caching & Invalidation:
 * - TC-T2-F9-01: Key namespace collision & special character handling
 * - TC-T2-F9-02: Concurrent catalog queries (cache stampede resilience)
 * - TC-T2-F9-03: Deletion of non-existent product cache safety (HTTP 404)
 * - TC-T2-F9-04: Wildcard cache invalidation via cacheDel('alleyrich:catalog:products:*')
 * - TC-T2-F9-05: Cache TTL expiration and stale entry eviction
 */

'use strict';

const { defineSuite } = require('../helpers/suite.js');

module.exports = defineSuite({
  tier: 2,
  feature: 'F9',
  title: 'Feature 9 Boundary & Corner Cases: Catalog Caching & Invalidation',
  description: 'Validates key prefixes, stampede resilience under concurrent load, safe deletion barriers, wildcard invalidation, and TTL expiration.'
}, ({ test }) => {

  test('TC-T2-F9-01', 'Namespace Collision: Prefix logic prevents double-prefixing and escapes colons', async ({ assert }) => {
    const redis = require('../../../lib/redis.js');
    assert.ok(redis, 'Redis module must be loaded');

    // Test cacheSet and cacheGet with special characters and existing prefixes
    const keyWithColons = 'catalog:products:drop-2026:exclusive-hoodie';
    const sampleData = { id: 'test_drop_1', price: 2999 };

    await redis.cacheSet(keyWithColons, sampleData, 60);
    const retrieved = await redis.cacheGet(keyWithColons);
    assert.deepStrictEqual(retrieved, sampleData, 'Data stored under key with colons must match retrieved data');

    // Test with already-prefixed key
    const alreadyPrefixed = 'alleyrich:catalog:products:all';
    await redis.cacheSet(alreadyPrefixed, { allCount: 300 }, 60);
    const retrievedPrefixed = await redis.cacheGet(alreadyPrefixed);
    assert.deepStrictEqual(retrievedPrefixed, { allCount: 300 });

    // Cleanup test keys
    await redis.cacheDel(keyWithColons);
    await redis.cacheDel(alreadyPrefixed);
  });

  test('TC-T2-F9-02', 'Cache Stampede Resilience: 20 concurrent catalog requests execute without crashing', async ({ client, assert }) => {
    // Send 20 concurrent requests to catalog endpoint
    const concurrentRequests = Array.from({ length: 20 }, () => client.get('/api/products'));
    const responses = await Promise.all(concurrentRequests);

    assert.strictEqual(responses.length, 20);
    for (const res of responses) {
      assert.assertStatus(res, 200);
      assert.strictEqual(res.data.success, true);
      assert.ok(Array.isArray(res.data.products), 'Products must be an array');
      assert.ok(res.data.count > 0, 'Catalog count must be positive');
    }
  });

  test('TC-T2-F9-03', 'Non-Existent Product Deletion: Returns HTTP 404 without corrupting catalog cache', async ({ client, assert, env }) => {
    // Attempt deletion of a non-existent product ID
    const res = await client.delete('/api/admin/products/non-existent-sku-id-99999', {
      headers: env.getAdminHeaders()
    });

    assert.assertStatus(res, 404);
    assert.strictEqual(res.data.success, false);
    assert.strictEqual(res.data.message, 'Product not found');

    // Verify catalog remains healthy and intact
    const catRes = await client.get('/api/products');
    assert.assertStatus(catRes, 200);
    assert.ok(catRes.data.count > 0, 'Catalog should remain intact after failed deletion');
  });

  test('TC-T2-F9-04', 'Wildcard Invalidation Hook: cacheDel clears matching namespace keys', async ({ assert }) => {
    const redis = require('../../../lib/redis.js');

    // Set 3 mock product keys
    await redis.cacheSet('catalog:products:item_a', { title: 'A' }, 60);
    await redis.cacheSet('catalog:products:item_b', { title: 'B' }, 60);
    await redis.cacheSet('catalog:collections:item_c', { title: 'C' }, 60);

    // Verify they are accessible
    assert.deepStrictEqual(await redis.cacheGet('catalog:products:item_a'), { title: 'A' });
    assert.deepStrictEqual(await redis.cacheGet('catalog:products:item_b'), { title: 'B' });
    assert.deepStrictEqual(await redis.cacheGet('catalog:collections:item_c'), { title: 'C' });

    // Invalidate products namespace wildcard
    await redis.cacheDel('alleyrich:catalog:products:*');

    // Products keys should be evicted
    assert.strictEqual(await redis.cacheGet('catalog:products:item_a'), null, 'Item A must be evicted');
    assert.strictEqual(await redis.cacheGet('catalog:products:item_b'), null, 'Item B must be evicted');

    // Collections key must remain intact
    assert.deepStrictEqual(await redis.cacheGet('catalog:collections:item_c'), { title: 'C' }, 'Collections item must remain untouched');

    // Cleanup
    await redis.cacheDel('catalog:collections:item_c');
  });

  test('TC-T2-F9-05', 'Cache TTL Expiration: Stale cache keys expire and return null', async ({ assert }) => {
    const redis = require('../../../lib/redis.js');

    // Store key with 1-second TTL
    const ephemeralKey = 'catalog:ephemeral:drop_flash';
    await redis.cacheSet(ephemeralKey, { flash: 'sale' }, 1);

    // Immediately check: should exist
    const immediate = await redis.cacheGet(ephemeralKey);
    assert.deepStrictEqual(immediate, { flash: 'sale' }, 'Key must exist immediately after set');

    // Wait 1.1s for TTL to lapse
    await new Promise(resolve => setTimeout(resolve, 1100));

    // Stale key must return null
    const expired = await redis.cacheGet(ephemeralKey);
    assert.strictEqual(expired, null, 'Expired cache entry must return null after TTL elapses');
  });

});
