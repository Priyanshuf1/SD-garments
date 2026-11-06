const fs = require('fs');
const path = require('path');

let pass = 0;
let fail = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    pass++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    fail++;
  }
}

console.log('--- RUNNING VERIFICATION FOR USER ISSUES ---');

// 1. Verify admin.html fixes
const adminHtml = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');

// A: No demo images
assert(!adminHtml.includes('1_cd34702d-ac3b-4ee4-a9d4-1733e518d430'), 'admin.html has ZERO occurrences of legacy demo shopify image');
assert(adminHtml.includes("document.getElementById('edit-prod-image').value = '';"), 'openAddProductModal initializes edit-prod-image to empty string');
assert(adminHtml.includes("document.getElementById('edit-prod-hover-image').value = '';"), 'openAddProductModal initializes edit-prod-hover-image to empty string');
assert(adminHtml.includes("this.previewProductImage('');"), 'openAddProductModal clears primary preview');

// B: Add Collection buttons
assert(adminHtml.includes('id="btn-add-collection"'), 'admin.html has btn-add-collection');
assert(adminHtml.includes('+ Add Collection'), 'btn-add-collection has label "+ Add Collection"');
assert(adminHtml.includes('NEW COLLECTION'), 'Top action bar has NEW COLLECTION shortcut');
assert(adminHtml.includes('openAddCollectionModal()'), 'admin.html defines openAddCollectionModal()');

// 2. Verify 3D Hero Phone Screen
const heroJs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'allyrich-3d-hero.js'), 'utf8');
assert(heroJs.includes("layer.updateTexture(screenUrl)"), 'allyrich-3d-hero.js calls layer.updateTexture(screenUrl) to bind phone texture');
assert(heroJs.includes('/assets/spline/scene.splinecode'), 'allyrich-3d-hero.js loads scene.splinecode directly');
assert(!heroJs.includes('/assets/spline/scene.bin'), 'allyrich-3d-hero.js does NOT attempt 404 scene.bin load');
assert(fs.existsSync(path.join(__dirname, '..', 'assets', 'spline-phone-screen.jpg')), 'assets/spline-phone-screen.jpg exists on disk');

// 3. Verify index.html navigation and preloads
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert(indexHtml.includes('/assets/spline/scene.splinecode'), 'index.html preloads scene.splinecode');
assert(!indexHtml.includes('/assets/spline/scene.bin'), 'index.html does not preload scene.bin');
assert(indexHtml.includes('data-title="COLLECTIONS"'), 'index.html desktop nav includes COLLECTIONS dropdown');
assert(indexHtml.includes('COLLECTIONS & DROPS</a>'), 'index.html mobile drawer includes COLLECTIONS & DROPS');

// 4. Verify collections.html dynamic collections & showcase
const colHtml = fs.readFileSync(path.join(__dirname, '..', 'collections.html'), 'utf8');
assert(colHtml.includes('/api/collections'), 'collections.html fetches /api/collections dynamically');
assert(colHtml.includes('renderCollectionsShowcase'), 'collections.html defines renderCollectionsShowcase()');
assert(colHtml.includes('view=drops'), 'collections.html supports view=drops');

// 5. Verify server.js public collections endpoint
const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
assert(serverJs.includes("pathname === '/api/collections'"), 'server.js defines public /api/collections endpoint');

console.log(`\nVerification Summary: ${pass} PASSED, ${fail} FAILED`);
if (fail > 0) process.exit(1);
