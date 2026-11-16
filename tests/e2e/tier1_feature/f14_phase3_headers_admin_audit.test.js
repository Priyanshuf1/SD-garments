/**
 * ALLEYRICH — Phase 3 Test Coverage: Headers, Admin Hardening, Audit & Marketing Controls
 * File: tests/e2e/tier1_feature/f14_phase3_headers_admin_audit.test.js
 * 
 * Verifies Phase 3 Security Controls:
 * - TC-P3-01: Security Headers (HSTS, nosniff, Referrer, Permissions, CSP-Report-Only) & /csp-report endpoint
 * - TC-P3-02: Admin Route Protection & Robots Noindex Header (X-Robots-Tag)
 * - TC-P3-03: Admin IP Allowlist Guard (ADMIN_IP_ALLOWLIST)
 * - TC-P3-04: Cloudflare Access JWT Assertion Verification Guard (CF_ACCESS_ENABLED)
 * - TC-P3-05: Admin Login Exponential Backoff Lockout (3 attempts -> 15s HTTP 429)
 * - TC-P3-06: Sensitive Action TOTP Re-Authentication (Order Refund & Bulk Export)
 * - TC-P3-07: Append-Only Administrative Audit Log & PII Masking
 * - TC-P3-08: Marketing Hub Explicit Consent, Confirmation Step & Rate Limit
 */

'use strict';

const crypto = require('crypto');
const { defineSuite } = require('../helpers/suite.js');
const totp = require('../../../lib/totp.js');

