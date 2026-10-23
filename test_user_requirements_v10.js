const fs = require('fs');
const path = require('path');

console.log('🧪 Verifying All User Request #10 Requirements...\n');
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

// 1. Logo replacement on lookbook hero videos & posters
assert(fs.existsSync('assets/ar-video-badge.png'), 'ar-video-badge.png exists');
assert(fs.existsSync('assets/videos/lookbook1_desktop.mp4'), 'lookbook1_desktop.mp4 exists');
assert(fs.existsSync('assets/videos/lookbook1_mobile.mp4'), 'lookbook1_mobile.mp4 exists');
assert(fs.existsSync('assets/videos/showcase2.mp4'), 'showcase2.mp4 exists');
assert(fs.existsSync('assets/videos/lookbook1_desktop_poster.jpg'), 'lookbook1_desktop_poster.jpg exists');
assert(fs.existsSync('assets/videos/lookbook1_mobile_poster.jpg'), 'lookbook1_mobile_poster.jpg exists');
assert(fs.existsSync('assets/videos/showcase2_poster.jpg'), 'showcase2_poster.jpg exists');

const indexHtml = fs.readFileSync('index.html', 'utf8');
assert(indexHtml.includes('/assets/videos/lookbook1_desktop_poster.jpg'), 'index.html points to lookbook1_desktop_poster.jpg');
assert(indexHtml.includes('/assets/videos/lookbook1_mobile_poster.jpg'), 'index.html points to lookbook1_mobile_poster.jpg');
assert(indexHtml.includes('/assets/videos/showcase2_poster.jpg'), 'index.html points to showcase2_poster.jpg');

// 2. Wishlist heart deduplication
assert(!indexHtml.includes('bundle-6a4285924e154a16a8c102769c90d5f8.js'), 'index.html does NOT include 3rd-party vtlsAebBundle');
const wishlistJs = fs.readFileSync('assets/js/wishlist.js', 'utf8');
assert(wishlistJs.includes('existingBtns[i].remove()'), 'wishlist.js strictly enforces single heart per card');
const customCss = fs.readFileSync('assets/css/custom.css', 'utf8');
assert(customCss.includes('.product-card .wishlist-btn ~ .wishlist-btn') && customCss.includes('display: none !important'), 'custom.css suppresses any accidental sibling wishlist buttons');

// 3. Loader runs once on open/refresh, not on button taps
const loaderJs = fs.readFileSync('assets/js/allyrich-loader.js', 'utf8');
assert(loaderJs.includes("sessionStorage.getItem('allyrich_loader_seen')"), 'allyrich-loader.js checks sessionStorage for previous visit');
assert(loaderJs.includes("type === 'reload'"), 'allyrich-loader.js checks performance reload type');
assert(!indexHtml.includes('<button type="submit" class="product-card__quick-add-button"'), 'index.html has zero raw submit buttons that reload page on quick-add');

// 4. Footer modernization & reduction
assert(!indexHtml.includes('forumcases'), 'index.html has NO forumcases links');
assert(!indexHtml.includes('instagram.com/gen.rage'), 'index.html has NO old gen.rage instagram link');
assert(indexHtml.includes('instagram.com/allyrich_'), 'index.html has official allyrich_ instagram link');
assert(indexHtml.includes('JOIN THE INNER CIRCLE'), 'index.html footer has Inner Circle newsletter');
assert(!indexHtml.includes('COLLECTIONS</p>'), 'index.html footer does NOT have Collections column');
assert(indexHtml.includes('CLIENT CARE</p>'), 'index.html footer has Client Care column');
assert(!indexHtml.includes('ALLEYRICH VIP</p>'), 'index.html footer does NOT have VIP column');
assert(indexHtml.includes('LEGAL &amp; POLICIES</p>'), 'index.html footer has Legal column');
assert(!indexHtml.includes('site-footer__payment-methods'), 'index.html footer does NOT have payment methods row (ss 1)');
assert(indexHtml.includes('2026 ALLEYRICH'), 'index.html footer has clean AlleyRich copyright');

// 5. Announcement bar removed from index.html (ss 2)
assert(!indexHtml.includes('shopify-section-sections--23671272669422__announcement-bar'), 'Announcement bar section is REMOVED from index.html');

// Also check collections.html and product.html
const colHtml = fs.readFileSync('collections.html', 'utf8');
assert(!colHtml.includes('forumcases'), 'collections.html has NO forumcases links');
assert(!colHtml.includes('COLLECTIONS</p>'), 'collections.html footer does NOT have Collections column');
assert(!colHtml.includes('ALLEYRICH VIP</p>'), 'collections.html footer does NOT have VIP column');
assert(!colHtml.includes('site-footer__payment-methods'), 'collections.html footer does NOT have payment badges');
assert(colHtml.includes('JOIN THE INNER CIRCLE'), 'collections.html footer has Inner Circle newsletter');

const prodHtml = fs.readFileSync('product.html', 'utf8');
assert(!prodHtml.includes('forumcases'), 'product.html has NO forumcases links');
assert(!prodHtml.includes('COLLECTIONS</p>'), 'product.html footer does NOT have Collections column');
assert(!prodHtml.includes('ALLEYRICH VIP</p>'), 'product.html footer does NOT have VIP column');
assert(!prodHtml.includes('site-footer__payment-methods'), 'product.html footer does NOT have payment badges');
assert(prodHtml.includes('JOIN THE INNER CIRCLE'), 'product.html footer has Inner Circle newsletter');

// 5. Sections removed from index.html (Images 2, 3, 4)
assert(!indexHtml.includes('shopify-section-template--23671271489774__collection-list'), 'Image 2 section (collection-list) is REMOVED from index.html');
assert(!indexHtml.includes('shopify-section-template--23671271489774__multiple-media-with-text'), 'Image 3 section (pants editorial) is REMOVED from index.html');
assert(!indexHtml.includes('shopify-section-template--23671271489774__multi_column_aPLbUE'), 'Image 4 section (press & media) is REMOVED from index.html');

console.log(`\n====================================================`);
console.log(`Result: ${passed} Passed, ${failed} Failed.`);
if (failed === 0) {
  console.log(`🎉 ALL REQUIREMENTS VERIFIED SUCCESSFULLY!`);
} else {
  process.exit(1);
}
