/**
 * Automated Verification Suite for all 7 Critical Fixes in ALLYRICH Storefront
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

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
  console.log('🚀 ========================================================');
  console.log('   RUNNING DEEP VERIFICATION FOR ALL 7 CRITICAL FIXES');
  console.log('========================================================\n');

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

  const testPort = 3014;
  const serverProc = spawn('node', ['server.js'], { env: { ...process.env, PORT: String(testPort) } });
  await new Promise(r => setTimeout(r, 1500));

  try {
    // ------------------------------------------------------------------------
    // FIX 1: Wishlist Optimistic UI & Fast Response
    // ------------------------------------------------------------------------
    console.log('\n--- 1. Testing Wishlist Optimistic UI & CSS Touch Actions ---');
    const wishlistJs = fs.readFileSync(path.resolve(__dirname, 'assets/js/wishlist.js'), 'utf8');
    assert(wishlistJs.includes('_syncTimer = setTimeout'), 'wishlist.js debounces server sync with timer');
    assert(wishlistJs.includes('400'), 'wishlist.js debounce delay set to 400ms');
    assert(wishlistJs.includes('this.updateButtons(cleanHandle, isAdded)'), 'wishlist.js performs instant optimistic DOM button update');
    assert(wishlistJs.includes('scale(1.25)'), 'wishlist.js applies tactile scale pulse');
    assert(!wishlistJs.includes('this._isUpdating = true'), 'wishlist.js removed restrictive multi-tap lock');
    assert(wishlistJs.includes('touchstart') && wishlistJs.includes('wishlistTouchMoved'), 'wishlist.js implements touchstart and scroll-swipe suppression for mobile');

    const customCss = fs.readFileSync(path.resolve(__dirname, 'assets/css/custom.css'), 'utf8');
    assert(customCss.includes('touch-action: manipulation !important;'), 'custom.css enforces touch-action: manipulation on wishlist buttons');
    assert(customCss.includes('.wishlist-btn:active'), 'custom.css defines active pulse animation for instant feedback');

    // Test /api/wishlist/sync endpoint
    const testUserId = 'test_wishlist_user_' + Date.now();
    const wishSyncRes = await request(
      { hostname: 'localhost', port: testPort, path: '/api/wishlist/sync', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { userId: testUserId, wishlist: ['boxy-tshirt-black', 'baggy-cargo-pants'] }
    );
    assert(wishSyncRes.status === 200 && wishSyncRes.data && wishSyncRes.data.success, 'POST /api/wishlist/sync returns 200 OK with success: true');

    // ------------------------------------------------------------------------
    // FIX 2: Real OTP across Serverless & Backdoor Removal
    // ------------------------------------------------------------------------
    console.log('\n--- 2. Testing OTP Multi-Instance Persistence & 123456 Backdoor Removal ---');
    const serverJs = fs.readFileSync(path.resolve(__dirname, 'server.js'), 'utf8');
    assert(!serverJs.includes("token === '123456'"), 'server.js has completely removed token === 123456 backdoor');
    assert(!serverJs.includes('token === "123456"'), 'server.js has zero remaining 123456 backdoors');

    const otpEmail = `otp_audit_${Date.now()}@allyrichtest.com`;
    // Attempt verify with backdoor 123456 WITHOUT sending OTP first
    const backdoorRes = await request(
      { hostname: 'localhost', port: testPort, path: '/api/auth/verify-otp', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { email: otpEmail, token: '123456' }
    );
    assert(backdoorRes.status === 400, `POST /api/auth/verify-otp with backdoor '123456' was strictly rejected with HTTP ${backdoorRes.status}`);

    // Send real OTP
    const sendOtpRes = await request(
      { hostname: 'localhost', port: testPort, path: '/api/auth/send-otp', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { email: otpEmail }
    );
    assert(sendOtpRes.status === 200 && sendOtpRes.data && sendOtpRes.data.success, 'POST /api/auth/send-otp generated OTP successfully');

    // Check supabase helper has otp methods
    const supabaseJs = fs.readFileSync(path.resolve(__dirname, 'lib/supabase.js'), 'utf8');
    assert(supabaseJs.includes('otp = {') && supabaseJs.includes('OTP_'), 'lib/supabase.js defines otp persistence targeting webhook_events OTP_${email}');

    // ------------------------------------------------------------------------
    // FIX 3: Address & Cart Persistence Across Devices
    // ------------------------------------------------------------------------
    console.log('\n--- 3. Testing Address & Cart Sync Across Devices ---');
    const crossUserId = 'cust_cross_' + Date.now();
    const crossEmail = `cross_${Date.now()}@allyrichtest.com`;

    // 1. Save full profile with address
    const profileSaveRes = await request(
      { hostname: 'localhost', port: testPort, path: `/api/customers/${crossUserId}`, method: 'PUT', headers: { 'Content-Type': 'application/json' } },
      {
        id: crossUserId,
        email: crossEmail,
        name: 'Aarav Mehta',
        phone: '9876543210',
        address: 'Villa 14, Palm Meadows',
        locality: 'Whitefield',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560066',
        country: 'India'
      }
    );
    assert(profileSaveRes.status === 200, 'Saved initial customer address');

    // 2. Perform partial update (wishlist sync) - must NOT wipe address
    const partialWishRes = await request(
      { hostname: 'localhost', port: testPort, path: `/api/customers/${crossUserId}`, method: 'PUT', headers: { 'Content-Type': 'application/json' } },
      { wishlist: ['hoodie-washed-black'] }
    );
    assert(partialWishRes.status === 200, 'Partial wishlist update sent');

    // 3. Fetch profile and verify address is intact
    const verifyProfileRes = await request(
      { hostname: 'localhost', port: testPort, path: `/api/customers/${crossUserId}`, method: 'GET' }
    );
    assert(verifyProfileRes.status === 200, 'GET /api/customers/:id returns 200');
    const custData = verifyProfileRes.data.customer;
    assert(custData.address === 'Villa 14, Palm Meadows' && custData.locality === 'Whitefield', 'Customer address & locality preserved after partial update');
    assert(custData.pincode === '560066' && custData.city === 'Bengaluru', 'Pincode & city preserved');
    assert(Array.isArray(custData.wishlist) && custData.wishlist.includes('hoodie-washed-black'), 'Wishlist updated');

    // 4. Test /api/cart/sync and /api/cart
    const sampleCart = [
      { id: 'item_1', handle: 'boxy-tshirt-black', title: 'Boxy Tee', price: 1299, quantity: 2, size: 'L' }
    ];
    const cartSyncRes = await request(
      { hostname: 'localhost', port: testPort, path: '/api/cart/sync', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { userId: crossUserId, cart: sampleCart }
    );
    assert(cartSyncRes.status === 200 && cartSyncRes.data && cartSyncRes.data.success, 'POST /api/cart/sync succeeded');

    const cartGetRes = await request(
      { hostname: 'localhost', port: testPort, path: `/api/cart?userId=${crossUserId}`, method: 'GET' }
    );
    assert(cartGetRes.status === 200 && Array.isArray(cartGetRes.data.cart) && cartGetRes.data.cart.length === 1, 'GET /api/cart retrieved saved cart');
    assert(cartGetRes.data.cart[0].handle === 'boxy-tshirt-black', 'Cart item matches saved payload');

    // ------------------------------------------------------------------------
    // FIX 4: Duplicate Email Registration Prevention
    // ------------------------------------------------------------------------
    console.log('\n--- 4. Testing Duplicate Email Registration Prevention ---');
    const dupEmail = `dup_test_${Date.now()}@allyrichtest.com`;
    // Register first time
    const signup1 = await request(
      { hostname: 'localhost', port: testPort, path: '/api/auth/signup', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { name: 'Original User', email: dupEmail, password: 'SecurePassword123' }
    );
    assert(signup1.status === 200 || signup1.status === 201, 'First signup succeeded');

    // Register second time with same email
    const signup2 = await request(
      { hostname: 'localhost', port: testPort, path: '/api/auth/signup', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { name: 'Duplicate User', email: dupEmail, password: 'AnotherPassword456' }
    );
    const errMsg = (signup2.data && (signup2.data.error || signup2.data.message)) || '';
    assert(signup2.status === 400, `Second signup with existing email returned HTTP 400 (${errMsg})`);
    assert(errMsg.includes('already exists'), 'Error message warns user account already exists');

    // ------------------------------------------------------------------------
    // FIX 5: Admin Subscriber Broadcast via Resend
    // ------------------------------------------------------------------------
    console.log('\n--- 5. Testing Admin Subscriber Broadcast ---');
    const broadcastRes = await request(
      { hostname: 'localhost', port: testPort, path: '/api/admin/subscribers/broadcast', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { subject: 'VIP Drop: Archival Heavyweights', message: 'The 2026 Archive is live.', headline: 'EXCLUSIVE PREVIEW' }
    );
    assert(broadcastRes.status === 200, `POST /api/admin/subscribers/broadcast returned HTTP 200`);
    assert(broadcastRes.data && (broadcastRes.data.success || broadcastRes.data.sent !== undefined), 'Broadcast response confirms execution');

    const adminHtml = fs.readFileSync(path.resolve(__dirname, 'admin.html'), 'utf8');
    assert(adminHtml.includes('openBroadcastModal()'), 'admin.html contains Broadcast modal trigger');
    assert(adminHtml.includes('sendBroadcastCampaign()'), 'admin.html contains campaign dispatch handler');

    // ------------------------------------------------------------------------
    // FIX 6: Policy Pages Redesign & Assets
    // ------------------------------------------------------------------------
    console.log('\n--- 6. Testing Policy Pages Redesign (7 Pages) ---');
    const policyFiles = [
      'refund-policy.html',
      'privacy-policy.html',
      'terms-of-service.html',
      'shipping-policy.html',
      'contact.html',
      'returns.html',
      'reviews.html'
    ];

    for (const file of policyFiles) {
      const pagePath = path.resolve(__dirname, 'pages', file);
      const content = fs.readFileSync(pagePath, 'utf8');
      assert(content.includes('allyrich.css'), `${file} links to /assets/css/allyrich.css`);
      assert(!content.includes('logo.png?v='), `${file} has no broken shopify cdn logo`);
      assert(content.includes('/assets/ar-logo.png'), `${file} uses official AR logo`);
      assert(content.includes('site-header__inner'), `${file} uses luxury sticky header`);
      assert(content.includes('shopify-section-sections--footer'), `${file} uses ruins footer`);
      assert(content.includes('footer-ruins.webp'), `${file} includes ruins background`);
      assert(content.includes('wishlist.js') && content.includes('auth.js') && content.includes('quick-buy.js'), `${file} includes required engine scripts`);
      assert(content.includes('id="mobile-menu-trigger"'), `${file} includes mobile menu hamburger trigger in header`);
      assert(content.includes('id="mobile-drawer"'), `${file} includes responsive mobile navigation drawer`);

      // Check direct server route
      const cleanRoute = '/' + file.replace('.html', '');
      const routeRes = await request({ hostname: 'localhost', port: testPort, path: cleanRoute, method: 'GET' });
      assert(routeRes.status === 200, `Route ${cleanRoute} returned HTTP 200 OK`);
    }

    // ------------------------------------------------------------------------
    // FIX 7: Snappy Loader & Dead Script Removal
    // ------------------------------------------------------------------------
    console.log('\n--- 7. Testing Snappy Loader & Dead Script Removal ---');
    const loaderJs = fs.readFileSync(path.resolve(__dirname, 'assets/js/allyrich-loader.js'), 'utf8');
    assert(loaderJs.includes('capTimer = setTimeout(finish, 1200)'), 'allyrich-loader.js capTimer set to 1200ms');

    const indexHtml = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf8');
    assert(!indexHtml.includes('atlantis.live.zoko.io'), 'index.html removed dead zoko script');
    assert(!indexHtml.includes('/a/goaffpro/loader.js'), 'index.html removed dead goaffpro script');
    assert(!indexHtml.includes('restock-sdk-loader.js'), 'index.html removed dead restock sdk script');
    assert(!indexHtml.includes('upcart-bundle.js'), 'index.html removed dead upcart script');

  } catch (err) {
    console.error('Fatal Verification Error:', err);
    failed++;
  } finally {
    serverProc.kill();
  }

  console.log('\n========================================================');
  console.log(`FINAL RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
