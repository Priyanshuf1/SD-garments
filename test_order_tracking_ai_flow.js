/**
 * Test Suite: ALLYRICH Order Tracking, AI Concierge & Invoice Webhook
 */

const http = require('http');

const TEST_PORT = process.env.PORT || 3001;

function request(options, data = null) {
  options.port = TEST_PORT;
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, rawBody: body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Starting ALLYRICH Order Tracking & AI Concierge Verification...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // 1. Create a Test Order
    console.log('--- Step 1: Placing Test Order ---');
    const orderRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/orders',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      customer: {
        name: 'Kabir Khanna',
        email: 'kabir.khanna.test@gmail.com',
        phone: '+91 98200 88776',
        address: 'Flat 402, Skyline Towers',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400050'
      },
      items: [
        {
          title: 'Heavyweight Drop Shoulder Boxy Hoodie',
          size: 'XL',
          price: 2499,
          quantity: 1
        }
      ],
      paymentMethod: 'Cash on Delivery (COD)'
    });

    assert(orderRes.status === 200 || orderRes.status === 201, 'Order created successfully');
    const createdOrder = orderRes.body.order;
    assert(createdOrder && createdOrder.id, `Order ID assigned: ${createdOrder?.id}`);
    const orderId = createdOrder.id;

    // 2. Test Order Tracking API
    console.log('\n--- Step 2: Testing GET /api/orders/track ---');
    const trackRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/orders/track?id=${encodeURIComponent(orderId)}`,
      method: 'GET'
    });

    assert(trackRes.status === 200, 'GET /api/orders/track returns HTTP 200');
    assert(trackRes.body.success === true, 'Track response has success: true');
    assert(trackRes.body.order.id === orderId, 'Tracked order ID matches');
    assert(Array.isArray(trackRes.body.order.steps) && trackRes.body.order.steps.length >= 4, 'Order has tracking steps timeline');
    assert(trackRes.body.order.customer.city === 'Mumbai', 'Customer city returned');

    // Test tracking by phone number
    const trackPhoneRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/orders/track?query=9820088776`,
      method: 'GET'
    });
    assert(trackPhoneRes.status === 200 && trackPhoneRes.body.order.id === orderId, 'Track by phone number matches correctly');

    // 3. Test AI Concierge Chat API
    console.log('\n--- Step 3: Testing POST /api/ai/chat ---');
    
    // 3a. Order Tracking Intent
    const aiTrackRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/ai/chat',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      message: `Where is my order ${orderId}?`
    });
    assert(aiTrackRes.status === 200, 'AI Chat returns HTTP 200 for order query');
    assert(aiTrackRes.body.reply && aiTrackRes.body.reply.includes(orderId), 'AI response references the exact Order ID');
    assert(aiTrackRes.body.reply.includes('Mumbai') || aiTrackRes.body.reply.includes('Processing') || aiTrackRes.body.reply.includes('Confirmed'), 'AI gives live order status context');

    // 3b. Sizing Advice Intent
    const aiSizeRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/ai/chat',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      message: 'I am 6 feet tall and weigh 78 kg, what size hoodie should I buy?'
    });
    assert(aiSizeRes.status === 200, 'AI Chat returns HTTP 200 for sizing advice');
    assert(aiSizeRes.body.reply.includes('XL') || aiSizeRes.body.reply.includes('L') || aiSizeRes.body.reply.includes('boxy'), 'AI recommends streetwear fit');

    // 3c. Exchange & Return Policy Intent
    const aiPolicyRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/ai/chat',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      message: 'What is your return policy?'
    });
    assert(aiPolicyRes.status === 200, 'AI Chat returns HTTP 200 for return policy');
    assert(aiPolicyRes.body.reply.includes('7-day') || aiPolicyRes.body.reply.includes('exchange'), 'AI states 7-day exchange policy');

    // 3d. Human Support / WhatsApp Intent
    const aiHumanRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/ai/chat',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      message: 'I want to talk to human support'
    });
    assert(aiHumanRes.status === 200, 'AI Chat returns HTTP 200 for human escalation');
    assert(aiHumanRes.body.reply.includes('WhatsApp') || aiHumanRes.body.reply.includes('wa.me'), 'AI provides WhatsApp escalation link');

    // 4. Verify Pages Serve Correctly
    console.log('\n--- Step 4: Testing Frontend Pages ---');
    const trackPageRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/pages/track-order.html',
      method: 'GET'
    });
    assert(trackPageRes.status === 200, '/pages/track-order.html returns HTTP 200');

    const trackAliasRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/track',
      method: 'GET'
    });
    assert(trackAliasRes.status === 200 || trackAliasRes.status === 302, '/track route handled cleanly');

  } catch (err) {
    console.error('Test crashed:', err);
    failed++;
  }

  console.log('\n=======================================');
  console.log(`Results: ${passed} Passed, ${failed} Failed`);
  console.log('=======================================');
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
