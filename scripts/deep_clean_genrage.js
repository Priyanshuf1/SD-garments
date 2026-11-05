const fs = require('fs');

// Deep replace helper
function cleanFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  let text = fs.readFileSync(filePath, 'utf8');
  const initial = (text.match(/genrage/gi) || []).length;
  if (initial === 0) return;

  // Specific word replacements
  text = text.replaceAll('GENRAGE Pendant Chain', 'ALLEYRICH Pendant Chain');
  text = text.replaceAll('Genrage Pendant Chain', 'Alleyrich Pendant Chain');
  text = text.replaceAll('genrage-pendant-chain', 'alleyrich-pendant-chain');
  text = text.replaceAll('GENRAGE TOTE BAG', 'ALLEYRICH TOTE BAG');
  text = text.replaceAll('Genrage Tote Bag', 'Alleyrich Tote Bag');
  text = text.replaceAll('GENRAGE BRANDING', 'ALLEYRICH BRANDING');
  text = text.replaceAll('DESIGNED AND CONSTRUCTED BY GENRAGE', 'DESIGNED AND CONSTRUCTED BY ALLEYRICH');
  text = text.replaceAll('Genrage White Balloon Pants', 'Alleyrich White Balloon Pants');
  text = text.replaceAll('genrage-white-balloon-pants', 'alleyrich-white-balloon-pants');
  text = text.replaceAll('Genrage Grey Balloon Pants', 'Alleyrich Grey Balloon Pants');
  text = text.replaceAll('genrage-melange-balloon-supper-baggy-pants', 'alleyrich-melange-balloon-supper-baggy-pants');
  text = text.replaceAll('dark-grey-basic-genrage-baggy-pants', 'dark-grey-basic-alleyrich-baggy-pants');
  text = text.replaceAll('basics-genrage', 'basics-alleyrich');
  text = text.replaceAll('Signature Genrage', 'Signature Alleyrich');
  text = text.replaceAll('"GENRAGE CHAIN"', '"ALLEYRICH CHAIN"');

  // Charm pendants
  text = text.replace(/([a-z0-9_-]+)-genrage-charm-pendant/g, '$1-alleyrich-charm-pendant');

  // Image URLs
  text = text.replaceAll('https://genrage.com/cdn/shop/files/Artboard1_5_82984cdd-972f-4b5b-a210-dcaed2709686.png?v=1792262710&width=1536', '/images/photo_5.webp');
  text = text.replaceAll('https://genrage.com/cdn/shop/files/Artboard4_1a338260-649e-4d62-859e-72bffceea4b2.png?v=1792262709&width=1536', '/images/photo_6.webp');

  // Generic case-preserving replacements for remaining standalone words
  text = text.replace(/\bGENRAGE\b/g, 'ALLEYRICH');
  text = text.replace(/\bGenrage\b/g, 'Alleyrich');
  text = text.replace(/\bgenrage\b/g, 'alleyrich');

  fs.writeFileSync(filePath, text, 'utf8');
  const remaining = (text.match(/genrage/gi) || []).length;
  console.log(`Cleaned ${filePath}: ${initial} -> ${remaining} remaining`);
}

cleanFile('data/products.json');
cleanFile('data/collections.json');
cleanFile('data/orders.json');
cleanFile('data/customers.json');
cleanFile('data/subscribers.json');
cleanFile('admin.html');
cleanFile('collections.html');
cleanFile('checkout.html');
cleanFile('account.html');
cleanFile('product.html');
