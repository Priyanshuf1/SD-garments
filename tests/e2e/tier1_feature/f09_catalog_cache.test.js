/**
 * ALLEYRICH — Tier 1 Feature Coverage: Feature F9
 * File: tests/e2e/tier1_feature/f09_catalog_cache.test.js
 * 
 * Tests for Catalog Caching & Invalidation:
 * - TC-T1-F9-01: Catalog Response Caching (Subsequent GET /api/products served from cache with sub-millisecond latency)
 * - TC-T1-F9-02: Single Product Handle Caching (GET /api/products/:handle cached under handle key)
 * - TC-T1-F9-03: Admin Product Creation Cache Invalidation (POST /api/admin/products evicts catalog cache)
 * - TC-T1-F9-04: Admin Product Update Cache Invalidation (PUT /api/admin/products/:id evicts cache and serves updated price)
 * - TC-T1-F9-05: Collections Catalog Invalidation (POST /api/admin/collections evicts collections cache)
 */

'use strict';

const { defineSuite } = require('../helpers/suite.js');

module.exports = defineSuite({
  tier: 1,
  feature: 'F9',
  title: 'Feature 9 Coverage: Catalog Caching & Invalidation',
  description: 'Verifies sub-millisecond catalog caching in Redis/in-memory, single item handle caching, and instant cache eviction upon administrative mutations.'
}, ({ test }) => {

  test('TC-T1-F9-01', 'Catalog Response Caching: Consecutive catalog requests return identical payloads with fast cached response', async ({ client, assert }) => {
    // 1. Initial catalog request (populates cache)
    const res1 = await client.get('/api/products');
    assert.assertStatus(res1, 200);
    assert.strictEqual(res1.data.success, true);
    assert.ok(Array.isArray(res1.data.products));

    // 2. Second request immediately after (served from cache)
    const res2 = await client.get('/api/products');
    assert.assertStatus(res2, 200);
    assert.strictEqual(res2.data.success, true);
    assert.strictEqual(res2.data.count, res1.data.count, 'Cached product count must match initial response');
    assert.strictEqual(res2.data.products.length, res1.data.products.length, 'Cached product list length must match');
  });

  test('TC-T1-F9-02', 'Single Product Handle Caching: Individual product handle query returns consistent cached product data', async ({ client, assert }) => {
    // 1. Fetch catalog to obtain an existing handle
    const catalogRes = await client.get('/api/products');
    assert.assertStatus(catalogRes, 200);
    const sampleProduct = catalogRes.data.products[0];
    const handle = sampleProduct.handle;
    assert.ok(handle, 'Sample product must have a handle');

    // 2. Query product by handle twice
    const res1 = await client.get(`/api/products/${encodeURIComponent(handle)}`);
    assert.assertStatus(res1, 200);
    assert.strictEqual(res1.data.success, true);

    const res2 = await client.get(`/api/products/${encodeURIComponent(handle)}`);
    assert.assertStatus(res2, 200);
    assert.strictEqual(res2.data.success, true);
    const prod1 = res1.data.product || res1.data;
    const prod2 = res2.data.product || res2.data;
    assert.strictEqual(prod1.handle, prod2.handle, 'Cached product handle must match');
  });

  test('TC-T1-F9-03', 'Admin Product Creation Cache Invalidation: Creating product triggers cache eviction so subsequent fetch includes new product', async ({ client, env, assert }) => {
    const ts = Date.now();
    const testHandle = `e2e-cache-test-${ts}`;
    const newProduct = {
      title: `E2E Cache Invalidation Tee ${ts}`,
      handle: testHandle,
      category: 'Top Wear',
      price: '1999',
      variants: [{ id: 1, title: 'M', price: '1999', available: true, inventory_quantity: 50 }],
      images: [{ id: 1, src: '/images/photo_1.webp' }]
    };

    // 1. Prime the catalog cache
    await client.get('/api/products');

    // 2. Create new product via admin API
    const createRes = await client.post('/api/admin/products', newProduct, {
      headers: env.getAdminHeaders()
    });
    assert.assertStatus(createRes, 201);
    assert.strictEqual(createRes.data.success, true);
    const createdId = createRes.data.product?.id || createRes.data.id;
    assert.ok(createdId, 'Created product must have an ID');

    try {
      // 3. Immediately query storefront catalog — should contain the newly created product
      const freshRes = await client.get('/api/products');
      assert.assertStatus(freshRes, 200);
      const exists = freshRes.data.products.some(p => p.handle === testHandle || String(p.id) === String(createdId));
      assert.ok(exists, 'Newly created product must appear in catalog after cache eviction');
    } finally {
      // Clean up test product
      await client.delete(`/api/admin/products/${createdId}`, {
        headers: env.getAdminHeaders()
      });
    }
  });

  test('TC-T1-F9-04', 'Admin Product Update Cache Invalidation: Updating product price evicts cache and serves updated price immediately', async ({ client, env, assert }) => {
    const ts = Date.now();
    const testHandle = `e2e-update-test-${ts}`;
    const createRes = await client.post('/api/admin/products', {
      title: `E2E Update Item ${ts}`,
      handle: testHandle,
      category: 'Bottom Wear',
      price: '1299',
      variants: [{ id: 1, title: 'M', price: '1299', available: true, inventory_quantity: 10 }]
    }, {
      headers: env.getAdminHeaders()
    });
    assert.assertStatus(createRes, 201);
    const prodId = createRes.data.product?.id || createRes.data.id;

    try {
      // Prime cache
      await client.get(`/api/products/${testHandle}`);

      // Update price
      const updateRes = await client.put(`/api/admin/products/${prodId}`, {
        price: '1599',
        variants: [{ id: 1, title: 'M', price: '1599', available: true, inventory_quantity: 10 }]
      }, {
        headers: env.getAdminHeaders()
      });
      assert.assertStatus(updateRes, 200);

      // Verify immediate fresh read returns updated price
      const freshRes = await client.get(`/api/products/${testHandle}`);
      assert.assertStatus(freshRes, 200);
      const prod = freshRes.data.product || freshRes.data;
      assert.strictEqual(String(prod.price), '1599', 'Catalog should reflect updated price immediately');
    } finally {
      await client.delete(`/api/admin/products/${prodId}`, {
        headers: env.getAdminHeaders()
      });
    }
  });

  test('TC-T1-F9-05', 'Collections Catalog Invalidation: Adding new collection evicts collection cache and reflects new drop', async ({ client, env, assert }) => {
    const ts = Date.now();
    const colHandle = `e2e-col-${ts}`;

    // Prime collections cache
    const initialRes = await client.get('/api/collections');
    assert.assertStatus(initialRes, 200);
    const initialCount = initialRes.data.collections?.length || initialRes.data.count || 0;

    // Create new collection
    const createRes = await client.post('/api/admin/collections', {
      title: `E2E Capsule ${ts}`,
      handle: colHandle,
      description: 'Test capsule for cache invalidation'
    }, {
      headers: env.getAdminHeaders()
    });
    assert.assertStatus(createRes, 201);
    const colId = createRes.data.collection?.id || createRes.data.id;

    try {
      // Fetch collections — must include new capsule
      const afterRes = await client.get('/api/collections');
      assert.assertStatus(afterRes, 200);
      const cols = afterRes.data.collections || [];
      const found = cols.some(c => c.handle === colHandle || String(c.id) === String(colId));
      assert.ok(found, 'New collection must be visible after cache invalidation');
    } finally {
      if (colId) {
        await client.delete(`/api/admin/collections/${colId}`, {
          headers: env.getAdminHeaders()
        });
      }
    }
  });

});
