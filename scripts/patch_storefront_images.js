const fs = require('fs');
const path = require('path');

// 1. Patch index.html
const indexPath = path.join(__dirname, '..', 'index.html');
let indexHtml = fs.readFileSync(indexPath, 'utf8');

// A. Replace admin products fetch with public products
indexHtml = indexHtml.replace(
  "fetch('/api/admin/products')",
  "fetch('/api/products')"
);

// B. Replace dead Shopify fallback image
indexHtml = indexHtml.replace(
  "const fallbackImg = 'https://cdn.shopify.com/s/files/1/0633/9339/9022/files/1_cd34702d-ac3b-4ee4-a9d4-1733e518d430.png?v=1792222977';",
  "const fallbackImg = '/images/photo_1.webp';"
);

// C. Add global image error handler in <head>
const globalImgHandler = `
  <!-- Resilient Fashion Asset Fallback Guard -->
  <script>
  window.addEventListener('error', function(e) {
    if (e.target && e.target.tagName === 'IMG') {
      const src = e.target.getAttribute('src') || '';
      if (src && !src.startsWith('/images/photo_')) {
        e.target.onerror = null;
        const seed = e.target.alt || e.target.src || '1';
        let hash = 0;
        for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        const photoIdx = (Math.abs(hash) % 16) + 1;
        e.target.src = '/images/photo_' + photoIdx + '.webp';
      }
    }
  }, true);
  </script>
`;

if (!indexHtml.includes('Resilient Fashion Asset Fallback Guard')) {
  indexHtml = indexHtml.replace('</head>', globalImgHandler + '\n</head>');
}

fs.writeFileSync(indexPath, indexHtml, 'utf8');
console.log('Successfully patched index.html');

// 2. Patch collections.html
const collPath = path.join(__dirname, '..', 'collections.html');
let collHtml = fs.readFileSync(collPath, 'utf8');

// Replace dead Shopify fallback
collHtml = collHtml.replace(
  "https://cdn.shopify.com/s/files/1/0633/9339/9022/files/1_cd34702d-ac3b-4ee4-a9d4-1733e518d430.png?v=1792222977",
  "/images/photo_1.webp"
);

// Add onerror to product card primary image in collections
collHtml = collHtml.replace(
  'class="product-card__image product-card__image--primary object-cover aspect-tall">',
  'class="product-card__image product-card__image--primary object-cover aspect-tall" onerror="this.onerror=null;this.src=\'/images/photo_\' + ((Math.abs(Array.from(this.alt||\'1\').reduce((a,c)=>a+c.charCodeAt(0),0)) % 16) + 1) + \'.webp\';">'
);

// Add secondary image onerror
collHtml = collHtml.replace(
  'class="product-card__image product-card__image--secondary">',
  'class="product-card__image product-card__image--secondary" onerror="this.style.display=\'none\';">'
);

if (!collHtml.includes('Resilient Fashion Asset Fallback Guard')) {
  collHtml = collHtml.replace('</head>', globalImgHandler + '\n</head>');
}

fs.writeFileSync(collPath, collHtml, 'utf8');
console.log('Successfully patched collections.html');
