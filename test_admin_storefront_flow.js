/**
 * Comprehensive Automated Verification Suite: Storefront & Admin End-to-End Flow
 * Tests:
 * 1. Gift card complete absence across catalog & APIs
 * 2. Empty cart rejection (HTTP 400 + error message)
 * 3. Product CRUD (Create, Read, Update, Delete) with immediate storefront reflection
 * 4. Storefront order placement and instant reflection in Admin Portal and Customer Account
 * 5. Order fulfillment flow (Delhivery AWB dispatch + Cashfree payment verification)
 * 6. Clean teardown and verification
 */

const http = require('http');
const appHandler = require('./server.js');
const supabase = require('./lib/supabase.js');

const TEST_PORT = 3456;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = data;
        }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✅ PASS: ${message}`);
  passedTests++;
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Starting Storefront & Admin Automated Test Flow');
  console.log('====================================================\n');

  const testServer = http.createServer(appHandler);
  await new Promise((resolve) => testServer.listen(TEST_PORT, resolve));
  console.log(`🚀 Test server listening on ${BASE_URL}\n`);

  try {
    // -----------------------------------------------------------------
    // TEST 1: Gift Card Removal
    // -----------------------------------------------------------------
    console.log('--- TEST 1: Gift Card Removal ---');
    const prodsRes = await makeRequest('GET', '/api/products');
    assert(prodsRes.status === 200, 'GET /api/products returns HTTP 200');
    assert(prodsRes.body.success === true, 'Response body has success: true');
    const products = prodsRes.body.products || [];
    
    const giftCardFound = products.find(p =>
      (p.handle || '').toLowerCase().includes('gift-card') ||
      (p.handle || '').toLowerCase().includes('giftcard') ||
      (p.title || '').toLowerCase().includes('gift card')
    );
    assert(!giftCardFound, 'No gift card product found in /api/products');

    const dataJsonRes = await makeRequest('GET', '/data/products.json');
    assert(dataJsonRes.status === 200, 'GET /data/products.json returns HTTP 200');
    const dataProducts = dataJsonRes.body.products || [];
    const giftCardInDataJson = dataProducts.find(p =>
      (p.handle || '').toLowerCase().includes('gift-card') ||
      (p.title || '').toLowerCase().includes('gift card')
    );
    assert(!giftCardInDataJson, 'No gift card product found in /data/products.json');
    console.log(`Catalog count: ${products.length} products (Gift card successfully excluded).\n`);

    // -----------------------------------------------------------------
    // TEST 2: Empty Cart Checkout Rejection
    // -----------------------------------------------------------------
    console.log('--- TEST 2: Empty Cart Checkout Rejection ---');
    const emptyOrderRes = await makeRequest('POST', '/api/checkout/create-order', {
      customer: { name: 'Empty Tester', phone: '+91 99999 00000', email: 'test@empty.com' },
      items: [],
      subtotal: 0,
      total: 0
    });
    assert(emptyOrderRes.status === 400, 'POST /api/checkout/create-order with empty items returns HTTP 400');
    assert(emptyOrderRes.body.success === false, 'Empty cart response has success: false');
    assert(emptyOrderRes.body.error && emptyOrderRes.body.error.toLowerCase().includes('cart is empty'), 'Error message specifies Cart is empty');

    const emptyOrderRes2 = await makeRequest('POST', '/api/orders', {
      customer: { name: 'Empty Tester 2' },
      items: []
    });
    assert(emptyOrderRes2.status === 400, 'POST /api/orders with empty items returns HTTP 400');
    console.log('Empty cart orders successfully rejected with HTTP 400.\n');

    // -----------------------------------------------------------------
    // TEST 3: Product CRUD on Admin & Immediate Reflection on Storefront
    // -----------------------------------------------------------------
    console.log('--- TEST 3: Product CRUD & Storefront Reflection ---');
    const newProdPayload = {
      title: 'Automated Test Gothic Cyber Oversized Tee',
      price: '1899.00',
      compare_at_price: '2799.00',
      category: 'T-Shirts & Boxy Tees',
      homepage_section: 'just_dropped',
      stock: 45,
      image: 'https://cdn.shopify.com/s/files/1/0633/9339/9022/files/1_cd34702d-ac3b-4ee4-a9d4-1733e518d430.png'
    };

    const createProdRes = await makeRequest('POST', '/api/admin/products', newProdPayload);
    assert(createProdRes.status === 201, 'POST /api/admin/products returns HTTP 201 Created');
    assert(createProdRes.body.success === true, 'Create product returns success: true');
    const createdProduct = createProdRes.body.product;
    assert(createdProduct && createdProduct.id, 'Created product contains an ID');
    const testProdId = createdProduct.id;
    const testProdHandle = createdProduct.handle;

    // Verify immediate storefront reflection via /api/products
    const storefrontProdsRes = await makeRequest('GET', '/api/products');
    const foundOnStorefront = storefrontProdsRes.body.products.find(p => String(p.id) === String(testProdId));
    assert(Boolean(foundOnStorefront), 'Newly added product reflects IMMEDIATELY on /api/products');
    assert(foundOnStorefront.title === newProdPayload.title, 'Product title matches on storefront');

    // Verify immediate storefront reflection via /data/products.json
    const storefrontDataRes = await makeRequest('GET', '/data/products.json');
    const foundInDataJson = storefrontDataRes.body.products.find(p => String(p.id) === String(testProdId));
    assert(Boolean(foundInDataJson), 'Newly added product reflects IMMEDIATELY on /data/products.json');

    // Update product via PUT /api/admin/products/:id
    const updatedTitle = 'Automated Test Gothic Cyber Oversized Tee (V2 Gold Edition)';
    const updateProdRes = await makeRequest('PUT', `/api/admin/products/${testProdId}`, {
      title: updatedTitle,
      price: '2199.00',
      stock: 30
    });
    assert(updateProdRes.status === 200, 'PUT /api/admin/products/:id returns HTTP 200 OK');
    assert(updateProdRes.body.product.title === updatedTitle, 'Updated title returned in response');

    // Verify update reflects immediately on storefront
    const verifyUpdateRes = await makeRequest('GET', '/api/products');
    const updatedProdInStore = verifyUpdateRes.body.products.find(p => String(p.id) === String(testProdId));
    assert(updatedProdInStore.title === updatedTitle, 'Updated product title reflects immediately on storefront');
    assert(updatedProdInStore.variants[0].price === '2199.00', 'Updated product price reflects immediately on storefront');
    console.log('Product CRUD and immediate storefront reflection verified.\n');

    // -----------------------------------------------------------------
    // TEST 4: Storefront Order Placement & Reflection in Admin & Account
    // -----------------------------------------------------------------
    console.log('--- TEST 4: Storefront Order Placement & Account Reflection ---');
    const testCustomerEmail = `tester_${Date.now()}@sdgarments.in`;
    const testCustomerPhone = '+91 98888 77777';

    const orderPayload = {
      customer: {
        name: 'Automated Test Shopper',
        email: testCustomerEmail,
        phone: testCustomerPhone,
        address: '42 Fashion Street, Indiranagar',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560038'
      },
      items: [
        {
          id: testProdId,
          title: updatedTitle,
          size: 'XL',
          price: 2199,
          quantity: 2,
          image: createdProduct.images?.[0]?.src
        }
      ],
      subtotal: 4398,
      discount: 0,
      total: 4398,
      paymentMethod: 'Cash on Delivery (COD)'
    };

    const placeOrderRes = await makeRequest('POST', '/api/checkout/create-order', orderPayload);
    assert(placeOrderRes.status === 201, 'POST /api/checkout/create-order returns HTTP 201 Created');
    assert(placeOrderRes.body.success === true, 'Order placement returns success: true');
    const createdOrder = placeOrderRes.body.order;
    assert(createdOrder && createdOrder.id, 'Placed order has an order ID (e.g. GR-xxxx)');
    const createdOrderId = createdOrder.id;
    console.log(`Placed test order with ID: ${createdOrderId}`);

    // Verify order reflects in Admin Orders (/api/admin/orders)
    const adminOrdersRes = await makeRequest('GET', '/api/admin/orders');
    assert(adminOrdersRes.status === 200, 'GET /api/admin/orders returns HTTP 200');
    const orderInAdmin = adminOrdersRes.body.orders.find(o => String(o.id) === String(createdOrderId));
    assert(Boolean(orderInAdmin), 'Placed order reflects IMMEDIATELY in Admin Portal (/api/admin/orders)');
    assert(orderInAdmin.customer.email === testCustomerEmail, 'Order customer email matches in Admin');
    assert(orderInAdmin.items.length === 1, 'Order items count matches in Admin');

    // Verify order reflects in Customer Account (/api/orders?email=...)
    const accountOrdersRes = await makeRequest('GET', `/api/orders?email=${encodeURIComponent(testCustomerEmail)}`);
    assert(accountOrdersRes.status === 200, 'GET /api/orders?email=... returns HTTP 200');
    assert(accountOrdersRes.body.orders.length > 0, 'Customer Account returns order list');
    const orderInAccount = accountOrdersRes.body.orders.find(o => String(o.id) === String(createdOrderId));
    assert(Boolean(orderInAccount), 'Placed order reflects IMMEDIATELY in Customer Account (/api/orders)');
    assert(orderInAccount.total === 4398, 'Customer Account displays correct order total (Rs. 4398)');

    // Verify /api/auth/orders fallback endpoint also reflects the order
    const authOrdersRes = await makeRequest('GET', `/api/auth/orders?phone=${encodeURIComponent(testCustomerPhone)}`);
    assert(authOrdersRes.status === 200, 'GET /api/auth/orders?phone=... returns HTTP 200');
    const orderInAuth = authOrdersRes.body.orders.find(o => String(o.id) === String(createdOrderId));
    assert(Boolean(orderInAuth), 'Placed order reflects in /api/auth/orders fallback endpoint');
    console.log('Storefront order placement and multi-portal reflection verified.\n');

    // -----------------------------------------------------------------
    // TEST 5: Order Status Update & Logistics Dispatch
    // -----------------------------------------------------------------
    console.log('--- TEST 5: Order Status Update & Logistics Dispatch ---');
    // Generate Delhivery AWB via Admin API
    const awbRes = await makeRequest('POST', `/api/admin/orders/${createdOrderId}/delhivery-awb`);
    assert(awbRes.status === 200, 'POST /api/admin/orders/:id/delhivery-awb returns HTTP 200');
    assert(awbRes.body.success === true, 'Delhivery AWB generation returns success: true');
    assert(awbRes.body.order.orderStatus === 'Shipped', 'Order status transitioned to "Shipped"');
    assert(Boolean(awbRes.body.awb), 'Tracking AWB was generated');

    // Verify status update reflects immediately in Customer Account
    const accountVerifyRes = await makeRequest('GET', `/api/orders?email=${encodeURIComponent(testCustomerEmail)}`);
    const shippedOrderInAccount = accountVerifyRes.body.orders.find(o => String(o.id) === String(createdOrderId));
    assert(shippedOrderInAccount.orderStatus === 'Shipped', 'Updated "Shipped" status reflects in Customer Account');
    assert(Boolean(shippedOrderInAccount.trackingNumber), 'Delhivery tracking number reflects in Customer Account');

    // Confirm payment via Cashfree verify
    const verifyPayRes = await makeRequest('POST', `/api/admin/orders/${createdOrderId}/cashfree-verify`);
    assert(verifyPayRes.status === 200, 'POST /api/admin/orders/:id/cashfree-verify returns HTTP 200');
    assert(verifyPayRes.body.order.paymentStatus === 'Paid', 'Order payment status transitioned to "Paid"');

    // Verify payment status reflects in Customer Account
    const accountVerifyPayRes = await makeRequest('GET', `/api/orders?email=${encodeURIComponent(testCustomerEmail)}`);
    const paidOrderInAccount = accountVerifyPayRes.body.orders.find(o => String(o.id) === String(createdOrderId));
    assert(paidOrderInAccount.paymentStatus === 'Paid', 'Updated "Paid" payment status reflects in Customer Account');
    console.log('Logistics dispatch and status synchronization verified.\n');

    // -----------------------------------------------------------------
    // TEST 6: Teardown & Deletion
    // -----------------------------------------------------------------
    console.log('--- TEST 6: Teardown & Catalog Integrity ---');
    // Delete test order
    const delOrderRes = await makeRequest('DELETE', `/api/admin/orders/${createdOrderId}`);
    assert(delOrderRes.status === 200, 'DELETE /api/admin/orders/:id returns HTTP 200');
    
    // Verify order deleted from admin & account
    const checkAdminOrders = await makeRequest('GET', '/api/admin/orders');
    assert(!checkAdminOrders.body.orders.some(o => String(o.id) === String(createdOrderId)), 'Test order successfully removed from Admin orders');

    // Delete test product
    const delProdRes = await makeRequest('DELETE', `/api/admin/products/${testProdId}`);
    assert(delProdRes.status === 200, 'DELETE /api/admin/products/:id returns HTTP 200');

    // Verify product deleted from storefront
    const checkStorefrontProds = await makeRequest('GET', '/api/products');
    assert(!checkStorefrontProds.body.products.some(p => String(p.id) === String(testProdId)), 'Test product successfully removed from storefront /api/products');

    const checkDataJsonProds = await makeRequest('GET', '/data/products.json');
    assert(!checkDataJsonProds.body.products.some(p => String(p.id) === String(testProdId)), 'Test product successfully removed from storefront /data/products.json');
    assert(checkStorefrontProds.body.products.length === 244, 'Catalog count restored exactly to 244 products');
    console.log('Teardown and catalog integrity verified.\n');

    console.log('====================================================');
    console.log(`🎉 ALL TESTS PASSED! (${passedTests}/${totalTests} assertions)`);
    console.log('====================================================');
    process.exit(0);

  } catch (err) {
    console.error('\n❌ Test suite failed:', err);
    process.exit(1);
  } finally {
    testServer.close();
  }
}

runTests();
