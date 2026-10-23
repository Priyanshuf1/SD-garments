/**
 * Comprehensive Verification Test for:
 * 1. "Chat with Us" direct WhatsApp and Instagram integration
 * 2. Complete removal of the generic "Contact Us" form
 * 3. Global floating chat widget (assets/js/chat-widget.js) presence across templates
 * 4. Server routes (/chat, /chat-with-us, /contact, /pages/contact.html)
 * 5. Zero regressions on brand name ("ALLEYRICH") and "Contact Concierge"
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

let totalTests = 0;
let passedTests = 0;

function assert(cond, msg) {
  totalTests++;
  if (!cond) {
    console.error(`❌ FAILED: ${msg}`);
    throw new Error(msg);
  }
  passedTests++;
  console.log(`✅ PASS: ${msg}`);
}

async function request(options) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          raw: data
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  console.log('\n======================================================');
  console.log('🧪 VERIFYING CHAT WITH US & CONTACT FORM REMOVAL');
  console.log('======================================================\n');

  const rootDir = __dirname;

  // 1. Check contact.html has NO contact form
  console.log('--- 1. Testing Contact Form Removal ---');
  const contactHtmlPath = path.join(rootDir, 'pages', 'contact.html');
  assert(fs.existsSync(contactHtmlPath), 'pages/contact.html exists');
  const contactHtml = fs.readFileSync(contactHtmlPath, 'utf8');

  // Must not have message sending form
  assert(!contactHtml.includes('SEND MESSAGE'), 'contact.html has NO "SEND MESSAGE" submit button');
  assert(!contactHtml.includes('YOUR NAME'), 'contact.html has NO "YOUR NAME" form label');
  assert(!contactHtml.includes('textarea rows="5"'), 'contact.html has NO textarea message input');
  assert(!contactHtml.includes('Message sent! Our support team will respond'), 'contact.html has NO fake toast handler');

  // Must have WhatsApp and Instagram links
  console.log('\n--- 2. Testing WhatsApp & Instagram Integration ---');
  assert(contactHtml.includes('https://wa.me/919876543210'), 'contact.html contains direct WhatsApp link');
  assert(contactHtml.includes('https://ig.me/m/allyrich_') || contactHtml.includes('https://www.instagram.com/allyrich_'), 'contact.html contains direct Instagram link');
  assert(contactHtml.includes('delhivery-track-input'), 'contact.html preserves Delhivery express shipment tracking');
  assert(contactHtml.includes('care@allyrich.com'), 'contact.html contains care@allyrich.com support email');

  // 2. Check assets/js/chat-widget.js exists and is valid
  console.log('\n--- 3. Testing Global Floating Chat Widget ---');
  const widgetPath = path.join(rootDir, 'assets', 'js', 'chat-widget.js');
  assert(fs.existsSync(widgetPath), 'assets/js/chat-widget.js exists');
  const widgetCode = fs.readFileSync(widgetPath, 'utf8');
  assert(widgetCode.includes('ar-chat-trigger'), 'chat-widget.js defines floating trigger pill');
  assert(widgetCode.includes('ar-chat-modal'), 'chat-widget.js defines chat modal dialog');
  assert(widgetCode.includes('https://wa.me/') && widgetCode.includes('919876543210'), 'chat-widget.js includes WhatsApp action');
  assert(widgetCode.includes('https://ig.me/m/allyrich_'), 'chat-widget.js includes Instagram action');
  assert(widgetCode.includes('window.openChatModal'), 'chat-widget.js exposes window.openChatModal API');

  // 3. Check presence of widget script and "Chat with Us" in storefront pages
  console.log('\n--- 4. Testing Template Integration ---');
  const templatesToCheck = [
    'index.html',
    'collections.html',
    'product.html',
    'account.html',
    'login.html',
    'checkout.html',
    'pages/contact.html',
    'pages/privacy-policy.html',
    'pages/refund-policy.html',
    'pages/shipping-policy.html',
    'pages/terms-of-service.html',
    'pages/returns.html',
    'pages/reviews.html'
  ];

  for (const t of templatesToCheck) {
    const fPath = path.join(rootDir, t);
    assert(fs.existsSync(fPath), `${t} exists`);
    const content = fs.readFileSync(fPath, 'utf8');
    assert(content.includes('chat-widget.js'), `${t} includes chat-widget.js`);
    assert(content.includes('Chat with Us') || content.includes('CHAT WITH US'), `${t} features "Chat with Us" option`);
  }

  // 4. Test Server Routes with active server
  console.log('\n--- 5. Testing Server Policy & Chat Routes ---');
  const serverJs = require('./server.js');
  const testPort = 3192;
  const testServer = http.createServer(serverJs);

  await new Promise(resolve => testServer.listen(testPort, resolve));

  try {
    const routesToTest = [
      '/chat',
      '/chat-with-us',
      '/pages/chat',
      '/contact',
      '/pages/contact.html'
    ];

    for (const r of routesToTest) {
      const res = await request({ hostname: 'localhost', port: testPort, path: r, method: 'GET' });
      assert(res.status === 200, `Route ${r} returned HTTP 200 OK`);
      assert(res.raw.includes('ALLEYRICH'), `Route ${r} returns ALLEYRICH branded page`);
      assert(res.raw.includes('CHAT WITH US'), `Route ${r} contains "CHAT WITH US" hero`);
      assert(res.raw.includes('https://wa.me/919876543210'), `Route ${r} contains WhatsApp link`);
    }
  } finally {
    await new Promise(resolve => testServer.close(resolve));
  }

  // 5. Test Zero Regressions
  console.log('\n--- 6. Testing Zero Regressions ---');
  let conciergeCount = 0;
  for (const t of templatesToCheck) {
    const content = fs.readFileSync(path.join(rootDir, t), 'utf8');
    if (/contact\s*concierge/i.test(content)) {
      conciergeCount++;
    }
  }
  assert(conciergeCount === 0, `Zero occurrences of obsolete "Contact Concierge" (found ${conciergeCount})`);

  console.log('\n======================================================');
  console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED CLEANLY!`);
  console.log('======================================================\n');
}

run().catch(err => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
