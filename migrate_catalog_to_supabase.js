/**
 * GENRAGE Storefront Catalog Migration Script
 * Migrates all 245 products from data/products.json into Supabase PostgreSQL
 * Populates: public.products, public.product_variants, and public.product_images (dual images)
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
  'Prefer': 'resolution=merge-duplicates'
};

async function checkDatabase() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/products?select=id&limit=1`, { headers });
    if (res.status === 404 || res.status === 401) {
      console.log('⚠️ Database tables not found yet. Please run supabase/schema.sql in Supabase SQL editor first.');
      return false;
    }
    return true;
  } catch (err) {
    console.error('❌ Connection error:', err.message);
    return false;
  }
}

async function runMigration() {
  console.log('⚡ Checking Supabase connection to:', SUPABASE_URL);
  const isReady = await checkDatabase();
  if (!isReady) {
    console.log('ℹ️ Waiting for schema to be applied. After executing supabase/schema.sql, re-run: node migrate_catalog_to_supabase.js');
    return;
  }

  const raw = fs.readFileSync(path.join(__dirname, 'data', 'products.json'), 'utf8');
  const data = JSON.parse(raw);
  const products = Array.isArray(data) ? data : (data.products || []);

  console.log(`🚀 Found ${products.length} products to migrate...`);

  let migratedCount = 0;
  let variantCount = 0;
  let imageCount = 0;

  for (const p of products) {
    try {
      // 1. Upsert product
      const productPayload = {
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
      };

      const prodRes = await fetch(`${SUPABASE_URL}/rest/v1/products?on_conflict=handle`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=representation,resolution=merge-duplicates' },
        body: JSON.stringify(productPayload)
      });

      if (!prodRes.ok) {
        const err = await prodRes.text();
        console.warn(`Failed product ${p.handle}:`, err);
        continue;
      }

      const insertedProds = await prodRes.json();
      const dbProduct = insertedProds[0];
      if (!dbProduct) continue;
      migratedCount++;

      // 2. Insert Variants
      const variants = p.variants || [{ price: '1599.00', compare_at_price: '2499.00', sku: `GR-${p.handle}` }];
      for (const v of variants) {
        const priceNum = Math.round(parseFloat(v.price || '1599') * 100);
        const mrpNum = Math.round(parseFloat(v.compare_at_price || v.price || '2499') * 100);
        
        await fetch(`${SUPABASE_URL}/rest/v1/product_variants?on_conflict=sku`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            product_id: dbProduct.id,
            title: v.title || 'Default Title',
            sku: v.sku || `SKU-${dbProduct.handle}-${v.id || 1}`,
            size: v.size || 'Free Size',
            color: v.color || 'Black',
            price_paise: priceNum,
            mrp_paise: mrpNum,
            inventory_quantity: v.inventory_quantity ?? 100,
            available: v.available !== false
          })
        });
        variantCount++;
      }

      // 3. Insert Product Images (Primary Flatlay + Model Hover)
      const images = p.images || [];
      if (images.length === 0 && p.image?.src) {
        images.push({ src: p.image.src, position: 1 });
      }

      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        await fetch(`${SUPABASE_URL}/rest/v1/product_images`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            product_id: dbProduct.id,
            src: img.src,
            position: img.position || i + 1,
            is_model_view: (img.position || i + 1) === 2
          })
        });
        imageCount++;
      }

      if (migratedCount % 25 === 0) {
        console.log(`📦 Migrated ${migratedCount}/${products.length} products...`);
      }
    } catch (itemErr) {
      console.warn(`Error on product ${p.handle}:`, itemErr.message);
    }
  }

  console.log(`\n🎉 CATALOG MIGRATION COMPLETE!`);
  console.log(`- Products Migrated: ${migratedCount}`);
  console.log(`- Variants Seeded: ${variantCount}`);
  console.log(`- Dual Images Seeded: ${imageCount}`);
}

runMigration().catch(err => console.error('Migration failed:', err));
