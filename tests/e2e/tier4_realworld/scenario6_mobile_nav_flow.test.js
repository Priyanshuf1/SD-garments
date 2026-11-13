/**
 * ALLEYRICH — Tier 4 Real-World Application Scenario 6: Mobile Header & Drawer Navigation
 * File: tests/e2e/tier4_realworld/scenario6_mobile_nav_flow.test.js
 * 
 * Exercises: F2 (Category Chips), F3 (Navigation Links & Taxonomies),
 *            F4 (Mobile Edge-to-Edge Header & Off-Canvas Drawer)
 * 
 * Workflow:
 * 1. Storefront HTML page load
 * 2. Verify edge-to-edge sticky black header DOM contracts (100vw, #000, 28px logo)
 * 3. Verify mobile off-canvas drawer structure, backdrop, and toggle controls
 * 4. Verify mobile accordion sub-navigation and category link targets
 * 5. Verify horizontal auto-centering dynamic taxonomy category chips
 */

'use strict';

const { defineSuite } = require('../helpers/suite.js');

module.exports = defineSuite({
  tier: 4,
  feature: 'F2+F3+F4',
  title: 'Scenario 6: Mobile Viewport Header & Category Drawer Navigation Flow',
  description: 'Validates mobile edge-to-edge sticky header, slide-out drawer accordions, touch targets, and category subnav auto-centering.'
}, ({ test }) => {

  test('SCENARIO-06', 'Mobile navigation flow: sticky header, touch targets, off-canvas drawer, accordions, and category chips', async ({ client, assert }) => {
    // Step 1: Load storefront page
    const pageRes = await client.get('/collections.html');
    assert.assertStatus(pageRes, 200);

    // Step 2: Edge-to-Edge Sticky Header DOM Contracts
    assert.assertHtmlContains(pageRes, '<header class="site-header">', 'Site header element must exist in markup');
    assert.assertHtmlContains(pageRes, '.site-header', 'Site header CSS class must be styled');
    assert.assertHtmlContains(pageRes, 'background: #000000', 'Header background must be strict black #000000');
    assert.assertHtmlContains(pageRes, 'position: sticky', 'Header must have sticky positioning');
    assert.assertHtmlContains(pageRes, 'max-width: 100vw', 'Header must be constrained to 100vw edge-to-edge');

    // Brand logo and title
    assert.assertHtmlContains(pageRes, 'allyrich-header-logo-img', 'Brand logo image class must exist');
    assert.assertHtmlContains(pageRes, 'allyrich-header-brand-name', 'Brand title class must exist');
    assert.assertHtmlContains(pageRes, 'ALLEYRICH', 'Brand name text must be present');

    // Touch targets and actions cluster
    assert.assertHtmlContains(pageRes, 'mobile-nav-toggle', 'Mobile hamburger toggle button must exist');
    assert.assertHtmlContains(pageRes, 'id="header-cart-badge"', 'Cart badge counter must exist');
    assert.assertHtmlContains(pageRes, 'action-touch-btn', 'Accessible touch targets must be styled');

    // Step 3: Off-Canvas Mobile Drawer & Backdrop
    assert.assertHtmlContains(pageRes, 'id="mobile-nav-drawer"', 'Off-canvas mobile drawer element must exist');
    assert.assertHtmlContains(pageRes, 'id="mobile-nav-backdrop"', 'Mobile backdrop overlay element must exist');
    assert.assertHtmlContains(pageRes, 'CollectionEngine.toggleMobileDrawer', 'Drawer toggle function must be wired');
    assert.assertHtmlContains(pageRes, 'transform:translateX(-100%)', 'Drawer must initially be off-canvas (-100%)');

    // Step 4: Accordion Sub-Navigation
    assert.assertHtmlContains(pageRes, 'mobile-accordion', 'Mobile accordion container must exist');
    assert.assertHtmlContains(pageRes, 'mobile-accordion-header', 'Mobile accordion headers must exist');
    assert.assertHtmlContains(pageRes, "MEN'S WEAR", "Men's Wear accordion title must be present");
    assert.assertHtmlContains(pageRes, 'CollectionEngine.toggleAccordion', 'Accordion toggle handler must exist');

    // Sub-category link routes
    assert.assertHtmlContains(pageRes, '/collections/shirts', 'Shirts category link must exist');
    assert.assertHtmlContains(pageRes, '/collections/t-shirts', 'T-Shirts category link must exist');
    assert.assertHtmlContains(pageRes, '/collections/hoodies', 'Hoodies category link must exist');
    assert.assertHtmlContains(pageRes, '/collections/mens-jeans', 'Jeans category link must exist');

    // Step 5: Category Chips & Horizontal Auto-Centering
    assert.assertHtmlContains(pageRes, 'id="category-chips"', 'Category chips subnav container must exist');
    assert.assertHtmlContains(pageRes, 'class="category-chip', 'Category chip class must exist');
    assert.assertHtmlContains(pageRes, 'scrollIntoView', 'Horizontal auto-centering scrollIntoView must be implemented');
    assert.assertHtmlContains(pageRes, 'inline: \'center\'', 'Auto-centering must specify inline center behavior');
  });

});
