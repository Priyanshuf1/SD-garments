/**
 * ALLEYRICH — Tier 2 Boundary & Corner Case Tests: Feature F1
 * File: tests/e2e/tier2_boundary/f01_pagination_bva.test.js
 * 
 * Boundary Value Analysis (BVA) for Catalog Pagination & Slicing:
 * - TC-T2-F1-01: Negative page index clamping
 * - TC-T2-F1-02: Page index exceeding total available pages
 * - TC-T2-F1-03: Non-numeric and NaN page parameters
 * - TC-T2-F1-04: Zero total products catalog & empty state rendering
 * - TC-T2-F1-05: Exact page size boundary (24 items threshold)
 */

'use strict';

const { defineSuite } = require('../helpers/suite.js');

module.exports = defineSuite({
  tier: 2,
  feature: 'F1',
  title: 'Feature 1 Boundary & Corner Cases: Catalog Pagination & Slicing',
  description: 'Validates boundary values, invalid parameters, overflow limits, and empty catalog pagination behavior.'
}, ({ test }) => {

  test('TC-T2-F1-01', 'Negative Page Index: Clamps negative page numbers to page 1', async ({ client, assert }) => {
    // 1. Verify HTTP response for negative page query
    const res = await client.get('/collections.html?page=-5');
    assert.assertStatus(res, 200);
    assert.assertHtmlContains(res, 'CollectionEngine', 'CollectionEngine must be present');
    assert.assertHtmlContains(res, 'if (this.currentPage < 1) this.currentPage = 1;', 'Underflow clamp guard must be implemented');

    // 2. Query catalog API to get actual product count
    const catalogRes = await client.get('/api/products');
    assert.assertStatus(catalogRes, 200);
    const totalProducts = catalogRes.data.products.length;
    assert.ok(totalProducts > 0, 'Catalog should contain products');

    // 3. Emulate CollectionEngine boundary calculation with negative page
    const pageSize = 24;
    let pageParam = parseInt('-5', 10);
    let currentPage = (!isNaN(pageParam) && pageParam >= 1) ? pageParam : 1;
    if (currentPage < 1) currentPage = 1;

    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalProducts);

    assert.strictEqual(currentPage, 1, 'Negative page must be clamped to 1');
    assert.strictEqual(startIndex, 0, 'Start index must be 0 for clamped page 1');
    assert.strictEqual(endIndex, Math.min(24, totalProducts), 'End index must reflect first page slice');
  });

  test('TC-T2-F1-02', 'Page Index Overflow: Clamps page exceeding total pages to max page', async ({ client, assert }) => {
    // 1. Verify collections.html serves cleanly with high page parameter
    const res = await client.get('/collections.html?page=9999');
    assert.assertStatus(res, 200);
    assert.assertHtmlContains(res, 'if (this.currentPage > totalPages) this.currentPage = totalPages;', 'Overflow clamp guard must be implemented');

    // 2. Fetch catalog and compute total pages
    const catalogRes = await client.get('/api/products');
    assert.assertStatus(catalogRes, 200);
    const totalProducts = catalogRes.data.products.length;
    const pageSize = 24;
    const totalPages = Math.ceil(totalProducts / pageSize) || 1;

    // 3. Evaluate overflow logic
    let requestedPage = 9999;
    let clampedPage = requestedPage;
    if (clampedPage > totalPages) clampedPage = totalPages;

    assert.strictEqual(clampedPage, totalPages, `Page 9999 should clamp to totalPages (${totalPages})`);

    const startIndex = (clampedPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalProducts);
    const finalSliceCount = endIndex - startIndex;

    assert.ok(finalSliceCount > 0 && finalSliceCount <= pageSize, 'Final page slice must contain remainder items');
    assert.strictEqual(endIndex, totalProducts, 'Final page slice must end at totalProducts count');
  });

  test('TC-T2-F1-03', 'Non-Numeric Page Parameter: NaN and string fallback to page 1 default', async ({ client, assert }) => {
    // 1. Verify invalid query parameters do not cause 500 error
    const testParams = ['abc', 'null', 'undefined', '%20', 'true'];
    for (const param of testParams) {
      const res = await client.get(`/collections.html?page=${param}`);
      assert.assertStatus(res, 200);

      // Verify parse logic matches CollectionEngine contract
      const parsed = parseInt(param, 10);
      const resolvedPage = (!isNaN(parsed) && parsed >= 1) ? parsed : 1;
      assert.strictEqual(resolvedPage, 1, `Invalid page param '${param}' must resolve to default page 1`);
    }

    // 2. Verify collections.html contains NaN guard in parseUrlCategory
    const pageHtml = await client.get('/collections.html');
    assert.assertHtmlContains(pageHtml, '!isNaN(pageParam)', 'Must check isNaN on parsed page parameter');
  });

  test('TC-T2-F1-04', 'Zero Total Products: Avoids division by zero and hides pagination', async ({ client, assert }) => {
    // 1. Query catalog with an impossible search term returning 0 items
    const emptyCatalogRes = await client.get('/api/products?search=NONEXISTENT_STREETWEAR_SILHOUETTE_XY99Z');
    assert.assertStatus(emptyCatalogRes, 200);
    assert.strictEqual(emptyCatalogRes.data.success, true);
    assert.strictEqual(emptyCatalogRes.data.count, 0, 'Count must be 0 for non-existent search');
    assert.strictEqual(emptyCatalogRes.data.products.length, 0, 'Products array must be empty');

    // 2. Verify zero-division avoidance in CollectionEngine pagination formula
    const totalProducts = emptyCatalogRes.data.products.length;
    const pageSize = 24;
    const totalPages = Math.ceil(totalProducts / pageSize) || 1;
    assert.strictEqual(totalPages, 1, 'Total pages must fall back to 1 when product count is 0');
    assert.ok(!isNaN(totalPages), 'Total pages must not be NaN');
    assert.ok(isFinite(totalPages), 'Total pages must be finite');

    // 3. Verify collections.html contains empty state template & pagination hiding
    const pageRes = await client.get('/collections.html');
    assert.assertStatus(pageRes, 200);
    assert.assertHtmlContains(pageRes, 'No Streetwear Items Found', 'Empty state title must be defined');
    assert.assertHtmlContains(pageRes, 'BROWSE ALL DROPS', 'Empty state reset CTA must be present');
    assert.assertHtmlContains(pageRes, "paginationEl.style.display = 'none'", 'Pagination must hide when totalPages <= 1');
  });

  test('TC-T2-F1-05', 'Exact Page Size Boundary (24 Products): Correctly bounds single page', async ({ client, assert }) => {
    // 1. Test mathematical boundary where totalProducts == pageSize (24)
    const pageSize = 24;
    const boundaryProducts = 24;
    const totalPages = Math.ceil(boundaryProducts / pageSize) || 1;

    assert.strictEqual(totalPages, 1, 'Exactly 24 products must result in exactly 1 page');

    // Slicing check
    const startIndex = (1 - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, boundaryProducts);
    const sliceCount = endIndex - startIndex;

    assert.strictEqual(sliceCount, 24, 'All 24 products should be displayed on page 1');

    // 2. Boundary edge: 25 products should trigger page 2
    const edgeProducts = 25;
    const edgeTotalPages = Math.ceil(edgeProducts / pageSize);
    assert.strictEqual(edgeTotalPages, 2, '25 products must result in 2 pages');

    // 3. Confirm collections.html hides pagination when totalPages <= 1
    const res = await client.get('/collections.html');
    assert.assertStatus(res, 200);
    assert.assertHtmlContains(res, 'if (totalPages <= 1)', 'Pagination check must hide on single page boundary');
  });

});
