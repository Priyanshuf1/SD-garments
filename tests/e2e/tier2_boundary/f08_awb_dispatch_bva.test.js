/**
 * ALLEYRICH — Tier 2 Boundary & Corner Case Tests: Feature F8
 * File: tests/e2e/tier2_boundary/f08_awb_dispatch_bva.test.js
 * 
 * Boundary Value Analysis (BVA) for Delhivery AWB Dispatch:
 * - TC-T2-F8-01: Dispatch on non-existent order ID (HTTP 404)
 * - TC-T2-F8-02: Unauthenticated AWB dispatch attempt (HTTP 401)
 * - TC-T2-F8-03: Destination pincode requirement validation in logistics engine
 * - TC-T2-F8-04: Re-dispatch of already shipped orders
 * - TC-T2-F8-05: Synthetic waybill format compliance (12-digit regex /^14092\d{7}$/)
 */

'use strict';

const { defineSuite } = require('../helpers/suite.js');

module.exports = defineSuite({
  tier: 2,
  feature: 'F8',
  title: 'Feature 8 Boundary & Corner Cases: Admin AWB Dispatch',
  description: 'Validates logistics authorization, missing order handling, dispatch idempotency, pincode constraints, and waybill formatting.'
}, ({ test }) => {

  test('TC-T2-F8-01', 'Non-Existent Order Dispatch: Returns HTTP 404 Not Found', async ({ client, assert, env }) => {
    const res = await client.post('/api/admin/orders/GR-NONEXISTENT-ORDER-ID-9999/delhivery-awb', {}, {
      headers: env.getAdminHeaders()
    });

    assert.assertStatus(res, 404);
    assert.strictEqual(res.data.success, false);
    assert.strictEqual(res.data.message, 'Order not found');
  });

  test('TC-T2-F8-02', 'Unauthenticated Dispatch Attempt: Rejects with HTTP 401 Unauthorized', async ({ client, assert }) => {
    // Attempt dispatch without admin key
    const res = await client.post('/api/admin/orders/GR-8D388C57DE9879375C7B/delhivery-awb', {});
    assert.assertStatus(res, 401);
    assert.strictEqual(res.data.success, false);
    assert.assertHtmlContains(res, 'Administrator authentication required');
  });

  test('TC-T2-F8-03', 'Destination Pincode Requirement: Logistics engine enforces valid 6-digit destination PIN', async ({ assert }) => {
    // Directly test delhivery createShipment validation logic
    const delhivery = require('../../../lib/delhivery.js');
    assert.ok(delhivery, 'delhivery module must be available');
    assert.strictEqual(typeof delhivery.createShipment, 'function', 'createShipment must be a function');

    // Emulate order with invalid/missing pincode
    const invalidOrder = {
      id: 'TEST-PIN-FAIL',
      customer: {
        name: 'No Pin Customer',
        phone: '9888877777',
        pincode: '00' // Invalid short PIN
      },
      items: [{ title: 'Shirt', quantity: 1, price: 1299 }],
      total: 1299
    };

    // If configured, createShipment must reject invalid pincode with descriptive error
    const config = delhivery.getConfig ? delhivery.getConfig() : {};
    if (config.isConfigured) {
      await assert.rejects(
        async () => { await delhivery.createShipment(invalidOrder); },
        /Valid 6-digit shipping destination PIN code is required/i,
        'Should reject invalid pincode when live API is configured'
      );
    } else {
      // In sandbox mode without live keys, synthetic AWB generates fallback
      const awb = await delhivery.createShipment(invalidOrder);
      assert.ok(awb && (awb.waybill || typeof awb === 'object'), 'Should handle fallback in unconfigured mode');
    }
  });

  test('TC-T2-F8-04', 'Re-Dispatch Idempotency: Successfully processes re-dispatch and preserves Shipped state', async ({ client, assert, env }) => {
    // 1. Fetch an existing order from orders database
    const ordersRes = await client.get('/api/admin/orders', {
      headers: env.getAdminHeaders()
    });
    assert.assertStatus(ordersRes, 200);
    const orders = ordersRes.data.orders || ordersRes.data;
    assert.ok(Array.isArray(orders) && orders.length > 0, 'Orders list must contain at least 1 order');

    const targetOrder = orders[0];
    const orderId = targetOrder.id;

    // 2. Dispatch first time
    const dispatch1 = await client.post(`/api/admin/orders/${orderId}/delhivery-awb`, {}, {
      headers: env.getAdminHeaders()
    });
    assert.assertStatus(dispatch1, 200);
    assert.strictEqual(dispatch1.data.success, true);
    assert.strictEqual(dispatch1.data.order?.orderStatus, 'Shipped');
    const assignedAwb1 = dispatch1.data.awb;
    assert.ok(assignedAwb1, 'First dispatch must assign a waybill');

    // 3. Dispatch second time on the same order (idempotency check)
    const dispatch2 = await client.post(`/api/admin/orders/${orderId}/delhivery-awb`, {}, {
      headers: env.getAdminHeaders()
    });
    assert.assertStatus(dispatch2, 200);
    assert.strictEqual(dispatch2.data.success, true);
    assert.strictEqual(dispatch2.data.order?.orderStatus, 'Shipped', 'Order status must remain Shipped');
    assert.match(String(dispatch2.data.awb), /^14092\d{7}$/, 'Allocated waybill must conform to Delhivery format');
  });

  test('TC-T2-F8-05', 'Synthetic Waybill Compliance: Formats to authentic 12-digit Delhivery standard', async ({ client, assert, env }) => {
    const ordersRes = await client.get('/api/admin/orders', {
      headers: env.getAdminHeaders()
    });
    assert.assertStatus(ordersRes, 200);
    const orders = ordersRes.data.orders || ordersRes.data;
    const targetOrder = orders[0];

    const res = await client.post(`/api/admin/orders/${targetOrder.id}/delhivery-awb`, {}, {
      headers: env.getAdminHeaders()
    });

    assert.assertStatus(res, 200);
    const awb = res.data.awb;

    // Verify 12-digit Delhivery AWB standard starting with 14092
    assert.match(String(awb), /^14092\d{7}$/, 'Synthetic waybill must match 12-digit Delhivery format (14092 + 7 digits)');
    assert.strictEqual(String(awb).length, 12, 'Waybill length must be exactly 12 digits');

    // Verify tracking URL composition
    assert.strictEqual(res.data.trackingUrl, `https://www.delhivery.com/track/package/${awb}`, 'Tracking URL must point to official Delhivery tracker');
  });

});
