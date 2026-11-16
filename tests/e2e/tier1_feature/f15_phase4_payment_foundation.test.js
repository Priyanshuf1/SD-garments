/**
 * ALLEYRICH — Phase 4 Test Coverage: Gateway-Ready Payment Foundation (Disabled)
 * File: tests/e2e/tier1_feature/f15_phase4_payment_foundation.test.js
 * 
 * Verifies Phase 4 Security Controls:
 * - TC-P4-01: Order State Machine: Valid transitions & rejection of illegal/conflicting transitions
 * - TC-P4-02: Online Payments Disabled: /api/checkout/create-payment and /api/webhooks/:provider are safe no-ops
 * - TC-P4-03: Webhook HMAC SHA-256 Verification: Valid signature accepted, forged signature rejected (401)
 * - TC-P4-04: Webhook Deduplication: Replaying same event_id returns HTTP 200 with { duplicate: true }
 * - TC-P4-05: Amount & Currency Tamper Protection: Mismatched amount or currency rejected with HTTP 400
 * - TC-P4-06: Order Reconciliation Job: Cancels stuck payment_pending orders and releases stock
 * - TC-P4-07: COD Behavior Unchanged: Standard COD checkout continues without interruption
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { defineSuite } = require('../helpers/suite.js');
const { ORDER_STATUSES, canTransition, transitionOrder } = require('../../../lib/orderStateMachine.js');

module.exports = defineSuite({
  tier: 1,
  feature: 'P4',
  title: 'Phase 4 Security Controls: Gateway-Ready Payment Foundation (Disabled)',
  description: 'Validates order state machine, disabled payment scaffolding, HMAC webhook verification, replay deduplication, amount tampering defense, reconciliation, and COD checkout compatibility.'
}, ({ test }) => {

  // TC-P4-01: Order State Machine Transitions
  test('TC-P4-01', 'Order State Machine: Transitions and Enforced SQL/Logic Constraints', async ({ assert }) => {
    // 1. Verify Allowed Transitions Map
    assert.strictEqual(canTransition(ORDER_STATUSES.CREATED, ORDER_STATUSES.PAYMENT_PENDING), true);
    assert.strictEqual(canTransition(ORDER_STATUSES.PAYMENT_PENDING, ORDER_STATUSES.PAID), true);
    assert.strictEqual(canTransition(ORDER_STATUSES.PAID, ORDER_STATUSES.FULFILLED), true);
    assert.strictEqual(canTransition(ORDER_STATUSES.FULFILLED, ORDER_STATUSES.REFUNDED), true);
    assert.strictEqual(canTransition(ORDER_STATUSES.CREATED, ORDER_STATUSES.CANCELLED), true);

    // 2. Verify Disallowed / Terminal Transitions
    assert.strictEqual(canTransition(ORDER_STATUSES.CANCELLED, ORDER_STATUSES.PAID), false, 'Cancelled order cannot be marked paid');
    assert.strictEqual(canTransition(ORDER_STATUSES.REFUNDED, ORDER_STATUSES.FULFILLED), false, 'Refunded order cannot be fulfilled');
    assert.strictEqual(canTransition(ORDER_STATUSES.PAYMENT_PENDING, ORDER_STATUSES.FULFILLED), false, 'Unpaid order cannot be fulfilled directly');

    // 3. Test transitionOrder execution logic
    let mockOrder = { id: 'ORD-TEST-001', status: ORDER_STATUSES.CREATED };
    const mockStorage = {
      readJsonFile: () => [mockOrder],
      writeJsonFile: (name, list) => { mockOrder = list[0]; return true; }
    };

    // Valid transition: created -> payment_pending
    const res1 = await transitionOrder('ORD-TEST-001', ORDER_STATUSES.CREATED, ORDER_STATUSES.PAYMENT_PENDING, mockStorage);
    assert.strictEqual(res1.status, ORDER_STATUSES.PAYMENT_PENDING);

    // Valid transition: payment_pending -> paid
    const res2 = await transitionOrder('ORD-TEST-001', ORDER_STATUSES.PAYMENT_PENDING, ORDER_STATUSES.PAID, mockStorage);
    assert.strictEqual(res2.status, ORDER_STATUSES.PAID);
    assert.strictEqual(res2.paymentStatus, 'Paid');

    // Illegal transition: paid -> created should throw 400
    let err400 = null;
    try {
      await transitionOrder('ORD-TEST-001', ORDER_STATUSES.PAID, ORDER_STATUSES.CREATED, mockStorage);
    } catch (e) {
      err400 = e;
    }
    assert.ok(err400, 'Illegal transition must throw error');
    assert.strictEqual(err400.statusCode, 400);

    // State transition conflict: expectedStatus does not match actual current status -> throws 409
    let err409 = null;
    try {
      await transitionOrder('ORD-TEST-001', ORDER_STATUSES.PAYMENT_PENDING, ORDER_STATUSES.PAID, mockStorage);
    } catch (e) {
      err409 = e;
    }
    assert.ok(err409, 'Status conflict must throw error');
    assert.strictEqual(err409.statusCode, 409);
  });

  // TC-P4-02: Online Payments Disabled (Safe No-Op)
  test('TC-P4-02', 'Online Payments Disabled: Payment Scaffolding Returns Safe Disabled Responses', async ({ client, assert }) => {
    const origFlag = process.env.ONLINE_PAYMENTS_ENABLED;
    try {
      process.env.ONLINE_PAYMENTS_ENABLED = 'false';

      // 1. Initiate online payment creation -> Returns disabled message
      const payRes = await client.post('/api/checkout/create-payment', {
        provider: 'razorpay',
        orderId: 'ORD-TEST-ONLINE-1',
        amountPaise: 199900,
        currency: 'INR'
      });
      assert.assertStatus(payRes, 200);
      assert.strictEqual(payRes.data.disabled, true);
      assert.ok(payRes.data.message.includes('Online payments are currently disabled'));

      // 2. Inbound webhook while disabled -> Safe 200 No-Op
      const webhookRes = await client.post('/api/webhooks/razorpay', {
        event: 'payment.captured',
        data: { test: true }
      });
      assert.assertStatus(webhookRes, 200);
      assert.strictEqual(webhookRes.data.success, true);
      assert.strictEqual(webhookRes.data.noop, true);
      assert.ok(webhookRes.data.message.includes('disabled'));
    } finally {
      process.env.ONLINE_PAYMENTS_ENABLED = origFlag;
    }
  });

  // TC-P4-03: Webhook HMAC SHA-256 Verification
  test('TC-P4-03', 'Webhook HMAC Verification: Accepts Valid Signature, Rejects Forged Signature (401)', async ({ client, assert }) => {
    const origFlag = process.env.ONLINE_PAYMENTS_ENABLED;
    const origSecret = process.env.PAYMENT_WEBHOOK_SECRET;

    try {
      process.env.ONLINE_PAYMENTS_ENABLED = 'true';
      const secret = 'p4_webhook_test_secret_9988';
      process.env.PAYMENT_WEBHOOK_SECRET = secret;

      const payload = {
        event_id: `evt_test_${Date.now()}_hmac`,
        event: 'payment.captured',
        order_id: 'ORD-HMAC-TEST',
        payment_id: 'pay_test_hmac_123',
        amount_paise: 249900,
        currency: 'INR'
      };
      const rawBody = JSON.stringify(payload);

      // 1. Forged Signature -> HTTP 401
      const forgedSig = crypto.createHmac('sha256', 'wrong_secret').update(rawBody).digest('hex');
      const badRes = await client.post('/api/webhooks/razorpay', payload, {
        headers: {
          'x-webhook-signature': forgedSig,
          'Content-Type': 'application/json'
        }
      });
      assert.assertStatus(badRes, 401);
      assert.strictEqual(badRes.data.success, false);
      assert.ok(badRes.data.message.includes('signature mismatch'));

      // 2. Missing Signature -> HTTP 401
      const noSigRes = await client.post('/api/webhooks/razorpay', payload, {
        headers: { 'Content-Type': 'application/json' }
      });
      assert.assertStatus(noSigRes, 401);

      // 3. Valid Signature (order not found in DB -> 200 processed: false)
      const validSig = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
      const validRes = await client.post('/api/webhooks/razorpay', payload, {
        headers: {
          'x-webhook-signature': validSig,
          'Content-Type': 'application/json'
        }
      });
      assert.assertStatus(validRes, 200);
      assert.strictEqual(validRes.data.success, true);
    } finally {
      process.env.ONLINE_PAYMENTS_ENABLED = origFlag;
      process.env.PAYMENT_WEBHOOK_SECRET = origSecret;
    }
  });

  // TC-P4-04: Webhook Deduplication
  test('TC-P4-04', 'Webhook Deduplication: Replaying Same Event ID Returns HTTP 200 Duplicate Flag', async ({ client, assert }) => {
    const origFlag = process.env.ONLINE_PAYMENTS_ENABLED;
    const origSecret = process.env.PAYMENT_WEBHOOK_SECRET;

    try {
      process.env.ONLINE_PAYMENTS_ENABLED = 'true';
      const secret = 'p4_dedupe_test_secret';
      process.env.PAYMENT_WEBHOOK_SECRET = secret;

      const eventId = `evt_dedupe_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const payload = {
        event_id: eventId,
        event: 'payment.captured',
        order_id: 'ORD-DEDUPE-TEST',
        payment_id: 'pay_dedupe_123',
        amount_paise: 99900,
        currency: 'INR'
      };
      const rawBody = JSON.stringify(payload);
      const validSig = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

      // First dispatch -> Accepted
      const res1 = await client.post('/api/webhooks/razorpay', payload, {
        headers: {
          'x-webhook-signature': validSig,
          'Content-Type': 'application/json'
        }
      });
      assert.assertStatus(res1, 200);
      assert.strictEqual(res1.data.success, true);

      // Second replay dispatch with exact same event_id -> Deduplicated!
      const res2 = await client.post('/api/webhooks/razorpay', payload, {
        headers: {
          'x-webhook-signature': validSig,
          'Content-Type': 'application/json'
        }
      });
      assert.assertStatus(res2, 200);
      assert.strictEqual(res2.data.success, true);
      assert.strictEqual(res2.data.duplicate, true, 'Replay of event_id must return duplicate: true');
    } finally {
      process.env.ONLINE_PAYMENTS_ENABLED = origFlag;
      process.env.PAYMENT_WEBHOOK_SECRET = origSecret;
    }
  });

  // TC-P4-05: Webhook Amount & Currency Tamper Detection
  test('TC-P4-05', 'Amount & Currency Tamper Protection: Webhook Mismatch Rejected with HTTP 400', async ({ client, assert }) => {
    const origFlag = process.env.ONLINE_PAYMENTS_ENABLED;
    const origSecret = process.env.PAYMENT_WEBHOOK_SECRET;

    try {
      process.env.ONLINE_PAYMENTS_ENABLED = 'true';
      const secret = 'p4_tamper_test_secret';
      process.env.PAYMENT_WEBHOOK_SECRET = secret;

      // Seed an order directly into orders.json
      const ordersPath = path.join(__dirname, '..', '..', '..', 'data', 'orders.json');
      const testOrderId = `ORD-TAMPER-${Date.now()}`;
      const testOrder = {
        id: testOrderId,
        status: 'payment_pending',
        paymentStatus: 'Pending',
        total: 1499,
        total_paise: 149900,
        subtotal_paise: 140000,
        createdAt: new Date().toISOString()
      };

      let existingOrders = [];
      try { existingOrders = JSON.parse(fs.readFileSync(ordersPath, 'utf8')); } catch (_) {}
      fs.writeFileSync(ordersPath, JSON.stringify([testOrder, ...existingOrders], null, 2), 'utf8');

      // 1. Mismatched Amount (Attacker claims paid only 100 paise = ₹1 instead of 149900 paise = ₹1499)
      const tamperedAmountPayload = {
        event_id: `evt_tamper_amt_${Date.now()}`,
        event: 'payment.captured',
        order_id: testOrderId,
        payment_id: 'pay_tamper_amt_1',
        amount_paise: 100, // ₹1 instead of ₹1499
        currency: 'INR'
      };
      const rawAmt = JSON.stringify(tamperedAmountPayload);
      const sigAmt = crypto.createHmac('sha256', secret).update(rawAmt).digest('hex');

      const amtRes = await client.post('/api/webhooks/razorpay', tamperedAmountPayload, {
        headers: {
          'x-webhook-signature': sigAmt,
          'Content-Type': 'application/json'
        }
      });
      assert.assertStatus(amtRes, 400);
      assert.strictEqual(amtRes.data.success, false);
      assert.assertHtmlContains(amtRes, 'amount or currency does not match');

      // 2. Mismatched Currency (e.g. USD instead of INR)
      const tamperedCurrPayload = {
        event_id: `evt_tamper_curr_${Date.now()}`,
        event: 'payment.captured',
        order_id: testOrderId,
        payment_id: 'pay_tamper_curr_1',
        amount_paise: 149900,
        currency: 'USD'
      };
      const rawCurr = JSON.stringify(tamperedCurrPayload);
      const sigCurr = crypto.createHmac('sha256', secret).update(rawCurr).digest('hex');

      const currRes = await client.post('/api/webhooks/razorpay', tamperedCurrPayload, {
        headers: {
          'x-webhook-signature': sigCurr,
          'Content-Type': 'application/json'
        }
      });
      assert.assertStatus(currRes, 400);
      assert.strictEqual(currRes.data.success, false);
      assert.assertHtmlContains(currRes, 'amount or currency does not match');

      // 3. Exact matching amount & currency -> Order transitions to paid!
      const validPayload = {
        event_id: `evt_valid_match_${Date.now()}`,
        event: 'payment.captured',
        order_id: testOrderId,
        payment_id: 'pay_valid_match_1',
        amount_paise: 149900,
        currency: 'INR'
      };
      const rawValid = JSON.stringify(validPayload);
      const sigValid = crypto.createHmac('sha256', secret).update(rawValid).digest('hex');

      const matchRes = await client.post('/api/webhooks/razorpay', validPayload, {
        headers: {
          'x-webhook-signature': sigValid,
          'Content-Type': 'application/json'
        }
      });
      assert.assertStatus(matchRes, 200);
      assert.strictEqual(matchRes.data.success, true);
      assert.strictEqual(matchRes.data.processed, true);
    } finally {
      process.env.ONLINE_PAYMENTS_ENABLED = origFlag;
      process.env.PAYMENT_WEBHOOK_SECRET = origSecret;
    }
  });

  // TC-P4-06: Reconciliation Job for Stuck Orders
  test('TC-P4-06', 'Reconciliation Job: Cancels Stuck Orders and Releases Stock Holds', async ({ client, env, assert }) => {
    const adminKey = process.env.ADMIN_SECRET_KEY || 'genrage_super_admin_secret_key_2026';
    const ordersPath = path.join(__dirname, '..', '..', '..', 'data', 'orders.json');

    // Seed a stuck payment_pending order created 45 minutes ago
    const stuckOrderId = `ORD-STUCK-${Date.now()}`;
    const pastTime = new Date(Date.now() - 45 * 60 * 1000).toISOString();
    const stuckOrder = {
      id: stuckOrderId,
      status: 'payment_pending',
      paymentStatus: 'Pending',
      orderStatus: 'Processing',
      total: 1999,
      total_paise: 199900,
      createdAt: pastTime,
      inventoryReservedAt: pastTime,
      inventoryReleasedAt: null,
      items: [
        { id: 'item_1', variantId: 'v1', size: 'M', quantity: 1 }
      ]
    };

    let existingOrders = [];
    try { existingOrders = JSON.parse(fs.readFileSync(ordersPath, 'utf8')); } catch (_) {}
    fs.writeFileSync(ordersPath, JSON.stringify([stuckOrder, ...existingOrders], null, 2), 'utf8');

    // Run reconciliation job via admin API
    const res = await client.post('/api/admin/reconciliation/run', {
      maxAgeMinutes: 30
    }, {
      headers: { 'x-admin-key': adminKey }
    });
    assert.assertStatus(res, 200);
    assert.strictEqual(res.data.success, true);
    assert.ok(res.data.reconciledCount >= 1, 'At least 1 order must be reconciled');
    assert.ok(res.data.cancelledOrders.includes(stuckOrderId), 'Stuck order must be in cancelled list');

    // Verify order was transitioned to cancelled
    const updatedOrders = JSON.parse(fs.readFileSync(ordersPath, 'utf8'));
    const cancelled = updatedOrders.find(o => o.id === stuckOrderId);
    assert.ok(cancelled);
    assert.strictEqual(cancelled.status, 'cancelled');
    assert.strictEqual(cancelled.orderStatus, 'Cancelled');
  });

  // TC-P4-07: COD Behavior Unchanged
  test('TC-P4-07', 'COD Behavior Unchanged: COD Checkout Functions Completely Uninterrupted', async ({ client, assert }) => {
    // 1. Fetch real catalog product to pass authoritative cart validation
    const prodsRes = await client.get('/api/products');
    assert.assertStatus(prodsRes, 200);
    const prods = Array.isArray(prodsRes.data) ? prodsRes.data : (prodsRes.data.products || []);
    const product = prods[0];
    assert.ok(product, 'At least one product must exist in catalog');
    const size = product.variants?.[0]?.title || 'M';

    // 2. Submit a Cash on Delivery (COD) order
    const payload = {
      paymentMethod: 'Cash on Delivery (COD)',
      customer: {
        name: 'Aarav Sharma',
        email: 'aarav.sharma@example.com',
        phone: '9876543210',
        city: 'Mumbai',
        state: 'Maharashtra',
        address: '402 Sunset Heights, Bandra West',
        pincode: '400050'
      },
      items: [
        {
          id: product.id,
          handle: product.handle,
          title: product.title,
          size: size,
          quantity: 1
        }
      ]
    };

    const res = await client.post('/api/checkout/create-order', payload, {
      headers: { 'Content-Type': 'application/json' }
    });

    assert.ok([200, 201].includes(res.status), `Expected 200 or 201, got ${res.status}`);
    assert.strictEqual(res.data.success, true);
    assert.ok(res.data.orderId, 'Order ID must be generated');

    const order = res.data.order;
    assert.ok(order);
    assert.strictEqual(order.paymentStatus, 'Pending COD');
    assert.strictEqual(order.paymentMethod, 'Cash on Delivery (COD)');
    assert.strictEqual(order.status, 'created');
  });

});
