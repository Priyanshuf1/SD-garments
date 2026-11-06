const fs = require('fs');
const path = require('path');

// ==============================================================
// 1. PATCH server.js
// ==============================================================
const serverPath = path.join(__dirname, '..', 'server.js');
let serverContent = fs.readFileSync(serverPath, 'utf8');
const isServerCRLF = serverContent.includes('\r\n');
serverContent = serverContent.replace(/\r\n/g, '\n');

const collRouteTarget = `  // Catalog mutation requires admin authorization`;
const collRouteCode = `  // Live Public Collections & Seasonal Drops API
  if (pathname === '/api/collections' || pathname.startsWith('/api/collections/')) {
    if (req.method === 'GET') {
      const collLimit = security.checkRateLimit(\`colls:\${security.getClientIp(req)}\`, 240, 60);
      if (!collLimit.allowed) return sendJson(res, 429, { success: false, message: 'Too many collection requests.' }, { 'Retry-After': String(collLimit.resetAfterSeconds) });
      const cData = readJsonFile('collections.json', { collections: [] });
      const collections = cData.collections || [];
      const query = parsedUrl.searchParams.get('search')?.toLowerCase();
      let filtered = collections;
      if (query) {
        filtered = filtered.filter(c =>
          (c.title && c.title.toLowerCase().includes(query)) ||
          (c.handle && c.handle.toLowerCase().includes(query))
        );
      }
      return sendJson(res, 200, { success: true, count: filtered.length, collections: filtered });
    }
  }

  // Catalog mutation requires admin authorization`;

if (!serverContent.includes('/api/collections')) {
  serverContent = serverContent.replace(collRouteTarget, collRouteCode);
  console.log('1. Added /api/collections in server.js');
} else {
  console.log('1. /api/collections already exists in server.js');
}

if (isServerCRLF) serverContent = serverContent.replace(/\n/g, '\r\n');
fs.writeFileSync(serverPath, serverContent, 'utf8');

// ==============================================================
// 2. PATCH index.html
// ==============================================================
const indexPath = path.join(__dirname, '..', 'index.html');
let indexContent = fs.readFileSync(indexPath, 'utf8');
const isIndexCRLF = indexContent.includes('\r\n');
indexContent = indexContent.replace(/\r\n/g, '\n');

// Desktop Header: Add COLLECTIONS dropdown right after NEW ARRIVALS
const oldDesktopNav = `<li class="header__primary-nav-item">
                <a href="/collections/new-arrivals" data-title="NEW ARRIVALS" class="block h6">NEW ARRIVALS</a>
              </li>`;

const newDesktopNav = `<li class="header__primary-nav-item">
                <a href="/collections/new-arrivals" data-title="NEW ARRIVALS" class="block h6">NEW ARRIVALS</a>
              </li>

              <!-- COLLECTIONS & DROPS Dropdown -->
              <li class="header__primary-nav-item">
                <mega-menu-disclosure follow-summary-link trigger="hover" class="contents">
                  <details class="header__menu-disclosure">
                    <summary data-follow-link="/collections" class="h6" data-title="COLLECTIONS">COLLECTIONS</summary>
                    <div class="mega-menu" style="grid-template-columns: repeat(2, minmax(0, 1fr)) 340px;">
                      <!-- Col 1: Seasonal Drops -->
                      <ul class="mega-menu__linklist unstyled-list">
                        <li class="v-stack justify-items-start gap-4">
                          <span class="h6" style="color:var(--accent-gold, #ff8585); font-weight:800; letter-spacing:0.08em; font-size:0.75rem;">CAPSULE DROPS</span>
                          <a href="/collections" class="h6" style="font-weight:700;">ALL DROPS & COLLECTIONS</a>
                          <a href="/collections/new-arrivals" class="h6">New Arrivals Drop</a>
                          <a href="/collections/mens-wear" class="h6">Men's Streetwear</a>
                          <a href="/collections/party-wear" class="h6">Party Wear Capsule</a>
                        </li>
                      </ul>
                      <!-- Col 2: Curated Fits -->
                      <ul class="mega-menu__linklist unstyled-list">
                        <li class="v-stack justify-items-start gap-4">
                          <span class="h6" style="color:var(--accent-gold, #ff8585); font-weight:800; letter-spacing:0.08em; font-size:0.75rem;">CURATED CATEGORIES</span>
                          <a href="/collections/shirts" class="h6">Streetwear Shirts</a>
                          <a href="/collections/t-shirts" class="h6">Heavyweight T-Shirts</a>
                          <a href="/collections/hoodies" class="h6">Boxy Hoodies</a>
                          <a href="/collections/mens-jeans" class="h6">Baggy Denim & Cargo</a>
                          <a href="/collections/accessories" class="h6">Bags & Accessories</a>
                        </li>
                      </ul>
                      <!-- Promo image -->
                      <div class="mega-menu__promo">
                        <a href="/collections" class="v-stack justify-items-center gap-4 sm:gap-5 group">
                          <div class="overflow-hidden">
                            <img src="/images/photo_1.webp" alt="AlleyRich Collections" width="1500" height="1500" loading="lazy" sizes="315px" class="zoom-image group-hover:zoom">
                          </div>
                        </a>
                      </div>
                    </div>
                  </details>
                </mega-menu-disclosure>
              </li>`;

