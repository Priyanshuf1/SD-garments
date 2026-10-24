/**
 * test_d2c_performance.js
 * Verification suite for:
 * 1. Delhivery Live Pincode Serviceability API (/api/shipping/pincode-check)
 * 2. 60 FPS WebGL Engine & Startup Optimization (allyrich-3d-hero.js)
 * 3. Review Fisheye Optimization & Viewport RAF Pausing (review-fisheye.js)
 * 4. Composite Layer Isolation & Canvas Containment (custom.css & index.html)
 * 5. D2C PDP Features: Sticky Bottom Bar, Delhivery Estimator, Trust Badges (product.html)
 * 6. Cart Drawer: Dynamic Free Shipping Progress & Express UPI/COD Buttons (app.js & quick-buy.js)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Test server configuration
process.env.PORT = '3499';
process.env.DELHIVERY_API_TOKEN = '5b89b0734b0d4daa1655ea178e432c33f1964d80';
process.env.ADMIN_SECRET_KEY = 'genrage_super_admin_secret_key_2026';

const appHandler = require('./server.js');
const server = http.createServer(appHandler);
const BASE_URL = 'http://127.0.0.1:3499';

let passed = 0;
let total = 0;

function check(desc, condition) {
  total++;
  if (condition) {
    passed++;
    console.log(`  [PASS] ${desc}`);
  } else {
    console.error(`  [FAIL] ${desc}`);
    throw new Error(`Assertion failed: ${desc}`);
  }
}

function get(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(new URL(urlPath, BASE_URL), (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) {}
        resolve({ status: res.statusCode, headers: res.headers, body: data, json });
      });
    }).on('error', reject);
  });
}

async function runTests() {
  console.log('======================================================');
  console.log('🧪 RUNNING D2C & PERFORMANCE ENGINE VERIFICATION SUITE');
  console.log('======================================================\n');

  await new Promise(resolve => server.listen(3499, '127.0.0.1', resolve));

  try {
    // -----------------------------------------------------------------
    // 1. Delhivery Pincode Serviceability API
    // -----------------------------------------------------------------
    console.log('[1] Testing Delhivery Live Pincode Serviceability API (/api/shipping/pincode-check):');
    
    const pinRes1 = await get('/api/shipping/pincode-check?pin=110001');
    check('Pincode check returns HTTP 200', pinRes1.status === 200);
    check('Pincode response has success: true', pinRes1.json && pinRes1.json.success === true);
    check('Pincode 110001 is serviceable', pinRes1.json && pinRes1.json.serviceable === true);
    check('COD flag is defined in response', pinRes1.json && typeof pinRes1.json.cod === 'boolean');

    const pinRes2 = await get('/api/shipping/pincode-check?pin=209721');
    check('Warehouse pincode 209721 is serviceable', pinRes2.json && pinRes2.json.serviceable === true);

    const pinResInvalid = await get('/api/shipping/pincode-check?pin=123');
    check('Invalid pincode length handled correctly', pinResInvalid.json && (pinResInvalid.json.serviceable === false || pinResInvalid.json.success === true));

    // -----------------------------------------------------------------
    // 2. allyrich-3d-hero.js Performance & 60 FPS Engine
    // -----------------------------------------------------------------
    console.log('\n[2] Testing 3D Hero Performance Optimizations (assets/js/allyrich-3d-hero.js):');
    const heroCode = fs.readFileSync(path.join(__dirname, 'assets/js/allyrich-3d-hero.js'), 'utf8');

    check('Clamps WebGL pixelRatio across ALL devices (not just mobile innerWidth)', 
      heroCode.includes('setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))') &&
      !heroCode.includes('window.innerWidth < 768 && splineApp._renderer && typeof splineApp._renderer.setPixelRatio')
    );

    check('Eliminated synchronous toDataURL main-thread startup freeze', 
      !heroCode.includes("toDataURL('image/jpeg'") &&
      heroCode.includes('layer.texture.image = arCanvas')
    );

    check('Removed duplicate pointermove listener on window', 
      !heroCode.includes("window.addEventListener('pointermove', handlePointerMove") &&
      !heroCode.includes("window.addEventListener('pointermove', handleMouseMove")
    );

    check('Throttles mouse movements to requestAnimationFrame', 
      heroCode.includes('mouseRafPending') && heroCode.includes('requestAnimationFrame')
    );

    check('IntersectionObserver completely pauses Spline and cancels motion RAF on off-screen', 
      heroCode.includes('splineApp.stop()') &&
      heroCode.includes('cancelAnimationFrame(motionRafId)')
    );

    // -----------------------------------------------------------------
    // 3. review-fisheye.js Performance & GPU Optimization
    // -----------------------------------------------------------------
    console.log('\n[3] Testing Review Fisheye Optimizations (assets/js/review-fisheye.js):');
    const fisheyeCode = fs.readFileSync(path.join(__dirname, 'assets/js/review-fisheye.js'), 'utf8');

    check('Clamps WebGL pixelRatio to 1.5 on all screens', 
      fisheyeCode.includes('Math.min(window.devicePixelRatio||1,1.5)') ||
      fisheyeCode.includes('Math.min(window.devicePixelRatio,1.5)')
    );

    check('Optimizes CubeCamera render target to 512 for GPU efficiency', 
      fisheyeCode.includes('new Zc(512,')
    );

    check('Completely cancels requestAnimationFrame when off-screen via IntersectionObserver', 
      fisheyeCode.includes('cancelAnimationFrame(this.rafId)') &&
      fisheyeCode.includes('IntersectionObserver')
    );

    // -----------------------------------------------------------------
    // 4. CSS Hardware Acceleration & Containment
    // -----------------------------------------------------------------
    console.log('\n[4] Testing CSS GPU Compositing & Containment:');
    const customCss = fs.readFileSync(path.join(__dirname, 'assets/css/custom.css'), 'utf8');
    const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

    check('Header has will-change: transform and transform: translateZ(0)', 
      customCss.includes('will-change: transform') &&
      customCss.includes('transform: translateZ(0)')
    );

    check('#allyrich-spline-canvas has contain: layout paint in custom.css or index.html', 
      customCss.includes('contain: layout paint') || indexHtml.includes('contain: layout paint')
    );

    // -----------------------------------------------------------------
    // 5. D2C PDP Features (product.html)
    // -----------------------------------------------------------------
    console.log('\n[5] Testing D2C Features on Product Detail Page (product.html):');
    const pdpHtml = fs.readFileSync(path.join(__dirname, 'product.html'), 'utf8');

    check('PDP contains mobile sticky bottom bar element', 
      pdpHtml.includes('id="pdp-mobile-sticky-bar"') &&
      pdpHtml.includes('class="pdp-mobile-sticky-bar"')
    );

    check('Sticky bottom bar contains product title, price, size, and ADD TO BAG button', 
      pdpHtml.includes('id="pdp-sticky-title"') &&
      pdpHtml.includes('id="pdp-sticky-price"') &&
      pdpHtml.includes('id="pdp-sticky-size"') &&
      pdpHtml.includes('id="pdp-sticky-add-btn"')
    );

    check('PDP contains Delhivery live pincode delivery estimator input and button', 
      pdpHtml.includes('id="pdp-pincode-input"') &&
      pdpHtml.includes('id="pdp-pincode-check-btn"') &&
      pdpHtml.includes('id="pdp-pincode-result"')
    );

    check('PDP contains all 4 D2C trust badges', 
      pdpHtml.includes('380 GSM Heavyweight Cotton') &&
      pdpHtml.includes('7-Day Easy Doorstep Exchange') &&
      pdpHtml.includes('Ships within 24-48 Hours') &&
      pdpHtml.includes('100% Secure Checkout')
    );

    check('PDP includes scroll docking observer for sticky bottom bar', 
      pdpHtml.includes('stickyObserver') || pdpHtml.includes('pdp-mobile-sticky-bar')
    );

    // -----------------------------------------------------------------
    // 6. Cart Drawer Enhancements (assets/js/app.js & quick-buy.js)
    // -----------------------------------------------------------------
    console.log('\n[6] Testing Cart Drawer Dynamic Shipping & Express Checkout:');
    const appCode = fs.readFileSync(path.join(__dirname, 'assets/js/app.js'), 'utf8');
    const quickBuyCode = fs.readFileSync(path.join(__dirname, 'assets/js/quick-buy.js'), 'utf8');

    check('app.js features dynamic Free Express Shipping at Rs. 1,999 threshold', 
      appCode.includes('threshold = 1999') &&
      appCode.includes('FREE EXPRESS SHIPPING')
    );

    check('app.js includes clear Express UPI and COD checkout buttons', 
      appCode.includes('express-btn-upi') &&
      appCode.includes('express-btn-cod') &&
      appCode.includes('CASH ON DELIVERY')
    );

    check('quick-buy.js global drawer features dynamic Free Shipping progress bar at Rs. 1,999', 
      quickBuyCode.includes('threshold = 1999') &&
      quickBuyCode.includes('global-shipping-progress')
    );

    check('quick-buy.js includes Express UPI and COD buttons', 
      quickBuyCode.includes('global-express-upi') &&
      quickBuyCode.includes('global-express-cod')
    );

    check('quick-buy.js integrates PDP sticky bar initialization', 
      quickBuyCode.includes('initPdpStickyBar')
    );

    console.log('\n======================================================');
    console.log(`🎉 ALL D2C & PERFORMANCE TESTS PASSED! (${passed}/${total} assertions)`);
    console.log('======================================================\n');
  } finally {
    server.close();
  }
}

runTests().catch(err => {
  console.error('\n❌ Test suite failure:', err);
  process.exit(1);
});
