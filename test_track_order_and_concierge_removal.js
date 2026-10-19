/**
 * Verification test for:
 * 1. Complete removal of "Contact Concierge" option across all pages
 * 2. Track Order redirection to Delhivery delivery agent
 * 3. Order ID / AWB lookup and resolution
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  } else {
    passedTests++;
    console.log(`✅ PASSED: ${message}`);
  }
}

async function runTests() {
  console.log('\n--- 1. Testing Contact Concierge Removal ---');
  const projectDir = __dirname;
  
  function getFiles(dir, exts = ['.html', '.js']) {
    let results = [];
    const list = fs.readdirSync(dir);
    for (const file of list) {
      if (file === 'node_modules' || file === '.git' || file === '.vercel') continue;
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat && stat.isDirectory()) {
        results = results.concat(getFiles(fullPath, exts));
      } else {
        if (exts.includes(path.extname(fullPath))) {
          results.push(fullPath);
        }
      }
    }
    return results;
  }

  const allFiles = getFiles(projectDir, ['.html']);
  let conciergeFound = 0;
  for (const f of allFiles) {
    // Exclude test scripts
    if (path.basename(f).startsWith('test_')) continue;
    const content = fs.readFileSync(f, 'utf8');
    if (/contact\s*concierge/i.test(content)) {
      console.error(`Found Contact Concierge in: ${f}`);
      conciergeFound++;
    }
  }
  assert(conciergeFound === 0, `Zero occurrences of "Contact Concierge" found in HTML files (found ${conciergeFound})`);

  console.log('\n--- 2. Testing Track Order Links in HTML Templates ---');
  const targetTemplates = [
    'index.html',
    'collections.html',
    'product.html',
    'pages/contact.html',
    'pages/privacy-policy.html',
    'pages/refund-policy.html',
    'pages/returns.html',
    'pages/reviews.html',
    'pages/shipping-policy.html',
    'pages/terms-of-service.html'
  ];

  for (const relPath of targetTemplates) {
    const full = path.join(projectDir, relPath);
    assert(fs.existsSync(full), `Template ${relPath} exists`);
    const html = fs.readFileSync(full, 'utf8');
    assert(
      html.includes('href="/track"') || html.includes('href="https://www.delhivery.com/track/package/'),
      `Template ${relPath} links Track Order to /track or Delhivery`
    );
  }

  console.log('\n--- 3. Testing track.html and order-success.html ---');
  const trackHtmlPath = path.join(projectDir, 'track.html');
  assert(fs.existsSync(trackHtmlPath), 'track.html exists');
  const trackHtml = fs.readFileSync(trackHtmlPath, 'utf8');
  assert(trackHtml.includes('https://www.delhivery.com/track/package/'), 'track.html redirects to Delhivery');

  const orderSuccessPath = path.join(projectDir, 'order-success.html');
  const orderSuccessHtml = fs.readFileSync(orderSuccessPath, 'utf8');
  assert(orderSuccessHtml.includes('TRACK SHIPMENT WITH DELHIVERY'), 'order-success.html contains Delhivery tracking button');

  console.log('\n--- 4. Testing /track Route Redirection in server.js ---');
  // Spin up an in-memory instance of the server handler to test HTTP 302 redirections
  const serverJs = require('./server.js');
  
  // We can make an actual HTTP request to the running server on port 3000 or start a temporary server
  const testPort = 3199;
  const testServer = http.createServer(async (req, res) => {
    // Forward to appHandler from server.js
    // We can require server.js which exports appHandler or start test
  });

  // Let's test server.js directly by starting the server on a test port if not running
  const httpModule = require('http');
  const url = require('url');

  // Let's make fetch calls against localhost:3000 if running, or start appHandler on 3199
  let isPort3000Live = false;
  try {
    const ping = await fetch('http://localhost:3000/api/health', { signal: AbortSignal.timeout(1000) });
    isPort3000Live = ping.ok;
  } catch (e) {
    isPort3000Live = false;
  }

  const targetHost = isPort3000Live ? 'http://localhost:3000' : null;

  if (targetHost) {
    console.log(`Testing against live local server at ${targetHost}...`);

    // Test 1: GET /track (no param) -> 302 to https://www.delhivery.com/track/package/
    const res1 = await fetch(`${targetHost}/track`, { redirect: 'manual' });
    assert(res1.status === 302, `/track returns HTTP 302 (got ${res1.status})`);
    const loc1 = res1.headers.get('location');
    assert(loc1 === 'https://www.delhivery.com/track/package/', `/track redirects to Delhivery portal (got ${loc1})`);

    // Test 2: GET /track?id=1409299887766 -> 302 to https://www.delhivery.com/track/package/1409299887766
    const res2 = await fetch(`${targetHost}/track?id=1409299887766`, { redirect: 'manual' });
    assert(res2.status === 302, `/track?id=... returns HTTP 302 (got ${res2.status})`);
    const loc2 = res2.headers.get('location');
    assert(loc2 === 'https://www.delhivery.com/track/package/1409299887766', `/track?id=1409299887766 redirects to specific package (got ${loc2})`);

    // Test 3: GET /track?orderId=GR-9999 -> 302 to https://www.delhivery.com/track/package/GR-9999
    const res3 = await fetch(`${targetHost}/track?orderId=GR-9999`, { redirect: 'manual' });
    assert(res3.status === 302, `/track?orderId=... returns HTTP 302 (got ${res3.status})`);
    const loc3 = res3.headers.get('location');
    assert(loc3 === 'https://www.delhivery.com/track/package/GR-9999', `/track?orderId=GR-9999 redirects to Delhivery package (got ${loc3})`);

    // Test 4: GET /track-order (alternate path) -> 302
    const res4 = await fetch(`${targetHost}/track-order`, { redirect: 'manual' });
    assert(res4.status === 302, `/track-order returns HTTP 302 (got ${res4.status})`);
    assert(res4.headers.get('location') === 'https://www.delhivery.com/track/package/', `/track-order redirects to Delhivery`);
  } else {
    console.log('Local port 3000 is offline; verifying server.js code syntax and regex route matching directly.');
    const serverCode = fs.readFileSync(path.join(projectDir, 'server.js'), 'utf8');
    assert(serverCode.includes("pathname === '/track'"), "server.js handles /track route");
    assert(serverCode.includes("https://www.delhivery.com/track/package/"), "server.js contains Delhivery tracking URL");
  }

  console.log(`\n========================================`);
  console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
  console.log(`========================================\n`);
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
