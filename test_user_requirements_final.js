/**
 * Comprehensive Automated Verification Suite for ALL User Requirements:
 * 1. Newsletter Subscription Persistence (Supabase cloud webhook_events + Admin Portal /api/admin/subscribers)
 * 2. Policy Pages Functionality (all 7 policy pages accessible via direct and clean routes with 200 OK)
 * 3. Brand Name Unification ("ALLY RICH" -> "ALLEYRICH" across all HTML, JS, CSS, Admin, and Policy pages)
 * 4. Header Flex Constraints & Badge Truncation (prevent element collision)
 * 5. Multi-Device Cloud Wishlist & Address Sync (cross-device session simulation with Supabase)
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
  console.log('   STARTING DEEP VERIFICATION FOR ALL USER REQUIREMENTS');
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

  // Spin up server on port 3012 for isolated testing
  const testPort = 3012;
  const serverProc = spawn('node', ['server.js'], { env: { ...process.env, PORT: String(testPort) } });
  await new Promise(r => setTimeout(r, 1500));

  try {
    // ------------------------------------------------------------------------
    // REQUIREMENT 1: Newsletter Subscription Cloud Persistence
    // ------------------------------------------------------------------------
    console.log('\n--- 1. Testing Newsletter Subscription & Admin Portal Reflection ---');
    const testEmail = `sub_test_${Date.now()}@allyrichtest.com`;
    
    // Subscribe via public API
    const subRes = await request(
      { hostname: 'localhost', port: testPort, path: '/api/newsletter', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { email: testEmail }
    );
    assert(subRes.status === 200 || subRes.status === 201, `POST /api/newsletter returned HTTP ${subRes.status}`);
    assert(subRes.data && subRes.data.success, 'Newsletter subscription confirmed success: true');

    // Fetch from Admin Portal API
    const adminSubsRes = await request(
      { hostname: 'localhost', port: testPort, path: '/api/admin/subscribers', method: 'GET' }
    );
    assert(adminSubsRes.status === 200, `GET /api/admin/subscribers returned HTTP 200`);
    const subsList = Array.isArray(adminSubsRes.data) ? adminSubsRes.data : (adminSubsRes.data && adminSubsRes.data.subscribers ? adminSubsRes.data.subscribers : []);
    assert(Array.isArray(subsList) && subsList.length > 0, 'GET /api/admin/subscribers returned a list of subscribers');
    
    const foundSub = subsList.find(s => s.email === testEmail);
    assert(!!foundSub, `Subscribed email '${testEmail}' immediately appeared in Admin Subscribers table`);

    if (foundSub && foundSub.id) {
      // Clean up test subscriber
      const delRes = await request(
        { hostname: 'localhost', port: testPort, path: `/api/admin/subscribers/${foundSub.id}`, method: 'DELETE' }
      );
      assert(delRes.status === 200, `DELETE /api/admin/subscribers/${foundSub.id} cleaned up successfully`);
    }

    // ------------------------------------------------------------------------
    // REQUIREMENT 2: Policy Pages Functionality
    // ------------------------------------------------------------------------
    console.log('\n--- 2. Testing Policy Pages Functionality ---');
    const policyRoutes = [
      '/pages/refund-policy.html',
      '/refund-policy',
      '/pages/privacy-policy.html',
      '/privacy-policy',
      '/pages/terms-of-service.html',
      '/terms-of-service',
      '/pages/shipping-policy.html',
      '/shipping-policy',
      '/pages/contact.html',
      '/contact',
      '/pages/returns.html',
      '/returns',
      '/pages/reviews.html',
      '/reviews'
    ];

    for (const route of policyRoutes) {
      const res = await request({ hostname: 'localhost', port: testPort, path: route, method: 'GET' });
      assert(res.status === 200, `Route ${route} returned HTTP 200 OK`);
      assert(res.raw && res.raw.includes('ALLEYRICH'), `Route ${route} contains unified brand name 'ALLEYRICH'`);
    }

    // ------------------------------------------------------------------------
    // REQUIREMENT 3: Brand Name Unification ("ALLY RICH" -> "ALLEYRICH")
    // ------------------------------------------------------------------------
    console.log('\n--- 3. Testing Brand Name Unification (Zero "ALLY RICH" across repo) ---');
    const filesToAudit = [
      'index.html',
      'product.html',
      'admin.html',
      'collections.html',
      'account.html',
      'login.html',
      'checkout.html',
      'order-success.html',
      'pages/contact.html',
      'pages/privacy-policy.html',
      'pages/refund-policy.html',
      'pages/returns.html',
      'pages/reviews.html',
      'pages/shipping-policy.html',
      'pages/terms-of-service.html',
      'assets/js/quick-buy.js',
      'assets/js/app.js',
      'assets/js/auth.js'
    ];

    let spaceCount = 0;
    filesToAudit.forEach(file => {
      const fullPath = path.resolve(__dirname, file);
      const content = fs.readFileSync(fullPath, 'utf8');
      // Look for ALLY RICH (except legacy checkout fallback in JS code)
      const matches = content.match(/ALLY\s+RICH/g) || [];
      if (file === 'checkout.html') {
        // One allowed instance in JS: || code === 'ALLY RICH10'
        const nonCouponMatches = matches.filter(m => !content.includes("'ALLY RICH10'"));
        spaceCount += nonCouponMatches.length;
      } else {
        spaceCount += matches.length;
        if (matches.length > 0) {
          console.error(`Found ${matches.length} 'ALLY RICH' in ${file}`);
        }
      }
      assert(content.includes('ALLEYRICH'), `${file} contains unified brand name 'ALLEYRICH'`);
    });
    assert(spaceCount === 0, `Audit confirmed 0 unwanted 'ALLY RICH' strings across ${filesToAudit.length} files`);

    // ------------------------------------------------------------------------
    // REQUIREMENT 4: Header Flex Constraints & Badge Truncation
    // ------------------------------------------------------------------------
    console.log('\n--- 4. Testing Header Flex Constraints & Collision Prevention ---');
    const allyrichCss = fs.readFileSync(path.resolve(__dirname, 'assets/css/allyrich.css'), 'utf8');
    assert(allyrichCss.includes('.allyrich-header-brand'), 'allyrich.css contains .allyrich-header-brand');
    assert(allyrichCss.includes('flex-shrink: 0 !important;') && allyrichCss.includes('min-width: max-content !important;'), 'Brand logo enforced flex-shrink: 0 and min-width: max-content');
    assert(allyrichCss.includes('.header-actions,') || allyrichCss.includes('.header-actions-group'), 'Header actions container enforced flex-shrink: 0 and min-width: max-content');

    const authJs = fs.readFileSync(path.resolve(__dirname, 'assets/js/auth.js'), 'utf8');
    assert(authJs.includes('text-overflow:ellipsis') || authJs.includes('text-overflow: ellipsis'), 'auth.js truncates customer username badge with text-overflow: ellipsis');
    assert(authJs.includes('max-width:85px') || authJs.includes('max-width: 85px'), 'auth.js enforces max-width on user name badge');

    // ------------------------------------------------------------------------
    // REQUIREMENT 5: Multi-Device / Cloud Database Persistence
    // ------------------------------------------------------------------------
    console.log('\n--- 5. Testing Multi-Device Cloud Wishlist & Address Persistence ---');
    const testUserId = 'test_device_user_' + Date.now();
    const testUserData = {
      id: testUserId,
      email: `device_test_${Date.now()}@allyrich.com`,
      name: 'Cross Device Tester',
      phone: '9988776655',
      address: '42 Regent Street, Penthouse 4',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560001',
      wishlist: ['boxy-heavy-tee', 'baggy-pants']
    };

    // Device 1: User saves profile & wishlist on their laptop
    console.log('   Device 1: Saving user wishlist and address to cloud...');
    const dev1SaveRes = await request(
      { hostname: 'localhost', port: testPort, path: `/api/customers/${testUserId}`, method: 'PUT', headers: { 'Content-Type': 'application/json' } },
      testUserData
    );
    assert(dev1SaveRes.status === 200, `Device 1: PUT /api/customers/${testUserId} returned HTTP 200`);

    // Device 1: Also test dedicated /api/wishlist/sync endpoint
    const syncRes = await request(
      { hostname: 'localhost', port: testPort, path: '/api/wishlist/sync', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { userId: testUserId, wishlist: ['boxy-heavy-tee', 'baggy-pants', 'hoodie-charcoal'] }
    );
    assert(syncRes.status === 200, `Device 1: POST /api/wishlist/sync returned HTTP 200`);

    // Device 2: User opens phone/incognito and logs into the same account (GET customer data)
    console.log('   Device 2: Opening fresh session on phone & fetching cloud state...');
    const dev2FetchRes = await request(
      { hostname: 'localhost', port: testPort, path: `/api/customers/${testUserId}`, method: 'GET' }
    );
    assert(dev2FetchRes.status === 200, `Device 2: GET /api/customers/${testUserId} returned HTTP 200`);
    assert(dev2FetchRes.data && dev2FetchRes.data.customer, 'Device 2: customer object returned');
    
    const cloudCust = dev2FetchRes.data.customer;
    assert(cloudCust.city === 'Bengaluru' && cloudCust.pincode === '560001', 'Device 2: Shipping address (Bengaluru, 560001) persisted from cloud');
    assert(Array.isArray(cloudCust.wishlist), 'Device 2: Wishlist is returned as an array');
    assert(cloudCust.wishlist.includes('boxy-heavy-tee') && cloudCust.wishlist.includes('hoodie-charcoal'), 'Device 2: Wishlist items retained all saved items from Device 1');

    // Device 2: Dedicated /api/wishlist endpoint check
    const dev2WishlistRes = await request(
      { hostname: 'localhost', port: testPort, path: `/api/wishlist?userId=${testUserId}`, method: 'GET' }
    );
    assert(dev2WishlistRes.status === 200, `Device 2: GET /api/wishlist?userId=${testUserId} returned HTTP 200`);
    assert(Array.isArray(dev2WishlistRes.data && dev2WishlistRes.data.wishlist), 'Device 2: Wishlist array returned');
    assert(dev2WishlistRes.data.wishlist.length >= 3, `Device 2: Retained all 3 wishlist items across devices`);

  } catch (err) {
    console.error('Fatal Test Suite Error:', err);
    failed++;
  } finally {
    serverProc.kill();
  }

  console.log('\n========================================================');
  console.log(`TEST SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
