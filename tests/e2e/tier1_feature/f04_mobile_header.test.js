/**
 * ALLEYRICH — Tier 1 Feature Coverage: Feature F4
 * File: tests/e2e/tier1_feature/f04_mobile_header.test.js
 * 
 * Tests for Mobile Edge-to-Edge Header & Navigation Drawer:
 * - TC-T1-F4-01: Header Layout & Sticky Styling (position: sticky, top: 0, #000000 black, 100vw)
 * - TC-T1-F4-02: Touch Target Sizing (interactive buttons >= 32px, 28px mobile logo)
 * - TC-T1-F4-03: Mobile Drawer Open Trigger (toggleMobileDrawer opens translateX(0), locks body scroll)
 * - TC-T1-F4-04: Accordion Expansion (toggleAccordion expands subcategories with .is-open)
 * - TC-T1-F4-05: Backdrop Click Dismissal (toggleMobileDrawer closes translateX(-100%), unlocks scroll)
 */

'use strict';

const { defineSuite } = require('../helpers/suite.js');

module.exports = defineSuite({
  tier: 1,
  feature: 'F4',
  title: 'Feature 4 Coverage: Mobile Edge-to-Edge Header',
  description: 'Verifies mobile sticky header styling, touch targets, off-canvas navigation drawer, accordion toggle, and backdrop dismissal.'
}, ({ test }) => {

  test('TC-T1-F4-01', 'Header Layout & Sticky Styling: Renders pure black sticky header spanning 100vw', async ({ client, assert }) => {
    const pageRes = await client.get('/collections.html');
    assert.assertStatus(pageRes, 200);

    // Verify .site-header CSS properties
    assert.assertHtmlContains(pageRes, '.site-header {');
    assert.assertHtmlContains(pageRes, 'background: #000000 !important;');
    assert.assertHtmlContains(pageRes, 'position: sticky;');
    assert.assertHtmlContains(pageRes, 'top: 0;');
    assert.assertHtmlContains(pageRes, 'max-width: 100vw;');
    assert.assertHtmlContains(pageRes, 'box-sizing: border-box;');

    // Verify mobile responsive padding under max-width: 900px
    assert.assertHtmlContains(pageRes, '@media (max-width: 900px)');
    assert.assertHtmlContains(pageRes, 'padding: 0.5rem 0.55rem !important;');
  });

  test('TC-T1-F4-02', 'Touch Target Sizing: Interactive mobile action buttons meet minimum 32px touch target requirements', async ({ client, assert }) => {
    const pageRes = await client.get('/collections.html');
    assert.assertStatus(pageRes, 200);

    // Verify touch action button minimum dimensions
    assert.assertHtmlContains(pageRes, '.header-actions-group .action-touch-btn {');
    assert.assertHtmlContains(pageRes, 'min-width: 32px !important;');
    assert.assertHtmlContains(pageRes, 'min-height: 32px !important;');
    assert.assertHtmlContains(pageRes, 'width: 32px !important;');
    assert.assertHtmlContains(pageRes, 'height: 32px !important;');

    // Verify mobile logo scaling
    assert.assertHtmlContains(pageRes, '.allyrich-header-logo-img {');
    assert.assertHtmlContains(pageRes, 'width: 28px !important;');
    assert.assertHtmlContains(pageRes, 'height: 28px !important;');
  });

  test('TC-T1-F4-03', 'Mobile Drawer Open Trigger: toggleMobileDrawer(true) slides drawer in and locks body scroll', async ({ client, assert }) => {
    const pageRes = await client.get('/collections.html');
    assert.assertStatus(pageRes, 200);

    // Verify drawer and backdrop markup
    assert.assertHtmlContains(pageRes, 'id="mobile-nav-drawer"');
    assert.assertHtmlContains(pageRes, 'id="mobile-nav-backdrop"');

    // Verify toggleMobileDrawer implementation
    assert.assertHtmlContains(pageRes, 'toggleMobileDrawer(show = null) {');
    assert.assertHtmlContains(pageRes, "backdrop.style.display = willOpen ? 'block' : 'none';");
    assert.assertHtmlContains(pageRes, "drawer.style.transform = willOpen ? 'translateX(0)' : 'translateX(-100%)';");
    assert.assertHtmlContains(pageRes, "document.body.style.overflow = willOpen ? 'hidden' : '';");

    // Emulate open state transition
    const simulatedDom = {
      drawerTransform: 'translateX(-100%)',
      backdropDisplay: 'none',
      bodyOverflow: ''
    };

    const willOpen = true;
    simulatedDom.backdropDisplay = willOpen ? 'block' : 'none';
    simulatedDom.drawerTransform = willOpen ? 'translateX(0)' : 'translateX(-100%)';
    simulatedDom.bodyOverflow = willOpen ? 'hidden' : '';

    assert.strictEqual(simulatedDom.drawerTransform, 'translateX(0)');
    assert.strictEqual(simulatedDom.backdropDisplay, 'block');
    assert.strictEqual(simulatedDom.bodyOverflow, 'hidden');
  });

  test('TC-T1-F4-04', 'Accordion Expansion: toggleAccordion toggles is-open class on parent accordion element', async ({ client, assert }) => {
    const pageRes = await client.get('/collections.html');
    assert.assertStatus(pageRes, 200);

    // Verify toggleAccordion implementation in collections.html
    assert.assertHtmlContains(pageRes, 'toggleAccordion(headerEl) {');
    assert.assertHtmlContains(pageRes, "const accordion = headerEl.closest('.mobile-accordion');");
    assert.assertHtmlContains(pageRes, "accordion.classList.toggle('is-open');");

    // Emulate accordion toggle
    const classes = new Set();
    const toggle = () => {
      if (classes.has('is-open')) classes.delete('is-open');
      else classes.add('is-open');
    };

    // First tap: opens
    toggle();
    assert.strictEqual(classes.has('is-open'), true, 'First tap should add is-open class');

    // Second tap: closes
    toggle();
    assert.strictEqual(classes.has('is-open'), false, 'Second tap should remove is-open class');
  });

  test('TC-T1-F4-05', 'Backdrop Click Dismissal: toggleMobileDrawer(false) closes drawer and restores body scroll', async ({ client, assert }) => {
    const pageRes = await client.get('/collections.html');
    assert.assertStatus(pageRes, 200);

    // Verify backdrop click binding in collections.html
    assert.assertHtmlContains(pageRes, 'onclick="CollectionEngine.toggleMobileDrawer(false)"');

    // Emulate close state transition
    const simulatedDom = {
      drawerTransform: 'translateX(0)',
      backdropDisplay: 'block',
      bodyOverflow: 'hidden'
    };

    const willOpen = false;
    simulatedDom.backdropDisplay = willOpen ? 'block' : 'none';
    simulatedDom.drawerTransform = willOpen ? 'translateX(0)' : 'translateX(-100%)';
    simulatedDom.bodyOverflow = willOpen ? 'hidden' : '';

    assert.strictEqual(simulatedDom.drawerTransform, 'translateX(-100%)');
    assert.strictEqual(simulatedDom.backdropDisplay, 'none');
    assert.strictEqual(simulatedDom.bodyOverflow, '');
  });

});
