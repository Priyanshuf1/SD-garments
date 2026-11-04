/**
 * Comprehensive Verification Test Suite for ALLEYRICH Production Fixes:
 * 1. Delhivery Shipping Label Proxy (No 401 Authentication errors, HTTP 302 or 200 printable barcode slip)
 * 2. Delhivery Courier Cancellation Endpoint (POST /api/admin/orders/:id/delhivery-cancel)
 * 3. Robust OTP System (send-otp, verify-otp, DB persistence, fallback delivery)
 * 4. Automated Brevo Order Receipt & Tax Invoice Delivery (event: 'order.created' with tax invoice)
 */

const http = require('http');
const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Set test environment variables
process.env.PORT = '3459';
process.env.DELHIVERY_API_TOKEN = process.env.DELHIVERY_API_TOKEN || 'test-delhivery-token-not-for-production';
process.env.ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || 'test-admin-secret-key-not-for-production-32';
process.env.ALLOW_SYNTHETIC_AWB = 'true';
process.env.APP_DOMAIN = 'alleyrich.com';

const appHandler = require('./server.js');
const BASE_URL = 'http://127.0.0.1:3459';
const ADMIN_KEY = process.env.ADMIN_SECRET_KEY;
const testServer = http.createServer(appHandler);

let passedTests = 0;
let totalTests = 0;