module.exports = defineSuite({
  tier: 1,
  feature: 'P3',
  title: 'Phase 3 Security Controls: Headers, Admin Hardening, Audit & Marketing Controls',
  description: 'Validates CSP/HSTS headers, admin noindex, IP allowlist, CF Access, TOTP re-auth for sensitive actions, audit logs, and marketing consent.'
}, ({ test }) => {

  test('TC-P3-01', 'Security Headers & CSP-Report-Only with /csp-report Endpoint', async ({ client, env, assert }) => {
    // 1. Fetch storefront page to verify security headers
    const res = await client.get('/');
    assert.assertStatus(res, 200);

    // Verify Defense-in-depth headers
    const h = res.headers;
    assert.strictEqual(h['x-content-type-options'], 'nosniff', 'X-Content-Type-Options must be nosniff');
    assert.strictEqual(h['x-frame-options'], 'SAMEORIGIN', 'X-Frame-Options must be SAMEORIGIN');
    assert.strictEqual(h['referrer-policy'], 'strict-origin-when-cross-origin', 'Referrer-Policy must be strict-origin-when-cross-origin');
    assert.ok(h['permissions-policy'], 'Permissions-Policy header must exist');
    assert.ok(h['permissions-policy'].includes('camera=()'), 'Permissions-Policy must restrict camera');
    assert.ok(h['permissions-policy'].includes('payment=(self)'), 'Permissions-Policy must allow payment');

    // Verify CSP (Report-Only by default)
    const csp = h['content-security-policy-report-only'] || h['content-security-policy'];
    assert.ok(csp, 'Content-Security-Policy or Report-Only header must exist');
    assert.ok(csp.includes("default-src 'self'"), 'CSP must specify default-src');
    assert.ok(csp.includes('prod.spline.design'), 'CSP must permit Spline CDN');
    assert.ok(csp.includes('checkout.razorpay.com'), 'CSP must permit Razorpay frames/scripts');
    assert.ok(csp.includes("frame-ancestors 'none'"), 'CSP must forbid embedding site in frames');
    assert.ok(csp.includes('report-uri /csp-report'), 'CSP must direct reports to /csp-report');

    // 2. Submit test report to /csp-report
    const reportRes = await client.post('/csp-report', {
      'csp-report': {
        'document-uri': 'https://alleyrich.com/',
        'violated-directive': 'script-src'
      }
    });
    assert.assertStatus(reportRes, 204);
  });

  test('TC-P3-02', 'Admin Route Protection: X-Robots-Tag Noindex Header', async ({ client, env, assert }) => {
    const adminKey = process.env.ADMIN_SECRET_KEY || 'genrage_super_admin_secret_key_2026';

    // 1. Check static /admin route
    const staticRes = await client.get('/admin');
    assert.ok([200, 304, 401].includes(staticRes.status), 'Admin page should be reachable');
    assert.strictEqual(staticRes.headers['x-robots-tag'], 'noindex, nofollow, noarchive, nosnippet', 'Admin page must have noindex tag');

    // 2. Check API admin route
    const apiRes = await client.get('/api/admin/stats', {
      headers: { 'x-admin-key': adminKey }
    });
    assert.assertStatus(apiRes, 200);
    assert.strictEqual(apiRes.headers['x-robots-tag'], 'noindex, nofollow, noarchive, nosnippet', 'Admin API must have noindex tag');
  });

  test('TC-P3-03', 'Admin IP Allowlist: Rejects Unauthorized Remote IPs with HTTP 403', async ({ client, env, assert }) => {
    const adminKey = process.env.ADMIN_SECRET_KEY || 'genrage_super_admin_secret_key_2026';
    const origAllowlist = process.env.ADMIN_IP_ALLOWLIST;

    try {
      // Set allowlist to restrictive external IP that does not match local test client (127.0.0.1)
      process.env.ADMIN_IP_ALLOWLIST = '198.51.100.25, 203.0.113.50';

      const res = await client.get('/api/admin/stats', {
        headers: { 'x-admin-key': adminKey }
      });
      assert.assertStatus(res, 403);
      assert.strictEqual(res.data.success, false);
      assert.assertHtmlContains(res, 'IP address not authorized');
    } finally {
      process.env.ADMIN_IP_ALLOWLIST = origAllowlist || '';
    }
  });

  test('TC-P3-04', 'Cloudflare Access JWT Assertion Verification Guard', async ({ client, env, assert }) => {
    const adminKey = process.env.ADMIN_SECRET_KEY || 'genrage_super_admin_secret_key_2026';
    const origCf = process.env.CF_ACCESS_ENABLED;
    const origAud = process.env.CF_ACCESS_AUD;

    try {
      process.env.CF_ACCESS_ENABLED = 'true';
      process.env.CF_ACCESS_AUD = 'test-cf-access-aud-tag-2026';

      // 1. Request missing Cf-Access-Jwt-Assertion header must be rejected
      const missingRes = await client.get('/api/admin/stats', {
        headers: { 'x-admin-key': adminKey }
      });
      assert.assertStatus(missingRes, 403);
      assert.strictEqual(missingRes.data.success, false);
      assert.assertHtmlContains(missingRes, 'Cloudflare Access');

      // 2. Request with valid Cloudflare Access JWT header is allowed
      const validPayload = {
        sub: 'admin-auditor',
        email: 'deepak@alleyrich.com',
        aud: 'test-cf-access-aud-tag-2026',
        exp: Math.floor(Date.now() / 1000) + 3600
      };
      const headerB64 = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
      const payloadB64 = Buffer.from(JSON.stringify(validPayload)).toString('base64url');
      const dummySig = crypto.randomBytes(32).toString('base64url');
      const validJwt = `${headerB64}.${payloadB64}.${dummySig}`;

      const validRes = await client.get('/api/admin/stats', {
        headers: {
          'x-admin-key': adminKey,
          'cf-access-jwt-assertion': validJwt
        }
      });
      assert.assertStatus(validRes, 200);
      assert.strictEqual(validRes.data.success, true);
    } finally {
      process.env.CF_ACCESS_ENABLED = origCf || 'false';
      process.env.CF_ACCESS_AUD = origAud || '';
    }
  });

  test('TC-P3-05', 'Admin Lockout: Exponential Backoff rejects after 3 failed attempts with HTTP 429', async ({ client, env, assert }) => {
    const testAdminUser = `lockout_test_${Date.now()}`;

    // Fail 1
    const f1 = await client.post('/api/admin/login', { username: testAdminUser, password: 'wrong-password-1' });
    assert.assertStatus(f1, 401);

    // Fail 2
    const f2 = await client.post('/api/admin/login', { username: testAdminUser, password: 'wrong-password-2' });
    assert.assertStatus(f2, 401);

    // Fail 3 -> triggers exponential backoff lockout (15s)
    const f3 = await client.post('/api/admin/login', { username: testAdminUser, password: 'wrong-password-3' });
    assert.ok([401, 429].includes(f3.status));

    // Next request should encounter active lockout (HTTP 429)
    const f4 = await client.post('/api/admin/login', { username: testAdminUser, password: 'wrong-password-4' });
    assert.assertStatus(f4, 429);
    assert.ok(f4.headers['retry-after'], 'Retry-After header must be present on lockout');
    assert.assertHtmlContains(f4, 'Security Lockout');
  });

  test('TC-P3-06', 'Sensitive Action TOTP Re-Authentication: Order Refund & Bulk Export', async ({ client, env, assert }) => {
    const adminKey = process.env.ADMIN_SECRET_KEY || 'genrage_super_admin_secret_key_2026';
    const totpSecret = process.env.ADMIN_2FA_SECRET || 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

    // 1. Bulk Export without TOTP re-auth must be rejected with HTTP 403
    const unauthExport = await client.get('/api/admin/orders/export', {
      headers: { 'x-admin-key': adminKey }
    });
    assert.assertStatus(unauthExport, 403);
    assert.strictEqual(unauthExport.data.reauthRequired, true);

    // 2. Bulk Export with fresh valid TOTP passes
    const exportCode = totp.generateTotp(totpSecret);
    const authExport = await client.get('/api/admin/orders/export', {
      headers: {
        'x-admin-key': adminKey,
        'x-admin-totp': exportCode
      }
    });
    assert.assertStatus(authExport, 200);
    assert.strictEqual(authExport.data.success, true);
    assert.ok(Array.isArray(authExport.data.orders), 'Orders array should be returned');

    // 3. Order Refund without TOTP re-auth must be rejected with HTTP 403
    const catalogRes = await client.get('/api/products');
    const prod = catalogRes.data.products[0];
    const orderRes = await client.post('/api/orders', {
      items: [{ id: prod.id, name: prod.name, price: 1999, size: 'M', quantity: 1 }],
      customer: { name: 'Audit Customer', email: 'audit_refund@alleyrich.com', phone: '9876543210', address: '123 MG Road', city: 'Mumbai', state: 'Maharashtra', pincode: '400001' },
      paymentMethod: 'COD'
    });
    assert.assertStatus(orderRes, 201);
    const orderId = orderRes.data.id || orderRes.data.order?.id;

    // Attempt refund without TOTP
    const refundNoTotp = await client.put(`/api/orders/${orderId}`, {
      orderStatus: 'Refunded'
    }, {
      headers: { 'x-admin-key': adminKey }
    });
    assert.assertStatus(refundNoTotp, 403);
    assert.strictEqual(refundNoTotp.data.reauthRequired, true);

    // Provide valid TOTP for refund
    const refundCode = totp.generateTotp(totpSecret);
    const refundWithTotp = await client.put(`/api/orders/${orderId}`, {
      orderStatus: 'Refunded',
      totpCode: refundCode
    }, {
      headers: { 'x-admin-key': adminKey }
    });
    assert.assertStatus(refundWithTotp, 200);
    assert.strictEqual(refundWithTotp.data.order.orderStatus, 'Refunded');
  });

  test('TC-P3-07', 'Append-Only Audit Log: Verifies Event Recording & PII Masking', async ({ client, env, assert }) => {
    const adminKey = process.env.ADMIN_SECRET_KEY || 'genrage_super_admin_secret_key_2026';

    const auditRes = await client.get('/api/admin/audit-logs', {
      headers: { 'x-admin-key': adminKey }
    });
    assert.assertStatus(auditRes, 200);
    assert.strictEqual(auditRes.data.success, true);
    assert.ok(Array.isArray(auditRes.data.logs), 'Audit logs should be an array');

    // Check recent logs
    const logs = auditRes.data.logs;
    assert.ok(logs.length > 0, 'At least one audit log entry should exist from preceding tests');

    // Verify PII is masked (no raw emails or unmasked phones)
    for (const entry of logs.slice(0, 10)) {
      const detailsStr = JSON.stringify(entry.details || {});
      assert.ok(!detailsStr.includes('@alleyrich.com'), 'Raw emails must not appear in audit log details');
      assert.ok(!detailsStr.includes('9876543210'), 'Raw phone numbers must not appear in audit log details');
      if (entry.target_id && entry.target_id.includes('@')) {
        assert.ok(entry.target_id.includes('***'), 'Target email ID must be masked');
      }
    }
  });

  test('TC-P3-08', 'Marketing Hub: Explicit Consent, Confirmation Step & Rate Limit', async ({ client, env, assert }) => {
    const adminKey = process.env.ADMIN_SECRET_KEY || 'genrage_super_admin_secret_key_2026';
    const totpSecret = process.env.ADMIN_2FA_SECRET || 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
    const origBrevo = process.env.BREVO_API_KEY;
    const origResend = process.env.RESEND_API_KEY;

    try {
      // Disable outbound email network calls in test environment so tests complete instantly
      delete process.env.BREVO_API_KEY;
      delete process.env.RESEND_API_KEY;

      // 1. Dispatch broadcast without confirmed: true -> Must return requireConfirmation: true
      const code1 = totp.generateTotp(totpSecret);
      const estimateRes = await client.post('/api/admin/marketing/broadcast', {
        channel: 'email',
        subject: 'Drop Alert: Season 2',
        message: 'Exclusive early access is live now!',
        totpCode: code1
      }, {
        headers: { 'x-admin-key': adminKey }
      });
      assert.assertStatus(estimateRes, 200);
      assert.strictEqual(estimateRes.data.requireConfirmation, true);
      assert.ok(typeof estimateRes.data.eligibleRecipientsCount === 'number');

      // 2. Dispatch broadcast with confirmed: true and TOTP -> Executes
      const code2 = totp.generateTotp(totpSecret);
      const confirmRes = await client.post('/api/admin/marketing/broadcast', {
        channel: 'email',
        subject: 'Drop Alert: Season 2 Confirmed',
        message: 'Exclusive early access is live now!',
        confirmed: true,
        totpCode: code2
      }, {
        headers: { 'x-admin-key': adminKey }
      });
      assert.assertStatus(confirmRes, 200);
      assert.strictEqual(confirmRes.data.success, true);
      assert.ok(confirmRes.data.emailSentCount !== undefined);

      // 3. Immediately dispatch again -> Rate limited with HTTP 429
      const code3 = totp.generateTotp(totpSecret);
      const rateLimitRes = await client.post('/api/admin/marketing/broadcast', {
        channel: 'email',
        subject: 'Immediate Repeat Broadcast',
        message: 'Spam attempt',
        confirmed: true,
        totpCode: code3
      }, {
        headers: { 'x-admin-key': adminKey }
      });
      assert.assertStatus(rateLimitRes, 429);
      assert.ok(rateLimitRes.headers['retry-after']);
      assert.assertHtmlContains(rateLimitRes, 'rate limit');
    } finally {
      if (origBrevo) process.env.BREVO_API_KEY = origBrevo;
      if (origResend) process.env.RESEND_API_KEY = origResend;
    }
  });

});
