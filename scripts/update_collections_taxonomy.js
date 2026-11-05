const fs = require('fs');
let html = fs.readFileSync('collections.html', 'utf8');

const newStatic = `<div class="collection-subnav__inner" id="category-chips">
      <a href="/collections/shop" class="category-chip active" data-cat="all">All Drops</a>
      <a href="/collections/new-arrivals" class="category-chip" data-cat="new-arrivals">New Arrivals</a>
      <a href="/collections/shirts" class="category-chip" data-cat="shirts">Shirts</a>
      <a href="/collections/t-shirts" class="category-chip" data-cat="t-shirts">T-Shirts</a>
      <a href="/collections/hoodies" class="category-chip" data-cat="hoodies">Hoodies</a>
      <a href="/collections/mens-jeans" class="category-chip" data-cat="mens-jeans">Jeans</a>
      <a href="/collections/cargo-joggers" class="category-chip" data-cat="cargo-joggers">Cargo / Joggers</a>
      <a href="/collections/party-wear" class="category-chip" data-cat="party-wear">Party Wear</a>
      <a href="/collections/kids-wear" class="category-chip" data-cat="kids-wear">Kids Wear</a>
      <a href="/collections/accessories" class="category-chip" data-cat="accessories">Accessories</a>
    </div>`;

html = html.replace(
  /<div class="collection-subnav__inner" id="category-chips">[\s\S]*?<\/div>/,
  newStatic
);

// Update getCategoryTaxonomy default return
const newTax = `// 5. Default Top-Level Drops (Specific Wearable Drops - No redundant department names)
        return [
          { cat: 'all', label: 'All Drops', href: '/collections/shop' },
          { cat: 'new-arrivals', label: 'New Arrivals', href: '/collections/new-arrivals' },
          { cat: 'shirts', label: 'Shirts', href: '/collections/shirts' },
          { cat: 't-shirts', label: 'T-Shirts', href: '/collections/t-shirts' },
          { cat: 'hoodies', label: 'Hoodies', href: '/collections/hoodies' },
          { cat: 'mens-jeans', label: 'Jeans', href: '/collections/mens-jeans' },
          { cat: 'cargo-joggers', label: 'Cargo / Joggers', href: '/collections/cargo-joggers' },
          { cat: 'party-wear', label: 'Party Wear', href: '/collections/party-wear' },
          { cat: 'kids-wear', label: 'Kids Wear', href: '/collections/kids-wear' },
          { cat: 'accessories', label: 'Accessories', href: '/collections/accessories' }
        ];`;

html = html.replace(
  /\/\/\s*5\.\s*Default Top-Level Drops[\s\S]*?return\s*\[[\s\S]*?\];\s*\}/,
  newTax + '\n      }'
);

fs.writeFileSync('collections.html', html, 'utf8');
console.log('collections.html taxonomy chips updated successfully');
