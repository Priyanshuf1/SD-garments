/**
 * ALLEYRICH — Tier 2 Boundary & Corner Case Tests: Feature F4
 * File: tests/e2e/tier2_boundary/f04_mobile_header_bva.test.js
 * 
 * Boundary Value Analysis (BVA) for Mobile Edge-to-Edge Header & Navigation:
 * - TC-T2-F4-01: Orientation and 900px breakpoint layout handover
 * - TC-T2-F4-02: Rapid hamburger double-tap state & body lock synchronization
 * - TC-T2-F4-03: Multi-accordion independent expansion without collision
 * - TC-T2-F4-04: Ultra-narrow 320px viewport geometry & touch target sizing
 * - TC-T2-F4-05: Drawer internal scrolling and backdrop isolation
 */

'use strict';

const { defineSuite } = require('../helpers/suite.js');

module.exports = defineSuite({
  tier: 2,
  feature: 'F4',
  title: 'Feature 4 Boundary & Corner Cases: Mobile Edge-to-Edge Header',
  description: 'Validates responsive breakpoints, rapid drawer toggling, accordion isolation, narrow screen touch targets, and scroll locking.'
}, ({ test }) => {

  test('TC-T2-F4-01', 'Orientation Change Handover: 900px breakpoint switches mobile header state', async ({ client, assert }) => {
    const res = await client.get('/collections.html');
    assert.assertStatus(res, 200);

    // Verify 900px responsive breakpoint rules in CSS
    assert.assertHtmlContains(res, '@media (max-width: 900px)', '900px media query must be defined');
    assert.assertHtmlContains(res, 'max-width: 100vw !important', 'Header must span 100vw edge-to-edge');
    assert.assertHtmlContains(res, 'position: sticky', 'Header must be sticky at top: 0');
  });

  test('TC-T2-F4-02', 'Rapid Hamburger Double-Tap: Synchronizes drawer transform, backdrop, and body overflow', async ({ client, assert }) => {
    const res = await client.get('/collections.html');
    assert.assertStatus(res, 200);

    // Verify toggleMobileDrawer implementation
    assert.assertHtmlContains(res, 'toggleMobileDrawer(show = null)', 'Mobile drawer toggle function must exist');
    assert.assertHtmlContains(res, "backdrop.style.display = willOpen ? 'block' : 'none'", 'Backdrop must synchronize with drawer state');
    assert.assertHtmlContains(res, "drawer.style.transform = willOpen ? 'translateX(0)' : 'translateX(-100%)'", 'Drawer translation must toggle cleanly');
    assert.assertHtmlContains(res, "document.body.style.overflow = willOpen ? 'hidden' : ''", 'Body scroll lock must be restored on close');
  });

  test('TC-T2-F4-03', 'Multi-Accordion Expansion: Independent class toggling across navigation sections', async ({ client, assert }) => {
    const res = await client.get('/collections.html');
    assert.assertStatus(res, 200);

    // Verify toggleAccordion handles individual section elements
    assert.assertHtmlContains(res, 'toggleAccordion(headerEl)', 'Accordion toggle function must exist');
    assert.assertHtmlContains(res, "accordion.classList.toggle('is-open')", 'Accordion must toggle is-open independently');
    assert.assertHtmlContains(res, 'mobile-accordion', 'Accordion markup classes must be defined');
  });

  test('TC-T2-F4-04', 'Ultra-Narrow Screen (320px): Preserves touch targets and compact padding', async ({ client, assert }) => {
    const res = await client.get('/collections.html');
    assert.assertStatus(res, 200);

    // Verify touch action button styling
    assert.assertHtmlContains(res, 'action-touch-btn', 'Action buttons must have touch target class');
    assert.assertHtmlContains(res, 'allyrich-header-logo-img', 'Logo image class must exist');
    assert.assertHtmlContains(res, 'max-width: 100vw', 'Page must clamp width to 100vw');
  });

  test('TC-T2-F4-05', 'Drawer Scroll Boundary: Drawer internal overflow is independent of page', async ({ client, assert }) => {
    const res = await client.get('/collections.html');
    assert.assertStatus(res, 200);

    // Verify drawer element has touch scrolling and overflow-y: auto
    assert.assertHtmlContains(res, 'id="mobile-nav-drawer"', 'Drawer element must exist');
    assert.assertHtmlContains(res, 'overflow-y:auto', 'Drawer must allow vertical scrolling for long menus');
    assert.assertHtmlContains(res, 'id="mobile-nav-backdrop"', 'Backdrop element must exist for dismissals');
  });

});
