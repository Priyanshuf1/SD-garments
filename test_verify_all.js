/**
 * Comprehensive Automated Verification Suite for Genrage Categories, Photo Uploads & Admin Panels
 */
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

async function runTests() {
  console.log('🧪 Starting Genrage Feature & Category Verification Tests...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // 1. Verify Category breakdown in Stats
    const statsRes = await request({ hostname: 'localhost', port: 3000, path: '/api/admin/stats', method: 'GET' });
    assert(statsRes.status === 200 && statsRes.data?.stats?.categoryBreakdown, 'Dashboard stats API returns categoryBreakdown');
    const cb = statsRes.data?.stats?.categoryBreakdown || {};
    assert(cb['Pants & Bottoms'] === 75, `Category 'Pants & Bottoms' has exactly 75 products (found: ${cb['Pants & Bottoms']})`);
    assert(cb['Vests & Tanks'] === 53, `Category 'Vests & Tanks' has exactly 53 products (found: ${cb['Vests & Tanks']})`);
    assert(cb['T-Shirts & Boxy Tees'] === 30, `Category 'T-Shirts & Boxy Tees' has exactly 30 products (found: ${cb['T-Shirts & Boxy Tees']})`);
    assert(cb['Jewelry & Pendants'] === 28, `Category 'Jewelry & Pendants' has exactly 28 products (found: ${cb['Jewelry & Pendants']})`);

    // 2. Query Products by Category
    const catQueryRes = await request({ hostname: 'localhost', port: 3000, path: '/api/admin/products?category=Hoodies', method: 'GET' });
    assert(catQueryRes.status === 200 && catQueryRes.data?.count === 6, `Filtering products by 'Hoodies' returns 6 hoodies (found: ${catQueryRes.data?.count})`);

    // 3. Test Photo Upload Endpoint (POST /api/admin/upload)
    const test1pxPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const uploadRes = await request(
      { hostname: 'localhost', port: 3000, path: '/api/admin/upload', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { filename: 'streetwear_test_sample.png', data: test1pxPng }
    );
    assert(uploadRes.status === 200 && uploadRes.data?.success && uploadRes.data?.url, 'Photo upload API successfully processes image and returns asset URL');
    const uploadedUrl = uploadRes.data.url;

    // 4. Verify Uploaded File is served statically
    const serveUploadRes = await request({ hostname: 'localhost', port: 3000, path: uploadedUrl, method: 'GET' });
    assert(serveUploadRes.status === 200 && serveUploadRes.headers['content-type'] === 'image/png', `Uploaded photo served with HTTP 200 and image/png at ${uploadedUrl}`);

    // 5. Test Product Creation with Category & Uploaded Photo
    const createProdRes = await request(
      { hostname: 'localhost', port: 3000, path: '/api/admin/products', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      {
        title: 'Cyberpunk Tactical Cargo Pants',
        category: 'Pants & Bottoms',
        product_type: 'Pants & Bottoms',
        price: '2499',
        compare_at_price: '3499',
        stock: 50,
        image: uploadedUrl,
        tags: 'Shop, Cargo, Streetwear, Limited'
      }
    );
    assert(createProdRes.status === 201 && createProdRes.data?.product?.category === 'Pants & Bottoms', 'Admin can add product with specific category and photo URL/upload');
    const newProdId = createProdRes.data.product.id;

    // 6. Test Product Edit
    const editProdRes = await request(
      { hostname: 'localhost', port: 3000, path: `/api/admin/products/${newProdId}`, method: 'PUT', headers: { 'Content-Type': 'application/json' } },
      { title: 'Cyberpunk Tactical Cargo Pants (Special Edition)', price: '2699' }
    );
    assert(editProdRes.status === 200 && editProdRes.data?.product?.title.includes('Special Edition'), 'Admin can edit product title and price');

    // Clean up created test product
    await request({ hostname: 'localhost', port: 3000, path: `/api/admin/products/${newProdId}`, method: 'DELETE' });

    // 7. Test Customers API
    const custRes = await request({ hostname: 'localhost', port: 3000, path: '/api/admin/customers', method: 'GET' });
    assert(custRes.status === 200 && custRes.data?.count >= 8, `Customers API returns directory with ${custRes.data?.count} customers`);

    // 8. Test Reviews API
    const revRes = await request({ hostname: 'localhost', port: 3000, path: '/api/admin/reviews', method: 'GET' });
    assert(revRes.status === 200 && revRes.data?.count >= 5, `Reviews API returns ${revRes.data?.count} verified reviews`);

    // 9. Test Media Gallery API
    const mediaRes = await request({ hostname: 'localhost', port: 3000, path: '/api/admin/media', method: 'GET' });
    assert(mediaRes.status === 200 && mediaRes.data?.success, 'Media API lists all stored uploaded files');

    // 10. Test Video Stream Range 206
    const videoRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/assets/videos/hero_desktop.mp4',
      method: 'GET',
      headers: { 'Range': 'bytes=0-1024' }
    });
    assert(videoRes.status === 206 && videoRes.headers['content-range'], 'Video streaming engine serves HTTP 206 with Content-Range');

  } catch (err) {
    console.error('Fatal test error:', err);
    failed++;
  }

  console.log(`\n========================================`);
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log(`========================================\n`);

  if (failed === 0) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests();
