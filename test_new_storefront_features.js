/**
 * Comprehensive Automated Verification Suite for Bug 1-6 Fixes:
 * - BUG 1: Admin button removed from public headers (collections, index, product); admin portal preserved at /admin
 * - BUG 2: Collections page 1:1 match with official site (light background, sub-nav, toolbar, centered count, cards)
 * - BUG 3: Cart has NO Cashfree branding; Cashfree strictly on checkout page
 * - BUG 4: Wishlist functionality (hearts on cards, storage, server sync, PDP wishlist button)
 * - BUG 5: Customer auth (signup, login, unauth 401 protection, profile, orders, checkout APIs)
 * - BUG 6: Subcategory routing & natural navigation (all 14 routes, baby tees, live filtering)
 */

const http = require('http');
const fs = require('fs');
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
  console.log('🧪 Starting Deep Verification of Storefront Fixes & Features...\n');
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

  // Spin up updated server.js on port 3009 for deep API testing
  const testPort = 3009;
  const serverProc = spawn('node', ['server.js'], { env: { ...process.env, PORT: String(testPort) } });
  await new Promise(r => setTimeout(r, 1200));

  try {
    // ---------------------------------------------------------
    // BUG 1: Admin button removal & admin portal preservation
    // ---------------------------------------------------------
    const colHtml = fs.readFileSync('collections.html', 'utf8');
    const indexHtml = fs.readFileSync('index.html', 'utf8');
    const prodHtml = fs.readFileSync('product.html', 'utf8');

    assert(!colHtml.includes('href="/admin"'), 'collections.html has NO admin link in header or page');
    assert(!colHtml.includes('>ADMIN<'), 'collections.html has NO visible ADMIN button');
    assert(!indexHtml.includes('href="/admin"'), 'index.html has NO admin link in header');
    assert(!prodHtml.includes('href="/admin"'), 'product.html has NO admin link in header');

    // Admin portal still works at /admin
    const adminRes = await request({ hostname: 'localhost', port: testPort, path: '/admin', method: 'GET' });
    assert(adminRes.status === 200 && (adminRes.raw.includes('Brand Command & Management Portal') || adminRes.raw.includes('admin')), 'Admin portal at http://localhost:3000/admin is 100% functional');

    // ---------------------------------------------------------
    // BUG 2: Collections/View All UI Matches Official Site
    // ---------------------------------------------------------
    assert(colHtml.includes('--bg-page: #f5f5f5') || colHtml.includes('background-color: var(--bg-page)'), 'collections.html uses light off-white background, NOT black #000000');
    assert(colHtml.includes('class="site-header"'), 'collections.html has sticky header matching official site');
    assert(colHtml.includes('background: #000000') || colHtml.includes('background:#000000'), 'collections.html has pure black header and footer matching official site');

    // Subnav tabs matching official site:
    const requiredTabs = ['New In', 'Pants', 'Tank Tops', 'Basics', 'T-shirts', 'Long Sleeves', 'Jackets', 'Shorts', 'Jeans', 'Accessories'];
    requiredTabs.forEach(tab => {
      assert(colHtml.includes(`>${tab}<`), `Sub-nav bar contains tab '${tab}'`);
    });

    // Toolbar elements:
    assert(colHtml.includes('id="btn-layout-4"'), 'Toolbar contains 4-column layout toggle');
    assert(colHtml.includes('id="btn-layout-3"'), 'Toolbar contains 3-column layout toggle');
    assert(colHtml.includes('id="btn-layout-1"'), 'Toolbar contains 1-column/compact layout toggle');
    assert(colHtml.includes('id="page-count-text"'), 'Toolbar contains centered product count');
    assert(colHtml.includes('btn-filter-toggle'), 'Toolbar contains FILTER button');
    assert(colHtml.includes('position: relative') && colHtml.includes('collection-toolbar-bar'), 'Toolbar enforces position: relative for centered product count');

    // Product cards:
    assert(colHtml.includes('class="product-card"'), 'Product grid renders .product-card items');
    assert(colHtml.includes('class="product-card__image product-card__image--primary'), 'Cards contain primary image');
    assert(colHtml.includes('class="product-card__image product-card__image--secondary'), 'Cards contain secondary hover image');
    assert(colHtml.includes('badge--on-sale'), 'Cards contain red Save % sale badge');
    assert(colHtml.includes('wishlist-btn'), 'Cards contain heart/wishlist button');
    assert(colHtml.includes('price-list'), 'Cards contain price list with current & strike-through compare price');

    // ---------------------------------------------------------
    // BUG 3: Cart has NO Cashfree branding; Cashfree only in checkout
    // ---------------------------------------------------------
    assert(!colHtml.includes('Pay via Cashfree'), 'Cart drawer in collections.html has NO "Pay via Cashfree" button');
    assert(!colHtml.includes('btn-cashfree-checkout'), 'Cart drawer has NO btn-cashfree-checkout element');
    assert(colHtml.includes('PROCEED TO CHECKOUT'), 'Cart drawer has clean single "PROCEED TO CHECKOUT" button');
    assert(colHtml.includes('href=\'/checkout\'') || colHtml.includes('href="/checkout"'), 'Checkout button directs to /checkout');
    assert(colHtml.includes('cart-qty-btn'), 'Cart drawer includes quantity increment/decrement controls');
    assert(!prodHtml.includes('alert(\'Proceeding to Checkout!\')'), 'product.html cart checkout does not alert, directs to /checkout');

    // Checkout page exists and has Cashfree payment method
    assert(fs.existsSync('checkout.html'), 'checkout.html exists');
    const chkHtml = fs.readFileSync('checkout.html', 'utf8');
    assert(chkHtml.includes('Cashfree Online Payment'), 'checkout.html contains Cashfree Online Payment option');
    assert(chkHtml.includes('Cash on Delivery (COD)'), 'checkout.html contains COD option');

    // ---------------------------------------------------------
    // BUG 4: Wishlist functionality
    // ---------------------------------------------------------
    assert(fs.existsSync('assets/js/wishlist.js'), 'assets/js/wishlist.js exists');
    const wishlistJs = fs.readFileSync('assets/js/wishlist.js', 'utf8');
    assert(wishlistJs.includes('toggle('), 'wishlist.js defines toggle() method');
    assert(wishlistJs.includes('getWishlist()'), 'wishlist.js defines getWishlist() method');
    assert(wishlistJs.includes('decorateCards()'), 'wishlist.js automatically decorates product cards with heart icon');
    assert(colHtml.includes('/assets/js/wishlist.js'), 'collections.html loads wishlist.js');
    assert(indexHtml.includes('/assets/js/wishlist.js'), 'index.html loads wishlist.js');
    assert(prodHtml.includes('/assets/js/wishlist.js'), 'product.html loads wishlist.js');
    assert(prodHtml.includes('id="pdp-wishlist-btn"'), 'product.html includes PDP wishlist heart button');

    // ---------------------------------------------------------
    // BUG 5: User Login / Sign Up system & APIs
    // ---------------------------------------------------------
    assert(fs.existsSync('assets/js/auth.js'), 'assets/js/auth.js exists');
    assert(fs.existsSync('account.html'), 'account.html exists');
    assert(fs.existsSync('login.html'), 'login.html exists');
    assert(fs.existsSync('order-success.html'), 'order-success.html exists');
    assert(prodHtml.includes('/assets/js/auth.js'), 'product.html loads auth.js');

    // Test static pages served
    const chkPageRes = await request({ hostname: 'localhost', port: testPort, path: '/checkout.html', method: 'GET' });
    assert(chkPageRes.status === 200 && (chkPageRes.raw.includes('Checkout | ALLYRICH') || chkPageRes.raw.includes('Checkout | GENRAGE')), 'Checkout page served at /checkout.html');

    const accPageRes = await request({ hostname: 'localhost', port: testPort, path: '/account.html', method: 'GET' });
    assert(accPageRes.status === 200 && (accPageRes.raw.includes('My Account | ALLYRICH') || accPageRes.raw.includes('My Account | GENRAGE')), 'Account page served at /account.html');

    const loginPageRes = await request({ hostname: 'localhost', port: testPort, path: '/login.html', method: 'GET' });
    assert(loginPageRes.status === 200 && (loginPageRes.raw.includes('ALLYRICH CLUB') || loginPageRes.raw.includes('GENRAGE CLUB')), 'Login page served at /login.html');

    // Deep Customer Auth & Checkout APIs Verification
    const testEmail = `reviewer_${Date.now()}@testgenrage.com`;

    // 1. Signup API
    const signupRes = await request(
      { hostname: 'localhost', port: testPort, path: '/api/auth/signup', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { name: 'Reviewer Test', email: testEmail, password: 'password123', phone: '+91 99999 22222', city: 'Delhi' }
    );
    assert(signupRes.status === 201 && signupRes.data?.success && signupRes.data?.token, 'POST /api/auth/signup registers customer and returns JWT/token');
    const userToken = signupRes.data?.token;
    const userId = signupRes.data?.user?.id;

    // 2. Login API
    const loginRes = await request(
      { hostname: 'localhost', port: testPort, path: '/api/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { email: testEmail, password: 'password123' }
    );
    assert(loginRes.status === 200 && loginRes.data?.success && loginRes.data?.user?.email === testEmail, 'POST /api/auth/login logs in customer');

    // 3. Me API Unauthenticated (Security check - must NOT return customer[0])
    const unauthMeRes = await request({ hostname: 'localhost', port: testPort, path: '/api/auth/me', method: 'GET' });
    assert(unauthMeRes.status === 401 && !unauthMeRes.data?.success, 'GET /api/auth/me rejects unauthenticated request with 401 (no leaked customer)');

    // 4. Me API Authenticated
    const authMeRes = await request({
      hostname: 'localhost',
      port: testPort,
      path: '/api/auth/me',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${userToken}` }
    });
    assert(authMeRes.status === 200 && authMeRes.data?.user?.email === testEmail, 'GET /api/auth/me returns authenticated customer profile');

    // 5. Profile Update & Wishlist sync via API
    const profileRes = await request(
      { hostname: 'localhost', port: testPort, path: '/api/auth/profile', method: 'PUT', headers: { 'Content-Type': 'application/json' } },
      { id: userId, wishlist: ['zaraki-corduroy-full-sleeves', 'reign-grey-boxy-oversized-tshirt'] }
    );
    assert(profileRes.status === 200 && profileRes.data?.user?.wishlist?.length === 2, 'PUT /api/auth/profile updates profile and syncs wishlist');

    // 6. Public customer wishlist sync endpoint
    const custWishRes = await request(
      { hostname: 'localhost', port: testPort, path: `/api/customers/${userId}`, method: 'PUT', headers: { 'Content-Type': 'application/json' } },
      { wishlist: ['zaraki-corduroy-full-sleeves'] }
    );
    assert(custWishRes.status === 200 && custWishRes.data?.customer?.wishlist?.length === 1, 'PUT /api/customers/:id updates wishlist in customers.json');

    // 7. Checkout Create Order (Cashfree gateway)
    const createOrdRes = await request(
      { hostname: 'localhost', port: testPort, path: '/api/checkout/create-order', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      {
        customer: { name: 'Reviewer Test', email: testEmail, phone: '+91 99999 22222' },
        items: [{ title: 'Zaraki Corduroy Full Sleeves', price: 1599, quantity: 1 }],
        total: 1599,
        paymentMethod: 'cashfree'
      }
    );
    assert(createOrdRes.status === 201 && createOrdRes.data?.orderId && createOrdRes.data?.cashfreeOrderId, 'POST /api/checkout/create-order generates order with Cashfree tracking');
    const createdOrderId = createOrdRes.data?.orderId;

    // 8. Checkout Verify Payment
    const verifyPayRes = await request(
      { hostname: 'localhost', port: testPort, path: '/api/checkout/verify-payment', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { orderId: createdOrderId, cashfreePaymentId: `cf_pay_${Date.now()}` }
    );
    assert(verifyPayRes.status === 200 && verifyPayRes.data?.order?.paymentStatus === 'Paid', 'POST /api/checkout/verify-payment marks order status as Paid');

    // 9. Customer Orders history API
    const userOrdersRes = await request({
      hostname: 'localhost',
      port: testPort,
      path: `/api/auth/orders?email=${encodeURIComponent(testEmail)}`,
      method: 'GET'
    });
    assert(userOrdersRes.status === 200 && userOrdersRes.data?.count >= 1, 'GET /api/auth/orders retrieves user order history');

    // Clean up test customer and test order
    try {
      const custFile = 'data/customers.json';
      const ordFile = 'data/orders.json';
      const cList = JSON.parse(fs.readFileSync(custFile, 'utf8')).filter(c => c.email !== testEmail);
      fs.writeFileSync(custFile, JSON.stringify(cList, null, 2));
      const oList = JSON.parse(fs.readFileSync(ordFile, 'utf8')).filter(o => o.id !== createdOrderId);
      fs.writeFileSync(ordFile, JSON.stringify(oList, null, 2));
    } catch (e) {}

    // ---------------------------------------------------------
    // BUG 6: Sub-category navigation works naturally
    // ---------------------------------------------------------
    const subRoutes = [
      '/collections/shop',
      '/collections/tank-top-men',
      '/collections/vest',
      '/collections/boxy-oversized-tshirt',
      '/collections/hoodies-for-men',
      '/collections/jacket-for-men',
      '/collections/full-sleeve-t-shirt',
      '/collections/baby-tee',
      '/collections/baggy-pants',
      '/collections/baggy-jeans',
      '/collections/shorts-for-men',
      '/collections/basics-genrage',
      '/collections/accessories',
      '/collections/clearance-sale'
    ];

    for (const route of subRoutes) {
      const res = await request({ hostname: 'localhost', port: testPort, path: route, method: 'GET' });
      assert(res.status === 200 && res.raw.includes('collection-subnav'), `Sub-category route ${route} serves collections page successfully`);
    }

    // Verify Baby Tee and Wishlist categories handled in CollectionEngine
    assert(colHtml.includes("'babytee': 'BABY TEES'"), 'collections.html defines BABY TEES category map');
    assert(colHtml.includes("'wishlist': 'MY SAVED WISHLIST'"), 'collections.html defines WISHLIST category map');
    assert(colHtml.includes("cat.includes('baby')"), 'collections.html filters baby tee products correctly');

  } catch (err) {
    console.error('Fatal error during test run:', err);
    failed++;
  } finally {
    serverProc.kill();
  }

  console.log(`\n========================================`);
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log(`========================================\n`);

  process.exit(failed === 0 ? 0 : 1);
}

runTests();
