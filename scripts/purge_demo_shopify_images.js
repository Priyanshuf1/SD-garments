const fs = require('fs');
const path = require('path');

const targetUrl1 = 'https://cdn.shopify.com/s/files/1/0633/9339/9022/files/1_cd34702d-ac3b-4ee4-a9d4-1733e518d430.png?v=1792222977';
const targetUrl2 = 'https://cdn.shopify.com/s/files/1/0633/9339/9022/files/1_cd34702d-ac3b-4ee4-a9d4-1733e518d430.png';
const replacement = '/images/photo_1.webp';

const filesToClean = [
  'server.js',
  'admin.html',
  'account.html',
  'checkout.html',
  'collections.html',
  'assets/js/quick-buy.js',
  'data/orders.json'
];

let totalReplaced = 0;

filesToClean.forEach(relPath => {
  if (fs.existsSync(relPath)) {
    let content = fs.readFileSync(relPath, 'utf8');
    const count1 = (content.match(new RegExp(targetUrl1.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    const count2 = (content.match(new RegExp(targetUrl2.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    if (count1 > 0 || count2 > 0) {
      content = content.replaceAll(targetUrl1, replacement);
      content = content.replaceAll(targetUrl2, replacement);
      fs.writeFileSync(relPath, content, 'utf8');
      console.log(`Cleaned ${count1 + count2} demo shopify URLs from ${relPath}`);
      totalReplaced += (count1 + count2);
    }
  }
});

console.log(`Total demo shopify URLs purged: ${totalReplaced}`);
