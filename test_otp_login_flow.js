const fs = require('fs');
const assert = require('assert');
const http = require('http');
const appHandler = require('./server.js');

console.log('🧪 Running Comprehensive Verification of 5 Storefront Fixes...\n');

// ========================================================
// 1. FRONTEND CHECKS: No OTP Leaks & Header Collision Fix
// ========================================================
console.log('--- 1. Checking Frontend Files For Security & Layout Fixes ---');

const authJs = fs.readFileSync('assets/js/auth.js', 'utf8');
assert(!authJs.includes('Click to Auto-Fill & Sign In'), 'auth.js must NOT include auto-fill button that leaked OTP code');
assert(!authJs.includes('AUTO-FILL 123456'), 'auth.js must NOT leak master bypass code in modal UI');
assert(authJs.includes('handleUrlAuthCallback'), 'auth.js must include handleUrlAuthCallback for Supabase magic link');
assert(authJs.includes('accessToken'), 'auth.js must parse accessToken from URL callback');
console.log('✅ PASS: auth.js has no OTP leak and correctly handles secure auth callbacks');

const loginHtml = fs.readFileSync('login.html', 'utf8');
assert(!loginHtml.includes('Click to Auto-Fill & Sign In'), 'login.html must NOT include auto-fill button that leaked OTP code');
assert(!loginHtml.includes('AUTO-FILL 123456'), 'login.html must NOT leak master bypass code on login page');
assert(!loginHtml.includes('codeInput.value = res.code'), 'login.html must NOT prefill code from response');
assert(loginHtml.includes('Login Code Dispatched'), 'login.html must display clean customer instructions');
console.log('✅ PASS: login.html completely eliminates OTP code leak and green/yellow boxes');

const collectionsHtml = fs.readFileSync('collections.html', 'utf8');
assert(!collectionsHtml.includes('FREE EXPRESS DOORSTEP DELIVERY IN INDIA'), 'collections.html must NOT have announcement bar');
assert(collectionsHtml.includes('.site-header__nav') && (collectionsHtml.includes('@media (max-width: 1024px)') || collectionsHtml.includes('@media (max-width: 900px)')), 'collections.html must hide center nav on mobile');
assert(!collectionsHtml.includes('style="display:flex; justify-content:center; align-items:center; flex:1;"'), 'collections.html must not override mobile hiding with inline flex style');
assert(collectionsHtml.includes('Your Wishlist Is Empty'), 'collections.html must include dedicated wishlist empty state');
assert(collectionsHtml.includes('search-active-banner'), 'collections.html must include search active banner');
console.log('✅ PASS: collections.html header collision fixed, top announcement removed, and empty states present');

const quickBuyJs = fs.readFileSync('assets/js/quick-buy.js', 'utf8');
assert(quickBuyJs.includes('injectCartDrawer'), 'quick-buy.js must include cart drawer engine');
assert(quickBuyJs.includes('a[href*="/cart"]') || quickBuyJs.includes('a[href="/cart"]'), 'quick-buy.js must intercept cart clicks to open drawer');
assert(quickBuyJs.includes('openCartDrawer'), 'quick-buy.js must provide openCartDrawer method');
assert(quickBuyJs.includes('touchend'), 'quick-buy.js must listen for mobile touch events');
console.log('✅ PASS: quick-buy.js includes foolproof cart drawer interception with touch support');

// ========================================================
// 2. BACKEND API & ROUTING VERIFICATION
// ========================================================
const TEST_PORT = 3789;
const server = http.createServer((req, res) => {
  appHandler(req, res);
});