if (indexContent.includes(oldDesktopNav) && !indexContent.includes('data-title="COLLECTIONS"')) {
  indexContent = indexContent.replace(oldDesktopNav, newDesktopNav);
  console.log('2a. Added COLLECTIONS to desktop header in index.html');
}

// Mobile Sidebar Drawer: Add COLLECTIONS & DROPS right after NEW ARRIVALS
const oldMobileNav = `<li><a href="/collections/new-arrivals" class="header-sidebar__linklist-button h6">NEW ARRIVALS</a></li>`;
const newMobileNav = `<li><a href="/collections/new-arrivals" class="header-sidebar__linklist-button h6">NEW ARRIVALS</a></li>
        <li><a href="/collections" class="header-sidebar__linklist-button h6" style="color:var(--accent-gold, #ff8585); font-weight:700;">COLLECTIONS & DROPS</a></li>`;

if (indexContent.includes(oldMobileNav) && !indexContent.includes('COLLECTIONS & DROPS</a>')) {
  indexContent = indexContent.replace(oldMobileNav, newMobileNav);
  console.log('2b. Added COLLECTIONS & DROPS to mobile sidebar drawer in index.html');
}

if (isIndexCRLF) indexContent = indexContent.replace(/\n/g, '\r\n');
fs.writeFileSync(indexPath, indexContent, 'utf8');

// ==============================================================
// 3. PATCH collections.html
// ==============================================================
const colPath = path.join(__dirname, '..', 'collections.html');
let colContent = fs.readFileSync(colPath, 'utf8');
const isColCRLF = colContent.includes('\r\n');
colContent = colContent.replace(/\r\n/g, '\n');

// Desktop Header: Add COLLECTIONS dropdown right after NEW ARRIVALS in collections.html
const oldColDesktopNav = `<a href="/collections/new-arrivals" class="header-nav-link" data-cat="new-arrivals">NEW ARRIVALS</a>`;
const newColDesktopNav = `<a href="/collections/new-arrivals" class="header-nav-link" data-cat="new-arrivals">NEW ARRIVALS</a>
        <div class="nav-item-dropdown">
          <a href="/collections?view=drops" class="header-nav-link" data-cat="all-collections" style="display:inline-flex; align-items:center; gap:4px; font-weight:800; color:var(--accent-gold, #ff8585);">
            COLLECTIONS
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="m1 3 4 4 4-4" stroke="currentColor" stroke-width="1.5"/></svg>
          </a>
          <div class="nav-dropdown-menu" style="min-width: 240px;">
            <a href="/collections?view=drops" class="nav-dropdown-link" style="font-weight:800; color:#fff;">ALL DROPS & CAPSULES</a>
            <a href="/collections/new-arrivals" class="nav-dropdown-link">New Arrivals Drop</a>
            <a href="/collections/mens-wear" class="nav-dropdown-link">Men's Streetwear</a>
            <a href="/collections/party-wear" class="nav-dropdown-link">Party Wear Collection</a>
            <a href="/collections/kids-wear" class="nav-dropdown-link">Kids Capsule</a>
          </div>
        </div>`;

