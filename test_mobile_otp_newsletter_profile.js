const assert = require('assert');
const { spawn } = require('child_process');

async function testBackendEndpoints() {
  console.log('\n--- 1. Testing OTP Generation & Verification Backend ---');

  // Test 1: Send OTP
  const testEmail = `testuser_${Date.now()}@example.com`;
  const sendRes = await fetch('http://localhost:3000/api/auth/send-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail })
  });
  assert.strictEqual(sendRes.status, 200, 'Send OTP status should be 200');
  const sendData = await sendRes.json();
  assert.strictEqual(sendData.success, true, 'Send OTP should return success: true');
  assert.ok(sendData.code, 'Send OTP should return the 6-digit code for testing/display');
  assert.match(sendData.code, /^\d{6}$/, 'Code must be exactly 6 numeric digits');
  console.log(`✓ POST /api/auth/send-otp returned 6-digit OTP: ${sendData.code}`);

  // Test 2: Verify OTP with invalid code
  const badRes = await fetch('http://localhost:3000/api/auth/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, code: '000000' })
  });
  assert.strictEqual(badRes.status, 400, 'Invalid OTP should return 400');
  const badData = await badRes.json();
  assert.strictEqual(badData.success, false);
  console.log('✓ POST /api/auth/verify-otp correctly rejected invalid OTP');

  // Test 3: Verify OTP with valid code
  const verifyRes = await fetch('http://localhost:3000/api/auth/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, code: sendData.code })
  });
  assert.strictEqual(verifyRes.status, 200, 'Valid OTP verify status should be 200');
  const verifyData = await verifyRes.json();
  assert.strictEqual(verifyData.success, true);
  assert.ok(verifyData.token, 'Verify OTP should return a JWT auth token');
  assert.ok(verifyData.user, 'Verify OTP should return user profile');
  console.log('✓ POST /api/auth/verify-otp passed with valid code and issued token');

  // Test 4: Update Profile with Complete Delivery Address
  console.log('\n--- 2. Testing Customer Profile & Default Address Save ---');
  const authToken = verifyData.token;
  const profilePayload = {
    name: 'Kabir Oberoi',
    phone: '+91 98201 99999',
    address: 'Penthouse 1401, Crescent Bay, Parel',
    locality: 'Near ITC Grand Central',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400012',
    country: 'India'
  };

  const profRes = await fetch('http://localhost:3000/api/auth/profile', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify(profilePayload)
  });
  assert.strictEqual(profRes.status, 200, 'Profile update status should be 200');
  const profData = await profRes.json();
  assert.strictEqual(profData.success, true);
  assert.strictEqual(profData.user.name, 'Kabir Oberoi');
  assert.strictEqual(profData.user.locality, 'Near ITC Grand Central');
  assert.strictEqual(profData.user.city, 'Mumbai');
  assert.strictEqual(profData.user.pincode, '400012');
  console.log('✓ PUT /api/auth/profile saved full shipping address fields');

  // Verify /api/auth/me returns the updated profile
  const meRes = await fetch('http://localhost:3000/api/auth/me', {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  assert.strictEqual(meRes.status, 200);
  const meData = await meRes.json();
  assert.strictEqual(meData.user.address, 'Penthouse 1401, Crescent Bay, Parel');
  assert.strictEqual(meData.user.locality, 'Near ITC Grand Central');
  console.log('✓ GET /api/auth/me retrieved newly persisted shipping address');

  // Test 5: Newsletter Subscription & Admin Verification
  console.log('\n--- 3. Testing Footer Newsletter Subscription & Admin API ---');
  const subEmail = `innercircle_${Date.now()}@allyrich.com`;
  const subRes = await fetch('http://localhost:3000/api/newsletter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: subEmail })
  });
  assert.ok(subRes.status === 200 || subRes.status === 201, 'Newsletter subscribe status should be 200 or 201');
  const subData = await subRes.json();
  assert.strictEqual(subData.success, true);
  console.log('✓ POST /api/newsletter successfully subscribed email');

  // Verify duplicate prevention
  const dupRes = await fetch('http://localhost:3000/api/newsletter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: subEmail })
  });
  assert.strictEqual(dupRes.status, 200);
  const dupData = await dupRes.json();
  assert.strictEqual(dupData.success, true);
  assert.ok(dupData.alreadySubscribed, 'Duplicate subscriber should be noted');
  console.log('✓ POST /api/newsletter handles duplicate email gracefully');

  // Verify subscriber appears in /api/admin/subscribers
  const adminSubRes = await fetch('http://localhost:3000/api/admin/subscribers');
  assert.strictEqual(adminSubRes.status, 200);
  const adminSubData = await adminSubRes.json();
  assert.ok(Array.isArray(adminSubData.subscribers), 'Admin subscribers must be array');
  const found = adminSubData.subscribers.find(s => s.email === subEmail);
  assert.ok(found, 'Subscribed email must appear in admin subscribers list');
  console.log(`✓ GET /api/admin/subscribers confirmed subscriber: ${found.email}`);
}