server.listen(TEST_PORT, async () => {
  try {
    console.log('\n--- 2. Checking Backend Endpoints (/search, /cart, /api/products, auth) ---');

    // Test A: /search route (Fix for Search 404 Bug)
    console.log('Testing GET /search?q=hoodie...');
    const searchRes = await fetch(`http://127.0.0.1:${TEST_PORT}/search?q=hoodie`);
    assert.strictEqual(searchRes.status, 200, 'GET /search?q=hoodie must return 200 OK');
    const searchHtml = await searchRes.text();
    assert(searchHtml.includes('CollectionEngine'), 'GET /search must return collections page');
    console.log('✅ PASS: GET /search returns 200 and loads CollectionEngine');

    // Test B: /cart route redirect (Fix for Cart 404 Bug)
    console.log('Testing GET /cart redirect...');
    const cartRes = await fetch(`http://127.0.0.1:${TEST_PORT}/cart`, { redirect: 'manual' });
    assert.strictEqual(cartRes.status, 302, 'GET /cart must return 302 redirect');
    const redirectLocation = cartRes.headers.get('location');
    assert.strictEqual(redirectLocation, '/collections/shop?openCart=true', 'GET /cart must redirect to /collections/shop?openCart=true');
    console.log(`✅ PASS: GET /cart redirects with 302 to ${redirectLocation}`);

    // Test C: Catalog Products API (> 200 products fallback safety)
    console.log('Testing GET /api/products...');
    const prodRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/products`);
    assert.strictEqual(prodRes.status, 200, 'GET /api/products must return 200 OK');
    const prodData = await prodRes.json();
    const products = Array.isArray(prodData) ? prodData : (prodData.products || []);
    assert(products.length >= 240, `Catalog must have at least 240 products, got ${products.length}`);
    console.log(`✅ PASS: GET /api/products returns ${products.length} products (all catalog items present)`);

    // Test C2: Multi-Word Search Queries (Fix for 0 products search bug)
    console.log('Testing multi-word search: ?q=black+pants...');
    const searchPantsRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/products?q=black+pants`);
    const searchPantsData = await searchPantsRes.json();
    assert(searchPantsData.products.length > 0, 'Multi-word search "black pants" must return matching items');
    console.log(`✅ PASS: Multi-word search "black pants" returned ${searchPantsData.products.length} matching products`);

    console.log('Testing multi-word search: ?q=oversized+hoodie...');
    const searchHoodieRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/products?q=oversized+hoodie`);
    const searchHoodieData = await searchHoodieRes.json();
    assert(searchHoodieData.products.length > 0, 'Multi-word search "oversized hoodie" must return matching items');
    console.log(`✅ PASS: Multi-word search "oversized hoodie" returned ${searchHoodieData.products.length} matching products`);

    // Test D: Send OTP (No Code Leaked to Client)
    const testEmail = `otp_verify_${Date.now()}@example.com`;
    console.log(`\nTesting POST /api/auth/send-otp for ${testEmail}...`);
    const sendRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail })
    });
    assert.strictEqual(sendRes.status, 200, 'send-otp status must be 200');
    const sendData = await sendRes.json();
    assert.strictEqual(sendData.success, true, 'send-otp success must be true');
    assert.strictEqual(sendData.code, undefined, 'send-otp response must NOT contain the OTP code');
    assert.strictEqual(sendData.otp, undefined, 'send-otp response must NOT contain otp field');
    assert.strictEqual(sendData.devBypass, undefined, 'send-otp response must NOT leak devBypass field');
    assert(sendData.message.includes('verification code has been dispatched'), 'send-otp must return clean customer message');
    console.log('✅ PASS: send-otp dispatched securely with zero OTP leak in response payload');

    // Test E: Verify OTP with invalid code -> should fail with 400
    console.log('Testing POST /api/auth/verify-otp with invalid code...');
    const badRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, code: '999999' })
    });
    assert.strictEqual(badRes.status, 400, 'verify-otp with bad code must return 400');
    console.log('✅ PASS: verify-otp correctly rejected invalid OTP');

    // Test F: Backdoor '123456' must be rejected with 400
    console.log('Testing POST /api/auth/verify-otp with removed backdoor 123456...');
    const backdoorRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, code: '123456' })
    });
    assert.strictEqual(backdoorRes.status, 400, 'verify-otp with backdoor 123456 must return 400');
    console.log('✅ PASS: verify-otp correctly rejected removed 123456 backdoor');

    // Test G: Verify genuine OTP from Supabase PostgreSQL persistence
    console.log('Testing POST /api/auth/verify-otp with real generated OTP...');
    const supabaseAdapter = require('./lib/supabase');
    const cloudRecord = await supabaseAdapter.otp.get(testEmail);
    assert(cloudRecord && cloudRecord.code, 'Cloud OTP record must exist in Supabase');

    const okRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, code: cloudRecord.code })
    });
    assert.strictEqual(okRes.status, 200, 'verify-otp with genuine OTP must return 200');
    const okData = await okRes.json();
    assert.strictEqual(okData.success, true, 'verify-otp success must be true');
    assert.ok(okData.token, 'verify-otp must issue token');
    assert.ok(okData.user, 'verify-otp must return user');
    assert.strictEqual(okData.user.email, testEmail, 'verify-otp returned correct user email');
    console.log('✅ PASS: verify-otp succeeded with genuine OTP and issued token & user profile');

    console.log('\n======================================================');
    console.log('🎉 ALL 5 STOREFRONT DEFECT FIXES VERIFIED SUCCESSFULLY!');
    console.log('======================================================');
    server.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ FAIL:', err);
    server.close();
    process.exit(1);
  }
});
