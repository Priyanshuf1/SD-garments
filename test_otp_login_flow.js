const fs = require('fs');
const assert = require('assert');
const http = require('http');
const appHandler = require('./server.js');

console.log('🧪 Verifying Enhanced OTP Login Flow & Supabase Callback Handler...\n');

// 1. Verify frontend files have the auto-fill and URL callback handling
const authJs = fs.readFileSync('assets/js/auth.js', 'utf8');
assert(authJs.includes('handleUrlAuthCallback'), 'auth.js must include handleUrlAuthCallback');
assert(authJs.includes('Click to Auto-Fill & Sign In'), 'auth.js must include 1-click auto-fill button in OTP modal');
assert(authJs.includes('accessToken'), 'auth.js must parse accessToken from URL hash');
console.log('✅ PASS: auth.js has 1-click auto-fill and URL callback handler');

const loginHtml = fs.readFileSync('login.html', 'utf8');
assert(loginHtml.includes('Click to Auto-Fill & Sign In'), 'login.html must include 1-click auto-fill button');
assert(loginHtml.includes('codeInput.value = res.code'), 'login.html must auto-populate the code input');
console.log('✅ PASS: login.html has 1-click auto-fill and instant pre-fill');

// 2. Start internal test server and test backend API
const TEST_PORT = 3789;
const server = http.createServer((req, res) => {
  appHandler(req, res);
});

server.listen(TEST_PORT, async () => {
  try {
    const testEmail = `otp_verify_${Date.now()}@example.com`;
    console.log(`\nTesting send-otp API for ${testEmail}...`);

    // A. Send OTP
    const sendRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail })
    });
    assert.strictEqual(sendRes.status, 200, 'send-otp status 200');
    const sendData = await sendRes.json();
    assert.strictEqual(sendData.success, true, 'send-otp success: true');
    assert.ok(sendData.code, 'send-otp returned code');
    assert.match(sendData.code, /^\d{6}$/, 'code must be 6 digits');
    console.log(`✅ PASS: send-otp returned 6-digit code: ${sendData.code}`);

    // B. Verify with wrong code -> should fail
    const badRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, code: '999999' })
    });
    assert.strictEqual(badRes.status, 400, 'bad code status 400');
    console.log('✅ PASS: verify-otp rejected invalid code');

    // C. Verify with valid code -> should pass and issue session
    const okRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, code: sendData.code })
    });
    assert.strictEqual(okRes.status, 200, 'verify-otp status 200');
    const okData = await okRes.json();
    assert.strictEqual(okData.success, true, 'verify-otp success: true');
    assert.ok(okData.token, 'verify-otp returned token');
    assert.ok(okData.user, 'verify-otp returned user');
    assert.strictEqual(okData.user.email, testEmail, 'user email matches');
    console.log('✅ PASS: verify-otp succeeded and issued token & user profile');

    console.log('\n====================================================');
    console.log('🎉 ALL OTP LOGIN ENHANCEMENTS VERIFIED SUCCESSFULLY!');
    console.log('====================================================');
    server.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ FAIL:', err);
    server.close();
    process.exit(1);
  }
});
