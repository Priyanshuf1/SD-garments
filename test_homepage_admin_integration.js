const http = require('http');
const fs = require('fs');
const path = require('path');

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk.toString());
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, data: body ? JSON.parse(body) : null, raw: body });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(typeof data === 'string' ? data : JSON.stringify(data));
    req.end();
  });
}

async function run() {
  console.log('🧪 Running Homepage Admin & Collections Comprehensive Verification...\n');
  let passed = 0;
  let failed = 0;

  function assert(cond, msg) {
    if (cond) {
      console.log(`✅ [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${msg}`);
      failed++;
    }
  }

  // 1. Check Homepage Section Filtering on /api/admin/products
  const resBasics = await request({ hostname: 'localhost', port: 3000, path: '/api/admin/products?homepage_section=genrage_basics', method: 'GET' });
  assert(resBasics.status === 200 && resBasics.data.products.length === 13, `Basics homepage section query returns 13 products (found: ${resBasics.data?.products?.length})`);

  const resDropped = await request({ hostname: 'localhost', port: 3000, path: '/api/admin/products?homepage_section=just_dropped', method: 'GET' });
  assert(resDropped.status === 200 && resDropped.data.products.length === 17, `Just Dropped homepage section query returns 17 products (found: ${resDropped.data?.products?.length})`);

  const resNew = await request({ hostname: 'localhost', port: 3000, path: '/api/admin/products?homepage_section=new_arrivals', method: 'GET' });
  assert(resNew.status === 200 && resNew.data.products.length === 40, `New Arrivals homepage section query returns 40 products (found: ${resNew.data?.products?.length})`);

  const resNone = await request({ hostname: 'localhost', port: 3000, path: '/api/admin/products?homepage_section=none', method: 'GET' });
  assert(resNone.status === 200 && resNone.data.products.length === 174, `Catalog Only (none) homepage section query returns 174 products (found: ${resNone.data?.products?.length})`);

  // Total products (Gift card removed: 244 total)
  const total = (resBasics.data.products.length + resDropped.data.products.length + resNew.data.products.length + resNone.data.products.length);
  assert(total === 244, `Sum of homepage sections matches total catalog of 244 products (found: ${total})`);

  // 2. Add New Product with homepage_section
  const testProdData = {
    title: 'Test Admin Showcase Pants',
    category: 'Pants & Bottoms',
    price: 1999,
    compare_at_price: 2999,
    image: 'https://cdn.shopify.com/s/files/1/0633/9339/9022/files/test.png',
    hoverImage: 'https://cdn.shopify.com/s/files/1/0633/9339/9022/files/test_hover.png',
    homepage_section: 'just_dropped',
    inventory_quantity: 50
  };

  const createRes = await request(
    { hostname: 'localhost', port: 3000, path: '/api/admin/products', method: 'POST', headers: { 'Content-Type': 'application/json' } },
    testProdData
  );
  assert(createRes.status === 201 && createRes.data?.success, 'POST /api/admin/products creates product with homepage_section');
  const createdProd = createRes.data?.product;
  assert(createdProd?.homepage_section === 'just_dropped', 'Created product has homepage_section="just_dropped"');

  // Verify it appears in just_dropped filter
  const verifyDrop = await request({ hostname: 'localhost', port: 3000, path: '/api/admin/products?homepage_section=just_dropped', method: 'GET' });
  assert(verifyDrop.data.products.some(p => p.id === createdProd.id), 'Newly created product appears in just_dropped query');

  // 3. Update Product homepage_section to genrage_basics
  const updateRes = await request(
    { hostname: 'localhost', port: 3000, path: `/api/admin/products/${createdProd.id}`, method: 'PUT', headers: { 'Content-Type': 'application/json' } },
    { homepage_section: 'genrage_basics' }
  );
  assert(updateRes.status === 200 && updateRes.data?.success, 'PUT /api/admin/products/:id updates homepage_section');
  assert(updateRes.data?.product?.homepage_section === 'genrage_basics', 'Updated product has homepage_section="genrage_basics"');

  // 4. Update Product homepage_section to none
  const updateNone = await request(
    { hostname: 'localhost', port: 3000, path: `/api/admin/products/${createdProd.id}`, method: 'PUT', headers: { 'Content-Type': 'application/json' } },
    { homepage_section: 'none' }
  );
  assert(updateNone.status === 200 && updateNone.data?.product?.homepage_section === 'none', 'Updated product to "none" (removed from homepage)');

  // 5. Clean up test product
  const delRes = await request({ hostname: 'localhost', port: 3000, path: `/api/admin/products/${createdProd.id}`, method: 'DELETE' });
  assert(delRes.status === 200 && delRes.data?.success, 'DELETE /api/admin/products/:id cleans up test product');

  // 6. Verify HTML and File Integrity
  const indexHtml = fs.readFileSync('index.html', 'utf8');
  assert(!indexHtml.includes('products.forEach(p => {\n        const card = document.createElement(\'product-card\');'), 'Homepage removed old unconditional dump loop');
  assert(indexHtml.includes('featuredProds = products.filter(p => p.homepage_section && p.homepage_section !== \'none\')'), 'Homepage only syncs products where homepage_section !== none');

  const adminHtml = fs.readFileSync('admin.html', 'utf8');
  assert(adminHtml.includes('id="prod-filter-homepage"'), 'Admin toolbar includes prod-filter-homepage selector');
  assert(adminHtml.includes('id="edit-prod-homepage-section"'), 'Admin modal includes edit-prod-homepage-section select');
  assert(adminHtml.includes('Homepage Showcase'), 'Admin table includes Homepage Showcase column header');
  assert(adminHtml.includes('quickUpdateHomepageSection'), 'Admin includes quickUpdateHomepageSection 1-click update handler');
  assert(adminHtml.includes('prod-section-select'), 'Admin table rows render inline prod-section-select dropdowns');

  assert(indexHtml.includes('/assets/css/custom.css'), 'Homepage index.html links to custom.css for styling');
  assert(indexHtml.includes('product-card__image--secondary'), 'Homepage index.html has dual-image secondary hover class styles');

  const colHtml = fs.readFileSync('collections.html', 'utf8');
  assert(colHtml.includes('opacity: 1 !important'), 'collections.html enforces opacity: 1 !important for product-card');
  assert(!colHtml.includes('<product-card class="product-card" handle="${p.handle}" reveal-on-scroll="true">'), 'collections.html template does not set reveal-on-scroll="true"');
  assert(colHtml.includes('.product-card__image--secondary'), 'collections.html has dual-image secondary hover class styles');
  assert(colHtml.includes('data-cat="basics"'), 'collections.html has GENRAGE Basics category chip');
  assert(colHtml.includes('data-cat="clearance"'), 'collections.html has Clearance Sale category chip');

  console.log(`\n========================================`);
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log(`========================================`);

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
