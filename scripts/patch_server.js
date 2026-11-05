const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

code = code.replace(
  'const searchLimit = security.checkRateLimit(`product_search:${clientIp}`, 100, 60);',
  'const searchLimit = security.checkRateLimit(`product_search:${clientIp}`, 600, 60);'
);

code = code.replace(
  "vendor: product.vendor || 'GENRAGE'",
  "vendor: product.vendor || 'ALLEYRICH'"
);

code = code.replace(
  "vendor: payload.vendor || 'GENRAGE'",
  "vendor: payload.vendor || 'ALLEYRICH'"
);

code = code.replace(
  "image: payload.image ? { src: payload.image } : { src: 'https://genrage.com/cdn/shop/files/front_79f62e01-7f3f-468e-903c-959328f4d873.png?v=1758346828&width=600' }",
  "image: payload.image ? { src: payload.image } : { src: '/images/photo_1.webp' }"
);

code = code.replace(
  'const filename = `genrage_${Date.now()}_${rawName}${extension}`;',
  'const filename = `alleyrich_${Date.now()}_${rawName}${extension}`;'
);

code = code.replace(
  '🔥 GENRAGE 1:1 DITTO Server Running!',
  '🔥 ALLEYRICH Production Server Running!'
);

fs.writeFileSync('server.js', code, 'utf8');
console.log('server.js successfully updated');
