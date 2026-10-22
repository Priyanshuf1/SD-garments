const http = require('http');

const ALB_HOST = 'allyrich-alb-1951227217.ap-southeast-2.elb.amazonaws.com';

function request(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const payload = data ? JSON.stringify(data) : null;
    const req = http.request({
      hostname: ALB_HOST,
      port: 80,
      path: path,
      method: method,
      headers: {
        'Host': ALB_HOST,
        ...(payload ? {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        } : {})
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(body);
        } catch (_) {}
        resolve({ status: res.statusCode, headers: res.headers, body: parsed, raw: body });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function run() {
  console.log('🧪 Testing Live AWS ALB Deployment...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      failed++;
    }
  }

  // 1. Health check
  const health = await request('/api/health');
  assert(health.status === 200 && health.body.service === 'SD-garments', 'Health check returns 200 & SD-garments');

  // 2. /pages/track-order.html
  const trackPage = await request('/pages/track-order.html');
  assert(trackPage.status === 200 && trackPage.raw.includes('TRACK YOUR SHIPMENT'), '/pages/track-order.html served with 200 OK');

  // 3. /track route alias
  const trackAlias = await request('/track');
  assert(trackAlias.status === 200 && trackAlias.raw.includes('TRACK YOUR SHIPMENT'), '/track cleanly routes to in-store tracking portal');

  // 4. /api/orders/track public endpoint
  const trackApi = await request('/api/orders/track?query=GR-4891');
  assert(trackApi.status === 200 || (trackApi.body && trackApi.body.message.includes('No shipment found')), '/api/orders/track responds with valid JSON');

  // 5. AI Concierge: Exchange Policy
  const exchangeChat = await request('/api/ai/chat', 'POST', { message: 'What is your exchange policy?' });
  assert(exchangeChat.status === 200 && exchangeChat.body.reply.includes('Exchange Policy'), 'AI Concierge replies to exchange policy');

  // 6. AI Concierge: Sizing Recommendation
  const sizeChat = await request('/api/ai/chat', 'POST', { message: 'Recommend a size for 180cm and 75kg' });
  assert(sizeChat.status === 200 && (sizeChat.body.reply.includes('Size L') || sizeChat.body.reply.includes('Size XL')), 'AI Concierge delivers personalized streetwear sizing');

  // 7. Assets: ai-support.js
  const aiJs = await request('/assets/js/ai-support.js');
  assert(aiJs.status === 200 && aiJs.raw.includes('AR_AI_CONCIERGE'), 'ai-support.js served with 200 OK');

  // 8. Assets: ai-support.css
  const aiCss = await request('/assets/css/ai-support.css');
  assert(aiCss.status === 200 && (aiCss.raw.includes('ar-chat') || aiCss.raw.includes('ALLYRICH')), 'ai-support.css served with 200 OK');

  console.log(`\n=======================================`);
  console.log(`Live ALB Results: ${passed} Passed, ${failed} Failed`);
  console.log(`=======================================`);

  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
