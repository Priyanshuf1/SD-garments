const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function run() {
  console.log('🧪 Starting Verification Suite: Dual Product Images, Businessman Analytics, & Supabase Architecture\n');

  // 1. Verify schema.sql and .env.example
  console.log('--- 1. Architecture Files ---');
  const schemaPath = path.join(__dirname, 'supabase', 'schema.sql');
  const envPath = path.join(__dirname, '.env.example');
  assert(fs.existsSync(schemaPath), 'supabase/schema.sql exists');
  const schemaContent = fs.readFileSync(schemaPath, 'utf8');
  assert(schemaContent.includes('CREATE TABLE IF NOT EXISTS public.profiles'), 'schema.sql contains profiles table');
  assert(schemaContent.includes('CREATE TABLE IF NOT EXISTS public.product_images'), 'schema.sql contains product_images table');
  assert(schemaContent.includes('CREATE TABLE IF NOT EXISTS public.orders'), 'schema.sql contains orders table');

  assert(fs.existsSync(envPath), '.env.example exists');
  const envContent = fs.readFileSync(envPath, 'utf8');
  assert(envContent.includes('SUPABASE_URL'), '.env.example specifies SUPABASE_URL');
  assert(envContent.includes('CASHFREE_APP_ID'), '.env.example specifies CASHFREE credentials');
  assert(envContent.includes('DELHIVERY_API_TOKEN'), '.env.example specifies DELHIVERY credentials');

  // 2. Verify admin.html clutter removal
  console.log('\n--- 2. Admin Clutter Removal ---');
  const adminHtml = fs.readFileSync(path.join(__dirname, 'admin.html'), 'utf8');
  assert(!adminHtml.includes('6 HD Streetwear Video Streams Active'), 'Video streams health banner removed from Overview dashboard');
  assert(adminHtml.includes('Net Profit Realization'), 'Businessman metric "Net Profit Realization" present in Analytics');
  assert(adminHtml.includes('Prepaid vs COD Risk'), 'Businessman metric "Prepaid vs COD Risk" present in Analytics');
  assert(adminHtml.includes('Streetwear Metro Order Heatmap'), 'Businessman metric "Streetwear Metro Order Heatmap" present in Analytics');

  // 3. Verify Dual Product Image Selectors in Modal
  console.log('\n--- 3. Dual Product Image Modal Controls ---');
  assert(adminHtml.includes('edit-prod-image') && adminHtml.includes('edit-prod-hover-image'), 'Both primary and hover model image inputs exist');
  assert(adminHtml.includes('tab-hover-link') && adminHtml.includes('tab-hover-file') && adminHtml.includes('tab-hover-gallery'), 'Hover image has Link, Upload, and Gallery options');
  assert(adminHtml.includes('compressImageToWebP'), 'Auto WebP canvas compression enabled for uploads');

  // 4. Test Product CRUD with Dual Images
  console.log('\n--- 4. API: Product Creation & Dual Images ---');
  const primaryImg = 'https://genrage.com/cdn/shop/files/sample_primary.jpg';
  const hoverImg = 'https://genrage.com/cdn/shop/files/sample_model_hover.jpg';

  const createRes = await request({
    hostname: 'localhost',
    port: PORT,
    path: '/api/admin/products',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    title: 'Acid Wash Oversized Heavy Hoodie',
    price: '2499',
    compare_at_price: '3499',
    category: 'Hoodies',
    stock: 50,
    image: primaryImg,
    hoverImage: hoverImg,
    images: [
      { id: 1, src: primaryImg },
      { id: 2, src: hoverImg }
    ],
    tags: 'Oversized, Winter Drop'
  });

  assert(createRes.status === 201 && createRes.body.success, 'Product created successfully');
  const newProd = createRes.body.product;
  assert(newProd.images && newProd.images.length === 2, 'Product contains dual images array');
  assert(newProd.images[0].src === primaryImg, 'Primary image stored at index 0');
  assert(newProd.images[1].src === hoverImg, 'Hover model image stored at index 1');

  // 5. Test Product Update
  console.log('\n--- 5. API: Product Update with Dual Images ---');
  const updatedHover = 'https://genrage.com/cdn/shop/files/sample_model_hover_v2.jpg';
  const updateRes = await request({
    hostname: 'localhost',
    port: PORT,
    path: `/api/admin/products/${newProd.id}`,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' }
  }, {
    title: 'Acid Wash Oversized Heavy Hoodie (V2)',
    hoverImage: updatedHover,
    images: [
      { id: 1, src: primaryImg },
      { id: 2, src: updatedHover }
    ]
  });

  assert(updateRes.status === 200 && updateRes.body.success, 'Product updated successfully');
  assert(updateRes.body.product.images[1].src === updatedHover, 'Updated hover model image persisted');

  // Clean up created product
  await request({
    hostname: 'localhost',
    port: PORT,
    path: `/api/admin/products/${newProd.id}`,
    method: 'DELETE'
  });

  console.log(`\n========================================`);
  console.log(`TOTAL PASSED: ${passed} | TOTAL FAILED: ${failed}`);
  console.log(`========================================\n`);

  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
