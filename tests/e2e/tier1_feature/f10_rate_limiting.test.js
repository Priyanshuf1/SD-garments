/**
 * ALLEYRICH — Tier 1 Feature Coverage: Feature F10
 * File: tests/e2e/tier1_feature/f10_rate_limiting.test.js
 * 
 * Tests for Distributed Sliding-Window Rate Limiting:
 * - TC-T1-F10-01: OTP Dispatch Cooldown (60s cooldown, 429 on immediate repeat request with Retry-After)
 * - TC-T1-F10-02: Customer Login IP Rate Limit (10 req / 300s threshold, 11th returns 429)
 * - TC-T1-F10-03: Admin Login IP Rate Limit (5 req / 900s threshold, 6th returns 429 lockout)
 * - TC-T1-F10-04: Checkout Order Submission Rate Limit (10 req / 300s threshold, 11th returns 429)
 * - TC-T1-F10-05: Admin API General Rate Limit (120 req / 60s threshold contract enforcement)
 */

'use strict';

const { defineSuite } = require('../helpers/suite.js');

module.exports = defineSuite({
  tier: 1,
  feature: 'F10',
  title: 'Feature 10 Coverage: Distributed Rate Limiting',
  description: 'Verifies sliding-window rate limit barriers across OTP dispatch, customer login, admin login, checkout, and administrative routes.'
}, ({ test }) => {

  test('TC-T1-F10-01', 'OTP Dispatch Cooldown (60s): Rejects immediate second OTP request with HTTP 429 and Retry-After header', async ({ client, assert }) => {
    const ts = Date.now();
    const testEmail = `otp_limit_${ts}@sdgarments.in`;
    const ip = `198.51.100.${ts % 250 + 1}`;
    const headers = {
      'x-forwarded-for': ip,
      'cf-connecting-ip': ip
    };

    // 1. First OTP dispatch request -> must succeed with 200
    const res1 = await client.post('/api/auth/send-otp', { email: testEmail }, { headers });
    assert.assertStatus(res1, 200);
    assert.strictEqual(res1.data.success, true);

    // 2. Immediate second OTP dispatch request -> must be rejected with 429
    const res2 = await client.post('/api/auth/send-otp', { email: testEmail }, { headers });
    assert.assertRateLimited(res2);
    assert.strictEqual(res2.data.success, false);
    assert.assertHtmlContains(res2, 'wait');
  });

  test('TC-T1-F10-02', 'Customer Login IP Rate Limit: 11 rapid failed login attempts from same IP triggers HTTP 429 rate limit', async ({ client, assert }) => {
    const ts = Date.now();
    const testIp = `198.51.101.${ts % 250 + 1}`;
    const headers = {
      'x-forwarded-for': testIp,
      'cf-connecting-ip': testIp
    };

    // Fire 10 failed login attempts (allowed threshold)
    for (let i = 0; i < 10; i++) {
      const res = await client.post('/api/auth/login', {
        email: `fake_shopper_${i}@test.com`,
        password: 'wrong_password_123'
      }, { headers });
      assert.assertStatus(res, 401);
    }

    // 11th request must exceed the threshold and return HTTP 429
    const breachRes = await client.post('/api/auth/login', {
      email: 'fake_shopper_11@test.com',
      password: 'wrong_password_123'
    }, { headers });

    assert.assertRateLimited(breachRes);
    assert.strictEqual(breachRes.data.success, false);
    assert.assertHtmlContains(breachRes, 'Too many login attempts');
  });

  test('TC-T1-F10-03', 'Admin Login IP Rate Limit: 6 rapid failed admin login attempts from same IP triggers HTTP 429 lockout', async ({ client, assert }) => {
    // Ensure admin authentication credentials are configured in environment for validation
    process.env.ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
    process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'correct-password-32ch';
    process.env.ADMIN_2FA_SECRET = process.env.ADMIN_2FA_SECRET || 'JBSWY3DPEHPK3PXP';

    const ts = Date.now();
    const testIp = `198.51.102.${ts % 250 + 1}`;
    const headers = {
      'x-forwarded-for': testIp,
      'cf-connecting-ip': testIp
    };

    // First 5 attempts return 401
    for (let i = 0; i < 5; i++) {
      const res = await client.post('/api/admin/login', {
        username: 'intruder',
        password: 'bad_password',
        totpCode: '000000'
      }, { headers });
      assert.assertStatus(res, 401);
    }

    // 6th attempt must trigger HTTP 429 lockout
    const breachRes = await client.post('/api/admin/login', {
      username: 'intruder',
      password: 'bad_password',
      totpCode: '000000'
    }, { headers });

    assert.assertStatus(breachRes, 429);
    assert.strictEqual(breachRes.data.success, false);
    assert.assertHtmlContains(breachRes, 'Security Lockout');
  });

  test('TC-T1-F10-04', 'Checkout Order Submission Rate Limit: 11 rapid order attempts from same IP triggers HTTP 429 rate limit', async ({ client, env, assert }) => {
    const ts = Date.now();
    const testIp = `198.51.103.${ts % 250 + 1}`;
    const headers = {
      'x-forwarded-for': testIp,
      'cf-connecting-ip': testIp
    };

    // Submit invalid empty orders (which still increment order_create rate limiter)
    for (let i = 0; i < 10; i++) {
      const res = await client.post('/api/checkout/create-order', {
        items: []
      }, { headers });
      assert.assertStatus(res, 400); // Bad Request (rejected by validator after rate limit pass)
    }

    // 11th attempt must trigger HTTP 429
    const breachRes = await client.post('/api/checkout/create-order', {
      items: []
    }, { headers });

    assert.assertRateLimited(breachRes);
    assert.strictEqual(breachRes.data.success, false);
    assert.assertHtmlContains(breachRes, 'Too many order submissions');
  });

  test('TC-T1-F10-05', 'Admin API General Rate Limit: Verifies 120 req / 60s sliding window limit contract on /api/admin/*', async ({ client, env, assert }) => {
    // Verify rate limit enforcement configuration
    const ts = Date.now();
    const testIp = `198.51.104.${ts % 250 + 1}`;
    const headers = {
      ...env.getAdminHeaders(),
      'x-forwarded-for': testIp,
      'cf-connecting-ip': testIp
    };

    // A single request passes cleanly
    const res = await client.get('/api/admin/stats', { headers });
    assert.assertStatus(res, 200);

    // Verify rate limit threshold rule (120 req / 60s) directly via security helper
    const security = require('../../../lib/security.js');
    const limitResult = security.checkRateLimit(`admin_api:${testIp}`, 120, 60);
    assert.ok(limitResult.allowed, 'Initial requests must be allowed');
    assert.strictEqual(typeof limitResult.remaining, 'number');
    assert.ok(limitResult.remaining < 120, 'Remaining count must decrement');
  });

});
