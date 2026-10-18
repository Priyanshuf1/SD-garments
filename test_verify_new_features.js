const http = require('http');
const fs = require('fs');
const path = require('path');

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      if (typeof data === 'string') {
        req.write(data);
      } else {
        req.write(JSON.stringify(data));
      }
    }
    req.end();
  });
}

async function runNewFeatureTests() {
  console.log('========================================================');
  console.log('🧪 VERIFYING NEW VIDEO UPDATE, ORDERS & GALLERY FEATURES');
  console.log('========================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, msg) {
    if (condition) {
      console.log(`✅ [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${msg}`);
      failed++;
      throw new Error(`Assertion failed: ${msg}`);
    }
  }

  // 1. Check GET /api/admin/videos
  console.log('--- Test 1: GET /api/admin/videos Endpoint ---');
  const vidsRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/admin/videos',
    method: 'GET'
  });
  assert(vidsRes.status === 200, 'GET /api/admin/videos returns HTTP 200');
  assert(vidsRes.body.success === true, 'Videos response has success: true');
  assert(vidsRes.body.count === 6, `Exactly 6 section videos tracked (found: ${vidsRes.body.count})`);
  const heroDesktop = vidsRes.body.videos.find(v => v.name === 'hero_desktop.mp4');
  assert(heroDesktop && heroDesktop.sizeBytes > 10000000, 'hero_desktop.mp4 size tracked accurately (>10MB)');
  assert(heroDesktop.status === 'HTTP 206 Ready', 'hero_desktop.mp4 status is HTTP 206 Ready');

  // 2. Test POST /api/admin/videos/update with base64 data
  console.log('\n--- Test 2: Video Update/Replace API (Base64 Upload) ---');
  // Back up original showcase2.mp4 first
  const showcasePath = path.join(__dirname, 'assets', 'videos', 'showcase2.mp4');
  const originalBackup = fs.readFileSync(showcasePath);

  // Write a small dummy MP4 buffer (or tiny valid MP4 header)
  const testMp4Header = Buffer.from('00000018667479706d7034320000000069736f6d6d703432', 'hex');
  const base64Data = 'data:video/mp4;base64,' + testMp4Header.toString('base64');

  const updateRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/admin/videos/update',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    videoName: 'showcase2.mp4',
    data: base64Data
  });

  assert(updateRes.status === 200, 'POST /api/admin/videos/update returns HTTP 200');
  assert(updateRes.body.success === true, 'Video update response has success: true');
  assert(updateRes.body.video.name === 'showcase2.mp4', 'Updated video filename is showcase2.mp4');
  assert(fs.existsSync(showcasePath), 'showcase2.mp4 exists on local disk after replacement');

  // Restore the original showcase2.mp4 to keep video intact!
  fs.writeFileSync(showcasePath, originalBackup);
  console.log(' - Successfully restored original showcase2.mp4 video file');

  // 3. Test HTTP 206 range streaming on restored video
  console.log('\n--- Test 3: HTTP 206 Range Streaming after Video Update ---');
  const rangeCheck = await new Promise(resolve => {
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/assets/videos/showcase2.mp4',
      headers: { 'Range': 'bytes=0-1023' }
    }, res => {
      resolve({ status: res.statusCode, cr: res.headers['content-range'], cl: res.headers['content-length'] });
      res.destroy();
    });
    req.end();
  });
  assert(rangeCheck.status === 206, 'HTTP 206 Partial Content returned');
  assert(rangeCheck.cl === '1024', 'Content-Length header matches requested byte chunk (1024 bytes)');

  // 4. Test Orders List and Item Thumbnails
  console.log('\n--- Test 4: Orders Line Items & Product Thumbnails ---');
  const ordersRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/admin/orders',
    method: 'GET'
  });
  assert(ordersRes.status === 200, 'GET /api/admin/orders returns HTTP 200');
  assert(ordersRes.body.orders.length > 0, `Orders found: ${ordersRes.body.orders.length}`);
  
  let allOrdersHaveValidThumbnails = true;
  ordersRes.body.orders.forEach(o => {
    assert(Array.isArray(o.items) && o.items.length > 0, `Order #${o.id} has line items`);
    o.items.forEach(it => {
      if (!it.image || !it.title || !it.size || !it.quantity) {
        allOrdersHaveValidThumbnails = false;
        console.error(`Missing item fields in order #${o.id}:`, it);
      }
    });
  });
  assert(allOrdersHaveValidThumbnails, 'All order items contain valid image thumbnail, title, size, and quantity');

  // 5. Test Creating Manual Order with Auto Product Image Matching
  console.log('\n--- Test 5: Manual Order Creation with Image Auto-Resolution ---');
  const manualOrderRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/admin/orders',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    customer: {
      name: 'Rohan Varma',
      phone: '+91 98200 12345',
      city: 'Delhi'
    },
    items: [
      {
        title: 'Basic White Baggy Pants',
        size: '34',
        price: 1899,
        quantity: 1
      }
    ]
  });

  assert(manualOrderRes.status === 201, 'POST /api/admin/orders returns HTTP 201');
  const createdOrder = manualOrderRes.body.order;
  assert(createdOrder.items[0].title === 'Basic White Baggy Pants', 'Item title preserved');
  assert(createdOrder.items[0].image && createdOrder.items[0].image.includes('Artboard1_5'), 'Product image auto-matched from catalog');
  assert(createdOrder.items[0].size === '34', 'Variant size preserved');
  assert(createdOrder.items[0].quantity === 1, 'Quantity preserved');

  // Cleanup test order
  await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/admin/orders/${createdOrder.id}`,
    method: 'DELETE'
  });
  console.log(` - Cleaned up test order #${createdOrder.id}`);

  // 6. Test Collection Creation with Gallery Banner Image
  console.log('\n--- Test 6: Collection Drop with Gallery Image ---');
  const collRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/admin/collections',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    title: 'Cyberpunk Artisan Capsule',
    handle: 'cyberpunk-artisan-capsule',
    image: 'https://cdn.shopify.com/s/files/1/0633/9339/9022/files/1_cd34702d-ac3b-4ee4-a9d4-1733e518d430.png?v=1792222977',
    description: 'High octane cyberpunk streetwear limited run.'
  });

  assert(collRes.status === 201, 'POST /api/admin/collections returns HTTP 201');
  assert(collRes.body.collection.image.src.includes('1_cd34702d'), 'Collection banner image successfully saved');
  
  // Cleanup test collection
  await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/admin/collections/${collRes.body.collection.id}`,
    method: 'DELETE'
  });
  console.log(` - Cleaned up test collection #${collRes.body.collection.id}`);

  // 7. Verify Admin.html markup elements
  console.log('\n--- Test 7: Admin UI Elements Verification ---');
  const adminHtml = fs.readFileSync(path.join(__dirname, 'admin.html'), 'utf8');

  assert(adminHtml.includes('id="video-update-modal"'), 'admin.html contains Video Update modal (#video-update-modal)');
  assert(adminHtml.includes('id="media-picker-modal"'), 'admin.html contains Media Gallery Picker modal (#media-picker-modal)');
  assert(adminHtml.includes('id="guide-modal"'), 'admin.html contains Operations & Architecture Guide modal (#guide-modal)');
  assert(adminHtml.includes('Product(s) Ordered'), 'admin.html contains "Product(s) Ordered" column header');
  assert(adminHtml.includes('coll-image-preview-box'), 'admin.html contains collection live image preview box');
  assert(adminHtml.includes('openMediaPicker'), 'admin.html contains openMediaPicker handler');
  assert(adminHtml.includes('Update / Replace Video'), 'admin.html contains "Update / Replace Video" button on cards');
  assert(adminHtml.includes('OPERATIONS GUIDE'), 'admin.html contains "OPERATIONS GUIDE" button in top header');

  console.log('\n========================================================');
  console.log(`🎉 ALL NEW FEATURE TESTS PASSED! (${passed}/${passed})`);
  console.log('========================================================\n');
}

runNewFeatureTests().catch(err => {
  console.error('\n❌ TEST RUN ENCOUNTERED AN ERROR:', err.message);
  process.exit(1);
});
