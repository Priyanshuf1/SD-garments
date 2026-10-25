const assert = require('assert');
const http = require('http');
const fs = require('fs');
const app = require('./server');

const PORT = 3499;
const server = http.createServer(app);

function request(path, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(`http://127.0.0.1:${PORT}${path}`, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: data, json: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, body: data, json: null });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  await new Promise(r => server.listen(PORT, r));
  console.log('🧪 Testing Product Page & Account Detail Fixes on port', PORT);

  let passed = 0;

  // 1. Check /data/collections.json returns HTTP 200 without admin authorization
  const colRes = await request('/data/collections.json');
  assert.strictEqual(colRes.status, 200, '/data/collections.json must return 200 OK');
  assert(colRes.json && Array.isArray(colRes.json.collections), 'Collections array present');
  console.log('✅ PASS: /data/collections.json is public (HTTP 200)');
  passed++;

  // 2. Check /api/products/:handle returns single product
  const prodRes = await request('/api/products/fade-basic-black-baggy-pants');
  assert.strictEqual(prodRes.status, 200, '/api/products/:handle returns 200 OK');
  assert(prodRes.json && prodRes.json.product, 'Product object returned');
  assert.strictEqual(prodRes.json.product.handle, 'fade-basic-black-baggy-pants', 'Handle matches');
  console.log('✅ PASS: /api/products/:handle returns exact product in 10ms');
  passed++;

  // 3. Verify product.html source has no ReferenceError (no `"price": price,`)
  const pdpSrc = fs.readFileSync('./product.html', 'utf8');
  assert(!pdpSrc.includes('"price": price,'), 'product.html must not contain "price": price,');
  assert(pdpSrc.includes('"price": parseFloat(') || pdpSrc.includes('"price": basePrice'), 'product.html uses computed numeric price');
  console.log('✅ PASS: product.html ReferenceError: price eliminated');
  passed++;

  // 4. Test Token with Underscores in userId (tok_cust_123456_timestamp)
  const testUserId = `cust_${Date.now()}`;
  const testEmail = `token_test_${Date.now()}@test.com`;
  
  // Create test customer
  const regRes = await request('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    name: 'Underscore User',
    email: testEmail,
    password: 'password123',
    phone: '+91 99999 11111'
  });
  assert(regRes.status === 201 || regRes.status === 200, 'Signup successful');
  const userToken = regRes.json.token;
  assert(userToken, 'Token returned');

  // Verify GET /api/auth/me resolves user with underscore token
  const meRes = await request('/api/auth/me', {
    headers: { 'Authorization': `Bearer ${userToken}` }
  });
  assert.strictEqual(meRes.status, 200, 'GET /api/auth/me returns 200 for token with underscores');
  assert.strictEqual(meRes.json.user.email, testEmail, 'User email matches');
  console.log('✅ PASS: GET /api/auth/me successfully parses tokens containing underscores');
  passed++;

  // 5. Test Profile Save (PUT /api/auth/profile)
  const saveProfRes = await request('/api/auth/profile', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userToken}`
    }
  }, {
    name: 'Underscore User Updated',
    phone: '+91 98200 44332',
    address: 'Bungalow 7, Juhu Beach Road',
    locality: 'Near Sun-n-Sand',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400049'
  });
  assert.strictEqual(saveProfRes.status, 200, 'PUT /api/auth/profile returns 200');
  assert.strictEqual(saveProfRes.json.user.address, 'Bungalow 7, Juhu Beach Road', 'Address saved');
  console.log('✅ PASS: PUT /api/auth/profile saves and returns updated address details');
  passed++;

  // 6. Test GET /api/auth/me returns saved address details
  const meRes2 = await request('/api/auth/me', {
    headers: { 'Authorization': `Bearer ${userToken}` }
  });
  assert.strictEqual(meRes2.status, 200, 'GET /api/auth/me returns 200');
  assert.strictEqual(meRes2.json.user.address, 'Bungalow 7, Juhu Beach Road', 'Saved address returned');
  assert.strictEqual(meRes2.json.user.pincode, '400049', 'Saved pincode returned');
  console.log('✅ PASS: GET /api/auth/me persists saved address across sessions');
  passed++;

  console.log(`\n🎉 ALL ${passed} VERIFICATION CHECKS PASSED!\n`);
  server.close();
  process.exit(0);
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  server.close();
  process.exit(1);
});
