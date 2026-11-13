/**
 * ALLEYRICH — Tier 1 Feature Coverage: Feature F11
 * File: tests/e2e/tier1_feature/f11_session_state.test.js
 * 
 * Tests for Active Cart & Session Persistence:
 * - TC-T1-F11-01: Admin Session Creation on Login (ar_adm_ token format and session validation)
 * - TC-T1-F11-02: Admin Session Revocation on Logout (POST /api/admin/logout revokes session, 401 on reuse)
 * - TC-T1-F11-03: Customer Cloud Cart Sync Save (POST /api/cart/sync stores cart under customer session)
 * - TC-T1-F11-04: Customer Cloud Cart Sync Retrieve (GET /api/cart/sync retrieves saved customer cart)
 * - TC-T1-F11-05: Cashfree Webhook Idempotency Lock (Duplicate webhook events return duplicate: true / lock)
 */

'use strict';

const { defineSuite } = require('../helpers/suite.js');
const security = require('../../../lib/security.js');
const redis = require('../../../lib/redis.js');

module.exports = defineSuite({
  tier: 1,
  feature: 'F11',
  title: 'Feature 11 Coverage: Active Cart & Session Persistence',
  description: 'Verifies admin 12-hour session lifecycle, logout revocation, customer cloud cart sync, and webhook idempotency locking.'
}, ({ test }) => {

  test('TC-T1-F11-01', 'Admin Session Creation on Login: Generates ar_adm_ token with 12-hour validity and authorizes admin endpoints', async ({ client, assert }) => {
    // 1. Generate an admin session
    const adminSession = security.createAdminSession('admin');
    assert.ok(adminSession && adminSession.token, 'Admin session token must be generated');
    assert.match(adminSession.token, /^ar_adm_[a-f0-9]{64}$/, 'Token must follow ar_adm_ format with 64 hex chars');

    // 2. Validate session via security module
    const validated = security.validateAdminSession(adminSession.token);
    assert.ok(validated, 'Session must validate successfully');
    assert.strictEqual(validated.username, 'admin');

    // 3. Test authorizing an admin API endpoint with x-admin-token header
    const statsRes = await client.get('/api/admin/stats', {
      headers: {
        'x-admin-token': adminSession.token,
        'Accept': 'application/json'
      }
    });
    assert.assertStatus(statsRes, 200);
    assert.strictEqual(statsRes.data.success, true);
  });

  test('TC-T1-F11-02', 'Admin Session Revocation on Logout: POST /api/admin/logout revokes session token and prevents further access', async ({ client, assert }) => {
    // 1. Create a fresh admin session
    const session = security.createAdminSession('admin_logout_test');
    const token = session.token;

    // Verify it works initially
    const beforeRes = await client.get('/api/admin/stats', {
      headers: { 'x-admin-token': token }
    });
    assert.assertStatus(beforeRes, 200);

    // 2. Execute logout
    const logoutRes = await client.post('/api/admin/logout', {}, {
      headers: { 'x-admin-token': token }
    });
    assert.assertStatus(logoutRes, 200);
    assert.strictEqual(logoutRes.data.success, true);

    // 3. Verify session is revoked locally
    const validAfter = security.validateAdminSession(token);
    assert.strictEqual(Boolean(validAfter), false, 'Session must be falsy after revocation');

    // 4. Verify subsequent administrative call returns 401 Unauthorized
    const afterRes = await client.get('/api/admin/stats', {
      headers: { 'x-admin-token': token }
    });
    assert.assertStatus(afterRes, 401);
    assert.strictEqual(afterRes.data.success, false);
  });

  test('TC-T1-F11-03', 'Customer Cloud Cart Sync Save: POST /api/cart/sync saves active cart state for authenticated customer', async ({ client, assert }) => {
    const ts = Date.now();
    const customerId = `cust_e2e_${ts}`;
    const customerEmail = `customer_${ts}@sdgarments.in`;
    const customerToken = security.createCustomerSession(customerId, customerEmail);

    const cartPayload = [
      { id: '1792792091289', handle: 'raw-essentials-minimal-balloon-pant', quantity: 2, size: 'L' },
      { id: '1792792091276', handle: 'cyberpunk-oversized-heavy-hoodie', quantity: 1, size: 'M' }
    ];

    const res = await client.post('/api/cart/sync', { cart: cartPayload }, {
      headers: {
        'Authorization': `Bearer ${customerToken}`,
        'Content-Type': 'application/json'
      }
    });

    assert.assertStatus(res, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.count, 2);
    assert.strictEqual(res.data.cart.length, 2);
  });

  test('TC-T1-F11-04', 'Customer Cloud Cart Sync Retrieve: GET /api/cart/sync fetches persisted customer cart across sessions', async ({ client, assert }) => {
    const ts = Date.now();
    const customerId = `cust_retrieve_${ts}`;
    const customerEmail = `customer_ret_${ts}@sdgarments.in`;
    const customerToken = security.createCustomerSession(customerId, customerEmail);

    const cartPayload = [
      { id: '1792792091289', handle: 'raw-essentials-minimal-balloon-pant', quantity: 3, size: 'XL' }
    ];

    // Save cart
    await client.post('/api/cart/sync', { cart: cartPayload }, {
      headers: {
        'Authorization': `Bearer ${customerToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Retrieve cart using new request
    const getRes = await client.get('/api/cart/sync', {
      headers: {
        'Authorization': `Bearer ${customerToken}`
      }
    });

    assert.assertStatus(getRes, 200);
    assert.strictEqual(getRes.data.success, true);
    assert.strictEqual(getRes.data.count, 1);
    assert.strictEqual(getRes.data.cart[0].handle, 'raw-essentials-minimal-balloon-pant');
    assert.strictEqual(getRes.data.cart[0].quantity, 3);
  });

  test('TC-T1-F11-05', 'Cashfree Webhook Idempotency Lock: Prevents duplicate webhook event replay via distributed lock', async ({ assert }) => {
    const eventId = `evt_idemp_test_${Date.now()}`;

    // 1. First event processing -> allowed
    const firstAllowed = await redis.checkWebhookIdempotency(eventId);
    assert.strictEqual(firstAllowed, true, 'First webhook event must be allowed');

    // 2. Duplicate event submission -> rejected by idempotency lock
    const secondAllowed = await redis.checkWebhookIdempotency(eventId);
    assert.strictEqual(secondAllowed, false, 'Duplicate webhook event must be blocked');

    // Clean up
    await redis.clearWebhookIdempotency(eventId);
    const afterClear = await redis.checkWebhookIdempotency(eventId);
    assert.strictEqual(afterClear, true, 'Event must be allowed after clearing lock');
    await redis.clearWebhookIdempotency(eventId);
  });

});
