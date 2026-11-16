/**
 * ALLEYRICH — Phase 5 Test Coverage: COD Risk (Shadow Mode First)
 * File: tests/e2e/tier1_feature/f16_phase5_cod_risk.test.js
 * 
 * Verifies Phase 5 Security Controls:
 * - TC-P5-01: Pincode / City Mismatch Heuristic (Pan-India matrix)
 * - TC-P5-02: Junk Address Heuristics (repetitive patterns, keyboard mash, short addresses)
 * - TC-P5-03: Prior RTO History by Phone Number
 * - TC-P5-04: Order Velocity and High Cart Value Thresholds
 * - TC-P5-05: Shadow Mode Operation: Logs score & reasons with zero checkout impact
 * - TC-P5-06: Enforce Mode Operation: Surcharge / confirmation / limits applied
 * - TC-P5-07: Phone / WhatsApp Confirmation Hook & POST /api/orders/confirm-cod
 * - TC-P5-08: Reconciliation Auto-Cancel for Expired Unconfirmed COD Orders
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { defineSuite } = require('../helpers/suite.js');
const codRisk = require('../../../lib/codRisk.js');

module.exports = defineSuite({
  tier: 1,
  feature: 'P5',
  title: 'Phase 5 Security Controls: COD Risk Engine (Shadow Mode First)',
  description: 'Validates pincode-city mismatch, junk address detection, prior RTO history, order velocity, shadow vs enforce modes, and phone confirmation hooks.'
}, ({ test }) => {

  async function getCatalogProduct(client) {
    const res = await client.get('/api/products');
    const prods = Array.isArray(res.data) ? res.data : (res.data.products || []);
    const inStock = prods.find(p => p.variants && p.variants.some(v => v.available !== false && (v.inventory_quantity === undefined || v.inventory_quantity > 5)));
    const product = inStock || prods[0];
    const variant = (product.variants && product.variants.find(v => v.available !== false && (v.inventory_quantity === undefined || v.inventory_quantity > 0))) || product.variants?.[0];
    return {
      product,
      size: variant?.title || 'M'
    };
  }

  // TC-P5-01: Pincode / City Mismatch Heuristic
  test('TC-P5-01', 'Pincode / City Mismatch Heuristic: Detects Inconsistent Postal Circles', async ({ assert }) => {
    // 1. Obvious Mismatch: Delhi PIN (110001) with Mumbai city
    const badMatch = codRisk.evaluatePincodeCityMismatch('110001', 'Mumbai', 'Maharashtra');
    assert.strictEqual(badMatch.mismatch, true, 'Delhi pincode with Mumbai city must trigger mismatch');
    assert.ok(badMatch.reason.includes('conflicts with entered city'));

    // 2. Obvious Mismatch: Bengaluru PIN (560001) with Kolkata city
    const badMatch2 = codRisk.evaluatePincodeCityMismatch('560001', 'Kolkata', 'West Bengal');
    assert.strictEqual(badMatch2.mismatch, true, 'Karnataka pincode with Kolkata city must trigger mismatch');

    // 3. Valid Match: Mumbai PIN (400050) with Mumbai city
    const goodMatch1 = codRisk.evaluatePincodeCityMismatch('400050', 'Mumbai', 'Maharashtra');
    assert.strictEqual(goodMatch1.mismatch, false, 'Matching pincode and city must not trigger mismatch');

    // 4. Valid Match: Bengaluru PIN (560038) with Bengaluru city
    const goodMatch2 = codRisk.evaluatePincodeCityMismatch('560038', 'Bengaluru', 'Karnataka');
    assert.strictEqual(goodMatch2.mismatch, false);
  });

  // TC-P5-02: Junk Address Heuristics
  test('TC-P5-02', 'Junk Address Heuristics: Detects Gibberish, Short and Repetitive Addresses', async ({ assert }) => {
    // 1. Short address (< 10 chars)
    const short = codRisk.evaluateJunkAddress('Home');
    assert.strictEqual(short.isJunk, true);
    assert.ok(short.reason.includes('too short'));

    // 2. Repetitive characters (e.g. "aaaaa", "111111")
    const rep = codRisk.evaluateJunkAddress('House 11111111 Street X');
    assert.strictEqual(rep.isJunk, true);
    assert.ok(rep.reason.includes('Repetitive character sequence'));

    // 3. Dummy / placeholder keyword
    const dummy = codRisk.evaluateJunkAddress('This is a test test dummy address');
    assert.strictEqual(dummy.isJunk, true);
    assert.ok(dummy.reason.includes('dummy/test token'));

    // 4. Clean legitimate address passes cleanly
    const legitimate = codRisk.evaluateJunkAddress('Flat 402, Sunset Heights, 14th Road, Bandra West');
    assert.strictEqual(legitimate.isJunk, false, 'Valid address must pass junk check');
  });

  // TC-P5-03: Prior RTO History by Phone
  test('TC-P5-03', 'Prior RTO History: Flags Repeat RTO Phone Numbers', async ({ assert }) => {
    const testPhone = '9876543210';
    const mockOrders = [
      { id: 'ORD-HIST-1', customer: { phone: testPhone }, orderStatus: 'Delivered', paymentStatus: 'Paid' },
      { id: 'ORD-HIST-2', customer: { phone: testPhone }, orderStatus: 'RTO', paymentStatus: 'Pending COD' },
      { id: 'ORD-HIST-3', customer: { phone: '9111111111' }, orderStatus: 'RTO', paymentStatus: 'Pending COD' }
    ];

    const rtoCheck = codRisk.evaluatePriorRto(testPhone, mockOrders);
    assert.strictEqual(rtoCheck.rtoCount, 1, 'Should find exactly 1 prior RTO for this phone');
    assert.strictEqual(rtoCheck.rtoOrders[0], 'ORD-HIST-2');

    // Clean phone number has 0 RTOs
    const cleanCheck = codRisk.evaluatePriorRto('9999999999', mockOrders);
    assert.strictEqual(cleanCheck.rtoCount, 0);
  });

  // TC-P5-04: High Cart Value and Order Velocity Tracking
  test('TC-P5-04', 'Order Velocity & Cart Value: Calculates Multi-Signal Risk Score', async ({ assert }) => {
    const testPhone = '9820098200';
    const now = Date.now();
    const recentOrders = [
      { id: 'ORD-V1', customer: { phone: testPhone }, createdAt: new Date(now - 5 * 60 * 1000).toISOString() },
      { id: 'ORD-V2', customer: { phone: testPhone }, createdAt: new Date(now - 10 * 60 * 1000).toISOString() }
    ];

    // High velocity + High Cart Value (₹12,000)
    const assessment = codRisk.evaluateCodRisk({
      customer: {
        name: 'Rohan Mehta',
        phone: testPhone,
        pincode: '400050',
        city: 'Mumbai',
        state: 'Maharashtra',
        address: '402 Sunset Heights, Bandra West'
      },
      total: 12000,
      pastOrders: recentOrders
    });

    assert.ok(assessment.score >= 50, `Expected score >= 50, got ${assessment.score}`);
    assert.ok(assessment.reasons.includes('MODERATE_ORDER_VELOCITY'));
    assert.ok(assessment.reasons.includes('CRITICAL_CART_VALUE'));
  });

  // TC-P5-05: Shadow Mode Operation
  test('TC-P5-05', 'Shadow Mode: Stores Risk Score & Reasons With Zero Checkout Impact', async ({ client, assert }) => {
    const origMode = process.env.COD_RISK_MODE;
    try {
      process.env.COD_RISK_MODE = 'shadow';

      const { product, size } = await getCatalogProduct(client);

      // Submit COD order with intentional mismatch and dummy address
      const payload = {
        paymentMethod: 'Cash on Delivery (COD)',
        customer: {
          name: 'Shadow Tester',
          email: 'shadow.test@example.com',
          phone: '9876543210',
          city: 'Mumbai', // Mismatch with 110001 (Delhi)
          state: 'Maharashtra',
          address: 'House aaaaa111111 test test dummy', // Junk address
          pincode: '110001'
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

      assert.assertStatus(res, 201);
      assert.strictEqual(res.data.success, true);

      const order = res.data.order;
      assert.ok(order);
      assert.strictEqual(order.cod_risk_mode, 'shadow');
      assert.ok(order.cod_risk_score >= 60, `Score should be >= 60 in shadow mode, got ${order.cod_risk_score}`);
      assert.ok(Array.isArray(order.cod_risk_reasons));
      assert.ok(order.cod_risk_reasons.includes('PINCODE_CITY_MISMATCH'));
      assert.ok(order.cod_risk_reasons.includes('JUNK_ADDRESS_DETECTED'));

      // In shadow mode, COD checkout is NOT blocked and no unauthorized surcharge is added
      assert.strictEqual(order.paymentStatus, 'Pending COD');
    } finally {
      process.env.COD_RISK_MODE = origMode;
    }
  });

  // TC-P5-06: Enforce Mode Operation
  test('TC-P5-06', 'Enforce Mode: Applies Risk Policy (Fee, Limits, Confirmation)', async ({ client, assert }) => {
    const origMode = process.env.COD_RISK_MODE;
    const origSurcharge = process.env.COD_RISK_SURCHARGE_PAISE;

    try {
      process.env.COD_RISK_MODE = 'enforce';
      process.env.COD_RISK_SURCHARGE_PAISE = '9900'; // ₹99 surcharge

      const { product, size } = await getCatalogProduct(client);

      // Submit order that triggers medium risk (pincode mismatch only -> score 35)
      const payload = {
        paymentMethod: 'Cash on Delivery (COD)',
        customer: {
          name: 'Enforce Tester',
          email: 'enforce.test@example.com',
          phone: '9876543210',
          city: 'Mumbai',
          state: 'Maharashtra',
          address: 'Flat 101, Palm Court, Link Road', // Good address
          pincode: '110001' // Mismatched pincode -> triggers ADD_COD_FEE in enforce mode
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

      assert.assertStatus(res, 201);
      assert.strictEqual(res.data.success, true);

      const order = res.data.order;
      assert.strictEqual(order.cod_risk_mode, 'enforce');
      assert.strictEqual(order.cod_risk_action, 'ADD_COD_FEE');
      // Surcharge of ₹99 was applied to COD fee
      assert.strictEqual(order.codFee, 99);
    } finally {
      process.env.COD_RISK_MODE = origMode;
      process.env.COD_RISK_SURCHARGE_PAISE = origSurcharge;
    }
  });

  // TC-P5-07: Phone / WhatsApp Confirmation Hook
  test('TC-P5-07', 'COD Phone Confirmation Hook: Verifies Code via POST /api/orders/confirm-cod', async ({ client, assert }) => {
    const ordersPath = path.join(__dirname, '..', '..', '..', 'data', 'orders.json');
    const orderId = `ORD-CONFIRM-${Date.now()}`;
    const code = '784912';
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');

    const testOrder = {
      id: orderId,
      customer: { phone: '9876543210', name: 'Test User' },
      paymentStatus: 'Pending COD Confirmation',
      orderStatus: 'Processing',
      cod_confirmed: false,
      cod_confirmation_code_hash: codeHash,
      cod_confirmation_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString()
    };

    let existingOrders = [];
    try { existingOrders = JSON.parse(fs.readFileSync(ordersPath, 'utf8')); } catch (_) {}
    fs.writeFileSync(ordersPath, JSON.stringify([testOrder, ...existingOrders], null, 2), 'utf8');

    // 1. Submit incorrect confirmation code -> HTTP 400
    const badRes = await client.post('/api/orders/confirm-cod', {
      orderId,
      confirmationCode: '000000'
    });
    assert.assertStatus(badRes, 400);
    assert.strictEqual(badRes.data.success, false);
    assert.ok(badRes.data.message.includes('Invalid confirmation code'));

    // 2. Submit correct confirmation code -> HTTP 200, marks confirmed
    const goodRes = await client.post('/api/orders/confirm-cod', {
      orderId,
      confirmationCode: code
    });
    assert.assertStatus(goodRes, 200);
    assert.strictEqual(goodRes.data.success, true);
    assert.strictEqual(goodRes.data.order.cod_confirmed, true);
    assert.strictEqual(goodRes.data.order.paymentStatus, 'Pending COD');
  });

  // TC-P5-08: Reconciliation Auto-Cancel for Expired Unconfirmed COD Orders
  test('TC-P5-08', 'Reconciliation: Auto-Cancels Expired Unconfirmed COD Orders', async ({ client, assert }) => {
    const adminKey = process.env.ADMIN_SECRET_KEY || 'genrage_super_admin_secret_key_2026';
    const ordersPath = path.join(__dirname, '..', '..', '..', 'data', 'orders.json');

    const expiredCodOrderId = `ORD-EXPIRED-COD-${Date.now()}`;
    const pastTime = new Date(Date.now() - 75 * 60 * 1000).toISOString(); // 75 mins ago

    const expiredOrder = {
      id: expiredCodOrderId,
      status: 'created',
      paymentStatus: 'Pending COD Confirmation',
      orderStatus: 'Processing',
      cod_confirmed: false,
      total: 1899,
      total_paise: 189900,
      createdAt: pastTime,
      inventoryReservedAt: pastTime,
      inventoryReleasedAt: null,
      items: [{ id: 'item_exp_1', quantity: 1 }]
    };

    let existingOrders = [];
    try { existingOrders = JSON.parse(fs.readFileSync(ordersPath, 'utf8')); } catch (_) {}
    fs.writeFileSync(ordersPath, JSON.stringify([expiredOrder, ...existingOrders], null, 2), 'utf8');

    // Trigger reconciliation job
    const reconRes = await client.post('/api/admin/reconciliation/run', {
      maxAgeMinutes: 60
    }, {
      headers: { 'x-admin-key': adminKey }
    });

    assert.assertStatus(reconRes, 200);
    assert.strictEqual(reconRes.data.success, true);
    assert.ok(reconRes.data.cancelledOrders.includes(expiredCodOrderId), 'Expired unconfirmed COD order must be cancelled');

    const updatedOrders = JSON.parse(fs.readFileSync(ordersPath, 'utf8'));
    const cancelled = updatedOrders.find(o => o.id === expiredCodOrderId);
    assert.ok(cancelled);
    assert.strictEqual(cancelled.status, 'cancelled');
    assert.strictEqual(cancelled.orderStatus, 'Cancelled');
  });

});
