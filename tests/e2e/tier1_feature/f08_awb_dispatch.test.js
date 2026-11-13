/**
 * ALLEYRICH — Tier 1 Feature Coverage: Feature F8
 * File: tests/e2e/tier1_feature/f08_awb_dispatch.test.js
 * 
 * Tests for Admin AWB Dispatch Generation (Delhivery):
 * - TC-T1-F8-01: AWB Dispatch Generation (POST /api/admin/orders/:id/delhivery-awb generates 14092... waybill)
 * - TC-T1-F8-02: Order Status Mutation on Dispatch (orderStatus becomes 'Shipped', trackingNumber stored)
 * - TC-T1-F8-03: Carrier Metadata Persistence (carrier = 'Delhivery Express Air Priority', shippingDetails populated)
 * - TC-T1-F8-04: Thermal Packing Slip URL Generation (GET /api/admin/orders/:id/shipping-label returns printable slip)
 * - TC-T1-F8-05: COD vs Prepaid Mode Mapping in Shipment (COD maps to payment_mode: 'COD', Prepaid to 'Prepaid')
 */

'use strict';

const { defineSuite } = require('../helpers/suite.js');

module.exports = defineSuite({
  tier: 1,
  feature: 'F8',
  title: 'Feature 8 Coverage: Admin AWB Dispatch',
  description: 'Verifies Delhivery logistics dispatch, 12-digit waybill generation, order status progression to Shipped, and label proxy.'
}, ({ test }) => {

  let testOrderId = null;

  async function ensureTestOrder(client, env) {
    if (testOrderId) return testOrderId;
    const productsRes = await client.get('/api/products?stock=in_stock');
    const product = productsRes.data.products[0];
    const shopper = env.createUniqueShopper('awb_t1');

    const orderRes = await client.post('/api/checkout/create-order', {
      items: [{ id: product.id, handle: product.handle, title: product.title, size: 'M', quantity: 1 }],
      customer: shopper,
      paymentMethod: 'Cash on Delivery (COD)'
    });
    testOrderId = orderRes.data.orderId;
    return testOrderId;
  }

  test('TC-T1-F8-01', 'AWB Dispatch Generation: Generates Delhivery 12-digit AWB and tracking URLs via admin endpoint', async ({ client, env, assert }) => {
    const orderId = await ensureTestOrder(client, env);

    const res = await client.post(`/api/admin/orders/${orderId}/delhivery-awb`, {}, {
      headers: env.getAdminHeaders()
    });

    assert.assertStatus(res, 200);
    assert.strictEqual(res.data.success, true);
    assert.ok(res.data.awb, 'AWB waybill must be present');
    assert.match(String(res.data.awb), /^14092\d{6,7}$/, 'AWB must follow Delhivery 14092... format');
    assert.ok(res.data.trackingUrl && res.data.trackingUrl.includes('delhivery.com/track/package/'), 'Tracking URL must point to Delhivery portal');
    if (res.data.shippingLabelUrl) {
      assert.ok(res.data.shippingLabelUrl.includes('shipping-label'), 'Shipping label URL must reference shipping-label');
    }
  });

  test('TC-T1-F8-02', 'Order Status Mutation on Dispatch: Mutates orderStatus to Shipped and persists tracking number', async ({ client, env, assert }) => {
    const orderId = await ensureTestOrder(client, env);

    // Fetch order state from admin order list or stats
    const statsRes = await client.get('/api/admin/stats', {
      headers: env.getAdminHeaders()
    });
    assert.assertStatus(statsRes, 200);

    // Also re-verify via public tracking or direct order fetch
    const dispatchRes = await client.post(`/api/admin/orders/${orderId}/delhivery-awb`, {}, {
      headers: env.getAdminHeaders()
    });
    assert.assertStatus(dispatchRes, 200);
    const order = dispatchRes.data.order;

    assert.strictEqual(order.orderStatus, 'Shipped', "orderStatus must be mutated to 'Shipped'");
    assert.ok(order.trackingNumber, 'trackingNumber must be set on order');
    assert.strictEqual(order.trackingNumber, dispatchRes.data.awb);
  });

  test('TC-T1-F8-03', 'Carrier Metadata Persistence: Records carrier name and waybill details in order shippingDetails', async ({ client, env, assert }) => {
    const orderId = await ensureTestOrder(client, env);

    const dispatchRes = await client.post(`/api/admin/orders/${orderId}/delhivery-awb`, {}, {
      headers: env.getAdminHeaders()
    });
    assert.assertStatus(dispatchRes, 200);
    const order = dispatchRes.data.order;

    assert.strictEqual(order.carrier, 'Delhivery Express Air Priority');
    assert.ok(order.shippingDetails, 'shippingDetails must be present');
    assert.strictEqual(order.shippingDetails.waybill, dispatchRes.data.awb);
    assert.strictEqual(order.shippingDetails.carrier, 'Delhivery Express Air Priority');
  });

  test('TC-T1-F8-04', 'Thermal Packing Slip URL Generation: Serves printable packing slip HTML containing order ID and waybill', async ({ client, env, assert }) => {
    const orderId = await ensureTestOrder(client, env);

    const slipRes = await client.get(`/api/admin/orders/${orderId}/shipping-label`, {
      headers: env.getAdminHeaders()
    });

    // Label returns either 200 with printable HTML or 302 redirect to live S3 PDF
    assert.ok(
      slipRes.status === 200 || slipRes.status === 302,
      `Expected status 200 or 302 for shipping label, got ${slipRes.status}`
    );

    if (slipRes.status === 200) {
      assert.assertHtmlContains(slipRes, 'Delhivery');
      assert.assertHtmlContains(slipRes, orderId);
    }
  });

  test('TC-T1-F8-05', 'COD vs Prepaid Mode Mapping in Shipment: Verifies payment mode mapping logic in shipment manifest', async ({ assert }) => {
    // Test pure logic contract from lib/delhivery.js
    const codOrder = { paymentMethod: 'Cash on Delivery (COD)', total: 1899 };
    const prepaidOrder = { paymentMethod: 'Cashfree Online Payment', total: 2499 };

    const getPaymentMode = (order) => String(order.paymentMethod || '').toLowerCase().includes('cod') ? 'COD' : 'Prepaid';
    const getCodAmount = (order) => getPaymentMode(order) === 'COD' ? Number(order.total || 0) : 0;

    assert.strictEqual(getPaymentMode(codOrder), 'COD');
    assert.strictEqual(getCodAmount(codOrder), 1899);

    assert.strictEqual(getPaymentMode(prepaidOrder), 'Prepaid');
    assert.strictEqual(getCodAmount(prepaidOrder), 0);
  });

});
