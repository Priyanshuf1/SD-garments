const https = require('https');

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
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

async function verifyLive() {
  const hostname = process.env.TEST_HOST || 'alleyrich.com';
  console.log('🌐 ========================================================');
  console.log(`   VERIFYING LIVE PRODUCTION: https://${hostname}`);
  console.log('========================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ [PROD PASS] ${message}`);
      passed++;
    } else {
      console.error(`❌ [PROD FAIL] ${message}`);
      failed++;
    }
  }

  // 1. Wishlist Sync
  console.log('\n--- 1. Live Wishlist Sync ---');
  const wishRes = await request(
    { hostname, path: '/api/wishlist/sync', method: 'POST', headers: { 'Content-Type': 'application/json' } },
    { userId: 'prod_test_user_' + Date.now(), wishlist: ['boxy-tshirt-black'] }
  );
  assert(wishRes.status === 200 && wishRes.data && wishRes.data.success, 'POST /api/wishlist/sync returns 200 OK');

  // 2. Backdoor removal
  console.log('\n--- 2. Live Backdoor Removal (123456) ---');
  const backdoorRes = await request(
    { hostname, path: '/api/auth/verify-otp', method: 'POST', headers: { 'Content-Type': 'application/json' } },
    { email: `nobody_${Date.now()}@test.com`, token: '123456' }
  );
  assert(backdoorRes.status === 400, `POST /api/auth/verify-otp with backdoor '123456' strictly returned HTTP ${backdoorRes.status}`);

  // 3. Cart Sync
  console.log('\n--- 3. Live Cart Sync ---');
  const testUserId = 'prod_user_' + Date.now();
  const cartSyncRes = await request(
    { hostname, path: '/api/cart/sync', method: 'POST', headers: { 'Content-Type': 'application/json' } },
    { userId: testUserId, cart: [{ id: 'item_1', title: 'Heavy Hoodie', price: 2499, quantity: 1 }] }
  );
  assert(cartSyncRes.status === 200 && cartSyncRes.data && cartSyncRes.data.success, 'POST /api/cart/sync returns 200 OK');

  const cartGetRes = await request(
    { hostname, path: `/api/cart?userId=${testUserId}`, method: 'GET' }
  );
  assert(cartGetRes.status === 200 && Array.isArray(cartGetRes.data.cart) && cartGetRes.data.cart.length === 1, 'GET /api/cart returns saved cart');

  // 4. Duplicate Registration
  console.log('\n--- 4. Live Duplicate Registration Prevention ---');
  const dupEmail = `prod_dup_${Date.now()}@allyrichtest.com`;
  const signup1 = await request(
    { hostname, path: '/api/auth/signup', method: 'POST', headers: { 'Content-Type': 'application/json' } },
    { name: 'Prod User', email: dupEmail, password: 'ProdPassword123' }
  );
  assert(signup1.status === 200 || signup1.status === 201, `Initial signup returned HTTP ${signup1.status}`);

  const signup2 = await request(
    { hostname, path: '/api/auth/signup', method: 'POST', headers: { 'Content-Type': 'application/json' } },
    { name: 'Duplicate Prod User', email: dupEmail, password: 'AnotherPassword' }
  );
  assert(signup2.status === 400, `Duplicate signup rejected with HTTP ${signup2.status}`);

  // 5. Admin Broadcast
  console.log('\n--- 5. Live Admin Broadcast Endpoint ---');
  const broadcastRes = await request(
    { hostname, path: '/api/admin/subscribers/broadcast', method: 'POST', headers: { 'Content-Type': 'application/json' } },
    { subject: 'VIP Notification', message: 'Test live broadcast dispatch', headline: 'ALLYRICH VIP' }
  );
  assert(broadcastRes.status === 200 && broadcastRes.data && broadcastRes.data.success, `POST /api/admin/subscribers/broadcast returned HTTP 200 OK`);

  // 6. Policy Pages
  console.log('\n--- 6. Live Policy Pages ---');
  const policyPages = [
    '/refund-policy',
    '/privacy-policy',
    '/terms-of-service',
    '/shipping-policy',
    '/contact',
    '/returns',
    '/reviews'
  ];

  for (const page of policyPages) {
    const res = await request({ hostname, path: page, method: 'GET' });
    assert(res.status === 200, `Live page ${page} returned HTTP 200 OK`);
    assert(res.raw && res.raw.includes('ALLYRICH'), `${page} contains unified brand name ALLYRICH`);
    assert(res.raw && res.raw.includes('ar-logo.png'), `${page} uses official AR logo`);
    assert(res.raw && !res.raw.includes('logo.png?v='), `${page} contains no broken shopify logo`);
    assert(res.raw && res.raw.includes('footer-ruins.webp'), `${page} renders ruins footer`);
    assert(res.raw && res.raw.includes('id="mobile-menu-trigger"'), `${page} renders mobile menu trigger in header`);
    assert(res.raw && res.raw.includes('id="mobile-drawer"'), `${page} renders mobile drawer navigation`);
  }

  // Wishlist touch handling
  const wishJsRes = await request({ hostname, path: '/assets/js/wishlist.js', method: 'GET' });
  assert(wishJsRes.status === 200 && wishJsRes.raw.includes('touchstart') && wishJsRes.raw.includes('wishlistTouchMoved'), 'Live wishlist.js includes touchstart and scroll suppression');

  // 7. Index HTML Assets & Loader
  console.log('\n--- 7. Live Loader & Script Cleanliness ---');
  const indexRes = await request({ hostname, path: '/', method: 'GET' });
  assert(indexRes.status === 200, 'GET / returned HTTP 200 OK');
  assert(!indexRes.raw.includes('atlantis.live.zoko.io'), 'Live index has zero zoko script');
  assert(!indexRes.raw.includes('goaffpro/loader.js'), 'Live index has zero goaffpro script');
  assert(!indexRes.raw.includes('restock-sdk-loader.js'), 'Live index has zero restock sdk');
  assert(!indexRes.raw.includes('upcart-bundle.js'), 'Live index has zero upcart script');

  const loaderRes = await request({ hostname, path: '/assets/js/allyrich-loader.js', method: 'GET' });
  assert(loaderRes.status === 200, 'GET /assets/js/allyrich-loader.js returned HTTP 200 OK');
  assert(loaderRes.raw.includes('capTimer = setTimeout(finish, 1200)'), 'Live loader capTimer is set to 1200ms');

  console.log('\n========================================================');
  console.log(`LIVE PRODUCTION VERIFICATION: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================\n');

  if (failed > 0) process.exit(1);
}

verifyLive().catch(console.error);
