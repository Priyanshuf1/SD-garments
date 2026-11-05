const fs = require('fs');

// 1. data/orders.json
if (fs.existsSync('data/orders.json')) {
  let content = fs.readFileSync('data/orders.json', 'utf8');
  content = content.replaceAll('@testgenrage.com', '@alleyrich.com');
  content = content.replaceAll('@genrage.com', '@alleyrich.com');
  content = content.replaceAll('https://genrage.com/cdn/shop/files/1_cd34702d-ac3b-4ee4-a9d4-1733e518d430.png?v=1792222977', '/images/photo_1.webp');
  content = content.replaceAll('https://genrage.com/cdn/shop/files/front_79f62e01-7f3f-468e-903c-959328f4d873.png?v=1758346828&width=400', '/images/photo_1.webp');
  content = content.replaceAll('-genrage-1.png', '-1.png');
  content = content.replaceAll('-genrage-1_140x140.png', '-1.png');
  fs.writeFileSync('data/orders.json', content, 'utf8');
  console.log('Cleaned data/orders.json');
}

// 2. data/customers.json
if (fs.existsSync('data/customers.json')) {
  let content = fs.readFileSync('data/customers.json', 'utf8');
  content = content.replaceAll('-genrage-1.png', '-1.png');
  content = content.replaceAll('basic-grey-genrage-baggy-pants', 'basic-grey-baggy-pants');
  fs.writeFileSync('data/customers.json', content, 'utf8');
  console.log('Cleaned data/customers.json');
}

// 3. data/products.json
if (fs.existsSync('data/products.json')) {
  let content = fs.readFileSync('data/products.json', 'utf8');
  content = content.replaceAll('"homepage_section": "genrage_basics"', '"homepage_section": "alleyrich_basics"');
  content = content.replaceAll('Genrage Beige Balloon Pants', 'Alleyrich Beige Balloon Pants');
  content = content.replaceAll('genrage-beige-balloon-pants', 'alleyrich-beige-balloon-pants');
  content = content.replaceAll('genrage-pendant-chain', 'alleyrich-pendant-chain');
  content = content.replaceAll('Genrage Pendant Chain', 'Alleyrich Pendant Chain');
  content = content.replaceAll('vexor-genrage-charm-pendant', 'vexor-alleyrich-charm-pendant');
  content = content.replaceAll('Vexor Genrage Charm Pendant', 'Vexor Alleyrich Charm Pendant');
  content = content.replaceAll('genrage-balloon-baggy-pants', 'alleyrich-balloon-baggy-pants');
  content = content.replaceAll('Genrage Black Balloon Pants', 'Alleyrich Black Balloon Pants');
  content = content.replaceAll('basic-black-genrage-baggy-pants', 'basic-black-baggy-pants');
  content = content.replaceAll('basic-grey-genrage-baggy-pants', 'basic-grey-baggy-pants');
  content = content.replaceAll('genrage-freebie', 'alleyrich-freebie');
  content = content.replaceAll('https://genrage.com/cdn/shop/files/witch-unisex-straight-fit-baggy-pants-genrage-1.png?v=1788529155&width=800', '/images/photo_5.webp');
  content = content.replaceAll('https://genrage.com/cdn/shop/files/witch-unisex-straight-fit-baggy-pants-genrage-2.png?v=1788529155&width=800', '/images/photo_6.webp');
  content = content.replaceAll('https://genrage.com/cdn/shop/files/quill-black-tshirt-genrage-6.png?v=1786176078&width=800', '/images/photo_1.webp');
  content = content.replaceAll('https://genrage.com/cdn/shop/files/quill-black-tshirt-genrage-7.png?v=1786176081&width=800', '/images/photo_3.webp');
  content = content.replaceAll('https://genrage.com/cdn/shop/files/1_cd34702d-ac3b-4ee4-a9d4-1733e518d430.png?v=1792222977', '/images/photo_1.webp');
  content = content.replaceAll('https://genrage.com/cdn/shop/files/2_cccbb52d-ae40-4e13-a967-4a113f6a103a.png?v=1792222977', '/images/photo_3.webp');
  fs.writeFileSync('data/products.json', content, 'utf8');
  console.log('Cleaned data/products.json');
}

// Check remaining
const checkDir = (dir) => {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    if (f === 'node_modules' || f === '.git' || f === 'scripts') continue;
    const full = dir + '/' + f;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) checkDir(full);
    else if (f.endsWith('.json') || f.endsWith('.html')) {
      const c = fs.readFileSync(full, 'utf8');
      const m = (c.match(/genrage/gi) || []).length;
      if (m > 0 && !full.includes('index.html')) console.log('REMAINING in', full, ':', m);
    }
  }
};
checkDir('data');
