const fs = require('fs');
const path = require('path');

const prodsData = JSON.parse(fs.readFileSync('data/products.json', 'utf8'));
const products = prodsData.products || (Array.isArray(prodsData) ? prodsData : []);

const collsData = JSON.parse(fs.readFileSync('data/collections.json', 'utf8'));
const collections = collsData.collections || [];

// Fallback curated imagery pool for streetwear, ethnic, suits, kids, baby
const fallbackPool = [
  'https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=900&q=80'
];

function matchesCategory(product, handle) {
  if (!handle || handle === 'all' || handle === 'shop') return true;
  handle = handle.toLowerCase();
  let pDept = (product.department || '').toLowerCase();
  const pCat = (product.category || '').toLowerCase();
  const pSub = (product.sub_category || '').toLowerCase();
  const pFit = (product.fit || '').toLowerCase();
  const pTags = (Array.isArray(product.tags) ? product.tags : (product.tags || '').split(','))
                  .map(t => t.trim().toLowerCase());
  const pTitle = (product.title || '').toLowerCase();
  const pType = (product.product_type || '').toLowerCase();

  if (!pDept) {
    const combo = (pCat + ' ' + pType + ' ' + pTitle + ' ' + pTags.join(' ')).toLowerCase();
    if (combo.includes('boy') || combo.includes('girl') || combo.includes('baby') || combo.includes('kid')) {
      pDept = 'kids';
    } else if (combo.includes('party') || combo.includes('jodhpuri') || combo.includes('blazer') || combo.includes('indo') || combo.includes('suit') || combo.includes('koti')) {
      pDept = 'party';
    } else if (combo.includes('accessory') || combo.includes('belt') || combo.includes('wallet')) {
      pDept = 'accessories';
    } else {
      pDept = 'men';
    }
  }

  if (handle === 'new-arrivals') {
    return product.homepage_section === 'new_arrivals' || pTags.includes('new arrival') || pTags.includes('new arrivals');
  }
  if (handle === 'accessories') {
    return pDept === 'accessories' || pCat === 'accessories' || pTags.includes('accessories');
  }
  if (handle === 'mens-wear') return pDept.includes('men');
  if (handle === 'party-wear') return pDept.includes('party') || pCat.includes('party') || pTags.includes('party-wear');
  if (handle === 'kids-wear') return pDept.includes('kid') || pCat.includes('kid') || pCat.includes('baby');

  if (handle === 'shirts' || handle === 'shirt') {
    const combo = (pTitle + ' ' + pCat + ' ' + pSub + ' ' + pType + ' ' + pTags.join(' ')).toLowerCase();
    if (combo.includes('t-shirt') || combo.includes('tshirt') || combo.includes('tee') || combo.includes('sweatshirt') || combo.includes('hoodie')) return false;
    return combo.includes('shirt');
  }

  if (handle === 't-shirts' || handle === 'tshirts') {
    return pDept.includes('men') && (pSub.includes('t-shirt') || pTitle.includes('t-shirt') || pTitle.includes('tee'));
  }
  if (handle === 'hoodies') {
    return pDept.includes('men') && (pSub.includes('hoodie') || pTitle.includes('hoodie'));
  }
  if (handle === 'mens-jeans' || handle === 'jeans') {
    return pDept.includes('men') && (pSub.includes('jean') || pTitle.includes('jean'));
  }
  if (handle === 'cargo-joggers') {
    return pDept.includes('men') && (pSub.includes('cargo') || pSub.includes('jogger') || pTitle.includes('cargo') || pTitle.includes('jogger'));
  }
  if (handle === 'mens-coord-sets') {
    return pDept.includes('men') && (pCat.includes('co-ord') || pTitle.includes('co-ord') || pTitle.includes('set'));
  }

  return pTags.includes(handle) || pTitle.includes(handle) || pCat.includes(handle) || pSub.includes(handle);
}

let updatedCount = 0;

collections.forEach((c, idx) => {
  const matching = products.filter(p => matchesCategory(p, c.handle));
  c.products_count = matching.length;

  if (matching.length > 0 && matching[0].images && matching[0].images[0] && matching[0].images[0].src) {
    c.image = { src: matching[0].images[0].src };
    updatedCount++;
  } else if (!c.image || !c.image.src || c.image.src.includes('photo_1.webp')) {
    const poolImg = fallbackPool[idx % fallbackPool.length];
    c.image = { src: poolImg };
  }
});

fs.writeFileSync('data/collections.json', JSON.stringify({ collections }, null, 2), 'utf8');
console.log(`Enriched ${collections.length} collections! ${updatedCount} have direct matching products.`);
