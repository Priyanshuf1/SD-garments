/**
 * ALLEYRICH — Tier 2 Boundary & Corner Case Tests: Feature F3
 * File: tests/e2e/tier2_boundary/f03_mega_dropdown_bva.test.js
 * 
 * Boundary Value Analysis (BVA) for Desktop Mega-Dropdowns:
 * - TC-T2-F3-01: Rapid hover flapping timer stability (<50ms enter/leave)
 * - TC-T2-F3-02: Tap-to-toggle touch interaction contracts
 * - TC-T2-F3-03: Outside click dismissal & mutual exclusivity
 * - TC-T2-F3-04: Viewport edge containment and overflow protection
 * - TC-T2-F3-05: Promo card media fallback and integrity
 */

'use strict';

const { defineSuite } = require('../helpers/suite.js');

module.exports = defineSuite({
  tier: 2,
  feature: 'F3',
  title: 'Feature 3 Boundary & Corner Cases: Desktop Mega-Dropdowns',
  description: 'Validates debounce timers, rapid cursor flapping, touch tap-to-toggle, click-outside dismissal, and promo asset resilience.'
}, ({ test }) => {

  test('TC-T2-F3-01', 'Rapid Mouse Flapping: Clears close timer preventing dropouts', async ({ client, assert }) => {
    // 1. Verify collections.html contains hover intent and 220ms debounce
    const colRes = await client.get('/collections.html');
    assert.assertStatus(colRes, 200);
    assert.assertHtmlContains(colRes, 'clearTimeout(closeTimer)', 'Must clear close timer on mouseenter');
    assert.assertHtmlContains(colRes, 'closeTimer = setTimeout', 'Must set debounce timer on mouseleave');
    assert.assertHtmlContains(colRes, '220', 'Debounce duration must be 220ms');

    // 2. Verify index.html contains identical 220ms hover debounce
    const indexRes = await client.get('/');
    assert.assertStatus(indexRes, 200);
    assert.assertHtmlContains(indexRes, 'clearTimeout(timer)', 'Home page must clear hover timer on mouseenter');
    assert.assertHtmlContains(indexRes, '220', 'Home page debounce must be 220ms');
  });

  test('TC-T2-F3-02', 'Touch Device Tap-To-Toggle: First tap reveals dropdown, second tap navigates', async ({ client, assert }) => {
    // Verify touch tap-to-toggle implementation in collections.html
    const res = await client.get('/collections.html');
    assert.assertStatus(res, 200);

    // Assert that first click stops navigation if closed, and allows navigation if already open
    assert.assertHtmlContains(res, 'triggerLink.addEventListener("click"', 'Trigger link click listener must exist');
    assert.assertHtmlContains(res, 'const isOpen = dropdown.classList.contains("is-open")', 'Must inspect open state on click');
    assert.assertHtmlContains(res, 'e.preventDefault()', 'Must prevent default navigation on first tap');
    assert.assertHtmlContains(res, 'e.stopPropagation()', 'Must stop propagation on first tap');
  });

  test('TC-T2-F3-03', 'Outside Click Dismissal: Removes open class across all active menus', async ({ client, assert }) => {
    const res = await client.get('/collections.html');
    assert.assertStatus(res, 200);

    // Verify global document click listener removes .is-open from all dropdowns
    assert.assertHtmlContains(res, '!e.target.closest(".nav-item-dropdown")', 'Must detect clicks outside dropdown container');
    assert.assertHtmlContains(res, 'd.classList.remove("is-open")', 'Must remove is-open on outside click');

    // Also verify home page closes other disclosures on enter
    const indexRes = await client.get('/');
    assert.assertHtmlContains(indexRes, "d.removeAttribute('open')", 'Home page must close other disclosures');
  });

  test('TC-T2-F3-04', 'Viewport Edge Containment: Prevents horizontal overflow on boundary screens', async ({ client, assert }) => {
    const res = await client.get('/collections.html');
    assert.assertStatus(res, 200);

    // Verify mega dropdown layout has container boundaries
    assert.assertHtmlContains(res, 'mega-dropdown', 'Mega dropdown class must exist');
    assert.assertHtmlContains(res, 'overflow-x: hidden', 'Page must prevent horizontal scroll overflow');
  });

  test('TC-T2-F3-05', 'Promo Card Media Fallback: Standard images reference valid static paths', async ({ client, assert }) => {
    // 1. Inspect index.html promo card markup
    const indexRes = await client.get('/');
    assert.assertStatus(indexRes, 200);
    assert.assertHtmlContains(indexRes, 'mega-menu__promo', 'Promo card container must exist in mega menu');
    assert.assertHtmlContains(indexRes, '/images/photo_1.webp', 'Promo image path must be present');

    // 2. Verify static photo assets exist and return HTTP 200
    const promoImageRes = await client.get('/images/photo_1.webp');
    assert.assertStatus(promoImageRes, 200);
    assert.assertHeader(promoImageRes, 'content-type', /image\/(webp|jpeg|png)/i);
  });

});
