/**
 * ALLEYRICH — Tier 2 Boundary & Corner Case Tests: Feature F11
 * File: tests/e2e/tier2_boundary/f11_session_state_bva.test.js
 * 
 * Boundary Value Analysis (BVA) for Active Cart & Session Persistence:
 * - TC-T2-F11-01: Expired admin session token rejection (HTTP 401)
 * - TC-T2-F11-02: Unauthenticated cart sync barrier (HTTP 401)
 * - TC-T2-F11-03: Oversized cart payload clamping (max 100 items)
 * - TC-T2-F11-04: Malformed cart structure fallback ({ cart: "not-an-array" })
 * - TC-T2-F11-05: Customer session cryptographic tampering / IDOR protection
 */

'use strict';

const { defineSuite } = require('../helpers/suite.js');

module.exports = defineSuite({
  tier: 2,
  feature: 'F11',
  title: 'Feature 11 Boundary & Corner Cases: Active Cart & Session State',
  description: 'Validates session expiration, unauthenticated sync rejection, payload clamping to 100 items, and HMAC session integrity.'
}, ({ test }) => {

  test('TC-T2-F11-01', 'Expired Admin Session: Rejects expired session tokens with HTTP 401', async ({ client, assert }) => {
    // Send admin request with an expired/invalid admin token format
    const expiredToken = `ar_adm_${'0'.repeat(64)}`;
    const res = await client.get('/api/admin/stats', {
      headers: {
        'x-admin-token': expiredToken
      }
    });

    assert.assertStatus(res, 401);
    assert.strictEqual(res.data.success, false);
    assert.assertHtmlContains(res, 'Administrator authentication required');
  });

  test('TC-T2-F11-02', 'Unauthenticated Cart Sync: Rejects unauthenticated sync requests with HTTP 401', async ({ client, assert }) => {
    // 1. POST /api/cart/sync without Authorization header
    const postRes = await client.post('/api/cart/sync', {
      cart: [{ id: '1', quantity: 1 }]
    });
    assert.assertStatus(postRes, 401);
    assert.strictEqual(postRes.data.success, false);
    assert.strictEqual(postRes.data.message, 'Not authenticated');

    // 2. GET /api/cart/sync without Authorization header
    const getRes = await client.get('/api/cart/sync');
    assert.assertStatus(getRes, 401);
    assert.strictEqual(getRes.data.success, false);
    assert.strictEqual(getRes.data.message, 'Not authenticated');
  });

  test('TC-T2-F11-03', 'Oversized Cart Clamping: Clamps carts with >100 items to exact 100 item ceiling', async ({ client, assert }) => {
    const security = require('../../../lib/security.js');

    // Create a valid signed customer session
    const customerToken = security.createCustomerSession('cust_test_100', 'clamp_test@sdgarments.in');
    assert.ok(customerToken.startsWith('ar_usr.'), 'Customer token must have ar_usr prefix');

    // Generate payload with 150 cart items
    const largeCart = Array.from({ length: 150 }, (_, i) => ({
      id: `item_${i + 1}`,
      title: `Apparel Item ${i + 1}`,
      quantity: 1,
      price: 999
    }));

    const res = await client.post('/api/cart/sync', {
      cart: largeCart
    }, {
      headers: {
        'Authorization': `Bearer ${customerToken}`
      }
    });

    assert.assertStatus(res, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.count, 100, 'Count must be clamped to maximum 100 items');
    assert.strictEqual(res.data.cart.length, 100, 'Cart array must have exactly 100 items');
  });

  test('TC-T2-F11-04', 'Malformed Cart Structure: Gracefully defaults non-array payloads to empty cart', async ({ client, assert }) => {
    const security = require('../../../lib/security.js');
    const customerToken = security.createCustomerSession('cust_test_malformed', 'malformed_test@sdgarments.in');

    const res = await client.post('/api/cart/sync', {
      cart: 'not_an_array_string_corrupted'
    }, {
      headers: {
        'Authorization': `Bearer ${customerToken}`
      }
    });

    assert.assertStatus(res, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.count, 0, 'Malformed cart payload must yield 0 items');
    assert.deepStrictEqual(res.data.cart, [], 'Cart must fall back to empty array');
  });

  test('TC-T2-F11-05', 'Cryptographic Session Tampering: Forged claims or altered signatures return null/401', async ({ client, assert }) => {
    const security = require('../../../lib/security.js');

    // 1. Generate valid session for User A
    const legitimateToken = security.createCustomerSession('victim_user_1', 'victim@sdgarments.in');
    const validated = security.validateCustomerSession(legitimateToken);
    assert.ok(validated, 'Legitimate token must validate');
    assert.strictEqual(validated.sub, 'victim_user_1');

    // 2. Tamper with the claims payload to impersonate User B
    const parts = legitimateToken.split('.');
    const decodedClaims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    decodedClaims.sub = 'attacker_compromised_id';
    decodedClaims.email = 'attacker@evil.com';
    const forgedClaimsPart = Buffer.from(JSON.stringify(decodedClaims)).toString('base64url');

    // Reconstruct token with original signature (signature mismatch)
    const forgedToken = `ar_usr.${forgedClaimsPart}.${parts[2]}`;

    // Validate using security module
    const forgedValidation = security.validateCustomerSession(forgedToken);
    assert.strictEqual(forgedValidation, null, 'Tampered token signature mismatch must return null');

    // 3. Test HTTP request with forged token
    const res = await client.get('/api/cart/sync', {
      headers: {
        'Authorization': `Bearer ${forgedToken}`
      }
    });
    assert.assertStatus(res, 401);
    assert.strictEqual(res.data.success, false);
    assert.strictEqual(res.data.message, 'Not authenticated');
  });

});
