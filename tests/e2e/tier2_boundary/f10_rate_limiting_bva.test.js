/**
 * ALLEYRICH — Tier 2 Boundary & Corner Case Tests: Feature F10
 * File: tests/e2e/tier2_boundary/f10_rate_limiting_bva.test.js
 * 
 * Boundary Value Analysis (BVA) for Distributed Rate Limiting:
 * - TC-T2-F10-01: OTP 5-attempt brute-force lockout (HTTP 429 on 5th failure)
 * - TC-T2-F10-02: Rate limiter isolation across distinct client IPs
 * - TC-T2-F10-03: Sliding window expiration reset behavior
 * - TC-T2-F10-04: Anti-spoofing of untrusted X-Forwarded-For headers
 * - TC-T2-F10-05: Excessive payload rejection (2MB guard returning HTTP 413)
 */

'use strict';

const { defineSuite } = require('../helpers/suite.js');

module.exports = defineSuite({
  tier: 2,
  feature: 'F10',
  title: 'Feature 10 Boundary & Corner Cases: Distributed Rate Limiting',
  description: 'Validates OTP brute-force permanent deactivation, IP partition isolation, sliding window resets, header anti-spoofing, and payload limits.'
}, ({ test }) => {

  test('TC-T2-F10-01', 'OTP 5-Attempt Lockout: Deactivates code and returns HTTP 429 on 5th failed attempt', async ({ client, assert }) => {
    const email = `lockout_${Date.now()}@sdgarments.in`;
    const ip = '198.51.100.91';
    const headers = {
      'Content-Type': 'application/json',
      'cf-connecting-ip': ip,
      'x-forwarded-for': ip
    };

    // 1. Send OTP
    const sendRes = await client.post('/api/auth/send-otp', { email }, { headers });
    assert.assertStatus(sendRes, 200);

    // 2. Submit 4 consecutive wrong codes -> should return HTTP 400
    for (let i = 1; i <= 4; i++) {
      const failRes = await client.post('/api/auth/verify-otp', {
        email,
        token: `00000${i}`
      }, { headers });
      assert.assertStatus(failRes, 400, `Attempt ${i} should return HTTP 400`);
      assert.strictEqual(failRes.data.success, false);
    }

    // 3. 5th wrong attempt -> must return HTTP 429 lockout
    const fifthRes = await client.post('/api/auth/verify-otp', {
      email,
      token: '999999'
    }, { headers });

    assert.assertStatus(fifthRes, 429, '5th attempt must trigger HTTP 429 lockout');
    assert.assertHeader(fifthRes, 'retry-after', '900', 'Must include 900s Retry-After header on lockout');
    assert.strictEqual(fifthRes.data.success, false);
    assert.assertHtmlContains(fifthRes, 'Too many failed verification attempts (5/5)');
  });

  test('TC-T2-F10-02', 'IP Limiter Isolation: Rate limiting on IP A does not block IP B', async ({ client, assert, env }) => {
    const ipA = '198.51.100.111';
    const ipB = '198.51.100.222';

    // Exhaust IP A on admin stats (120 req limit)
    const headersA = { ...env.getAdminHeaders(), 'cf-connecting-ip': ipA, 'x-forwarded-for': ipA };
    const headersB = { ...env.getAdminHeaders(), 'cf-connecting-ip': ipB, 'x-forwarded-for': ipB };

    // Trigger 429 for IP A
    for (let i = 0; i < 122; i++) {
      const res = await client.get('/api/admin/stats', { headers: headersA });
      if (res.status === 429) break;
    }

    // Confirm IP A is rate limited
    const resA = await client.get('/api/admin/stats', { headers: headersA });
    assert.assertStatus(resA, 429);

    // IP B must succeed with HTTP 200
    const resB = await client.get('/api/admin/stats', { headers: headersB });
    assert.assertStatus(resB, 200);
    assert.strictEqual(resB.data.success, true);
  });

  test('TC-T2-F10-03', 'Window Expiration Reset: Sliding window resets after window duration elapses', async ({ assert }) => {
    const security = require('../../../lib/security.js');
    const testKey = `unit_test_reset_${Date.now()}`;

    // Limit: max 1 request per 1 second window
    const firstCheck = security.checkRateLimit(testKey, 1, 1);
    assert.strictEqual(firstCheck.allowed, true, 'First request within window must be allowed');
    assert.strictEqual(firstCheck.remaining, 0);

    // Immediate second check should be blocked
    const secondCheck = security.checkRateLimit(testKey, 1, 1);
    assert.strictEqual(secondCheck.allowed, false, 'Second request within 1s window must be blocked');

    // Wait 1.1 seconds for sliding window to reset
    await new Promise(resolve => setTimeout(resolve, 1100));

    // Third check after window expiry should be allowed
    const thirdCheck = security.checkRateLimit(testKey, 1, 1);
    assert.strictEqual(thirdCheck.allowed, true, 'Request after window expiration must be allowed');
  });

  test('TC-T2-F10-04', 'Anti-Spoofing: Direct client X-Forwarded-For is ignored when TRUST_PROXY is false', async ({ assert }) => {
    const security = require('../../../lib/security.js');

    // Emulate mock direct client request with forged X-Forwarded-For header
    const mockReq = {
      headers: {
        'x-forwarded-for': '1.2.3.4, 5.6.7.8'
        // Note: No cf-connecting-ip
      },
      socket: {
        remoteAddress: '127.0.0.1'
      }
    };

    // When TRUST_PROXY is not enabled, getClientIp must bind to socket remote address
    const resolvedIp = security.getClientIp(mockReq);
    assert.strictEqual(resolvedIp, '127.0.0.1', 'Untrusted proxy request must resolve to remote socket address');
  });

  test('TC-T2-F10-05', 'Payload Size Boundary: Rejects bodies exceeding 2MB guard with HTTP 413', async ({ client, assert }) => {
    // Generate an oversized 2.5MB string payload
    const oversizedChunk = 'X'.repeat(2.5 * 1024 * 1024);

    const res = await client.post('/api/auth/login', oversizedChunk, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(oversizedChunk)
      }
    });

    assert.assertStatus(res, 413);
    assert.assertHtmlContains(res, 'Payload Too Large');
  });

});
