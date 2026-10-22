/**
 * ALLYRICH Omnichannel Marketing & WhatsApp Verification Suite
 * 
 * Verifies:
 * 1. Indian Phone Number Normalization
 * 2. WhatsApp Promotional Message Formatter
 * 3. Universal wa.me Link Generation
 * 4. Admin Authentication Barrier on Marketing Endpoints (HTTP 401)
 * 5. Marketing Recipients Aggregation Engine (Emails + Phone Contacts)
 * 6. Dual-Channel Broadcast Execution (Email + WhatsApp)
 * 7. Storefront Phone & Email Opt-in
 */

const http = require('http');
const whatsapp = require('./lib/whatsapp.js');
const appHandler = require('./server.js');

const TEST_PORT = 3459;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const ADMIN_KEY = 'genrage_super_admin_secret_key_2026';

function makeRequest(method, path, body = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const headers = {
      'Content-Type': 'application/json',
      ...extraHeaders
    };

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: headers
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = data;
        }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✅ PASS: ${message}`);
  passedTests++;
}

async function runTests() {
  console.log('====================================================');
  console.log('📢 Starting Omnichannel Marketing & WhatsApp Tests');
  console.log('====================================================\n');

  // 1. Unit Tests for lib/whatsapp.js
  console.log('--- Unit 1: Phone Normalization ---');
  assert(whatsapp.normalizeIndianPhoneNumber('9876543210') === '919876543210', '10 digits standard -> 919876543210');
  assert(whatsapp.normalizeIndianPhoneNumber('+91 99999 22222') === '919999922222', 'Spaced formatted -> 919999922222');
  assert(whatsapp.normalizeIndianPhoneNumber('09876543210') === '919876543210', 'Leading 0 -> 919876543210');
  assert(whatsapp.normalizeIndianPhoneNumber('919876543210') === '919876543210', 'Already normalized -> 919876543210');
  assert(whatsapp.normalizeIndianPhoneNumber('12345') === null, 'Short invalid phone returns null');
  assert(whatsapp.normalizeIndianPhoneNumber('') === null, 'Empty phone returns null');

  console.log('\n--- Unit 2: WhatsApp Promo Formatter & Links ---');
  const promo = whatsapp.buildWhatsAppPromoMessage({
    headline: '40% OFF FLASH SALE',
    message: 'Limited drop access now live.',
    code: 'FLASH40',
    link: 'https://genrage.vercel.app/collections/shop'
  });
  assert(promo.includes('*ALLYRICH ARCHITECTURAL STREETWEAR*'), 'Message includes brand header');
  assert(promo.includes('*40% OFF FLASH SALE*'), 'Message includes headline');
  assert(promo.includes('FLASH40'), 'Message includes promo code');
  assert(promo.includes('https://genrage.vercel.app/collections/shop'), 'Message includes shop link');

  const waLink = whatsapp.buildDirectWhatsAppLink('9876543210', 'Hello from ALLYRICH');
  assert(waLink.startsWith('https://wa.me/919876543210?text='), 'wa.me link has correct schema');
  assert(waLink.includes('Hello%20from%20ALLYRICH'), 'wa.me text is properly URI encoded');

  // 2. Integration Tests with Local HTTP Server
  console.log('\n--- Integration Tests on Server ---');
  const server = http.createServer(appHandler);
  await new Promise((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`🚀 Marketing Test server listening on ${BASE_URL}\n`);

  try {
    const externalHeaders = { 'x-forwarded-for': '203.0.113.195' };

    // Test 1: Security Barrier on Marketing Endpoints
    console.log('Testing Authentication Barrier:');
    const unauthedRecipients = await makeRequest('GET', '/api/admin/marketing/recipients', null, externalHeaders);
    assert(unauthedRecipients.status === 401, 'Unauthenticated GET /api/admin/marketing/recipients returns HTTP 401');

    const unauthedBroadcast = await makeRequest('POST', '/api/admin/marketing/broadcast', { message: 'test' }, externalHeaders);
    assert(unauthedBroadcast.status === 401, 'Unauthenticated POST /api/admin/marketing/broadcast returns HTTP 401');

    // Test 2: Authenticated Recipients Fetch
    console.log('\nTesting Authenticated Recipients Endpoint:');
    const authedRecipients = await makeRequest('GET', '/api/admin/marketing/recipients', null, {
      ...externalHeaders,
      'x-admin-key': ADMIN_KEY
    });
    assert(authedRecipients.status === 200, 'Authenticated GET /api/admin/marketing/recipients returns HTTP 200');
    assert(authedRecipients.body.success === true, 'Response has success: true');
    assert(typeof authedRecipients.body.totalEmails === 'number', 'totalEmails count is present');
    assert(typeof authedRecipients.body.totalPhones === 'number', 'totalPhones count is present');
    assert(Array.isArray(authedRecipients.body.phoneContacts), 'phoneContacts is an array');
    console.log(`  📊 Aggregated: ${authedRecipients.body.totalEmails} Emails, ${authedRecipients.body.totalPhones} Phone Contacts`);

    // Test 3: Dual-Channel Broadcast Execution
    console.log('\nTesting Dual Channel (All) Broadcast:');
    const broadcastAll = await makeRequest('POST', '/api/admin/marketing/broadcast', {
      channel: 'all',
      subject: 'Secret Drop Test',
      headline: 'VIP ARCHIVE DROP',
      message: 'Test message for all subscribers and WhatsApp contacts',
      code: 'TEST40',
      link: 'https://genrage.vercel.app'
    }, {
      ...externalHeaders,
      'x-admin-key': ADMIN_KEY
    });
    assert(broadcastAll.status === 200, 'POST /api/admin/marketing/broadcast (all) returns HTTP 200');
    assert(broadcastAll.body.success === true, 'Broadcast returns success: true');
    assert(broadcastAll.body.channel === 'all', 'Broadcast confirmed channel: all');
    assert(broadcastAll.body.emailSentCount >= 0, 'emailSentCount is recorded');
    assert(broadcastAll.body.whatsappSentCount >= 0, 'whatsappSentCount is recorded');
    assert(Array.isArray(broadcastAll.body.waDispatchQueue), 'waDispatchQueue is generated');

    // Test 4: WhatsApp-Only Broadcast
    console.log('\nTesting WhatsApp-Only Channel:');
    const broadcastWa = await makeRequest('POST', '/api/admin/marketing/broadcast', {
      channel: 'whatsapp',
      subject: 'WhatsApp Exclusive',
      headline: 'FLASH DROP',
      message: 'Exclusive WhatsApp message',
      code: 'WA20'
    }, {
      ...externalHeaders,
      'x-admin-key': ADMIN_KEY
    });
    assert(broadcastWa.status === 200, 'POST /api/admin/marketing/broadcast (whatsapp) returns HTTP 200');
    assert(broadcastWa.body.emailSentCount === 0, 'Email sent count is 0 for whatsapp-only');
    assert(broadcastWa.body.whatsappSentCount >= 0, 'WhatsApp contacts processed');

    // Test 5: Empty Message Rejection
    console.log('\nTesting Input Validation:');
    const emptyBroadcast = await makeRequest('POST', '/api/admin/marketing/broadcast', {
      channel: 'all',
      subject: '',
      message: ''
    }, {
      ...externalHeaders,
      'x-admin-key': ADMIN_KEY
    });
    assert(emptyBroadcast.status === 400, 'Empty message broadcast rejected with HTTP 400');

    // Test 6: Newsletter Phone + Email Subscription
    console.log('\nTesting Newsletter Subscription with Phone:');
    const testEmail = `wa_sub_${Date.now()}@test.com`;
    const testPhone = '9876543210';
    const nlRes = await makeRequest('POST', '/api/newsletter', {
      email: testEmail,
      phone: testPhone,
      name: 'WhatsApp VIP'
    }, { 'x-forwarded-for': '198.51.100.42' });
    if (nlRes.status !== 200) {
      console.log('nlRes status:', nlRes.status, 'body:', nlRes.body);
    }
    assert(nlRes.status === 200, 'POST /api/newsletter with phone returns HTTP 200');
    assert(nlRes.body.success === true, 'Newsletter response has success: true');

    console.log('\n====================================================');
    console.log(`🎉 ALL MARKETING & WHATSAPP TESTS PASSED! (${passedTests}/${totalTests} assertions)`);
    console.log('====================================================\n');
  } finally {
    server.close();
  }
}

runTests().catch(err => {
  console.error('\n❌ TEST RUNNER FAILED:', err.message);
  process.exit(1);
});
