const fs = require('fs');
let html = fs.readFileSync('collections.html', 'utf8');

html = html.replace('VIEW ALL 244 PRODUCTS', 'VIEW ALL PRODUCTS');

const skeletonCard = `      <div class="product-card skeleton-card" style="opacity:0.6; pointer-events:none;">
        <div class="product-card__figure" style="background:#222; border-radius:2px; animation:pulse 1.5s infinite ease-in-out;"></div>
        <div style="height:14px; background:#282828; margin:8px 0 4px; width:70%; border-radius:2px;"></div>
        <div style="height:14px; background:#222; width:40%; border-radius:2px;"></div>
      </div>`;
const skeletons = Array(8).fill(skeletonCard).join('\n');

html = html.replace(
  '<div class="product-grid" id="product-grid">\n      <!-- Dynamically Populated from /api/products -->\n    </div>',
  `<div class="product-grid" id="product-grid">\n${skeletons}\n    </div>`
);

fs.writeFileSync('collections.html', html, 'utf8');
console.log('collections.html skeletons and view all button updated');
