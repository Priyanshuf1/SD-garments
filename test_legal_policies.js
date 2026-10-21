// Automated test suite to verify all legal policy pages, routes, compliance clauses and content
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function request(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE_URL}${urlPath}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

async function runTests() {
  console.log('--- STARTING ALLYRICH LEGAL POLICIES & TERMS VERIFICATION ---');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // 1. Direct file checks on disk
    console.log('\n[1] Verifying Disk Files & Completeness:');
    const pages = [
      'terms-of-service.html',
      'privacy-policy.html',
      'refund-policy.html',
      'shipping-policy.html',
      'returns.html'
    ];

    for (const page of pages) {
      const filePath = path.join(__dirname, 'pages', page);
      assert(fs.existsSync(filePath), `File exists: pages/${page}`);
      const content = fs.readFileSync(filePath, 'utf8');
      assert(content.length > 5000, `pages/${page} has rich content (${content.length} bytes)`);
      assert(!content.includes('INTELLECTUAL PROPERTY & DESIGN PROTECTION NOTICE\n  <p>This website'), `pages/${page} does NOT contain old 2-line placeholder`);
    }

    // 2. Specific Clause Verification
    console.log('\n[2] Verifying Specific Legal Clauses & Compliance Content:');
    
    // Terms of Service
    const tos = fs.readFileSync(path.join(__dirname, 'pages', 'terms-of-service.html'), 'utf8');
    assert(tos.includes('CONSUMER PROTECTION (E-COMMERCE) RULES, 2020'), 'Terms of Service includes Consumer Protection E-Commerce Rules 2020');
    assert(tos.includes('INTELLECTUAL PROPERTY &amp; BRAND ASSETS'), 'Terms of Service includes Intellectual Property clause');
    assert(tos.includes('LIMITATION OF LIABILITY &amp; DISCLAIMER OF WARRANTIES'), 'Terms of Service includes Limitation of Liability clause');
    assert(tos.includes('Grievance Officer'), 'Terms of Service includes Statutory Grievance Redressal details');
    assert(tos.includes('care@allyrich.com'), 'Terms of Service includes official care@allyrich.com email');

    // Privacy Policy
    const privacy = fs.readFileSync(path.join(__dirname, 'pages', 'privacy-policy.html'), 'utf8');
    assert(privacy.includes('DIGITAL PERSONAL DATA PROTECTION ACT, 2023'), 'Privacy Policy includes DPDP Act 2023');
    assert(privacy.includes('Cashfree Payments'), 'Privacy Policy accurately identifies Cashfree Payments processor');
    assert(privacy.includes('Delhivery Express Logistics'), 'Privacy Policy identifies Delhivery Express');
    assert(privacy.includes('ZERO DATA MONETIZATION GUARANTEE'), 'Privacy Policy includes Zero Data Monetization Guarantee');
    assert(privacy.includes('YOUR STATUTORY RIGHTS (DPDP ACT 2023)'), 'Privacy Policy details Data Principal statutory rights');
    assert(privacy.includes('Data Protection &amp; Grievance Officer'), 'Privacy Policy specifies Data Protection Officer desk');

    // Refund Policy
    const refund = fs.readFileSync(path.join(__dirname, 'pages', 'refund-policy.html'), 'utf8');
    assert(refund.includes('7-DAY HASSLE-FREE SIZE EXCHANGES'), 'Refund Policy includes 7-Day Size Exchange');
    assert(refund.includes('DAMAGED, DEFECTIVE OR WRONG GARMENTS'), 'Refund Policy includes 48-hr Defective/Damaged guarantee');
    assert(refund.includes('REFUND PROCESSING MODES &amp; TIMELINES'), 'Refund Policy includes payment mode breakdown table');
    assert(refund.includes('NON-RETURNABLE / FINAL SALE ITEMS'), 'Refund Policy outlines Final Sale exclusions');

    // Shipping Policy
    const shipping = fs.readFileSync(path.join(__dirname, 'pages', 'shipping-policy.html'), 'utf8');
    assert(shipping.includes('19,000+ PIN CODES SERVICED ACROSS INDIA'), 'Shipping Policy includes Pan-India 19,000+ PIN code coverage');
    assert(shipping.includes('ESTIMATED DELIVERY TIMELINES'), 'Shipping Policy includes metro vs non-metro timeline table');
    assert(shipping.toLowerCase().includes('free express doorstep delivery'), 'Shipping Policy includes free prepaid delivery');
    assert(shipping.includes('TAMPER-PROOF PACKAGING NOTICE'), 'Shipping Policy contains security polybag tamper notice');

    // Returns Walkthrough
    const returns = fs.readFileSync(path.join(__dirname, 'pages', 'returns.html'), 'utf8');
    assert(returns.includes('STEP-BY-STEP EXCHANGE PROCESS'), 'Returns page includes step-by-step walkthrough');
    assert(returns.includes('MANDATORY RETURN CHECKLIST'), 'Returns page includes condition requirements checklist');
    assert(returns.includes('SELF-SHIPMENT IN NON-SERVICEABLE PIN CODES'), 'Returns page covers self-ship courier reimbursement');

    // 3. HTTP Server Route Tests (if server is up)
    console.log('\n[3] Testing HTTP Server Route Handlers:');
    try {
      const routesToTest = [
        '/pages/terms-of-service.html',
        '/pages/terms-of-service',
        '/terms-of-service',
        '/terms',
        '/pages/privacy-policy.html',
        '/privacy-policy',
        '/pages/refund-policy.html',
        '/refund-policy',
        '/pages/shipping-policy.html',
        '/shipping-policy',
        '/pages/returns.html',
        '/returns'
      ];

      for (const route of routesToTest) {
        const res = await request(route);
        assert(res.statusCode === 200, `HTTP GET ${route} -> 200 OK (${res.body.length} bytes)`);
      }
    } catch (netErr) {
      console.log(`  [INFO] Local server is not running on port 3000 (${netErr.message}). Disk tests verified static files.`);
    }

    console.log(`\n========================================`);
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log(`========================================`);

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal test error:', err);
    process.exit(1);
  }
}

runTests();
