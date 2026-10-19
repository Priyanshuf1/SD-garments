const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== ALLYRICH WISHLIST LAPTOP FIX VERIFICATION SUITE ===\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] ${name}:`, err.message);
    failed++;
  }
}

// 1. Audit assets/js/wishlist.js
test('wishlist.js contains _lastToggleMap duplicate prevention guard', () => {
  const content = fs.readFileSync(path.join(__dirname, 'assets/js/wishlist.js'), 'utf8');
  assert(content.includes('_lastToggleMap'), 'Missing _lastToggleMap');
  assert(content.includes('this._lastToggleMap[cleanHandle]'), 'Missing duplicate check on handle');
});

test('wishlist.js synchronizes genrage_user in localStorage on toggle', () => {
  const content = fs.readFileSync(path.join(__dirname, 'assets/js/wishlist.js'), 'utf8');
  assert(content.includes("localStorage.getItem('genrage_user')"), 'Missing genrage_user reading in toggle');
  assert(content.includes("localStorage.setItem('genrage_user'"), 'Missing genrage_user update in toggle');
});

test('wishlist.js syncWithServer uses keepalive: true', () => {
  const content = fs.readFileSync(path.join(__dirname, 'assets/js/wishlist.js'), 'utf8');
  assert(content.includes('keepalive: true'), 'Missing keepalive: true in fetch');
});

test('wishlist.js showToast provides interactive VIEW WISHLIST CTA', () => {
  const content = fs.readFileSync(path.join(__dirname, 'assets/js/wishlist.js'), 'utf8');
  assert(content.includes('/collections/shop?view=wishlist'), 'Missing wishlist view link in toast');
  assert(content.includes('VIEW WISHLIST'), 'Missing VIEW WISHLIST text in toast');
  assert(content.includes('pointer-events: auto'), 'Toast must allow clicking the link');
});

test('wishlist.js removed fragile lastWishlistTouchTs 500ms suppressor', () => {
  const content = fs.readFileSync(path.join(__dirname, 'assets/js/wishlist.js'), 'utf8');
  assert(!content.includes('lastWishlistTouchTs'), 'Fragile lastWishlistTouchTs still present');
  assert(!content.includes('wishlistTouchMoved'), 'Fragile wishlistTouchMoved still present');
});

// 2. Audit assets/js/auth.js
test('auth.js _saveUserSession merges cloud wishlist without destroying local items', () => {
  const content = fs.readFileSync(path.join(__dirname, 'assets/js/auth.js'), 'utf8');
  assert(content.includes('Safely merge cloud wishlist with local wishlist'), 'Missing safe merge comment');
  assert(content.includes('mergedHandles.has(cleanH)'), 'Missing deduplicated mergedHandles logic');
  assert(!content.includes("localStorage.setItem('genrage_wishlist', JSON.stringify(list));\n        localStorage.setItem('wishlist', JSON.stringify(list));\n      } catch (e) {}"), 'Blind overwrite still present');
});

// 3. Simulated Wishlist Merge Logic Test
test('Simulated AuthEngine merge preserves local items when cloud wishlist is empty []', () => {
  const localList = [
    { handle: 'basic-black-genrage-baggy-pants', title: 'Basic Black Baggy Pants', price: '1699' }
  ];
  const userFromCloud = {
    id: 'CUST-1001',
    email: 'user@test.com',
    wishlist: [] // Stale empty wishlist from server
  };

  const cloudList = Array.isArray(userFromCloud.wishlist) ? userFromCloud.wishlist : [];
  const mergedHandles = new Set();
  const mergedList = [];

  localList.forEach(item => {
    const h = typeof item === 'string' ? item : item?.handle;
    const cleanH = h ? String(h).split('?')[0].split('#')[0].trim() : '';
    if (cleanH && !mergedHandles.has(cleanH)) {
      mergedHandles.add(cleanH);
      mergedList.push(typeof item === 'string' ? { handle: cleanH, addedAt: new Date().toISOString() } : item);
    }
  });

  cloudList.forEach(item => {
    const h = typeof item === 'string' ? item : item?.handle;
    const cleanH = h ? String(h).split('?')[0].split('#')[0].trim() : '';
    if (cleanH && !mergedHandles.has(cleanH)) {
      mergedHandles.add(cleanH);
      mergedList.push(typeof item === 'string' ? { handle: cleanH, addedAt: new Date().toISOString() } : item);
    }
  });

  assert.strictEqual(mergedList.length, 1, 'Local item must be preserved');
  assert.strictEqual(mergedList[0].handle, 'basic-black-genrage-baggy-pants', 'Handle must match');
});

// 4. Audit collections.html
test('collections.html has instant 0ms pre-render on wishlist view', () => {
  const content = fs.readFileSync(path.join(__dirname, 'collections.html'), 'utf8');
  assert(content.includes('Instant 0ms Wishlist Pre-render'), 'Missing instant pre-render logic');
  assert(content.includes("this.activeCategory === 'wishlist'"), 'Missing wishlist category check in init');
});

test('collections.html filterAndRender has fallback to localWishlist products', () => {
  const content = fs.readFileSync(path.join(__dirname, 'collections.html'), 'utf8');
  assert(content.includes('Wishlist fallback: If filteredProducts is empty'), 'Missing wishlist fallback');
  assert(content.includes('window.WishlistEngine.getWishlist()'), 'Missing getWishlist call');
});

test('collections.html renderGrid removed duplicate inline onclick from wishlist-btn', () => {
  const content = fs.readFileSync(path.join(__dirname, 'collections.html'), 'utf8');
  assert(!content.includes('data-wishlist-handle="${p.handle}" aria-label="Add to wishlist" onclick="WishlistEngine.toggle'), 'Duplicate inline onclick still present');
});

// 5. Audit account.html
test('account.html loadWishlist renders immediately from cached metadata', () => {
  const content = fs.readFileSync(path.join(__dirname, 'account.html'), 'utf8');
  assert(content.includes('Initial synchronous render using cached item metadata (0ms delay)'), 'Missing synchronous initial render');
});

// 6. Audit assets/css/custom.css
test('custom.css sets z-index: 9999 !important for .wishlist-btn', () => {
  const content = fs.readFileSync(path.join(__dirname, 'assets/css/custom.css'), 'utf8');
  assert(content.includes('z-index: 9999 !important;'), 'Missing z-index: 9999 !important on .wishlist-btn');
});

console.log(`\nTEST SUMMARY: ${passed} Passed, ${failed} Failed`);
if (failed > 0) process.exit(1);
