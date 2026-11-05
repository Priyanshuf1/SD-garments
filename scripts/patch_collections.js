const fs = require('fs');
let html = fs.readFileSync('collections.html', 'utf8');

// 1. Change hardcoded 244 PRODUCTS to LOADING PRODUCTS...
html = html.replace(
  /<p class="collection-toolbar__products-count" id="page-count-text">[\s\S]*?<\/p>/,
  `<p class="collection-toolbar__products-count" id="page-count-text">\n      LOADING PRODUCTS...\n    </p>`
);

// 2. Add loading skeletons into #product-grid initial HTML
const skeletonCards = Array(8).fill(`
      <div class="product-card skeleton-card" style="opacity:0.6; pointer-events:none;">
        <div class="product-card__figure" style="background:#222; border-radius:2px; animation:pulse 1.5s infinite ease-in-out;"></div>
        <div style="height:14px; background:#282828; margin:8px 0 4px; width:70%; border-radius:2px;"></div>
        <div style="height:14px; background:#222; width:40%; border-radius:2px;"></div>
      </div>
`).join('\n');

html = html.replace(
  '<div class="product-grid" id="product-grid">\n      \n    </div>',
  `<div class="product-grid" id="product-grid">\n${skeletonCards}\n    </div>`
);

// 3. Fix matchesCategory for shirts
const oldShirtBlock = `        // Top Wear Subcategories (Robust Shirt matching for all manual products)
        if (handle === 'shirts' || handle === 'shirt') {
          return (pDept.includes("men") || pDept.includes("top")) && 
            ((pSub.includes("shirt") && !pSub.includes("t-shirt") && !pSub.includes("sweatshirt")) ||
             (pTitle.includes("shirt") && !pTitle.includes("t-shirt") && !pTitle.includes("sweatshirt")) ||
             (pCat.includes("shirt") && !pCat.includes("t-shirt") && !pCat.includes("sweatshirt")) ||
             (pType.includes("shirt") && !pType.includes("t-shirt") && !pType.includes("sweatshirt")) ||
             pTags.some(t => t === 'shirt' || t === 'shirts' || (t.includes('shirt') && !t.includes('t-shirt') && !t.includes('sweatshirt'))));
        }`;

const newShirtBlock = `        // Top Wear Subcategories (Accurate Shirt matching - excludes T-shirts, Tees, Sweatshirts)
        if (handle === 'shirts' || handle === 'shirt') {
          const combo = (pTitle + ' ' + pCat + ' ' + pSub + ' ' + pType + ' ' + pTags.join(' ')).toLowerCase();
          const isTeeOrSweat = combo.includes('t-shirt') || combo.includes('tshirt') || combo.includes('tee') || combo.includes('sweatshirt') || combo.includes('hoodie') || combo.includes('vest') || combo.includes('tank');
          if (isTeeOrSweat) return false;
          return combo.includes('shirt');
        }`;

if (html.includes(oldShirtBlock)) {
  html = html.replace(oldShirtBlock, newShirtBlock);
} else {
  console.log('Warning: oldShirtBlock not found directly, using regex replacement');
  html = html.replace(/\/\/\s*Top Wear Subcategories[\s\S]*?pTags\.some\(t => t === 'shirt'[\s\S]*?\);\s*\}/, newShirtBlock);
}

// 4. Safe wishlist handling in filterAndRender and renderGrid
html = html.replace(
  `const wishlist = window.WishlistEngine ? window.WishlistEngine.getWishlist() : [];
        const wishlistedHandles = new Set(wishlist.map(i => (typeof i === 'string' ? i : i.handle)));`,
  `const wishlist = window.WishlistEngine ? window.WishlistEngine.getWishlist() : [];
        const wishlistedHandles = new Set((wishlist || []).map(i => {
          if (!i) return '';
          const h = typeof i === 'string' ? i : i.handle;
          return h ? String(h).split('?')[0].split('#')[0].trim() : '';
        }).filter(Boolean));`
);

// 5. Safe title attribute in image
html = html.replace(
  'alt="${p.title}"',
  'alt="${(p.title || \'Streetwear\').replace(/\"/g, \'&quot;\')}"'
);

// 6. Ensure dropdown z-index is top tier
html = html.replaceAll(
  'z-index: 200;',
  'z-index: 999999;'
);

// 7. Ensure fallback in loadCatalog always sets products
const oldLoadCatalogEnd = `          if (products && products.length > 0) {
            this.allProducts = products;
            this.updateActiveChip();
            this.filterAndRender();
          }
        } catch (err) {
          console.error('Failed to load products:', err);
          document.getElementById('product-grid').innerHTML = \`
            <div style="grid-column: 1/-1; text-align:center; padding:4rem; color:#777;">
              <h3>Unable to load collection</h3>
              <p>Please refresh the page.</p>
            </div>
          \`;
        }`;

const newLoadCatalogEnd = `          if (products && products.length > 0) {
            this.allProducts = products;
            this.updateActiveChip();
            this.filterAndRender();
          } else {
            // Automatic fallback to fetch raw products.json directly
            try {
              const fRes = await fetch('/data/products.json?v=' + Date.now());
              if (fRes.ok) {
                const fData = await fRes.json();
                this.allProducts = fData.products || (Array.isArray(fData) ? fData : []);
                this.updateActiveChip();
                this.filterAndRender();
              }
            } catch (fe) {}
          }
        } catch (err) {
          console.error('Failed to load products:', err);
          this.filterAndRender();
        }`;

if (html.includes(oldLoadCatalogEnd)) {
  html = html.replace(oldLoadCatalogEnd, newLoadCatalogEnd);
}

fs.writeFileSync('collections.html', html, 'utf8');
console.log('collections.html patched successfully');
