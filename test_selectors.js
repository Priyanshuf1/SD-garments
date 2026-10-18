const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const sec = html.split('id="shopify-section-template--23671271489774__featured_collections_MAzpBk"')[1]?.split('</section>')[0];
console.log('MAzpBk section length:', sec?.length);
console.log('Contains <product-list>?:', sec?.includes('<product-list'));
console.log('Contains <product-card>?:', sec?.includes('<product-card'));

// Find the direct parent container of <product-card> in MAzpBk
const idx = sec.indexOf('<product-card');
console.log('Context before <product-card> in MAzpBk:\n', sec.slice(idx - 300, idx));
