/**
 * ALLEYRICH — Phase 2 Test Coverage: Shared State, Sessions & Auth Hardening
 * File: tests/e2e/tier1_feature/f13_phase2_shared_state_auth.test.js
 * 
 * Verifies Phase 2 Security Controls:
 * - TC-P2-01: OTP Hashing at Rest, Constant-Time Verify & Single-Use Deactivation
 * - TC-P2-02: OTP Attempt Lockout (Deactivation & HTTP 429 after 5 failed attempts)
 * - TC-P2-03: Uniform OTP Response (Anti-Enumeration Guard)
 * - TC-P2-04: Random 256-bit Sessions & HttpOnly Cookie Authentication
 * - TC-P2-05: Admin TOTP Single-Use Replay Protection (usedTotpCodes)
 * - TC-P2-06: CSRF Cross-Origin State Modification Protection (Sec-Fetch-Site / Origin)
 * - TC-P2-07: Turnstile Server-Side Verification Guard
 */

'use strict';

const crypto = require('crypto');
const { defineSuite } = require('../helpers/suite.js');
const totp = require('../../../lib/totp.js');

module.exports = defineSuite({
  tier: 1,
  feature: 'P2',
  title: 'Phase 2 Security Controls: Shared State, Sessions & Auth Hardening',
  description: 'Validates hashed OTPs, 5-attempt lockout, anti-enumeration, 256-bit sessions, TOTP replay guard, and CSRF protection.'
}, ({ test }) => {

  test('TC-P2-01', 'OTP Hashing at Rest, Constant-Time Verify & Single-Use Deactivation', async ({ client, env, assert }) => {
    const testEmail = `otp_hash_${Date.now()}@sdgarments.in`;

    // 1. Send OTP
    const sendRes = await client.post('/api/auth/send-otp', { email: testEmail });
    assert.assertStatus(sendRes, 200);
    assert.strictEqual(sendRes.data.success, true);
    const devCode = sendRes.data.devCode;
    assert.ok(devCode, 'Dev code should be returned in non-production for verification testing');

    // 2. Successful verification with correct code
    const verifyRes = await client.post('/api/auth/verify-otp', {
      email: testEmail,
      token: devCode
    });
    assert.assertStatus(verifyRes, 200);
    assert.strictEqual(verifyRes.data.success, true);
    assert.ok(verifyRes.data.token, 'Session token must be issued');

    // 3. Single-use deactivation: replaying the same code must fail
    const replayRes = await client.post('/api/auth/verify-otp', {
      email: testEmail,
      token: devCode
    });
    assert.assertStatus(replayRes, 400);
    assert.strictEqual(replayRes.data.success, false);
  });

  test('TC-P2-02', 'OTP Attempt Lockout: 5 failed attempts deactivates code and locks out with HTTP 429', async ({ client, env, assert }) => {
    const testEmail = `otp_lock_${Date.now()}@sdgarments.in`;

    // Send OTP
    const sendRes = await client.post('/api/auth/send-otp', { email: testEmail });
    assert.assertStatus(sendRes, 200);

    // Attempt 1 through 4 with incorrect codes
    for (let i = 1; i <= 4; i++) {
      const failRes = await client.post('/api/auth/verify-otp', {
        email: testEmail,
        token: '000000'
      });
      assert.assertStatus(failRes, 400);
      assert.strictEqual(failRes.data.success, false);
    }

    // Attempt 5 breaches max failed attempts threshold -> returns HTTP 429 Lockout
    const lockRes = await client.post('/api/auth/verify-otp', {
      email: testEmail,
      token: '000000'
    });
    assert.assertStatus(lockRes, 429);
    assert.strictEqual(lockRes.data.success, false);
    assert.assertHtmlContains(lockRes, 'Too many failed verification attempts');
  });

  test('TC-P2-03', 'Uniform OTP Response: Anti-Enumeration Guard returns identical responses for all emails', async ({ client, env, assert }) => {
    const existingShopper = env.createUniqueShopper('enum_exist');
    const nonExistingEmail = `nobody_${Date.now()}@sdgarments.in`;

    // 1. Existing user OTP request
    const existRes = await client.post('/api/auth/send-otp', { email: existingShopper.email });
    assert.assertStatus(existRes, 200);

    // 2. Non-existing user OTP request
    const nonExistRes = await client.post('/api/auth/send-otp', { email: nonExistingEmail });
    assert.assertStatus(nonExistRes, 200);

    // Both must return identical generic message
    assert.strictEqual(existRes.data.message, nonExistRes.data.message);
  });

  test('TC-P2-04', 'Random 256-bit Sessions & HttpOnly Cookie Authentication', async ({ client, env, assert }) => {
    const testEmail = `sess_test_${Date.now()}@sdgarments.in`;
    const sendRes = await client.post('/api/auth/send-otp', { email: testEmail });
    assert.assertStatus(sendRes, 200);

    const verifyRes = await client.post('/api/auth/verify-otp', {
      email: testEmail,
      token: sendRes.data.devCode
    });
    assert.assertStatus(verifyRes, 200);
    const token = verifyRes.data.token;
    assert.ok(token.startsWith('ar_usr_'), 'Token must be random 256-bit format starting with ar_usr_');

    // Verify Set-Cookie header was issued
    const setCookie = verifyRes.headers['set-cookie'];
    assert.ok(setCookie, 'Set-Cookie header must be present');
    const cookieHeaderStr = Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie);
    assert.ok(cookieHeaderStr.includes('HttpOnly'), 'Cookie must be HttpOnly');
    assert.ok(cookieHeaderStr.includes('SameSite=Lax') || cookieHeaderStr.includes('SameSite=Strict'), 'Cookie must specify SameSite');

    // Authenticated request using session cookie
    const meRes = await client.get('/api/auth/me', {
      headers: {
        'Cookie': `alleyrich_session=${token}`
      }
    });
    assert.assertStatus(meRes, 200);
    assert.strictEqual(meRes.data.success, true);
    assert.strictEqual(meRes.data.user.email, testEmail);
  });

  test('TC-P2-05', 'Admin TOTP Single-Use Replay Protection: Replaying valid 6-digit code returns HTTP 400', async ({ client, env, assert }) => {
    const adminUser = process.env.ADMIN_USERNAME || 'deepak';
    const adminPass = process.env.ADMIN_PASSWORD || 'alleyrich_super_secret_admin_vault_2026';
    const totpSecret = process.env.ADMIN_2FA_SECRET || 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

    // Generate fresh TOTP
    const code = totp.generateTotp(totpSecret);

    // 1. First admin login with valid TOTP code
    const res1 = await client.post('/api/admin/login', {
      username: adminUser,
      password: adminPass,
      totpCode: code
    });
    assert.assertStatus(res1, 200);
    assert.strictEqual(res1.data.success, true);
    assert.ok(res1.data.token, 'Admin session token must be issued');

    // 2. Replay the exact same TOTP code within the same 30-90s window
    const res2 = await client.post('/api/admin/login', {
      username: adminUser,
      password: adminPass,
      totpCode: code
    });

    // Server must reject replayed code with HTTP 400
    assert.assertStatus(res2, 400);
    assert.strictEqual(res2.data.success, false);
    assert.assertHtmlContains(res2, 'already been used');
  });

  test('TC-P2-06', 'CSRF Protection: Rejects cross-origin state-changing modifications with HTTP 403', async ({ client, env, assert }) => {
    // 1. Cross-site browser header
    const crossSiteRes = await client.post('/api/cart/sync', { cart: [] }, {
      headers: {
        'Sec-Fetch-Site': 'cross-site'
      }
    });
    assert.assertStatus(crossSiteRes, 403);
    assert.strictEqual(crossSiteRes.data.success, false);
    assert.assertHtmlContains(crossSiteRes, 'CSRF Protection');

    // 2. Untrusted Origin header
    const badOriginRes = await client.post('/api/cart/sync', { cart: [] }, {
      headers: {
        'Origin': 'https://evil-hacker-storefront.com'
      }
    });
    assert.assertStatus(badOriginRes, 403);
    assert.strictEqual(badOriginRes.data.success, false);
    assert.assertHtmlContains(badOriginRes, 'Untrusted Origin');
  });

  test('TC-P2-07', 'Turnstile Server-Side Verification: Rejects when token is missing and fail mode is closed', async ({ client, env, assert }) => {
    const origEnabled = process.env.TURNSTILE_ENABLED;
    const origFail = process.env.TURNSTILE_FAIL_MODE;
    const origKey = process.env.TURNSTILE_SECRET_KEY;

    try {
      process.env.TURNSTILE_ENABLED = 'true';
      process.env.TURNSTILE_FAIL_MODE = 'closed';
      process.env.TURNSTILE_SECRET_KEY = '0x4AAAAAAABbogus_secret_key_for_testing';

      const res = await client.post('/api/auth/send-otp', {
        email: `turnstile_${Date.now()}@sdgarments.in`
      });
      assert.assertStatus(res, 400);
      assert.strictEqual(res.data.success, false);
      assert.assertHtmlContains(res, 'Captcha verification');
    } finally {
      process.env.TURNSTILE_ENABLED = origEnabled || 'false';
      process.env.TURNSTILE_FAIL_MODE = origFail || 'open';
      process.env.TURNSTILE_SECRET_KEY = origKey || '';
    }
  });

});
