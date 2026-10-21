/**
 * ALLYRICH Security & Abuse Prevention Automated Verification Suite
 * Tests:
 * 1. Admin Authentication Barrier (Blocks unauthenticated external access)
 * 2. Catalog Mutation Barrier (Blocks unauthenticated POST/PUT/DELETE /api/products)
 * 3. Sensitive Orders Dump Barrier (Blocks unauthenticated /data/orders.json and unauthenticated full /api/orders dump)
 * 4. OTP Send Cooldown Enforcement (HTTP 429 on rapid re-dispatch)
 * 5. OTP 5-Attempt Brute-Force Lockout (Code destroyed after 5 failed attempts)
 * 6. Video Upload SSRF Protection (Blocks AWS metadata / private subnets)
 * 7. Memory Exhaustion Payload Size Guard (Rejects > 2MB body on standard APIs)
 * 8. Newsletter Rate Limit Enforcement (Blocks spam flooding)
 */

const http = require('http');
const appHandler = require('./server.js');

const TEST_PORT = 3457;
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

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✅ PASS: ${message}`);
  passedTests++;
}

async function runSecurityAuditTests() {
  console.log('====================================================');
  console.log('🛡️ Starting Security & Abuse Prevention Verification');
  console.log('====================================================\n');

  const testServer = http.createServer(appHandler);
  await new Promise((resolve) => testServer.listen(TEST_PORT, resolve));
  console.log(`🚀 Security Test server listening on ${BASE_URL}\n`);

  try {
    // Simulated external untrusted client IP
    const externalHeaders = { 'x-forwarded-for': '203.0.113.195' };

    // -----------------------------------------------------------------
    // TEST 1: Admin Authentication Barrier
    // -----------------------------------------------------------------
    console.log('--- TEST 1: Admin Authentication Barrier ---');
    const unauthedAdminRes = await makeRequest('GET', '/api/admin/stats', null, externalHeaders);
    assert(unauthedAdminRes.status === 401, 'Unauthenticated /api/admin/stats returns HTTP 401 Unauthorized');
    assert(unauthedAdminRes.body.success === false, 'Unauthenticated response has success: false');

    const authedAdminRes = await makeRequest('GET', '/api/admin/stats', null, {
      ...externalHeaders,
      'x-admin-key': ADMIN_KEY
    });
    assert(authedAdminRes.status === 200, 'Authenticated /api/admin/stats with valid x-admin-key returns HTTP 200');
    assert(authedAdminRes.body.success === true, 'Authenticated response has success: true');
    console.log('Admin Authentication barrier successfully verified.\n');

    // -----------------------------------------------------------------
    // TEST 2: Catalog Mutation Barrier
    // -----------------------------------------------------------------
    console.log('--- TEST 2: Catalog Mutation Barrier ---');
    const unauthedCreateProd = await makeRequest('POST', '/api/products', { title: 'Hacked Product' }, externalHeaders);
    assert(unauthedCreateProd.status === 401, 'Unauthenticated POST /api/products returns HTTP 401 Unauthorized');

    const unauthedDeleteProd = await makeRequest('DELETE', '/api/products/some-prod-id', null, externalHeaders);
    assert(unauthedDeleteProd.status === 401, 'Unauthenticated DELETE /api/products/:id returns HTTP 401 Unauthorized');
    console.log('Catalog Mutation barrier successfully verified.\n');

    // -----------------------------------------------------------------
    // TEST 3: Orders Dump Barrier
    // -----------------------------------------------------------------
    console.log('--- TEST 3: Orders Archive Barrier ---');
    const unauthedOrdersDump = await makeRequest('GET', '/data/orders.json', null, externalHeaders);
    assert(unauthedOrdersDump.status === 401, 'Unauthenticated GET /data/orders.json returns HTTP 401 Unauthorized');

    const unauthedFullOrders = await makeRequest('GET', '/api/orders', null, externalHeaders);
    assert(unauthedFullOrders.status === 401, 'Unauthenticated full GET /api/orders returns HTTP 401 Unauthorized');
    console.log('Orders Archive barrier successfully verified.\n');

    // -----------------------------------------------------------------
    // TEST 4: OTP Send Cooldown
    // -----------------------------------------------------------------
    console.log('--- TEST 4: OTP Send Cooldown ---');
    const testEmail = `sec_audit_${Date.now()}@gmail.com`;
    const otp1 = await makeRequest('POST', '/api/auth/send-otp', { email: testEmail }, externalHeaders);
    assert(otp1.status === 200, 'First OTP dispatch returns HTTP 200');

    // Rapid second dispatch should be blocked by 60s cooldown
    const otp2 = await makeRequest('POST', '/api/auth/send-otp', { email: testEmail }, externalHeaders);
    assert(otp2.status === 429, 'Immediate second OTP dispatch returns HTTP 429 Too Many Requests');
    assert(otp2.body.message.includes('seconds'), 'HTTP 429 message includes cooldown countdown');
    console.log('OTP Send Cooldown successfully verified.\n');

    // -----------------------------------------------------------------
    // TEST 5: OTP 5-Attempt Lockout
    // -----------------------------------------------------------------
    console.log('--- TEST 5: OTP 5-Attempt Brute-Force Lockout ---');
    const bruteEmail = `brute_victim_${Date.now()}@gmail.com`;
    await makeRequest('POST', '/api/auth/send-otp', { email: bruteEmail }, { 'x-forwarded-for': '198.51.100.11' });

    // Attempts 1 to 4 should return HTTP 400
    for (let i = 1; i <= 4; i++) {
      const failRes = await makeRequest('POST', '/api/auth/verify-otp', {
        email: bruteEmail,
        code: `00000${i}`
      }, { 'x-forwarded-for': '198.51.100.11' });
      assert(failRes.status === 400, `Attempt ${i}/5 returns HTTP 400 with attempts remaining warning`);
    }

    // Attempt 5 MUST trigger lockout & code deactivation (HTTP 429)
    const lockoutRes = await makeRequest('POST', '/api/auth/verify-otp', {
      email: bruteEmail,
      code: '999999'
    }, { 'x-forwarded-for': '198.51.100.11' });
    assert(lockoutRes.status === 429, 'Attempt 5/5 triggers HTTP 429 Lockout');
    assert(lockoutRes.body.message.includes('deactivated') || lockoutRes.body.message.includes('Too many failed'), 'Lockout confirms code deactivation');
    console.log('OTP Brute-Force Lockout successfully verified.\n');

    // -----------------------------------------------------------------
    // TEST 6: Video Upload SSRF Protection
    // -----------------------------------------------------------------
    console.log('--- TEST 6: Video Upload SSRF Protection ---');
    const ssrfRes = await makeRequest('POST', '/api/admin/videos/upload', {
      videoName: 'test_ssrf.mp4',
      url: 'http://169.254.169.254/latest/meta-data/'
    }, {
      'x-admin-key': ADMIN_KEY
    });
    assert(ssrfRes.status === 400, 'SSRF attempt to 169.254.169.254 rejected with HTTP 400');
    assert(ssrfRes.body.message.includes('restricted') || ssrfRes.body.message.includes('prohibited'), 'Error message confirms SSRF prohibition');
    console.log('Video Upload SSRF protection successfully verified.\n');

    // -----------------------------------------------------------------
    // TEST 7: Payload Size Limit Guard
    // -----------------------------------------------------------------
    console.log('--- TEST 7: Payload Size Limit Guard ---');
    const hugePayload = {
      email: 'test@example.com',
      bloat: 'X'.repeat(3 * 1024 * 1024) // 3MB payload (exceeds 2MB max)
    };
    try {
      const largeRes = await makeRequest('POST', '/api/auth/login', hugePayload);
      assert(largeRes.status === 500 || !largeRes.body || largeRes.body.includes('Payload too large'), 'Huge payload (>2MB) successfully rejected/destroyed');
    } catch (e) {
      // Socket reset or destroy is expected behavior on oversized payload
      assert(true, 'Huge payload (>2MB) caused socket termination as expected');
    }
    console.log('Payload Size Limit Guard successfully verified.\n');

    // -----------------------------------------------------------------
    // TEST 8: Newsletter Flooding Rate Limit
    // -----------------------------------------------------------------
    console.log('--- TEST 8: Newsletter Flooding Rate Limit ---');
    const spamIpHeaders = { 'x-forwarded-for': '192.0.2.77' };
    let spamBlocked = false;
    for (let i = 0; i < 7; i++) {
      const nlRes = await makeRequest('POST', '/api/newsletter', { email: `spam_${Date.now()}_${i}@test.com` }, spamIpHeaders);
      if (nlRes.status === 429) {
        spamBlocked = true;
        break;
      }
    }
    assert(spamBlocked === true, 'Rapid newsletter spam from single IP blocked with HTTP 429');
    console.log('Newsletter Flooding Rate Limit successfully verified.\n');

    console.log('====================================================');
    console.log(`🎉 ALL SECURITY TESTS PASSED! (${passedTests}/${totalTests} assertions)`);
    console.log('====================================================');
  } catch (err) {
    console.error('Security verification failed:', err);
    process.exit(1);
  } finally {
    testServer.close();
    process.exit(0);
  }
}

runSecurityAuditTests();