if (colContent.includes(oldColDesktopNav) && !colContent.includes('data-cat="all-collections"')) {
  colContent = colContent.replace(oldColDesktopNav, newColDesktopNav);
  console.log('3a. Added COLLECTIONS to desktop header in collections.html');
}

// Mobile Drawer in collections.html
const oldColMobileNav = `<a href="/collections/new-arrivals" class="mobile-nav-item" onclick="CollectionEngine.toggleMobileDrawer(false)">NEW ARRIVALS</a>`;
const newColMobileNav = `<a href="/collections/new-arrivals" class="mobile-nav-item" onclick="CollectionEngine.toggleMobileDrawer(false)">NEW ARRIVALS</a>
      <a href="/collections?view=drops" class="mobile-nav-item" onclick="CollectionEngine.toggleMobileDrawer(false)" style="color:var(--accent-gold, #ff8585); font-weight:800;">COLLECTIONS & DROPS</a>`;

if (colContent.includes(oldColMobileNav) && !colContent.includes('COLLECTIONS & DROPS</a>')) {
  colContent = colContent.replace(oldColMobileNav, newColMobileNav);
  console.log('3b. Added COLLECTIONS & DROPS to mobile drawer in collections.html');
}

// In loadCatalog(): Also fetch /api/collections to dynamically register custom collections into categoryMap
const oldLoadCat = `          if (products && products.length > 0) {
            this.allProducts = products;
            this.updateActiveChip();
            this.filterAndRender();
          }`;

const newLoadCat = `          // Load published dynamic collections & seasonal drops
          try {
            const cRes = await fetch('/api/collections');
            if (cRes.ok) {
              const cData = await cRes.json();
              if (cData.success && Array.isArray(cData.collections)) {
                this.allCollections = cData.collections;
                cData.collections.forEach(c => {
                  if (c.handle && c.title) {
                    this.categoryMap[c.handle.toLowerCase()] = c.title.toUpperCase();
                  }
                });
              }
            }
          } catch (eColl) {}

          if (products && products.length > 0) {
            this.allProducts = products;
            this.updateActiveChip();
            this.filterAndRender();
          }`;

if (colContent.includes(oldLoadCat) && !colContent.includes('this.allCollections = cData.collections;')) {
  colContent = colContent.replace(oldLoadCat, newLoadCat);
  console.log('3c. Injected dynamic collections fetch into loadCatalog()');
}

// In getCategoryTaxonomy: Add "Collections & Drops" chip in default top-level drops
const oldTaxonomy = `        // 5. Default Top-Level Drops (Specific Wearable Drops - No redundant department names)
        return [
          { cat: 'all', label: 'All Drops', href: '/collections/shop' },
          { cat: 'new-arrivals', label: 'New Arrivals', href: '/collections/new-arrivals' },`;

const newTaxonomy = `        // 5. Default Top-Level Drops (Specific Wearable Drops - No redundant department names)
        return [
          { cat: 'all', label: 'All Drops', href: '/collections/shop' },
          { cat: 'all-collections', label: 'Collections & Drops', href: '/collections?view=drops' },
          { cat: 'new-arrivals', label: 'New Arrivals', href: '/collections/new-arrivals' },`;

if (colContent.includes(oldTaxonomy)) {
  colContent = colContent.replace(oldTaxonomy, newTaxonomy);
  console.log('3d. Added Collections & Drops chip to taxonomy');
}

// In parseUrlCategory(): handle view=drops or all-collections
const oldParseUrl = `if (viewMode === 'wishlist' || queryCat === 'wishlist' || path.includes('/wishlist')) {
          this.activeCategory = 'wishlist';
        } else if (queryCat && this.categoryMap[queryCat]) {`;

const newParseUrl = `if (viewMode === 'wishlist' || queryCat === 'wishlist' || path.includes('/wishlist')) {
          this.activeCategory = 'wishlist';
        } else if (viewMode === 'drops' || queryCat === 'drops' || queryCat === 'all-collections' || path.includes('/collections/drops')) {
          this.activeCategory = 'all-collections';
        } else if (queryCat && this.categoryMap[queryCat]) {`;

if (colContent.includes(oldParseUrl)) {
  colContent = colContent.replace(oldParseUrl, newParseUrl);
  console.log('3e. Added view=drops support to parseUrlCategory');
}

