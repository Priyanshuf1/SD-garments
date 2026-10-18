const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('🧪 Starting AllyRich Loader & Footer Verification...\n');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}:`, err.message);
    process.exit(1);
  }
}

// 1. Asset verification
const requiredAssets = [
  'ar-logo.png',
  'footer-ruins.webp',
  'loader-mark.svg',
  'logo-forum-chariot.svg',
  'barlow-semi-condensed-600.woff2',
  'shippori-mincho-b1-500.woff2'
];

requiredAssets.forEach(file => {
  test(`Asset exists: assets/${file}`, () => {
    const p = path.join(__dirname, 'assets', file);
    assert(fs.existsSync(p), `Missing asset: ${file}`);
    assert(fs.statSync(p).size > 0, `Asset is empty: ${file}`);
  });
});

// 2. CSS verification
test('assets/css/allyrich.css exists and defines loader & ruins footer rules', () => {
  const css = fs.readFileSync(path.join(__dirname, 'assets', 'css', 'allyrich.css'), 'utf8');
  assert(css.includes('--color-obsidian: #111112;'), 'CSS missing --color-obsidian');
  assert(css.includes('.loader'), 'CSS missing .loader class');
  assert(css.includes('.loader__brand'), 'CSS missing .loader__brand');
  assert(css.includes('clip-path: inset(-2px 100% -2px 0);'), 'CSS missing etching clip-path');
  assert(css.includes('.loader--filling .loader__brand'), 'CSS missing .loader--filling');
  assert(css.includes('.loader--lit .loader__brand'), 'CSS missing .loader--lit');
  assert(css.includes('.site-footer__bg'), 'CSS missing .site-footer__bg');
  assert(css.includes('.site-footer__content'), 'CSS missing .site-footer__content');
  assert(css.includes('.site-footer__band'), 'CSS missing .site-footer__band');
});

// 3. JS verification
test('assets/js/allyrich-loader.js exists and defines loader animation lifecycle', () => {
  const js = fs.readFileSync(path.join(__dirname, 'assets', 'js', 'allyrich-loader.js'), 'utf8');
  assert(js.includes('runLoaderAnimation'), 'JS missing runLoaderAnimation');
  assert(js.includes('loader--filling'), 'JS missing loader--filling');
  assert(js.includes('loader--lit'), 'JS missing loader--lit');
  assert(js.includes('loader--done'), 'JS missing loader--done');
  assert(js.includes('window.replayAllyRichLoader'), 'JS missing replay hook');
});

// 4. HTML Page Integration
const pages = ['index.html', 'collections.html', 'product.html'];

pages.forEach(page => {
  test(`${page} integrates AllyRich loader, styles, and footer`, () => {
    const html = fs.readFileSync(path.join(__dirname, page), 'utf8');
    assert(html.includes('/assets/css/allyrich.css'), `${page} missing allyrich.css link`);
    assert(html.includes('id="ForumLoader"'), `${page} missing #ForumLoader`);
    assert(html.includes('assets/ar-logo.png') || html.includes('/assets/ar-logo.png'), `${page} missing ar-logo.png`);
    assert(html.includes('class="loader__brand"'), `${page} missing loader__brand`);
    assert(html.includes('assets/footer-ruins.webp') || html.includes('/assets/footer-ruins.webp'), `${page} missing footer ruins image`);
    assert(html.includes('site-footer'), `${page} missing site-footer class`);
    assert(html.includes('/assets/js/allyrich-loader.js'), `${page} missing allyrich-loader.js script`);
  });
});

console.log(`\n========================================`);
console.log(`TOTAL TESTS: ${passed} | PASSED: ${passed} | FAILED: 0`);
console.log(`========================================\n`);
