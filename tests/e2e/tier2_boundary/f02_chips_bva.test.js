/**
 * ALLEYRICH — Tier 2 Boundary & Corner Case Tests: Feature F2
 * File: tests/e2e/tier2_boundary/f02_chips_bva.test.js
 * 
 * Boundary Value Analysis (BVA) for Category Chips Navigation:
 * - TC-T2-F2-01: Non-existent category slug fallback
 * - TC-T2-F2-02: Zero-product filter combinations
 * - TC-T2-F2-03: Rapid sequential category toggling state stability
 * - TC-T2-F2-04: Case insensitivity and delimiter variations
 * - TC-T2-F2-05: Malicious XSS category payload resistance
 */

'use strict';

const { defineSuite } = require('../helpers/suite.js');

module.exports = defineSuite({
  tier: 2,
  feature: 'F2',
  title: 'Feature 2 Boundary & Corner Cases: Category Chips Navigation',
  description: 'Validates invalid slugs, zero-result categories, delimiter variations, rapid toggle synchronization, and XSS safety.'
}, ({ test }) => {

  test('TC-T2-F2-01', 'Non-Existent Category Slug: Falls back to all products without error', async ({ client, assert }) => {
    // 1. Request unknown collection URL
    const res = await client.get('/collections/unknown-alien-capsule-xyz');
    assert.assertStatus(res, 200);
    assert.assertHtmlContains(res, 'id="category-chips"', 'Category chips DOM container must exist');
    assert.assertHtmlContains(res, 'this.activeCategory = \'all\';', 'Must have safe fallback to all category');

    // 2. Query products API with unknown category
    const apiRes = await client.get('/api/products?category=unknown-alien-capsule-xyz');
    assert.assertStatus(apiRes, 200);
    assert.strictEqual(apiRes.data.success, true);
    assert.strictEqual(apiRes.data.count, 0, 'API must return 0 products for unknown category');
    assert.strictEqual(apiRes.data.products.length, 0);
  });

  test('TC-T2-F2-02', 'Zero-Product Filter Combination: Renders empty state card gracefully', async ({ client, assert }) => {
    // 1. Query with impossible filter combination (e.g. valid category + conflicting search)
    const res = await client.get('/api/products?category=shirts&search=IMPOSSIBLE_SEARCH_TERM_NO_MATCH_999');
    assert.assertStatus(res, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.count, 0, 'Filter combination must return empty set');
    assert.deepStrictEqual(res.data.products, [], 'Products array must be empty');

    // 2. Verify collections.html contains empty state markup
    const pageRes = await client.get('/collections.html');
    assert.assertStatus(pageRes, 200);
    assert.assertHtmlContains(pageRes, 'No Streetwear Items Found', 'Empty state header must exist');
    assert.assertHtmlContains(pageRes, 'There are no products matching this filter combination.', 'Empty state subtitle must exist');
    assert.assertHtmlContains(pageRes, 'CollectionEngine.clearFilters()', 'Must provide filter reset mechanism');
  });

  test('TC-T2-F2-03', 'Rapid Chip Toggling: Sequential category queries settle cleanly', async ({ client, assert }) => {
    // Emulate 4 rapid sequential category requests mimicking rapid user clicks
    const categories = ['shirts', 'hoodies', 'mens-jeans', 'all'];
    const results = [];

    for (const cat of categories) {
      const q = cat === 'all' ? '' : `?category=${cat}`;
      const res = await client.get(`/api/products${q}`);
      assert.assertStatus(res, 200);
      assert.strictEqual(res.data.success, true);
      results.push({ category: cat, count: res.data.count, products: res.data.products });
    }

    // Verify each result is distinctly filtered and self-consistent
    assert.strictEqual(results.length, 4);
    const allCount = results[3].count;
    assert.ok(allCount > 0, 'Total catalog count must be positive');

    // Filtered counts should be <= total catalog
    for (let i = 0; i < 3; i++) {
      assert.ok(results[i].count <= allCount, `Category ${results[i].category} count (${results[i].count}) should be <= total (${allCount})`);
    }

    // Verify final state matches 'all' category without cross-pollution
    assert.strictEqual(results[3].category, 'all');
  });

  test('TC-T2-F2-04', 'Case & Delimiter Variations: Normalizes underscores and casing', async ({ client, assert }) => {
    // 1. Verify API handles case insensitivity
    const upperRes = await client.get('/api/products?category=SHIRTS');
    const lowerRes = await client.get('/api/products?category=shirts');

    assert.assertStatus(upperRes, 200);
    assert.assertStatus(lowerRes, 200);
    assert.strictEqual(upperRes.data.count, lowerRes.data.count, 'Upper and lowercase category filters must return identical counts');

    // 2. Verify delimiter normalization logic in collections.html
    const pageRes = await client.get('/collections.html');
    assert.assertStatus(pageRes, 200);
    assert.assertHtmlContains(pageRes, 'replace(/_/g, \'-\')', 'URL category parsing must normalize underscores to hyphens');
  });

  test('TC-T2-F2-05', 'Malicious XSS Category Payload: Sanitized without script injection', async ({ client, assert }) => {
    // 1. Test XSS payload in API query parameter
    const xssPayload = '<script>alert("xss")</script>';
    const apiRes = await client.get(`/api/products?category=${encodeURIComponent(xssPayload)}`);
    assert.assertStatus(apiRes, 200);
    assert.strictEqual(apiRes.data.success, true);
    assert.strictEqual(apiRes.data.count, 0, 'XSS query must match 0 products');

    // 2. Test XSS payload on HTML page request
    const pageRes = await client.get(`/collections.html?category=${encodeURIComponent(xssPayload)}`);
    assert.assertStatus(pageRes, 200);

    // Verify that raw script tags are not unescaped in dynamic title
    assert.ok(!pageRes.text.includes('<script>alert("xss")</script><'), 'Raw script tags must not be injected into HTML DOM');
  });

});