// In filterAndRender(): when activeCategory === 'all-collections', render rich collections grid
const oldFilterRenderStart = `filterAndRender() {`;
const newFilterRenderStart = `filterAndRender() {
        if (this.activeCategory === 'all-collections') {
          this.renderCollectionsShowcase();
          return;
        }`;

if (colContent.includes(oldFilterRenderStart) && !colContent.includes('this.renderCollectionsShowcase()')) {
  colContent = colContent.replace(oldFilterRenderStart, newFilterRenderStart);
  console.log('3f. Added renderCollectionsShowcase interceptor in filterAndRender');
}

// Add renderCollectionsShowcase method to CollectionEngine
const oldRenderGrid = `renderGrid() {`;
const newRenderGrid = `renderCollectionsShowcase() {
        const grid = document.getElementById('product-grid');
        const countText = document.getElementById('page-count-text');
        const colls = this.allCollections || [];
        if (countText) countText.textContent = \`\${colls.length} COLLECTIONS & DROPS\`;
        if (!grid) return;

        grid.innerHTML = \`
          <div style="grid-column: 1 / -1; display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem; padding: 1.5rem 0;">
            \${colls.map(c => {
              const img = c.image?.src || '/images/photo_1.webp';
              return \`
                <div style="background:#0a0a0a; border:1px solid #222; border-radius:6px; overflow:hidden; display:flex; flex-direction:column; transition:transform 0.2s ease, border-color 0.2s ease;" onmouseover="this.style.borderColor='#ff8585';this.style.transform='translateY(-4px)'" onmouseout="this.style.borderColor='#222';this.style.transform='none'">
                  <div style="position:relative; aspect-ratio:16/9; background:#111; overflow:hidden;">
                    <img src="\${img}" alt="\${c.title}" style="width:100%; height:100%; object-fit:cover; display:block;" onerror="this.src='/images/photo_1.webp'">
                    <span style="position:absolute; top:10px; left:10px; background:rgba(0,0,0,0.75); color:#fff; font-size:11px; font-weight:800; letter-spacing:0.06em; padding:3px 8px; border-radius:2px; text-transform:uppercase;">
                      \${c.products_count || 0} PRODUCTS
                    </span>
                  </div>
                  <div style="padding:1.25rem; flex:1; display:flex; flex-direction:column; justify-content:space-between;">
                    <div>
                      <h3 style="font-size:1.05rem; font-weight:800; margin:0 0 0.5rem 0; letter-spacing:0.04em; color:#fff;">\${c.title}</h3>
                      <p style="font-size:0.85rem; color:#888; line-height:1.4; margin:0 0 1rem 0;">\${c.description || 'Exclusive limited streetwear capsule drop.'}</p>
                    </div>
                    <a href="/collections/\${c.handle}" onclick="event.preventDefault(); CollectionEngine.setCategory('\${c.handle}', '/collections/\${c.handle}');" style="display:inline-block; text-align:center; background:#fff; color:#000; padding:10px 18px; font-weight:800; font-size:0.8rem; letter-spacing:0.08em; text-transform:uppercase; text-decoration:none; border-radius:2px; transition:background 0.2s ease;">
                      EXPLORE DROP →
                    </a>
                  </div>
                </div>
              \`;
            }).join('')}
          </div>
        \`;
      },

      renderGrid() {`;

if (colContent.includes(oldRenderGrid) && !colContent.includes('renderCollectionsShowcase()')) {
  colContent = colContent.replace(oldRenderGrid, newRenderGrid);
  console.log('3g. Added renderCollectionsShowcase implementation in collections.html');
}

// Add categoryMap entry for all-collections
const oldCatMap = `"clearance": "CLEARANCE SALE"`;
const newCatMap = `"clearance": "CLEARANCE SALE",
      "all-collections": "COLLECTIONS & SEASONAL DROPS",
      "drops": "COLLECTIONS & SEASONAL DROPS"`;

if (colContent.includes(oldCatMap)) {
  colContent = colContent.replace(oldCatMap, newCatMap);
  console.log('3h. Added all-collections to categoryMap');
}

if (isColCRLF) colContent = colContent.replace(/\n/g, '\r\n');
fs.writeFileSync(colPath, colContent, 'utf8');

console.log('All collections flow files patched successfully!');
