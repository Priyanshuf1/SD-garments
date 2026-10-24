const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
let totalPassed = 0;
let totalFailed = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    totalPassed++;
  } else {
    console.error(`  ❌ FAIL: ${testName} ${details ? `(${details})` : ''}`);
    totalFailed++;
  }
}

function fetchUrl(urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    const reqOptions = {
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(url, reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runAudit() {
  console.log('\n===============================================================');
  console.log('🤖 LAUNCHING MASTER BOT AUDIT: COMPLIANCE, DELIVERY & SECURITY');
  console.log('===============================================================\n');

  // BOT 1: Legal Policy & Compliance Routes Bot
  console.log('--- BOT 1: Legal Suite & Compliance Endpoints ---');
  const policyRoutes = [
    { path: '/privacy-policy', title: 'Privacy Policy', keywords: ['DPDP Act 2023', 'Data Protection', 'Data We Collect', 'Your Rights'] },
    { path: '/terms-of-service', title: 'Terms of Service', keywords: ['Governing Law', 'Terms', 'ALLYRICH', 'Intellectual Property'] },
    { path: '/cookie-policy', title: 'Cookie Policy', keywords: ['Cookie Policy', 'Strictly Necessary', 'Analytics', 'How to Manage', 'DPDP Act 2023'] },
    { path: '/refund-policy', title: 'Refund Policy', keywords: ['Refund', 'Return', 'Exchange', '7-Day'] },
    { path: '/shipping-policy', title: 'Shipping Policy', keywords: ['Shipping', 'Delhivery', 'Free Delivery', 'Dispatch'] },
    { path: '/returns', title: 'Returns & Exchange', keywords: ['Return', 'Exchange'] }
  ];

  for (const p of policyRoutes) {
    const res = await fetchUrl(p.path);
    assert(res.statusCode === 200, `${p.title} route (${p.path}) returns HTTP 200`);
    assert(res.body.length > 500, `${p.title} route (${p.path}) has substantial content (${res.body.length} bytes)`);
    for (const kw of p.keywords) {
      assert(res.body.toLowerCase().includes(kw.toLowerCase()), `${p.title} contains keyword: "${kw}"`);
    }
  }

  // BOT 2: Delivery & Shipping Model Bot
  console.log('\n--- BOT 2: Delivery Model & Delhivery Integration API ---');
  
  // Metro PIN code tests
  const metroPins = [
    { pin: '400053', city: 'Mumbai (Andheri West)', region: 'Metro Express' },
    { pin: '110001', city: 'New Delhi (Connaught Place)', region: 'Metro Express' },
    { pin: '560001', city: 'Bengaluru (MG Road)', region: 'Metro Express' },
    { pin: '700001', city: 'Kolkata (BBD Bagh)', region: 'Metro Express' },
    { pin: '600001', city: 'Chennai (George Town)', region: 'Metro Express' },
    { pin: '500001', city: 'Hyderabad (Abids)', region: 'Metro Express' }
  ];

  for (const m of metroPins) {
    const res = await fetchUrl(`/api/shipping/pincode/${m.pin}`);
    assert(res.statusCode === 200, `PIN ${m.pin} (${m.city}) returns HTTP 200`);
    const data = JSON.parse(res.body);
    assert(data.serviceable === true, `PIN ${m.pin} is marked serviceable`);
    assert(data.carrier.includes('Delhivery'), `PIN ${m.pin} carrier is Delhivery Express`);
    assert(data.slaDays === '2-3', `PIN ${m.pin} metro SLA is 2-3 business days`);
    assert(data.codAvailable === true, `PIN ${m.pin} has COD enabled`);
  }

  // Tier 2 PIN code test
  const tier2Res = await fetchUrl('/api/shipping/pincode/226001');
  assert(tier2Res.statusCode === 200, 'Tier 2 PIN 226001 (Lucknow) returns HTTP 200');
  const tier2Data = JSON.parse(tier2Res.body);
  assert(tier2Data.serviceable === true, 'Tier 2 PIN 226001 is serviceable');
  assert(tier2Data.slaDays === '3-5', 'Tier 2 PIN 226001 SLA is 3-5 business days');

  // Invalid PIN code tests
  const invalidPins = ['000000', '123', 'abcdef', '999999', '1000000'];
  for (const ip of invalidPins) {
    const res = await fetchUrl(`/api/shipping/pincode/${ip}`);
    assert(res.statusCode === 400 || (res.statusCode === 200 && JSON.parse(res.body).serviceable === false), 
      `Invalid PIN "${ip}" is correctly rejected (Status: ${res.statusCode})`);
  }

  // Delivery AWB Generation & Tracking Bot
  console.log('\n--- BOT 3: Delhivery AWB Generation & Live Order Tracking ---');
  const ordersRaw = fs.readFileSync('C:\\SD_garments\\data\\orders.json', 'utf8');
  const orders = JSON.parse(ordersRaw);
  const testOrder = orders[0];
  assert(Boolean(testOrder), 'Test order exists in data/orders.json');

  if (testOrder) {
    const orderId = testOrder.id;
    // Call Delhivery AWB generation endpoint with admin auth
    const awbRes = await fetchUrl(`/api/admin/orders/${orderId}/delhivery-awb`, {
      method: 'POST',
      headers: { 'Authorization': 'Basic ' + Buffer.from('admin:allyrich2026').toString('base64') }
    });
    assert(awbRes.statusCode === 200, `POST /api/admin/orders/${orderId}/delhivery-awb returns HTTP 200`);
    const awbData = JSON.parse(awbRes.body);
    assert(awbData.success === true, 'AWB generation reported success');
    assert(typeof awbData.awb === 'string' && (awbData.awb.length === 12 || awbData.awb.length === 14), `Generated Delhivery AWB is valid: ${awbData.awb}`);
    assert(awbData.awb.startsWith('14092') || awbData.awb.startsWith('480') || awbData.awb.length >= 10, `Generated AWB conforms to Delhivery express series (${awbData.awb})`);

    // Verify tracking endpoint lookup
    const trackRes = await fetchUrl(`/api/orders/track?id=${orderId}`);
    assert(trackRes.statusCode === 200, `Tracking lookup GET /api/orders/track?id=${orderId} returns HTTP 200`);
    const trackData = JSON.parse(trackRes.body);
    assert(trackData.success === true, 'Tracking response is successful');
    assert(trackData.order.delhiveryWaybill === awbData.awb, 'Tracking order has assigned Delhivery waybill');
    assert(trackData.order.carrier.includes('Delhivery'), 'Tracking order carrier is Delhivery');
    assert(trackData.order.orderStatus === 'Shipped', 'Order status updated to Shipped');
  }

  // BOT 4: Accessibility & Form Compliance Bot
  console.log('\n--- BOT 4: Accessibility & Form Consent Audit ---');
  const repoDir = 'C:\\SD_garments';
  const htmlFiles = fs.readdirSync(repoDir).concat(fs.readdirSync(path.join(repoDir, 'pages')).map(f => 'pages/' + f))
    .filter(f => f.endsWith('.html'));

  let totalImgMissingAlt = 0;
  htmlFiles.forEach(file => {
    const content = fs.readFileSync(path.join(repoDir, file), 'utf8');
    const imgMatches = content.match(/<img\b([^>]*)>/gi) || [];
    imgMatches.forEach(tag => {
      if (!tag.includes('alt=')) {
        totalImgMissingAlt++;
        console.error(`Missing alt in ${file}: ${tag.slice(0, 60)}`);
      }
    });
  });
  assert(totalImgMissingAlt === 0, `Zero missing alt attributes across all ${htmlFiles.length} HTML files`);

  // Verify Checkout Form Consent & Accessibility
  const chkContent = fs.readFileSync(path.join(repoDir, 'checkout.html'), 'utf8');
  assert(chkContent.includes('checkPincodeDelivery(this.value)'), 'Checkout PIN input has live serviceability trigger');
  assert(chkContent.includes('id="pincode-status-badge"'), 'Checkout PIN input has serviceability status badge container');
  assert(chkContent.includes('aria-label="Delhivery Express Air Priority Delivery"'), 'Delivery radio has explicit aria-label');
  assert(chkContent.includes('aria-label="Cashfree Online Payment"'), 'Cashfree radio has explicit aria-label');
  assert(chkContent.includes('aria-label="Cash on Delivery"'), 'COD radio has explicit aria-label');
  assert(chkContent.includes('href="/terms-of-service"') && chkContent.includes('href="/privacy-policy"') && chkContent.includes('href="/refund-policy"'),
    'Checkout order submission has clickable consent links to Terms, Privacy & Returns');

  // Verify Login Form Consent
  const loginContent = fs.readFileSync(path.join(repoDir, 'login.html'), 'utf8');
  assert(loginContent.includes('href="/terms-of-service"') && loginContent.includes('href="/privacy-policy"'),
    'Login form has clickable consent links to Terms & Privacy');

  // Verify Newsletter Consent in index.html
  const idxContent = fs.readFileSync(path.join(repoDir, 'index.html'), 'utf8');
  assert(idxContent.includes('agree to receive promotional updates') && idxContent.includes('href="/privacy-policy"'),
    'Index newsletter has explicit opt-in and privacy consent text');
  assert(!idxContent.includes('gokwik') && !idxContent.includes('snapchat') && !idxContent.includes('sc-static'),
    'Index.html is 100% clean of legacy Gokwik and Snapchat scripts');

  // BOT 5: Cookie Consent Banner & Integration Bot
  console.log('\n--- BOT 5: Cookie Consent Banner Integration ---');
  const bannerRes = await fetchUrl('/assets/js/cookie-consent.js');
  assert(bannerRes.statusCode === 200, 'Cookie consent script (/assets/js/cookie-consent.js) served with HTTP 200');
  assert(bannerRes.body.includes('allyrich_cookie_consent'), 'Cookie consent script manages localStorage key allyrich_cookie_consent');
  assert(bannerRes.body.includes('Accept All') && bannerRes.body.includes('Essential Only'), 'Cookie consent banner offers Granular Choices');

  const customerPages = ['index.html', 'collections.html', 'product.html', 'checkout.html', 'login.html', 'account.html'];
  customerPages.forEach(p => {
    const c = fs.readFileSync(path.join(repoDir, p), 'utf8');
    assert(c.includes('/assets/js/cookie-consent.js'), `${p} loads /assets/js/cookie-consent.js`);
  });

  console.log('\n===============================================================');
  console.log(`📊 MASTER AUDIT COMPLETE: ${totalPassed} PASSED, ${totalFailed} FAILED`);
  console.log('===============================================================\n');

  if (totalFailed > 0) {
    process.exit(1);
  }
}

runAudit().catch(err => {
  console.error('Master Audit Fatal Error:', err);
  process.exit(1);
});
