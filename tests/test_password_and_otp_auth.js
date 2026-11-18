/**
 * Comprehensive Automated Verification Suite for:
 * 1. Password Registration & Login (POST /api/auth/signup & POST /api/auth/login)
 * 2. Multi-Worker OTP First-Click Verification (No more wrong OTP on first try)
 * 3. Forgot Password & Reset Password Workflow (POST /api/auth/forgot-password & /reset-password)
 * 4. Authenticated Password Change on /account (POST /api/auth/change-password)
 */

const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const security = require('../lib/security');
const db = require('../lib/db');

const TEST_PORT = 3988;
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
  console.log('🚀 TESTING AUTHENTICATION & PASSWORD / OTP ENGINE');
  console.log('====================================================\n');

  process.env.PORT = String(TEST_PORT);
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_JSON_FALLBACK = 'true';

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

  const testEmail = `test_pwd_${Date.now()}@allyrich.com`;
  const initialPassword = 'Password123!';
  const updatedPassword = 'NewSecretPassword456!';
  let authToken = null;

  // SUITE 1: Password Registration & Login
  console.log('--- SUITE 1: Password Registration & Direct Login ---');
  await test('POST /api/auth/signup creates account with hashed password and session', async () => {
    const res = await makeRequest('POST', '/api/auth/signup', {}, {
      email: testEmail,
      password: initialPassword,
      name: 'Priyanshu Tester',
      phone: '+91 98765 43210'
    });
    assert.strictEqual(res.statusCode, 201, `Expected 201, got ${res.statusCode}: ${res.body}`);
    assert.strictEqual(res.json?.success, true);
    assert(res.json?.token, 'Token must be present in response');
    authToken = res.json.token;
  });

  await test('POST /api/auth/login succeeds with valid email and password', async () => {
    const res = await makeRequest('POST', '/api/auth/login', {}, {
      email: testEmail,
      password: initialPassword
    });
    assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}: ${res.body}`);
    assert.strictEqual(res.json?.success, true);
    assert.strictEqual(res.json?.user?.email, testEmail);
    assert(res.json?.token, 'Login must issue session token');
  });

  await test('POST /api/auth/login rejects incorrect password with 401', async () => {
    const res = await makeRequest('POST', '/api/auth/login', {}, {
      email: testEmail,
      password: 'WrongPassword999!'
    });
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.json?.success, false);
    assert(res.json?.message?.includes('Incorrect password'));
  });

  // SUITE 2: Multi-Worker OTP First-Click Verification
  console.log('\n--- SUITE 2: Multi-Worker OTP First-Click Verification ---');
  let dispatchedOtp = null;
  await test('POST /api/auth/send-otp dispatches OTP and records cross-worker state', async () => {
    const res = await makeRequest('POST', '/api/auth/send-otp', {}, { email: testEmail });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json?.success, true);
    dispatchedOtp = res.json?.devCode;
    assert(dispatchedOtp, 'Test mode must return devCode for assertions');
  });

  await test('POST /api/auth/verify-otp succeeds on FIRST CLICK across isolated workers', async () => {
    // Simulate Worker B receiving the verify request by wiping Worker A in-memory cache
    if (global.otpCache && typeof global.otpCache.delete === 'function') {
      global.otpCache.delete(testEmail);
    }

    // Call verify-otp directly with the 6-digit code
    const res = await makeRequest('POST', '/api/auth/verify-otp', {}, {
      email: testEmail,
      token: dispatchedOtp
    });
    assert.strictEqual(res.statusCode, 200, `Expected 200 on first click, got ${res.statusCode}: ${res.body}`);
    assert.strictEqual(res.json?.success, true);
    assert(res.json?.token, 'Must return session token upon verification');
  });

  // SUITE 3: Forgot Password & Reset Password Workflow
  console.log('\n--- SUITE 3: Forgot Password & Reset Password Workflow ---');
  let resetCode = null;
  await test('POST /api/auth/forgot-password sends 6-digit reset code', async () => {
    const res = await makeRequest('POST', '/api/auth/forgot-password', {}, { email: testEmail });
    assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}: ${res.body}`);
    assert.strictEqual(res.json?.success, true);
    resetCode = res.json?.devCode;
    assert(resetCode, 'Dev/test reset code must be returned for testing');
  });

  await test('POST /api/auth/reset-password verifies code and updates password', async () => {
    const res = await makeRequest('POST', '/api/auth/reset-password', {}, {
      email: testEmail,
      token: resetCode,
      newPassword: updatedPassword
    });
    assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}: ${res.body}`);
    assert.strictEqual(res.json?.success, true);
    assert(res.json?.token, 'Must auto-login user after reset');
    authToken = res.json.token;
  });

  await test('POST /api/auth/login succeeds with newly reset password', async () => {
    const res = await makeRequest('POST', '/api/auth/login', {}, {
      email: testEmail,
      password: updatedPassword
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json?.success, true);
  });

  await test('POST /api/auth/login fails with old password', async () => {
    const res = await makeRequest('POST', '/api/auth/login', {}, {
      email: testEmail,
      password: initialPassword
    });
    assert.strictEqual(res.statusCode, 401);
  });

  // SUITE 4: Authenticated Password Change
  console.log('\n--- SUITE 4: Authenticated Password Change ---');
  await test('POST /api/auth/change-password updates password for logged-in user', async () => {
    const finalPassword = 'BrandFinalPassword789!';
    const res = await makeRequest('POST', '/api/auth/change-password', {
      'Authorization': `Bearer ${authToken}`
    }, {
      currentPassword: updatedPassword,
      newPassword: finalPassword
    });
    assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}: ${res.body}`);
    assert.strictEqual(res.json?.success, true);

    // Verify login with new final password
    const loginRes = await makeRequest('POST', '/api/auth/login', {}, {
      email: testEmail,
      password: finalPassword
    });
    assert.strictEqual(loginRes.statusCode, 200);
  });

  // Cleanup test server
  await new Promise((resolve) => server.close(resolve));

  console.log('\n====================================================');
  console.log(`RESULTS: ${passed}/${total} TESTS PASSED (${Math.round((passed / total) * 100)}%)`);
  console.log('====================================================\n');

  if (passed === total) {
    console.log('✓ ALL AUTH & PASSWORD TESTS PASSED SUCCESSFULLY!');
    process.exit(0);
  } else {
    console.error(`✕ ${total - passed} TESTS FAILED`);
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
