/**
 * ALLEYRICH — Tier 4 Real-World Application Scenario 3: Security & Rate-Limiter Abuse
 * File: tests/e2e/tier4_realworld/scenario3_security_abuse.test.js
 * 
 * Exercises: F6 (Checkout Security), F10 (Distributed Rate Limiting),
 *            F12 (In-Memory Security Fallback)
 * 
 * Workflow:
 * 1. Attacker triggers rapid OTP requests; server enforces 60s cooldown (HTTP 429)
 * 2. Attacker attempts brute-force OTP verification with 4 bad codes (HTTP 400)
 * 3. On 5th incorrect attempt, security engine triggers permanent lockout (HTTP 429)
 *    and deactivates the verification code
 * 4. Subsequent verification attempts fail because code was destroyed
 * 5. Attacker attempts rapid checkout flooding; 11th request triggers HTTP 429
 * 6. Attacker attempts unauthenticated admin access; blocked with HTTP 401
 */

'use strict';

const { defineSuite } = require('../helpers/suite.js');

module.exports = defineSuite({
  tier: 4,
  feature: 'F6+F10+F12',
  title: 'Scenario 3: Security Defense & Abuse Prevention (OTP Cooldown, Brute-Force Lockout, IP Rate Limits)',
  description: 'Validates multi-layered defensive controls protecting authentication, OTP lifecycles, and transactional checkout from abuse.'
}, ({ test }) => {

  test('SCENARIO-03', 'Security abuse controls: OTP cooldown, 5-attempt brute-force lockout, and checkout flood rate limiting', async ({ client, assert, env }) => {
    const abuseEmail = `sec_abuse_${Date.now()}@sdgarments.in`;
    const abuseIp = '198.51.100.99';
    const abuseHeaders = env.getForwardedIpHeaders(abuseIp);

    // Step 1: Initial OTP dispatch
    const firstOtpRes = await client.post('/api/auth/send-otp', { email: abuseEmail }, { headers: abuseHeaders });
    assert.assertStatus(firstOtpRes, 200);
    assert.strictEqual(firstOtpRes.data.success, true);

    // Step 2: Immediate rapid second OTP dispatch — Cooldown enforcement
    const rapidOtpRes = await client.post('/api/auth/send-otp', { email: abuseEmail }, { headers: abuseHeaders });
    assert.assertRateLimited(rapidOtpRes, 'Second rapid OTP request must trigger 60s cooldown with HTTP 429');
    assert.strictEqual(rapidOtpRes.data.success, false);
    assert.ok(
      rapidOtpRes.data.message.includes('wait') || rapidOtpRes.data.message.includes('cooldown'),
      'Response message must indicate cooldown wait time'
    );

    // Step 3: Brute-force OTP verification — Attempts 1 through 4 return HTTP 400
    for (let attempt = 1; attempt <= 4; attempt++) {
      const badCode = `99990${attempt}`;
      const failRes = await client.post('/api/auth/verify-otp', {
        email: abuseEmail,
        code: badCode
      }, { headers: abuseHeaders });

      assert.assertStatus(failRes, 400, `Failed verification attempt ${attempt} must return HTTP 400`);
      assert.strictEqual(failRes.data.success, false);
      assert.ok(
        failRes.data.message.includes('Invalid') || failRes.data.message.includes('attempts remaining'),
        `Attempt ${attempt} message must note failure count`
      );
    }

    // Step 4: 5th incorrect attempt triggers permanent lockout with HTTP 429
    const fifthAttemptRes = await client.post('/api/auth/verify-otp', {
      email: abuseEmail,
      code: '000000'
    }, { headers: abuseHeaders });

    assert.assertRateLimited(fifthAttemptRes, '5th incorrect OTP attempt must trigger lockout with HTTP 429');
    assert.strictEqual(fifthAttemptRes.data.success, false);
    assert.ok(
      fifthAttemptRes.data.message.includes('deactivated') || fifthAttemptRes.data.message.includes('Too many failed'),
      'Lockout message must confirm code deactivation'
    );

    // Step 5: Subsequent attempt with original devCode (if available) or another code fails
    const postLockoutRes = await client.post('/api/auth/verify-otp', {
      email: abuseEmail,
      code: firstOtpRes.data.devCode || '123456'
    }, { headers: abuseHeaders });
    assert.ok(
      postLockoutRes.status === 400 || postLockoutRes.status === 429,
      `Post-lockout verification must be rejected, got HTTP ${postLockoutRes.status}`
    );
    assert.strictEqual(postLockoutRes.data.success, false);

    // Step 6: Transactional order submission flood protection
    const floodIp = '198.51.100.123';
    const floodHeaders = env.getForwardedIpHeaders(floodIp);
    const catalogRes = await client.get('/api/products');
    const inStockProducts = catalogRes.data.products.filter(p => {
      const v = p.variants?.[0];
      return v?.available !== false && (v?.inventory_quantity === undefined || v?.inventory_quantity > 5);
    });
    assert.ok(inStockProducts.length >= 10, 'Must have at least 10 in-stock products for rate limit test');

    // Send 10 orders (the allowed threshold) cycling through in-stock products
    for (let i = 0; i < 10; i++) {
      const p = inStockProducts[i];
      const shopper = env.createUniqueShopper(`flood_${i}`);
      const res = await client.post('/api/checkout/create-order', {
        items: [{ id: String(p.id), handle: p.handle, title: p.title, size: 'M', quantity: 1 }],
        customer: shopper,
        paymentMethod: 'Cash on Delivery (COD)'
      }, { headers: floodHeaders });
      assert.assertStatus(res, 201, `Order ${i + 1} should be accepted`);
    }

    // 11th order from same IP must be rate limited
    const breachProd = inStockProducts[0];
    const breachOrderRes = await client.post('/api/checkout/create-order', {
      items: [{ id: String(breachProd.id), handle: breachProd.handle, title: breachProd.title, size: 'M', quantity: 1 }],
      customer: env.createUniqueShopper('flood_breach'),
      paymentMethod: 'Cash on Delivery (COD)'
    }, { headers: floodHeaders });
    assert.assertRateLimited(breachOrderRes, '11th checkout from flooded IP must return HTTP 429');

    // Step 7: Unauthenticated administrative endpoint access rejection
    const unauthStatsRes = await client.get('/api/admin/stats');
    assert.assertStatus(unauthStatsRes, 401, 'Admin stats without credentials must return HTTP 401');
    assert.strictEqual(unauthStatsRes.data.success, false);
  });

});
