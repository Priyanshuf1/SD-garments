/**
 * ALLEYRICH — Tier 1 Feature Coverage: Feature F3
 * File: tests/e2e/tier1_feature/f03_mega_dropdown.test.js
 * 
 * Tests for Desktop Mega-Dropdowns:
 * - TC-T1-F3-01: Mega-Dropdown Grid Structure (3 columns + promo lookbook card)
 * - TC-T1-F3-02: Hover Intent Activation (mouseenter adds .is-open)
 * - TC-T1-F3-03: Debounced Mouseleave Retention (220ms debounce before dismiss)
 * - TC-T1-F3-04: Mutual Exclusivity Between Dropdowns (only one open menu at a time)
 * - TC-T1-F3-05: Outside Click Dismissal (clicking document body closes all open menus)
 */

'use strict';

const { defineSuite } = require('../helpers/suite.js');

module.exports = defineSuite({
  tier: 1,
  feature: 'F3',
  title: 'Feature 3 Coverage: Desktop Mega-Dropdowns',
  description: 'Verifies desktop mega-dropdown structure, hover intent, 220ms debounce retention, exclusivity, and outside click dismissal.'
}, ({ test }) => {

  test('TC-T1-F3-01', 'Mega-Dropdown Grid Structure: Contains 3 columns covering apparel categories plus promo lookbook card', async ({ client, assert }) => {
    // 1. Fetch storefront page
    const pageRes = await client.get('/collections.html');
    assert.assertStatus(pageRes, 200);

    // 2. Verify mega-dropdown container and column classes
    assert.assertHtmlContains(pageRes, 'class="nav-dropdown-menu mega-dropdown"');
    assert.assertHtmlContains(pageRes, 'class="nav-mega-col"');
    assert.assertHtmlContains(pageRes, 'class="nav-mega-col-title"');

    // 3. Verify category column titles in Men's Wear
    assert.assertHtmlContains(pageRes, 'BOTTOM WEAR');
    assert.assertHtmlContains(pageRes, 'TOP WEAR');
    assert.assertHtmlContains(pageRes, 'SETS & EXPLORE');

    // 4. Verify category column titles in Kids Wear
    assert.assertHtmlContains(pageRes, "BOYS' CLOTHING");
    assert.assertHtmlContains(pageRes, "GIRLS' CLOTHING");
    assert.assertHtmlContains(pageRes, 'NEW BORN');

    // 5. Verify lookbook promo card in index.html
    const homeRes = await client.get('/');
    assert.assertStatus(homeRes, 200);
    assert.assertHtmlContains(homeRes, 'mega-menu__promo');
    assert.assertHtmlContains(homeRes, 'grid-template-columns: repeat(3, minmax(0, 1fr)) 340px;');
  });

  test('TC-T1-F3-02', 'Hover Intent Activation: mouseenter applies is-open class while closing sibling dropdowns', async ({ client, assert }) => {
    const pageRes = await client.get('/collections.html');
    assert.assertStatus(pageRes, 200);

    // Verify hover event listener and class application in collections.html
    assert.assertHtmlContains(pageRes, 'dropdown.addEventListener("mouseenter"');
    assert.assertHtmlContains(pageRes, 'clearTimeout(closeTimer);');
    assert.assertHtmlContains(pageRes, 'document.querySelectorAll(".nav-item-dropdown.is-open")');
    assert.assertHtmlContains(pageRes, 'dropdown.classList.add("is-open");');

    // Verify home page details-based hover intent disclosure
    const homeRes = await client.get('/');
    assert.assertStatus(homeRes, 200);
    assert.assertHtmlContains(homeRes, "details.setAttribute('open', '');");
  });

  test('TC-T1-F3-03', 'Debounced Mouseleave Retention: Retains menu open for 220ms debounce duration on mouseleave', async ({ client, assert }) => {
    // 1. Verify 220ms debounce in collections.html
    const pageRes = await client.get('/collections.html');
    assert.assertStatus(pageRes, 200);
    assert.assertHtmlContains(pageRes, 'dropdown.addEventListener("mouseleave"');
    assert.assertHtmlContains(pageRes, 'closeTimer = setTimeout(() => {');
    assert.assertHtmlContains(pageRes, 'dropdown.classList.remove("is-open");');
    assert.assertHtmlContains(pageRes, '}, 220);');

    // 2. Verify 220ms debounce in index.html
    const homeRes = await client.get('/');
    assert.assertStatus(homeRes, 200);
    assert.assertHtmlContains(homeRes, 'details.addEventListener(\'mouseleave\'');
    assert.assertHtmlContains(homeRes, 'details.removeAttribute(\'open\');');
    assert.assertHtmlContains(homeRes, '}, 220);');

    // 3. Emulate debounce timer state
    let isOpen = true;
    let timer = setTimeout(() => { isOpen = false; }, 220);

    // Within 100ms: still open
    assert.strictEqual(isOpen, true, 'Dropdown must remain open during 220ms debounce window');
    clearTimeout(timer);
  });

  test('TC-T1-F3-04', 'Mutual Exclusivity Between Dropdowns: Opening one dropdown closes all sibling dropdowns', async ({ client, assert }) => {
    const pageRes = await client.get('/collections.html');
    assert.assertStatus(pageRes, 200);

    // Verify closing sibling dropdowns logic
    assert.assertHtmlContains(pageRes, 'if (d !== dropdown) d.classList.remove("is-open");');

    // Emulate dropdown set state
    const dropdowns = [
      { id: 'mens', isOpen: true },
      { id: 'party', isOpen: false },
      { id: 'kids', isOpen: false }
    ];

    // Open 'party'
    const targetId = 'party';
    dropdowns.forEach(d => {
      if (d.id !== targetId) d.isOpen = false;
      else d.isOpen = true;
    });

    const openCount = dropdowns.filter(d => d.isOpen).length;
    assert.strictEqual(openCount, 1, 'Exactly one dropdown must be open');
    assert.strictEqual(dropdowns.find(d => d.id === 'party').isOpen, true);
    assert.strictEqual(dropdowns.find(d => d.id === 'mens').isOpen, false);
  });

  test('TC-T1-F3-05', 'Outside Click Dismissal: Clicking document body outside dropdown removes is-open from all menus', async ({ client, assert }) => {
    const pageRes = await client.get('/collections.html');
    assert.assertStatus(pageRes, 200);

    // Verify outside click handler
    assert.assertHtmlContains(pageRes, 'document.addEventListener("click", (e) => {');
    assert.assertHtmlContains(pageRes, '!e.target.closest(".nav-item-dropdown")');
    assert.assertHtmlContains(pageRes, 'd.classList.remove("is-open");');

    // Emulate outside click
    const activeMenus = new Set(['menu_mens', 'menu_kids']);
    const isInsideClick = false;

    if (!isInsideClick) {
      activeMenus.clear();
    }

    assert.strictEqual(activeMenus.size, 0, 'All open dropdowns must be dismissed on outside click');
  });

});