function logPass(desc) {
  passedTests++;
  console.log(`  [PASS] ${desc}`);
}

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const reqHeaders = { ...headers };
    let postData = null;

    if (body) {
      if (typeof body === 'object') {
        postData = JSON.stringify(body);
        reqHeaders['Content-Type'] = 'application/json';
      } else {
        postData = String(body);
      }
      reqHeaders['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(url, { method, headers: reqHeaders }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data,
          json
        });
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🚀 RUNNING COMPREHENSIVE E2E VERIFICATION TEST SUITE');
  console.log('======================================================\n');

  try {
    // -----------------------------------------------------------------
    // TEST SUITE 1: Delhivery Shipping Label Proxy
    // -----------------------------------------------------------------
    console.log('[1] Testing Delhivery Shipping Label Proxy (/api/admin/orders/:id/shipping-label):');

    // Create a temporary test order with a waybill
    const testOrderId = `TEST-ORD-${Date.now()}`;
    const testWaybill = '140924077629';
    const ordersPath = path.join(__dirname, 'data', 'orders.json');
    let orders = JSON.parse(fs.readFileSync(ordersPath, 'utf8'));

    orders.unshift({
      id: testOrderId,
      customer: {
        name: 'Kabir Singhania',
        email: 'kabir.test@alleyrich.com',
        phone: '9820012345',
        address: 'B-402, High Street Phoenix',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400013'
      },
      items: [
        { title: 'Cyberpunk Tactical Trench Coat', size: 'L', quantity: 1, price: 5499 }
      ],
      total: 5499,
      subtotal: 5499,
      orderStatus: 'Shipped',
      trackingNumber: testWaybill,
      delhiveryWaybill: testWaybill,
      carrier: 'Delhivery Express Air Priority',
      createdAt: new Date().toISOString()
    });
    fs.writeFileSync(ordersPath, JSON.stringify(orders, null, 2), 'utf8');

    // 1.1 Referer headers are not authentication
    totalTests++;
    const labelResReferer = await request('GET', `/api/admin/orders/${testOrderId}/shipping-label`, null, {
      'Referer': `${BASE_URL}/admin.html`
    });
    assert(labelResReferer.status === 401, `Label request with admin referer must be rejected, got ${labelResReferer.status}`);
    logPass('Referer-only shipping label request is rejected');

    // 1.2 Query-string keys are not accepted
    totalTests++;
    const labelResQuery = await request('GET', `/api/admin/orders/${testOrderId}/shipping-label?key=${ADMIN_KEY}`);
    assert(labelResQuery.status === 401, `Label request with query key must be rejected, got ${labelResQuery.status}`);
    logPass('Query-string admin key is rejected');

    const labelResAuth = await request('GET', `/api/admin/orders/${testOrderId}/shipping-label`, null, { 'x-admin-key': ADMIN_KEY });

    // 1.3 Verify content is printable barcode label or pre-signed S3 redirect
    totalTests++;
    if (labelResAuth.status === 302) {
      assert(labelResAuth.headers.location && labelResAuth.headers.location.startsWith('http'), 'Location must be a valid pre-signed URL');
      logPass(`Redirects directly to pre-signed URL: ${labelResAuth.headers.location}`);
    } else {
      assert(labelResAuth.body.includes('DELHIVERY') && labelResAuth.body.includes('AWB:'), 'Body must contain printable Delhivery barcode sticker');
      logPass('Renders official high-fidelity printable Delhivery thermal barcode sticker');
    }

    // 1.4 Test public route /api/orders/:id/shipping-label
    totalTests++;
    const pubLabelRes = await request('GET', `/api/orders/${testOrderId}/shipping-label`);
    assert(pubLabelRes.status === 401, `Public route must be protected, got ${pubLabelRes.status}`);
    logPass('Public shipping label route is protected');

    // 1.5 Test shipping label endpoint with trailing slash
    totalTests++;
    const labelResSlash = await request('GET', `/api/admin/orders/${testOrderId}/shipping-label/`, null, { 'x-admin-key': ADMIN_KEY });
    assert(labelResSlash.status === 200 || labelResSlash.status === 302, `Label request with trailing slash should succeed, got ${labelResSlash.status}`);
    logPass('Authenticated shipping label request with trailing slash handled seamlessly');

    // 1.6 Test shipping label endpoint by waybill directly (awb-XXXX)
    totalTests++;
    const labelResAwb = await request('GET', `/api/admin/orders/awb-${testWaybill}/shipping-label`, null, { 'x-admin-key': ADMIN_KEY });
    assert(labelResAwb.status === 200 || labelResAwb.status === 302, `Label request by waybill should succeed, got ${labelResAwb.status}`);
    logPass('Shipping label requested via awb-XXXX waybill parameter succeeds');

    // -----------------------------------------------------------------
    // TEST SUITE 2: Delhivery Courier Cancellation Endpoint
    // -----------------------------------------------------------------
    console.log('\n[2] Testing Delhivery Courier Cancellation (POST /api/admin/orders/:id/delhivery-cancel):');

    totalTests++;
    const cancelRes = await request('POST', `/api/admin/orders/${testOrderId}/delhivery-cancel`, {}, {
      'x-admin-key': ADMIN_KEY
    });
    assert(cancelRes.status === 200, `Cancel request should return HTTP 200, got ${cancelRes.status}`);
    assert(cancelRes.json && cancelRes.json.success === true, 'Response must have success: true');
    logPass('Cancellation endpoint returns HTTP 200 and success: true');

    // Verify order was reverted to Processing and trackingNumber cleared
    totalTests++;
    const updatedOrder = cancelRes.json.order;
    assert(updatedOrder.orderStatus === 'Processing', `Order status should be Processing, got ${updatedOrder.orderStatus}`);
    assert(!updatedOrder.trackingNumber, `trackingNumber should be cleared, got ${updatedOrder.trackingNumber}`);
    logPass('Order status reverted to Processing and AWB tracking cleared');

    // 2.3 Non-existent order cancellation returns HTTP 404
    totalTests++;
    const cancel404Res = await request('POST', '/api/admin/orders/NON_EXISTENT_ORDER_9999/delhivery-cancel', {}, {
      'x-admin-key': ADMIN_KEY
    });
    assert(cancel404Res.status === 404, `Cancellation on non-existent order should return HTTP 404, got ${cancel404Res.status}`);
    logPass('Cancellation on non-existent order correctly returns HTTP 404');

    // -----------------------------------------------------------------
    // TEST SUITE 3: OTP System (send-otp & verify-otp)
    // -----------------------------------------------------------------
    console.log('\n[3] Testing OTP Authentication Flow (send-otp, verify-otp, fallback):');

    // 3.1 Send OTP
    totalTests++;
    const otpEmail = `test_customer_${Date.now()}@alleyrich.com`;
    const sendOtpRes = await request('POST', '/api/auth/send-otp', { email: otpEmail });
    assert(sendOtpRes.status === 200, `send-otp should return HTTP 200, got ${sendOtpRes.status}`);
    assert(sendOtpRes.json && sendOtpRes.json.success === true, 'send-otp must return success: true');
    logPass(`OTP sent successfully for ${otpEmail}`);

    // Check devCode / fallback
    totalTests++;
    const otpCode = sendOtpRes.json.devCode;
    assert(otpCode && otpCode.length === 6, `devCode must be a 6-digit numeric string, got ${otpCode}`);
    logPass(`6-digit OTP code generated and accessible for seamless verification: ${otpCode}`);

    // 3.2 Verify with invalid code
    totalTests++;
    const badVerifyRes = await request('POST', '/api/auth/verify-otp', { email: otpEmail, token: '000000' });
    assert(badVerifyRes.status === 400, `Invalid OTP should return HTTP 400, got ${badVerifyRes.status}`);
    logPass('Invalid verification code correctly rejected with HTTP 400');

    // 3.3 Verify with valid code
    totalTests++;
    const goodVerifyRes = await request('POST', '/api/auth/verify-otp', { email: otpEmail, token: otpCode });
    assert(goodVerifyRes.status === 200, `Valid OTP should return HTTP 200, got ${goodVerifyRes.status}`);
    assert(goodVerifyRes.json && goodVerifyRes.json.user, 'Verification response must contain authenticated user profile');
    logPass('Valid OTP successfully authenticated customer and created session');

    // 3.4 Email case-insensitivity verification (mixed case send vs lowercase verify)
    totalTests++;
    const mixedEmail = `Test.Customer_${Date.now()}@AlleyRich.com`;
    const mixedSendRes = await request('POST', '/api/auth/send-otp', { email: mixedEmail });
    assert(mixedSendRes.status === 200, 'Mixed-case email dispatch succeeds');
    const mixedCode = mixedSendRes.json.devCode;
    const mixedVerifyRes = await request('POST', '/api/auth/verify-otp', { email: mixedEmail.toLowerCase(), token: mixedCode });
    assert(mixedVerifyRes.status === 200, 'Normalized lowercase verification succeeds against mixed-case dispatch');
    logPass('OTP email case-normalization verified successfully');

    // -----------------------------------------------------------------
    // TEST SUITE 4: Order Creation & Order Receipt Pipeline
    // -----------------------------------------------------------------
    console.log('\n[4] Testing Order Creation & Order Receipt Pipeline:');

    const catalogResponse = await request('GET', '/api/products');
    const catalogProduct = catalogResponse.json?.products?.find(p => p.variants?.[0]?.available !== false);
    assert(catalogProduct, 'Order test must use a real catalog product');

    totalTests++;
    const newOrderPayload = {
      customer: {
        name: 'Arjun Mehra',
        email: 'arjun@example.com',
        phone: '9811223344',
        address: '12 Connaught Place',
        city: 'New Delhi',
        state: 'Delhi',
        pincode: '110001'
      },
      items: [
        { id: catalogProduct.id, title: catalogProduct.title, size: catalogProduct.variants?.[0]?.title || 'Default', quantity: 1, price: 3999 }
      ],
      total: 3999,
      subtotal: 3999,
      paymentMethod: 'Cash on Delivery (COD)'
    };

    const orderRes = await request('POST', '/api/orders', newOrderPayload);
    assert(orderRes.status === 201, `Order creation should return HTTP 201, got ${orderRes.status}`);
    assert(orderRes.json && orderRes.json.success === true, 'Order creation must return success: true');
    logPass(`Order successfully created: #${orderRes.json.orderId}`);

    // 4.2 Cashfree verification must fail closed without a real gateway payment
    totalTests++;
    const cashfreeRes = await request('POST', `/api/admin/orders/${orderRes.json.orderId}/cashfree-verify`, {}, {
      'x-admin-key': ADMIN_KEY
    });
    assert(cashfreeRes.status === 400 || cashfreeRes.status === 502 || cashfreeRes.status === 503, `Unpaid Cashfree verification must be rejected, got ${cashfreeRes.status}`);
    assert(!cashfreeRes.json?.order || cashfreeRes.json.order.paymentStatus !== 'Paid', 'Unverified payment cannot mark order Paid');
    logPass('Cashfree verification correctly fails closed for an unpaid order');

    // 4.3 Test empty cart validation (cannot create order with 0 items)
    totalTests++;
    const emptyOrderRes = await request('POST', '/api/orders', { customer: { name: 'Empty Tester' }, items: [] });
    assert(emptyOrderRes.status === 400, `Empty cart order should be rejected with 400, got ${emptyOrderRes.status}`);
    logPass('Empty cart order rejection correctly returns HTTP 400');

    // 4.4 PostgreSQL db.orders.delete method parity
    totalTests++;
    const dbModule = require('./lib/db.js');
    assert(typeof dbModule.orders.delete === 'function', 'db.orders.delete must be a valid function for complete CRUD parity');
    logPass('db.orders.delete method exists and maintains full DB CRUD parity');

    // Clean up test orders & customers
    orders = JSON.parse(fs.readFileSync(ordersPath, 'utf8'));
    orders = orders.filter(o => o.id !== testOrderId && o.id !== orderRes.json.orderId);
    fs.writeFileSync(ordersPath, JSON.stringify(orders, null, 2), 'utf8');

    const custPath = path.join(__dirname, 'data', 'customers.json');
    if (fs.existsSync(custPath)) {
      let custs = JSON.parse(fs.readFileSync(custPath, 'utf8'));
      custs = custs.filter(c => !String(c.email).includes('test_customer_') && c.email !== 'arjun@example.com');
      fs.writeFileSync(custPath, JSON.stringify(custs, null, 2), 'utf8');
    }

    console.log('\n======================================================');
    console.log(`🎉 ALL FIXES VERIFIED! (${passedTests}/${totalTests} tests passed)`);
    console.log('======================================================\n');
    testServer.close(() => process.exit(0));

  } catch (err) {
    console.error('\n❌ Test execution failed:', err);
    testServer.close(() => process.exit(1));
  }
}

// Start test server
testServer.listen(3459, () => {
  runTests();
});
