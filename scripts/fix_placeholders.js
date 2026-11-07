const fs = require('fs');
let html = fs.readFileSync('admin.html', 'utf8');
const isCRLF = html.includes('\r\n');
html = html.replace(/\r\n/g, '\n');

html = html.replaceAll(
  'placeholder="https://cdn.shopify.com/... or /assets/uploads/..."',
  'placeholder="https://... or /assets/uploads/..."'
);

if (isCRLF) html = html.replace(/\n/g, '\r\n');
fs.writeFileSync('admin.html', html, 'utf8');
console.log('Placeholders replaced successfully');
