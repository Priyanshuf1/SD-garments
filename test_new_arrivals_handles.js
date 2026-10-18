const fs = require('fs');

const pData = JSON.parse(fs.readFileSync('data/products.json', 'utf8'));
const products = pData.products;

const html = fs.readFileSync('index.html', 'utf8');

// Find new arrivals container
const newArrPart = html.split('id="featured-collections-product-list-carousel-collection_hMhMwj"')[1]?.split('</featured-collections-carousel>')[0];

const handles = [];
const re = /handle="([^"]+)"/g;
let m;
while ((m = re.exec(newArrPart)) !== null) {
  handles.push(m[1]);
}
console.log('Static handles in new arrivals:', handles.length);

const noneHandles = [];
const missingFromProducts = [];
handles.forEach(h => {
  const p = products.find(prod => prod.handle === h);
  if (!p) {
    missingFromProducts.push(h);
  } else if (p.homepage_section === 'none') {
    noneHandles.push({ handle: h, title: p.title, section: p.homepage_section });
  }
});

console.log('Handles in New Arrivals that are MISSING from products.json:', missingFromProducts);
console.log('Handles in New Arrivals whose homepage_section is "none":', noneHandles);
