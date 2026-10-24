const https = require('https');

function request(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: data, json: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, body: data, json: null });
        }
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runMasterVerification() {
  const BASE_URL = process.env.TEST_BASE_URL || 'https://alleyrich.com';
  console.log('====================================================');
  console.log('🌐 RUNNING PRODUCTION MASTER VERIFICATION');
  console.log(`Target: ${BASE_URL}`);
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, desc) {
    if (condition) {
      console.log(`✅ [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${desc}`);
      failed++;
    }
  }

  // 1. Verify Policy Pages on Live Vercel
  console.log('--- 1. Policy Pages Live HTTP 200 & ALLYRICH Branding ---');
  const policyRoutes = [
    '/refund-policy',
    '/privacy-policy',
    '/terms-of-service',
    '/shipping-policy',
    '/contact',
    '/pages/refund-policy.html',
    '/pages/privacy-policy.html',
    '/pages/terms-of-service.html',
    '/pages/shipping-policy.html',
    '/pages/contact.html'
  ];

  for (const route of policyRoutes) {
    const res = await request(`${BASE_URL}${route}`);
    assert(res.status === 200, `${route} returned HTTP 200 OK`);
    assert(res.body.includes('ALLYRICH'), `${route} contains brand name ALLYRICH`);
    assert(!res.body.includes('ALLY RICH'), `${route} does NOT contain obsolete 'ALLY RICH'`);
  }

  // 2. Verify Newsletter Subscription & Immediate Admin Reflection on Live Vercel
  console.log('\n--- 2. Newsletter Subscription & Admin Reflection Live ---');
  const testSubEmail = `verify_sub_${Date.now()}@liveverify.com`;
  const subRes = await request(`${BASE_URL}/api/newsletter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { email: testSubEmail });

  assert(subRes.status === 201 || subRes.status === 200, `POST /api/newsletter returned status ${subRes.status}`);
  assert(subRes.json && subRes.json.success === true, 'Newsletter subscription returned success: true');

  const adminSubRes = await request(`${BASE_URL}/api/admin/subscribers`);
  assert(adminSubRes.status === 200, 'GET /api/admin/subscribers returned HTTP 200 OK');
  assert(adminSubRes.json && Array.isArray(adminSubRes.json.subscribers), 'Admin subscribers endpoint returns an array');
  const foundSub = adminSubRes.json?.subscribers?.some(s => s.email === testSubEmail);
  assert(foundSub, `Subscribed email '${testSubEmail}' reflected in Admin subscribers list`);

  // 3. Verify Resend OTP Email Dispatch Live
  console.log('\n--- 3. Resend Real Email Dispatch on Production ---');
  const otpRes = await request(`${BASE_URL}/api/auth/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { email: 'apriyanshu540@gmail.com' });

  assert(otpRes.status === 200, 'POST /api/auth/send-otp returned HTTP 200 OK');
  assert(otpRes.json && otpRes.json.success === true, 'send-otp returned success: true');
  assert(otpRes.json && otpRes.json.emailSent === true, 'send-otp confirmed emailSent: true via Resend API');
  assert(otpRes.json && otpRes.json.code === undefined, 'send-otp did NOT leak the OTP code to response payload');

  // 4. Verify Multi-Device Cloud Wishlist & Address Sync Live
  console.log('\n--- 4. Multi-Device Cloud Profile & Wishlist Persistence Live ---');
  const testUserId = `cloud_user_${Date.now()}`;
  const testUserEmail = `cloud_device_${Date.now()}@allyrich.com`;

  // Device 1: Save profile with address and wishlist
  const saveProfileRes = await request(`${BASE_URL}/api/auth/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' }
  }, {
    id: testUserId,
    email: testUserEmail,
    name: 'Multi Device User',
    phone: '+91 98765 43210',
    city: 'New Delhi',
    state: 'Delhi',
    address: 'Connaught Place 12',
    pincode: '110001',
    country: 'India',
    wishlist: ['boxy-heavy-tee', 'hoodie-charcoal']
  });

  assert(saveProfileRes.status === 200, 'Device 1: PUT /api/auth/profile returned HTTP 200 OK');

  // Device 2: Fetch profile from a completely fresh session
  const fetchProfileRes = await request(`${BASE_URL}/api/customers/${testUserId}?email=${encodeURIComponent(testUserEmail)}`);
  assert(fetchProfileRes.status === 200, 'Device 2: GET customer profile returned HTTP 200 OK');
  assert(fetchProfileRes.json && fetchProfileRes.json.customer, 'Device 2: Customer object retrieved from cloud');
  const loadedCust = fetchProfileRes.json?.customer;
  assert(loadedCust?.city === 'New Delhi', 'Device 2: Shipping address (New Delhi) persisted across sessions');
  assert(Array.isArray(loadedCust?.wishlist) && loadedCust.wishlist.includes('boxy-heavy-tee'), 'Device 2: Cloud wishlist (boxy-heavy-tee) persisted across sessions');

  // Device 2: Add item to wishlist and sync
  const syncWishlistRes = await request(`${BASE_URL}/api/wishlist/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    userId: testUserId,
    email: testUserEmail,
    wishlist: ['boxy-heavy-tee', 'hoodie-charcoal', 'baggy-pants']
  });
  assert(syncWishlistRes.status === 200, 'Device 2: POST /api/wishlist/sync returned HTTP 200 OK');

  // Device 3: Re-fetch wishlist
  const fetchWishlistRes = await request(`${BASE_URL}/api/wishlist?userId=${testUserId}&email=${encodeURIComponent(testUserEmail)}`);
  assert(fetchWishlistRes.status === 200, 'Device 3: GET /api/wishlist returned HTTP 200 OK');
  assert(fetchWishlistRes.json && fetchWishlistRes.json.wishlist?.length === 3, 'Device 3: All 3 wishlist items loaded from cloud');

  // 5. Storefront Catalog & Search Live
  console.log('\n--- 5. Storefront Catalog & Search Live ---');
  const catalogRes = await request(`${BASE_URL}/api/products`);
  assert(catalogRes.status === 200, 'GET /api/products returned HTTP 200 OK');
  assert(catalogRes.json?.products?.length === 244, 'Catalog contains all 244 products');

  const searchRes = await request(`${BASE_URL}/search?q=hoodie`);
  assert(searchRes.status === 200, 'GET /search?q=hoodie returned HTTP 200 OK');

  console.log('\n====================================================');
  console.log(`FINAL RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runMasterVerification().catch(err => {
  console.error('Master verification error:', err);
  process.exit(1);
});
