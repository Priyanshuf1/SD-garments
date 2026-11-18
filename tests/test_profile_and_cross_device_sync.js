/**
 * Comprehensive Automated Verification Suite for:
 * 1. Customer Profile Save (PUT /api/auth/profile)
 * 2. Cross-Device Wishlist & Cart Database Persistence & Login Hydration
 * 3. Mobile Header Layout & Cart/Wishlist Clipping Fixes
 * 4. Admin Portal Route Resolution (/admin, /admin/login, /admin-panel)
 */

const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const security = require('../lib/security');
const db = require('../lib/db');

let serverProcess = null;
const TEST_PORT = 3899;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

function makeRequest(method, urlPath, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    const req = http.request(url, {
      method,
      headers: {
        'Host': `127.0.0.1:${TEST_PORT}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...headers
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
        resolve({ statusCode: res.statusCode, headers: res.headers, body: data, json });
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('🚀 STARTING COMPREHENSIVE VERIFICATION SUITE');
  console.log('====================================================\n');

  // Set environment for test server
  process.env.PORT = String(TEST_PORT);
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_JSON_FALLBACK = 'true';

  // Start test instance of server
  console.log('1. Starting test server on port', TEST_PORT);
  const app = require('../server.js');
  const server = app.server || http.createServer(app);
  await new Promise((resolve) => server.listen(TEST_PORT, '127.0.0.1', resolve));

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    return fn()
      .then(() => {
        console.log(`  ✓ PASS: ${name}`);
        passed++;
      })
      .catch(err => {
        console.error(`  ✕ FAIL: ${name}`);
        console.error(`    ${err.message}`);
      });
  }

  // TEST 1: Admin Portal Routes
  console.log('\n--- SUITE A: Admin Portal Route Verification ---');
  await test('GET /admin returns 200 OK and serves admin.html', async () => {
    const res = await makeRequest('GET', '/admin');
    assert.strictEqual(res.statusCode, 200);
    assert(res.body.includes('ALLEYRICH // Official Brand Command') || res.body.includes('ADMIN'));
  });

  await test('GET /admin/login returns 200 OK (no 404)', async () => {
    const res = await makeRequest('GET', '/admin/login');
    assert.strictEqual(res.statusCode, 200);
    assert(res.body.includes('ALLEYRICH // Official Brand Command') || res.body.includes('ADMIN'));
  });

  await test('GET /admin-panel returns 200 OK (no 404)', async () => {
    const res = await makeRequest('GET', '/admin-panel');
    assert.strictEqual(res.statusCode, 200);
  });

  await test('GET /allyrich-hq returns 200 OK', async () => {
    const res = await makeRequest('GET', '/allyrich-hq');
    assert.strictEqual(res.statusCode, 200);
  });

  // TEST 2: Session Creation & Validation with Email
  console.log('\n--- SUITE B: Session Persistence & Multi-Worker State ---');
  const testEmail = `test_user_${Date.now()}@allyrich.com`;
  const testUserId = `CUST-${Date.now()}`;
  let testToken = null;

  await test('createCustomerSessionAsync generates valid token and persists email', async () => {
    const sess = await security.createCustomerSessionAsync(testUserId, testEmail);
    assert(sess.token && sess.token.startsWith('ar_usr_'));
    assert.strictEqual(sess.email, testEmail);
    testToken = sess.token;

    const validated = await security.validateCustomerSessionAsync(testToken);
    assert(validated !== null, 'Session should validate successfully');
    assert.strictEqual(validated.userId, testUserId);
    assert.strictEqual(validated.email, testEmail);
  });

  // TEST 3: Profile Save (PUT /api/auth/profile)
  console.log('\n--- SUITE C: Profile Save on /account ---');
  await test('PUT /api/auth/profile updates customer profile with full Pan-India address', async () => {
    const payload = {
      name: 'Priyanshu Awasthi',
      phone: '+919795796566',
      address: '513/ga gayatri puram raebareli',
      locality: 'jfdn mnl',
      city: 'raebareli',
      state: 'uttar pradesh',
      pincode: '229001',
      country: 'India'
    };

    const res = await makeRequest('PUT', '/api/auth/profile', {
      'Authorization': `Bearer ${testToken}`
    }, payload);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.success, true);
    assert(res.json.user, 'Response should contain updated user');
    assert.strictEqual(res.json.user.name, 'Priyanshu Awasthi');
    assert.strictEqual(res.json.user.phone, '+919795796566');
    assert.strictEqual(res.json.user.city, 'raebareli');
    assert.strictEqual(res.json.user.pincode, '229001');
    assert.strictEqual(res.json.message, 'Profile updated successfully');
  });

  await test('GET /api/auth/me returns saved profile details across requests', async () => {
    const res = await makeRequest('GET', '/api/auth/me', {
      'Authorization': `Bearer ${testToken}`
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.success, true);
    assert.strictEqual(res.json.user.name, 'Priyanshu Awasthi');
    assert.strictEqual(res.json.user.address, '513/ga gayatri puram raebareli');
    assert.strictEqual(res.json.user.city, 'raebareli');
  });

  // TEST 4: Cross-Device Cart & Wishlist Synchronization
  console.log('\n--- SUITE D: Cross-Device Cart & Wishlist Sync ---');
  await test('Device 1: syncs cart and wishlist to server', async () => {
    // 1. Sync wishlist
    const wishRes = await makeRequest('POST', '/api/wishlist/sync', {
      'Authorization': `Bearer ${testToken}`
    }, { wishlist: ['boys-classic-oxford-shirt', 'boys-executive-tuxedo'] });

    assert.strictEqual(wishRes.statusCode, 200);
    assert.strictEqual(wishRes.json.success, true);
    assert.strictEqual(wishRes.json.count, 2);

    // 2. Sync cart
    const cartRes = await makeRequest('POST', '/api/cart/sync', {
      'Authorization': `Bearer ${testToken}`
    }, {
      cart: [{
        id: 'prod_1',
        handle: 'boys-classic-oxford-shirt',
        title: 'Boys Classic Oxford Shirt',
        size: 'M',
        price: 1199,
        quantity: 2
      }]
    });

    assert.strictEqual(cartRes.statusCode, 200);
    assert.strictEqual(cartRes.json.success, true);
    assert.strictEqual(cartRes.json.count, 1);
  });

  await test('Device 2: logs in via OTP and receives hydrated wishlist and cart', async () => {
    // Generate OTP for testEmail
    const otpRes = await makeRequest('POST', '/api/auth/send-otp', {}, { email: testEmail });
    assert.strictEqual(otpRes.statusCode, 200);
    const otpCode = otpRes.json.devCode;
    assert(otpCode, 'Dev OTP should be returned in test mode');

    // Verify OTP on new device
    const verifyRes = await makeRequest('POST', '/api/auth/verify-otp', {}, {
      email: testEmail,
      token: otpCode
    });

    assert.strictEqual(verifyRes.statusCode, 200);
    assert.strictEqual(verifyRes.json.success, true);
    const authedUser = verifyRes.json.user;
    assert(authedUser, 'Should return user object');
    assert.strictEqual(authedUser.name, 'Priyanshu Awasthi');

    // VERIFY WISHLIST WAS HYDRATED ON DEVICE 2
    assert(Array.isArray(authedUser.wishlist), 'Wishlist must be an array');
    assert(authedUser.wishlist.includes('boys-classic-oxford-shirt'), 'Wishlist must contain Device 1 items');
    assert(authedUser.wishlist.includes('boys-executive-tuxedo'), 'Wishlist must contain Device 1 items');

    // VERIFY CART WAS HYDRATED ON DEVICE 2
    assert(Array.isArray(authedUser.cart), 'Cart must be an array');
    assert.strictEqual(authedUser.cart.length, 1, 'Cart should contain Device 1 cart item');
    assert.strictEqual(authedUser.cart[0].handle, 'boys-classic-oxford-shirt');
    assert.strictEqual(authedUser.cart[0].quantity, 2);

    // Device 2 GET /api/wishlist/sync
    const d2Wish = await makeRequest('GET', '/api/wishlist/sync', {
      'Authorization': `Bearer ${verifyRes.json.token}`
    });
    assert.strictEqual(d2Wish.statusCode, 200);
    assert.strictEqual(d2Wish.json.count, 2);

    // Device 2 GET /api/cart/sync
    const d2Cart = await makeRequest('GET', '/api/cart/sync', {
      'Authorization': `Bearer ${verifyRes.json.token}`
    });
    assert.strictEqual(d2Cart.statusCode, 200);
    assert.strictEqual(d2Cart.json.count, 1);
  });

  // TEST 5: Mobile Header CSS & Overflow
  console.log('\n--- SUITE E: Mobile Header Layout & CSS Verification ---');
  await test('collections.html has mobile header styles with account name hidden and unclipped cart', async () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'collections.html'), 'utf8');
    assert(html.includes('.site-header') && html.includes('background: #000000 !important;'), 'Header must be pure black #000000');
    assert(html.includes('.header-account-name') || html.includes('header-account-link .sm-max\\:hidden'), 'Should hide account name on mobile');
    assert(html.includes('.cart-trigger') && html.includes('flex-shrink: 0'), 'Cart trigger must have flex-shrink: 0');
  });

  console.log('\n====================================================');
  console.log(`RESULTS: ${passed}/${total} TESTS PASSED (${Math.round(passed/total*100)}%)`);
  console.log('====================================================\n');

  if (passed === total) {
    console.log('✓ ALL TESTS PASSED SUCCESSFULLY!\n');
    process.exit(0);
  } else {
    console.error(`✕ ${total - passed} TESTS FAILED\n`);
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test Suite Error:', err);
  process.exit(1);
});