async function testHeadlessMobileUi() {
  console.log('\n--- 4. Testing Mobile Viewport & Quick-Buy Bottom Sheet via Chrome Headless ---');

  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9229',
    '--user-data-dir=C:\\Users\\apriy\\.gemini\\antigravity\\scratch\\chrome_diag_test',
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=390,844',
    'about:blank'
  ]);

  try {
    await new Promise(r => setTimeout(r, 2000));
    const targets = await (await fetch('http://127.0.0.1:9229/json')).json();
    const page = targets.find(t => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);
    let id = 1;
    const send = (method, params = {}) => new Promise(res => {
      const mid = id++;
      const h = (e) => {
        const d = JSON.parse(e.data);
        if (d.id === mid) { ws.removeEventListener('message', h); res(d.result); }
      };
      ws.addEventListener('message', h);
      ws.send(JSON.stringify({ id: mid, method, params }));
    });

    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });

    // Sub-test A: PDP Mobile Layout
    console.log('Testing PDP mobile layout at 390px viewport width...');
    await send('Page.navigate', { url: 'http://localhost:3000/products/basic-black-genrage-baggy-pants' });
    await new Promise(r => setTimeout(r, 4500));

    const pdpMetrics = await send('Runtime.evaluate', {
      expression: `
        (function() {
          const addBtn = document.getElementById('pdp-add-cart-btn');
          const buyBtn = document.getElementById('pdp-buy-now-btn');
          const wishBtn = document.getElementById('pdp-wishlist-btn');

          return {
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            addBtn: addBtn ? {
              text: addBtn.innerText,
              width: addBtn.offsetWidth,
              visible: addBtn.offsetWidth > 50
            } : null,
            buyBtn: buyBtn ? {
              text: buyBtn.innerText,
              width: buyBtn.offsetWidth,
              visible: buyBtn.offsetWidth > 100
            } : null,
            wishBtn: wishBtn ? {
              width: wishBtn.offsetWidth,
              visible: wishBtn.offsetWidth > 30
            } : null
          };
        })()
      `,
      returnByValue: true
    });

    const m = pdpMetrics.result.value;
    assert.strictEqual(m.scrollWidth, 390, `PDP scrollWidth must be exactly 390px, got ${m.scrollWidth}px`);
    assert.ok(m.addBtn && m.addBtn.visible, 'PDP Add to Cart button must be visible');
    assert.ok(m.buyBtn && m.buyBtn.visible, 'PDP 1-Click Buy Now button must be visible');
    assert.ok(m.wishBtn && m.wishBtn.visible, 'PDP Wishlist button must be visible');
    console.log('✓ PDP mobile viewport is exactly 390px with zero blowout, all CTAs visible');

    // Sub-test B: Homepage Quick-Add Button & Bottom Sheet
    console.log('Testing Homepage Quick-Buy (+) button and bottom sheet drawer...');
    await send('Page.navigate', { url: 'http://localhost:3000/' });
    await new Promise(r => setTimeout(r, 4500));

    const quickBuyTest = await send('Runtime.evaluate', {
      expression: `
        (async function() {
          const plusBtn = document.querySelector('.product-card__quick-add-button');
          if (!plusBtn) return { error: 'No quick add button found' };

          // Click the '+' button
          plusBtn.click();
          await new Promise(r => setTimeout(r, 500));

          const drawer = document.getElementById('quick-buy-drawer');
          const title = drawer ? drawer.querySelector('.qb-title')?.innerText : null;
          const price = drawer ? drawer.querySelector('.qb-price-current')?.innerText : null;
          const sizePills = drawer ? Array.from(drawer.querySelectorAll('.qb-size-pill')).map(b => b.innerText) : [];
          const addBtn = drawer ? drawer.querySelector('#qb-btn-add') : null;
          const buyNowBtn = drawer ? drawer.querySelector('#qb-btn-buy-now') : null;

          // Click Add to Bag
          if (addBtn) addBtn.click();
          await new Promise(r => setTimeout(r, 300));

          const cartRaw = localStorage.getItem('genrage_cart');
          const cart = cartRaw ? JSON.parse(cartRaw) : [];

          return {
            drawerActive: drawer ? drawer.classList.contains('active') : false,
            title,
            price,
            sizePills,
            hasAddBtn: !!addBtn,
            hasBuyNowBtn: !!buyNowBtn,
            cartLength: cart.length
          };
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });

    const qb = quickBuyTest.result.value;
    assert.ok(!qb.error, qb.error);
    assert.ok(qb.title, 'Quick-Buy drawer must display product title');
    assert.ok(qb.price, 'Quick-Buy drawer must display product price');
    assert.ok(qb.sizePills.length >= 3, 'Quick-Buy drawer must display size pills');
    assert.ok(qb.hasAddBtn, 'Quick-Buy drawer must have ADD TO BAG button');
    assert.ok(qb.hasBuyNowBtn, 'Quick-Buy drawer must have 1-CLICK BUY NOW button');
    assert.ok(qb.cartLength > 0, 'Clicking ADD TO BAG must add item to cart');
    console.log(`✓ Homepage Quick-Buy (+) opened bottom sheet for "${qb.title}" (${qb.price}), size pills [${qb.sizePills.join(', ')}], and successfully added to cart!`);

    ws.close();
  } finally {
    chrome.kill();
  }
}

async function main() {
  console.log('====================================================');
  console.log('🚀 Running Full Verification for Mobile, OTP, Newsletter & Profile');
  console.log('====================================================');
  try {
    await testBackendEndpoints();
    await testHeadlessMobileUi();
    console.log('\n🎉 ALL VERIFICATION TESTS PASSED SUCCESSFULLY (100% PASS)!');
  } catch (err) {
    console.error('\n❌ VERIFICATION TEST FAILED:', err);
    process.exit(1);
  }
}

main();
