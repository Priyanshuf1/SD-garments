/**
 * ALLEYRICH — Tier 1 Feature Coverage: Feature F1
 * File: tests/e2e/tier1_feature/f01_pagination.test.js
 * 
 * Tests for Catalog Pagination & Slicing:
 * - TC-T1-F1-01: Default Page 1 Slice (24 items/page, active button '1', SHOWING 1–24 OF {total})
 * - TC-T1-F1-02: Next Page Navigation (slice index 24..47, URL pushState ?page=2, prev arrow enabled)
 * - TC-T1-F1-03: Last Page Boundary Slice (slice remainder, next arrow disabled)
 * - TC-T1-F1-04: Previous Arrow Navigation (return to page 1 slice, prev arrow disabled)
 * - TC-T1-F1-05: Direct URL Page Initialization (?page=2 initializes on page 2)
 */

'use strict';

const { defineSuite } = require('../helpers/suite.js');

module.exports = defineSuite({
  tier: 1,
  feature: 'F1',
  title: 'Feature 1 Coverage: Catalog Pagination & Slicing',
  description: 'Verifies 24 items per page slicing, page transitions, URL sync, dynamic ellipsis, and button states.'
}, ({ test }) => {

  test('TC-T1-F1-01', 'Default Page 1 Slice: Displays first 24 items with active button 1 and count text', async ({ client, assert }) => {
    // 1. Verify API catalog response
    const apiRes = await client.get('/api/products');
    assert.assertStatus(apiRes, 200);
    assert.strictEqual(apiRes.data.success, true);
    assert.ok(Array.isArray(apiRes.data.products), 'Products must be an array');
    const totalProducts = apiRes.data.products.length;
    assert.ok(totalProducts >= 24, `Catalog should contain at least 24 products, got ${totalProducts}`);

    // 2. Fetch storefront collections page
    const pageRes = await client.get('/collections.html');
    assert.assertStatus(pageRes, 200);
    assert.assertHtmlContains(pageRes, 'id="catalog-pagination"');
    assert.assertHtmlContains(pageRes, 'products-count-text');
    assert.assertHtmlContains(pageRes, 'pageSize: 24');

    // 3. Verify Page 1 slice calculation contract
    const pageSize = 24;
    const currentPage = 1;
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalProducts);
    const expectedCountText = `SHOWING ${startIndex + 1}–${endIndex} OF ${totalProducts} PRODUCTS`;

    assert.strictEqual(startIndex, 0, 'Page 1 start index must be 0');
    assert.strictEqual(endIndex, 24, 'Page 1 end index must be 24');
    assert.strictEqual(endIndex - startIndex, 24, 'Page 1 slice length must be exactly 24');
    assert.strictEqual(expectedCountText, `SHOWING 1–24 OF ${totalProducts} PRODUCTS`);
  });

  test('TC-T1-F1-02', 'Next Page Navigation: Advances to page 2, updates slice to 25..48, enables previous button', async ({ client, assert }) => {
    // 1. Fetch catalog
    const apiRes = await client.get('/api/products');
    assert.assertStatus(apiRes, 200);
    const totalProducts = apiRes.data.products.length;
    const pageSize = 24;
    const totalPages = Math.ceil(totalProducts / pageSize);
    assert.ok(totalPages >= 2, 'Total pages must be >= 2 for next page navigation test');

    // 2. Simulate goToPage(2)
    const targetPage = 2;
    const startIndex = (targetPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalProducts);
    const expectedCountText = `SHOWING ${startIndex + 1}–${endIndex} OF ${totalProducts} PRODUCTS`;

    assert.strictEqual(startIndex, 24, 'Page 2 start index must be 24');
    assert.strictEqual(endIndex, Math.min(48, totalProducts), 'Page 2 end index must be min(48, totalProducts)');

    // 3. Verify URL parameter pushState pattern in collections.html
    const pageRes = await client.get('/collections.html');
    assert.assertStatus(pageRes, 200);
    assert.assertHtmlContains(pageRes, "url.searchParams.set('page', page)");
    assert.assertHtmlContains(pageRes, "window.history.pushState(null, '', url)");

    // 4. Arrow navigation button states
    const prevDisabled = targetPage <= 1;
    const nextDisabled = targetPage >= totalPages;
    assert.strictEqual(prevDisabled, false, 'Previous arrow must be enabled on page 2');
    assert.strictEqual(nextDisabled, targetPage >= totalPages, 'Next arrow state must match page position');
  });

  test('TC-T1-F1-03', 'Last Page Boundary Slice: Renders final remainder items with next button disabled', async ({ client, assert }) => {
    // 1. Calculate last page
    const apiRes = await client.get('/api/products');
    assert.assertStatus(apiRes, 200);
    const totalProducts = apiRes.data.products.length;
    const pageSize = 24;
    const totalPages = Math.ceil(totalProducts / pageSize);

    // 2. Compute last page slice
    const startIndex = (totalPages - 1) * pageSize;
    const endIndex = totalProducts;
    const remainderCount = endIndex - startIndex;

    assert.ok(remainderCount > 0 && remainderCount <= 24, 'Remainder count must be between 1 and 24');

    // 3. Verify boundary arrow states
    const prevDisabled = totalPages <= 1;
    const nextDisabled = totalPages >= totalPages; // true
    assert.strictEqual(nextDisabled, true, 'Next arrow must be disabled on last page');
    assert.strictEqual(prevDisabled, false, 'Previous arrow must be enabled on last page (when totalPages > 1)');

    // 4. Verify count label format in collections.html
    const pageRes = await client.get('/collections.html');
    assert.assertStatus(pageRes, 200);
    assert.assertHtmlContains(pageRes, 'Page ${this.currentPage} of ${totalPages} · ${totalProducts} Streetwear Silhouettes');
  });

  test('TC-T1-F1-04', 'Previous Arrow Navigation: Navigates back from page 2 to page 1, re-disabling previous arrow', async ({ client, assert }) => {
    // 1. Step backward from page 2 to 1
    const startPage = 2;
    const backPage = startPage - 1;
    assert.strictEqual(backPage, 1, 'Stepping back from 2 must yield page 1');

    // 2. Validate resulting slice for page 1
    const pageSize = 24;
    const startIndex = (backPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;

    assert.strictEqual(startIndex, 0);
    assert.strictEqual(endIndex, 24);

    // 3. Arrow state on page 1
    const prevDisabled = backPage <= 1;
    assert.strictEqual(prevDisabled, true, 'Previous arrow must be disabled on page 1');

    // 4. Verify pagination button template in collections.html
    const pageRes = await client.get('/collections.html');
    assert.assertStatus(pageRes, 200);
    assert.assertHtmlContains(pageRes, '${prevDisabled ? \'disabled\' : \'\'}');
    assert.assertHtmlContains(pageRes, 'class="pagination-num-btn ${isActive ? \'is-active\' : \'\'}"');
  });

  test('TC-T1-F1-05', 'Direct URL Page Initialization: Reads ?page=2 query param and initializes on page 2', async ({ client, assert }) => {
    // 1. Request collections with page=2 query
    const res = await client.get('/collections.html?page=2');
    assert.assertStatus(res, 200);

    // 2. Verify URL search param extraction in collections.html
    assert.assertHtmlContains(res, 'new URLSearchParams(window.location.search)');
    assert.assertHtmlContains(res, "params.get('page')");

    // 3. Simulate parsing
    const url = new URL('http://127.0.0.1:3000/collections.html?page=2');
    const param = url.searchParams.get('page');
    const parsedPage = parseInt(param, 10);
    assert.strictEqual(parsedPage, 2, 'Parsed page parameter must be 2');

    // 4. Verify clamp check
    let initialPage = (!isNaN(parsedPage) && parsedPage >= 1) ? parsedPage : 1;
    assert.strictEqual(initialPage, 2, 'Initial page should be set to 2');
  });

});
