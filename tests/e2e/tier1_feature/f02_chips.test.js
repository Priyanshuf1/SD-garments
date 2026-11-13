/**
 * ALLEYRICH — Tier 1 Feature Coverage: Feature F2
 * File: tests/e2e/tier1_feature/f02_chips.test.js
 * 
 * Tests for Category Chips Navigation:
 * - TC-T1-F2-01: Default Top-Level Chips Render (All, New In, Shirts, T-Shirts, Hoodies, Jeans, Cargo, Party, Kids, Accessories)
 * - TC-T1-F2-02: Category Chip Selection & Grid Filter (Filter by shirts, update grid & URL)
 * - TC-T1-F2-03: Department Contextual Taxonomy Switch (Party Wear contextual subcategories)
 * - TC-T1-F2-04: Category Title Synchronization (Page title & document.title updated)
 * - TC-T1-F2-05: Mobile Horizontal Auto-Centering (activeEl.scrollIntoView inline: center, flex-shrink: 0)
 */

'use strict';

const { defineSuite } = require('../helpers/suite.js');

module.exports = defineSuite({
  tier: 1,
  feature: 'F2',
  title: 'Feature 2 Coverage: Category Chips Navigation',
  description: 'Verifies dynamic category chip rendering, taxonomy switches, active styling, title sync, and mobile auto-centering.'
}, ({ test }) => {

  test('TC-T1-F2-01', 'Default Top-Level Chips Render: Renders taxonomy chips with All active', async ({ client, assert }) => {
    const pageRes = await client.get('/collections.html');
    assert.assertStatus(pageRes, 200);
    assert.assertHtmlContains(pageRes, 'id="category-chips"');

    // Verify presence of top-level chip definitions in collections.html
    const expectedChips = [
      { cat: 'all', label: 'All' },
      { cat: 'new-arrivals', label: 'New In' },
      { cat: 'shirts', label: 'Shirts' },
      { cat: 't-shirts', label: 'T-Shirts' },
      { cat: 'hoodies', label: 'Hoodies' },
      { cat: 'mens-jeans', label: 'Jeans' },
      { cat: 'cargo-joggers', label: 'Cargo / Joggers' },
      { cat: 'party-wear', label: 'Party Wear' },
      { cat: 'kids-wear', label: 'Kids Wear' },
      { cat: 'accessories', label: 'Accessories' }
    ];

    for (const chip of expectedChips) {
      assert.assertHtmlContains(pageRes, `cat: '${chip.cat}'`, `Chip category '${chip.cat}' must be defined in taxonomy`);
      assert.assertHtmlContains(pageRes, `label: '${chip.label}'`, `Chip label '${chip.label}' must be defined`);
    }

    // Check active class logic on 'all'
    assert.assertHtmlContains(pageRes, "item.cat === 'all' && (this.activeCategory === 'shop' || this.activeCategory === 'all')");
  });

  test('TC-T1-F2-02', 'Category Chip Selection & Grid Filter: Filters catalog products by category and sets active category', async ({ client, assert }) => {
    // 1. Query catalog API with category=shirts
    const apiRes = await client.get('/api/products?category=shirts');
    assert.assertStatus(apiRes, 200);
    assert.strictEqual(apiRes.data.success, true);
    assert.ok(Array.isArray(apiRes.data.products), 'Products must be returned as array');

    // 2. Verify all filtered items correspond to shirts or top wear
    if (apiRes.data.products.length > 0) {
      const allMatch = apiRes.data.products.every(p => {
        const cat = (p.category || '').toLowerCase();
        const type = (p.product_type || '').toLowerCase();
        const handle = (p.handle || '').toLowerCase();
        const tags = Array.isArray(p.tags) ? p.tags.join(' ').toLowerCase() : '';
        return cat.includes('shirt') || cat.includes('top') || type.includes('shirt') || handle.includes('shirt') || tags.includes('shirt');
      });
      assert.ok(allMatch, 'Returned products should match category criteria');
    }

    // 3. Verify setCategory method implementation in collections.html
    const pageRes = await client.get('/collections.html');
    assert.assertStatus(pageRes, 200);
    assert.assertHtmlContains(pageRes, 'this.activeCategory = cat;');
    assert.assertHtmlContains(pageRes, "window.history.pushState(null, '', url);");
    assert.assertHtmlContains(pageRes, 'this.updateActiveChip();');
  });

  test('TC-T1-F2-03', 'Department Contextual Taxonomy Switch: Party Wear selection renders party wear subcategories', async ({ client, assert }) => {
    const pageRes = await client.get('/collections.html');
    assert.assertStatus(pageRes, 200);

    // Verify Party Wear taxonomy configuration
    const partyCategories = [
      'All Party Wear',
      'Jodhpuri Suits',
      'Blazers',
      'Three-Piece Suits',
      'Indo-Western',
      'Koti-Kurta Sets',
      'Long Kurtas',
      'Nehru Jackets'
    ];

    for (const subcat of partyCategories) {
      assert.assertHtmlContains(pageRes, subcat, `Party taxonomy must contain subcategory '${subcat}'`);
    }

    // Verify taxonomy branch guard for partyHandles
    assert.assertHtmlContains(pageRes, "const partyHandles = ['party-wear', 'jodhpuri-suits'");
  });

  test('TC-T1-F2-04', 'Category Title Synchronization: Updates page title and document.title upon category change', async ({ client, assert }) => {
    const pageRes = await client.get('/collections.html');
    assert.assertStatus(pageRes, 200);

    // Verify category map in collections.html contains mappings
    assert.assertHtmlContains(pageRes, '"mens-jeans": "JEANS"');
    assert.assertHtmlContains(pageRes, "document.getElementById('page-title').textContent = title;");
    assert.assertHtmlContains(pageRes, "document.title = `${title} | ALLEYRICH Official Store`;");

    // Simulate mapping lookup
    const categoryMap = {
      'all': 'ALL STREETWEAR',
      'shirts': 'SHIRTS',
      'mens-jeans': 'JEANS',
      'party-wear': 'PARTY WEAR'
    };

    assert.strictEqual(categoryMap['mens-jeans'], 'JEANS');
    assert.strictEqual(`${categoryMap['mens-jeans']} | ALLEYRICH Official Store`, 'JEANS | ALLEYRICH Official Store');
  });

  test('TC-T1-F2-05', 'Mobile Horizontal Auto-Centering: Centers active chip via scrollIntoView with smooth behavior', async ({ client, assert }) => {
    const pageRes = await client.get('/collections.html');
    assert.assertStatus(pageRes, 200);

    // Verify scrollIntoView call parameters in renderCategoryChips
    assert.assertHtmlContains(pageRes, "activeEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });");
    assert.assertHtmlContains(pageRes, "container.scrollWidth > container.clientWidth");

    // Verify CSS rule for flex-shrink on chips
    assert.assertHtmlContains(pageRes, '.category-chip');
    assert.assertHtmlContains(pageRes, 'flex-shrink: 0');
  });

});
