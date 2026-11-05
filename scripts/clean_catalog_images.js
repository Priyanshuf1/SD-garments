const fs = require('fs');
const path = require('path');

const productsFilePath = path.join(__dirname, '..', 'data', 'products.json');
const raw = fs.readFileSync(productsFilePath, 'utf8');
const data = JSON.parse(raw);
const products = data.products || data;

// Curated high-res Unsplash & local luxury fashion assets by category
const CATEGORY_FALLBACKS = {
  'Top Wear': [
    '/images/photo_1.webp',
    '/images/photo_3.webp',
    '/images/photo_4.webp',
    '/images/photo_11.webp',
    'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?auto=format&fit=crop&w=900&q=80'
  ],
  'Bottom Wear': [
    '/images/photo_2.webp',
    '/images/photo_9.webp',
    '/images/photo_10.webp',
    'https://images.unsplash.com/photo-1542272604-780c96856592?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=900&q=80'
  ],
  'Accessories': [
    '/images/photo_5.webp',
    '/images/photo_6.webp',
    '/images/photo_12.webp',
    '/images/photo_13.webp',
    'https://images.unsplash.com/photo-1598808503746-f34c53b9323e?auto=format&fit=crop&w=900&q=80'
  ],
  'Party Wear': [
    'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1593030761757-71fae45fa0e7?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1617137984095-74e4e5e3613f?auto=format&fit=crop&w=900&q=80'
  ],
  "Boys' Clothing": [
    'https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1503919545889-aef636e10ad4?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=900&q=80'
  ],
  "Girls' Clothing": [
    'https://images.unsplash.com/photo-1519457431-44ccd64a579b?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1518831959646-742c3a14ebf7?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1502781252888-9143ba7f074e?auto=format&fit=crop&w=900&q=80'
  ],
  'Baby Clothing (0–2 Years)': [
    'https://images.unsplash.com/photo-1522771930-78848d9293e8?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?auto=format&fit=crop&w=900&q=80'
  ],
  'Co-ord Sets': [
    '/images/photo_7.webp',
    '/images/photo_8.webp',
    '/images/photo_14.webp'
  ]
};

function getHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

let deadCount = 0;
products.forEach(p => {
  const cat = p.category || p.product_type || 'Top Wear';
  const pool = CATEGORY_FALLBACKS[cat] || CATEGORY_FALLBACKS['Top Wear'];
  const hash = getHash(p.handle || p.title || String(p.id));

  const isDead = (src) => !src || src.includes('cdn.shopify.com/s/files/1/0633/9339/9022/');

  if (isDead(p.image)) {
    deadCount++;
    p.image = pool[hash % pool.length];
  }
  if (isDead(p.hoverImage)) {
    p.hoverImage = pool[(hash + 1) % pool.length];
  }

  if (Array.isArray(p.images)) {
    p.images.forEach((img, idx) => {
      if (isDead(img.src)) {
        img.src = pool[(hash + idx) % pool.length];
      }
    });
    if (p.images.length === 0) {
      p.images = [
        { id: `${p.id}-img-1`, src: p.image, position: 1 },
        { id: `${p.id}-img-2`, src: p.hoverImage, position: 2 }
      ];
    }
  } else {
    p.images = [
      { id: `${p.id}-img-1`, src: p.image, position: 1 },
      { id: `${p.id}-img-2`, src: p.hoverImage, position: 2 }
    ];
  }
});

console.log(`Replaced ${deadCount} dead images across ${products.length} products with category-matched luxury imagery.`);

if (Array.isArray(data)) {
  fs.writeFileSync(productsFilePath, JSON.stringify(products, null, 2), 'utf8');
} else {
  data.products = products;
  fs.writeFileSync(productsFilePath, JSON.stringify(data, null, 2), 'utf8');
}

console.log('Saved updated products.json successfully.');
