/**
 * GENRAGE Storefront Catalog Migration Script (High-Speed Batched Version)
 * Migrates all 245 products from data/products.json into Supabase PostgreSQL
 * Populates: public.products, public.product_variants, and public.product_images
 */

const fs = require('fs');
const path = require('path');

// Vanilla zero-dependency .env parser
try {
  const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > -1) {
        const k = trimmed.substring(0, idx).trim();
        const v = trimmed.substring(idx + 1).trim();
        if (!process.env[k]) process.env[k] = v;
      }
    }
  });
} catch (e) {}

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://shhjnxarewideotbhzby.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Prefer': 'return=representation,resolution=merge-duplicates'
};

async function checkDatabase() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/products?select=id&limit=1`, { headers });
    return res.status === 200;
  } catch (err) {
    console.error('❌ Connection error:', err.message);
    return false;
  }
}

async function runMigration() {
  console.log('⚡ Checking Supabase connection to:', SUPABASE_URL);
  const isReady = await checkDatabase();
  if (!isReady) {
    console.log('⚠️ Database tables not reachable.');
    return;
  }

  // Clean up any test product
  await fetch(`${SUPABASE_URL}/rest/v1/products?handle=eq.test-item-1`, {
    method: 'DELETE',
    headers
  });

  const raw = fs.readFileSync(path.join(__dirname, 'data', 'products.json'), 'utf8');
  const data = JSON.parse(raw);
  const products = Array.isArray(data) ? data : (data.products || []);

  console.log(`🚀 Found ${products.length} products to migrate...`);

  // 1. Batch upsert products in chunks of 50
  const CHUNK_SIZE = 50;
  const dbProductMap = new Map(); // handle -> id

  for (let i = 0; i < products.length; i += CHUNK_SIZE) {
    const chunk = products.slice(i, i + CHUNK_SIZE);
    const batchPayload = chunk.map(p => ({
      handle: p.handle,
      title: p.title,
      description: p.body_html || p.description || '',
      vendor: p.vendor || 'GENRAGE',
      category: p.category || 'Apparel',
      product_type: p.product_type || 'Streetwear',
      homepage_section: p.homepage_section || 'none',
      tags: p.tags || [],
      is_published: true,
      gst_rate_percent: 12
    }));

    const prodRes = await fetch(`${SUPABASE_URL}/rest/v1/products?on_conflict=handle`, {
      method: 'POST',
      headers,
      body: JSON.stringify(batchPayload)
    });

    if (!prodRes.ok) {
      console.warn(`Failed batch ${i} - ${i + CHUNK_SIZE}:`, await prodRes.text());
      continue;
    }

    const inserted = await prodRes.json();
    inserted.forEach(p => {
      dbProductMap.set(p.handle, p.id);
    });
    console.log(`📦 Upserted ${dbProductMap.size}/${products.length} products into Supabase`);
  }

  // 2. Prepare all variants and images
  const allVariants = [];
  const allImages = [];

  for (const p of products) {
    const prodId = dbProductMap.get(p.handle);
    if (!prodId) continue;

    const variants = p.variants || [{ price: '1599.00', compare_at_price: '2499.00', sku: `GR-${p.handle}` }];
    for (const v of variants) {
      const priceNum = Math.round(parseFloat(v.price || '1599') * 100);
      const mrpNum = Math.round(parseFloat(v.compare_at_price || v.price || '2499') * 100);
      allVariants.push({
        product_id: prodId,
        title: v.title || 'Default Title',
        sku: v.sku || `SKU-${p.handle}-${v.id || 1}`,
        size: v.size || 'Free Size',
        color: v.color || 'Black',
        price_paise: priceNum,
        mrp_paise: mrpNum,
        inventory_quantity: v.inventory_quantity ?? 100,
        available: v.available !== false
      });
    }

    const images = p.images || [];
    if (images.length === 0 && p.image?.src) {
      images.push({ src: p.image.src, position: 1 });
    }
    for (let pos = 0; pos < images.length; pos++) {
      allImages.push({
        product_id: prodId,
        src: images[pos].src,
        position: images[pos].position || pos + 1,
        is_model_view: (images[pos].position || pos + 1) === 2
      });
    }
  }

  // 3. Batch insert variants in chunks of 100
  console.log(`⚡ Seeding ${allVariants.length} product variants in batches...`);
  let insertedVariants = 0;
  for (let i = 0; i < allVariants.length; i += 100) {
    const chunk = allVariants.slice(i, i + 100);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/product_variants?on_conflict=sku`, {
      method: 'POST',
      headers,
      body: JSON.stringify(chunk)
    });
    if (res.ok) insertedVariants += chunk.length;
    else console.warn('Variant batch warning:', await res.text());
  }

  // 4. Batch insert images in chunks of 100
  console.log(`⚡ Seeding ${allImages.length} product images in batches...`);
  let insertedImages = 0;
  for (let i = 0; i < allImages.length; i += 100) {
    const chunk = allImages.slice(i, i + 100);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/product_images`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      },
      body: JSON.stringify(chunk)
    });
    if (res.ok) insertedImages += chunk.length;
    else console.warn('Image batch warning:', await res.text());
  }

  console.log(`\n🎉 CATALOG MIGRATION TO SUPABASE COMPLETE!`);
  console.log(`- Products in Database: ${dbProductMap.size}`);
  console.log(`- Variants Seeded: ${insertedVariants}`);
  console.log(`- Product Images Seeded: ${insertedImages}`);
}

runMigration().catch(err => console.error('Migration failed:', err));
