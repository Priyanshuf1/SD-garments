const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE_DIR = 'C:\\Users\\palr8\\.gemini\\antigravity\\scratch\\chrome_test_profile_deep';

async function runDeepVerification() {
  console.log('🚀 Starting Comprehensive Deep Verification Suite...\n');

  let serverProcess = null;
  // Check if server is already running on port 3000
  let serverRunning = false;
  try {
    const res = await fetch('http://127.0.0.1:3000/api/products');
    if (res.ok) serverRunning = true;
  } catch (e) {}

  if (!serverRunning) {
    console.log('Starting local server on port 3000...');
    serverProcess = spawn('node', ['server.js'], { cwd: __dirname, stdio: 'inherit' });
    await new Promise(r => setTimeout(r, 2000));
  } else {
    console.log('Server is already running on port 3000.');
  }

  let allPassed = true;
  function check(cond, msg) {
    if (cond) {
      console.log(`  ✅ [PASS] ${msg}`);
    } else {
      console.error(`  ❌ [FAIL] ${msg}`);
      allPassed = false;
    }
  }

  try {
    // ==============================================================
    // PART 1: API & SERVER-SIDE PRICE PERSISTENCE TESTS
    // ==============================================================
    console.log('\n--- PART 1: Server Price Persistence & Reset Edge Cases ---');

    // 1.1 Test product creation with real price > selling price
    const testProdPayload = {
      title: 'TEST HOODIE EDGE CASE',
      price: '1100',
      compare_at_price: '2200',
      category: 'Hoodies',
      homepage_section: 'none'
    };
    const createRes = await fetch('http://127.0.0.1:3000/api/admin/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': 'dev-admin-secret-2026' },
      body: JSON.stringify(testProdPayload)
    });
    const createData = await createRes.json();
    check(createData.success === true, 'Admin product create returns success');
    const createdId = createData.product.id;
    check(createData.product.price === '1100', 'Created product price is 1100 at root');
    check(createData.product.compare_at_price === '2200', 'Created product compare_at_price is 2200 at root');
    check(createData.product.variants[0].price === '1100', 'Created product price is 1100 in variants[0]');
    check(createData.product.variants[0].compare_at_price === '2200', 'Created product compare_at_price is 2200 in variants[0]');

    // 1.2 Test clearing compare_at_price (removing discount completely)
    const updateRes = await fetch(`http://127.0.0.1:3000/api/admin/products/${createdId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': 'dev-admin-secret-2026' },
      body: JSON.stringify({ compare_at_price: '' })
    });
    const updateData = await updateRes.json();
    check(updateData.success === true, 'Admin product update with empty compare_at_price returns success');
    check(updateData.product.compare_at_price === '', 'compare_at_price at root was successfully cleared to empty string');
    check(updateData.product.variants[0].compare_at_price === '', 'compare_at_price in variants[0] was successfully cleared to empty string');

    // 1.3 Clean up the test product
    const delRes = await fetch(`http://127.0.0.1:3000/api/admin/products/${createdId}`, {
      method: 'DELETE',
      headers: { 'x-admin-key': 'dev-admin-secret-2026' }
    });
    const delData = await delRes.json();
    check(delData.success === true, 'Test product deleted cleanly');

    // ==============================================================
    // PART 2: HEADLESS CHROME STOREFRONT AUTOMATION
    // ==============================================================
    console.log('\n--- PART 2: Headless Chrome Storefront & Navigation Verification ---');

    try {
      if (fs.existsSync(PROFILE_DIR)) {
        fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
      }
    } catch (e) {}

    const chrome = spawn(CHROME_PATH, [
      '--headless=new',
      '--remote-debugging-port=9240',
      `--user-data-dir=${PROFILE_DIR}`,
      '--no-sandbox',
      '--disable-gpu',
      '--disable-extensions',
      '--window-size=1440,1080',
      'about:blank'
    ]);

    let chromeKilled = false;
    function killChrome() {
      if (!chromeKilled) {
        chromeKilled = true;
        try { chrome.kill(); } catch (e) {}
      }
    }
    process.on('exit', killChrome);

    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 200));
      try {
        const res = await fetch('http://127.0.0.1:9240/json/version');
        if (res.ok) break;
      } catch (e) {}
    }

    const targetsRes = await fetch('http://127.0.0.1:9240/json');
    const targets = await targetsRes.json();
    const pageTarget = targets.find(t => t.type === 'page' && !t.url.startsWith('chrome-extension://')) || targets[0];

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    let msgId = 1;
    const callbacks = new Map();

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && callbacks.has(data.id)) {
        callbacks.get(data.id)(data.result);
        callbacks.delete(data.id);
      }
    };

    function send(method, params = {}) {
      return new Promise((resolve) => {
        const id = msgId++;
        callbacks.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await send('Runtime.enable');
    await send('Page.enable');
    await send('DOM.enable');

    async function evaluate(expression) {
      const res = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true
      });
      return res?.result?.value;
    }

    async function takeScreenshot(filename) {
      const res = await send('Page.captureScreenshot', { format: 'png' });
      if (res && res.data) {
        fs.writeFileSync(filename, Buffer.from(res.data, 'base64'));
        console.log(`  📸 Saved screenshot: ${filename}`);
      }
    }

    // 2.1 Verify Homepage STREATBEAR HOODIES card layout
    console.log('\n2.1 Homepage Verification (http://localhost:3000/)');
    await send('Page.navigate', { url: 'http://localhost:3000/' });
    await new Promise(r => setTimeout(r, 2000));

    await evaluate(`
      new Promise(resolve => {
        const start = Date.now();
        const check = () => {
          const cards = Array.from(document.querySelectorAll('product-card, .product-card'));
          const sb = cards.find(c => (c.querySelector('.product-title')?.textContent || '').toUpperCase().includes('STREATBEAR'));
          if (sb && sb.querySelector('.zara-pct')) {
            resolve(true);
          } else if (Date.now() - start > 10000) {
            resolve(false);
          } else {
            setTimeout(check, 100);
          }
        };
        check();
      })
    `);

    const hpInfo = await evaluate(`
      (() => {
        const cards = Array.from(document.querySelectorAll('product-card, .product-card'));
        const sbCard = cards.find(c => (c.querySelector('.product-title')?.textContent || '').toUpperCase().includes('STREATBEAR'));
        if (!sbCard) return { found: false };

        const titleEl = sbCard.querySelector('.product-title');
        const quickAdd = sbCard.querySelector('.product-card__quick-add-button');
        const compareEl = sbCard.querySelector('.product-card__compare-price .money, .price-compare');
        const discountTag = sbCard.querySelector('.product-card__discount-tag');
        const pctEl = sbCard.querySelector('.zara-pct');
        const salePriceEl = sbCard.querySelector('.zara-price, .price');
        const tagStyle = discountTag ? window.getComputedStyle(discountTag) : null;

        // Check for any red elements
        const redEls = Array.from(sbCard.querySelectorAll('*')).filter(el => {
          const col = window.getComputedStyle(el).color;
          return col.includes('229, 9, 20') || col.includes('255, 0, 0') || col.includes('197, 49, 45');
        });

        return {
          found: true,
          title: titleEl?.textContent?.trim(),
          hasQuickAdd: !!quickAdd,
          quickAddText: quickAdd?.textContent?.trim(),
          compareText: compareEl?.textContent?.trim(),
          hasDiscountTag: !!discountTag,
          pctText: pctEl?.textContent?.trim(),
          priceText: salePriceEl?.textContent?.trim(),
          tagBg: tagStyle?.backgroundColor,
          tagColor: tagStyle?.color,
          redCount: redEls.length
        };
      })()
    `);

    console.log('Homepage STREATBEAR Info:', hpInfo);
    check(hpInfo.found === true, 'STREATBEAR card rendered on homepage');
    check(hpInfo.compareText?.includes('2,000') || hpInfo.compareText?.includes('2000'), `STREATBEAR shows strikethrough ₹ 2,000.00 (got: ${hpInfo.compareText})`);
    check(hpInfo.pctText === '-50%', `STREATBEAR displays exact -50% badge (got: ${hpInfo.pctText})`);
    check(hpInfo.priceText?.includes('1,000') || hpInfo.priceText?.includes('1000'), `STREATBEAR shows ₹ 1,000.00 selling price (got: ${hpInfo.priceText})`);
    check(hpInfo.tagBg === 'rgb(0, 0, 0)', 'Discount badge has solid black background (Zara styling)');
    check(hpInfo.tagColor === 'rgb(255, 255, 255)', 'Discount badge has clean white text');
    check(hpInfo.redCount === 0, 'Zero red text in STREATBEAR card');

    // 2.2 Test tapping "TOPS" header link on homepage
    console.log('\n2.2 Testing Tap on "TOPS" from Homepage Header');
    await evaluate(`
      (() => {
        const topsSummary = document.querySelector('summary[data-follow-link="/collections/tops"]');
        if (topsSummary) topsSummary.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 2500));
    const urlAfterTopsTap = await evaluate(`window.location.pathname`);
    console.log('URL after tapping TOPS:', urlAfterTopsTap);
    check(urlAfterTopsTap === '/collections/tops', `Tapping TOPS successfully navigated to /collections/tops (got: ${urlAfterTopsTap})`);

    // 2.3 Test /collections/tops content & Zara layout
    console.log('\n2.3 Verifying /collections/tops Page');
    const topsPageInfo = await evaluate(`
      (() => {
        const cards = Array.from(document.querySelectorAll('product-card, .product-card'));
        const bodyBg = window.getComputedStyle(document.body).backgroundColor;
        const hasSb = cards.some(c => (c.querySelector('.product-title')?.textContent || '').toUpperCase().includes('STREATBEAR'));
        const hasVortex = cards.some(c => (c.querySelector('.product-title')?.textContent || '').toUpperCase().includes('VORTEX'));
        const redEls = Array.from(document.querySelectorAll('.product-card *')).filter(el => {
          const col = window.getComputedStyle(el).color;
          return col.includes('229, 9, 20') || col.includes('255, 0, 0') || col.includes('197, 49, 45');
        });
        return {
          cardCount: cards.length,
          bodyBg,
          hasSb,
          hasVortex,
          redCount: redEls.length
        };
      })()
    `);
    console.log('Tops Page Info:', topsPageInfo);
    check(topsPageInfo.cardCount > 0, `Tops page has products (count: ${topsPageInfo.cardCount})`);
    check(topsPageInfo.hasSb === true, 'STREATBEAR HOODIES appears in /collections/tops');
    check(topsPageInfo.hasVortex === true, 'VORTEX ACID WASH BOX TEE appears in /collections/tops');
    check(topsPageInfo.bodyBg === 'rgb(196, 196, 196)', 'Background is seamless #C4C4C4 (rgb(196, 196, 196))');
    check(topsPageInfo.redCount === 0, 'Zero red text in /collections/tops');

    // 2.4 Test tapping "NEW ARRIVALS" header link from collections page
    console.log('\n2.4 Testing Tap on "NEW ARRIVALS" in Header');
    await evaluate(`
      (() => {
        const link = document.querySelector('a.header-nav-link[href="/collections/new-arrivals"]') ||
                     document.querySelector('a[href="/collections/new-arrivals"]');
        if (link) link.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 2500));
    const urlAfterNewTap = await evaluate(`window.location.pathname`);
    console.log('URL after tapping NEW ARRIVALS:', urlAfterNewTap);
    check(urlAfterNewTap === '/collections/new-arrivals', `Tapping NEW ARRIVALS navigated to /collections/new-arrivals (got: ${urlAfterNewTap})`);

    const newPageInfo = await evaluate(`
      (() => {
        const cards = Array.from(document.querySelectorAll('product-card, .product-card'));
        const sb = cards.find(c => (c.querySelector('.product-title')?.textContent || '').toUpperCase().includes('STREATBEAR'));
        return {
          cardCount: cards.length,
          hasSb: !!sb,
          sbCompare: sb?.querySelector('.product-card__compare-price .money, .price-compare')?.textContent?.trim(),
          sbPct: sb?.querySelector('.zara-pct')?.textContent?.trim(),
          sbPrice: sb?.querySelector('.zara-price, .price')?.textContent?.trim()
        };
      })()
    `);
    console.log('New Arrivals Page Info:', newPageInfo);
    check(newPageInfo.hasSb === true, 'STREATBEAR HOODIES found in /collections/new-arrivals');
    check(newPageInfo.sbPct === '-50%', `STREATBEAR shows -50% in /collections/new-arrivals (got: ${newPageInfo.sbPct})`);
    check(newPageInfo.sbCompare?.includes('2,000') || newPageInfo.sbCompare?.includes('2000'), `STREATBEAR shows ₹ 2,000.00 compare price (got: ${newPageInfo.sbCompare})`);

    // 2.5 Test Single Product Page (/products/streatbear-hoodies)
    console.log('\n2.5 Testing PDP (/products/streatbear-hoodies)');
    await send('Page.navigate', { url: 'http://localhost:3000/products/streatbear-hoodies' });
    await new Promise(r => setTimeout(r, 3000));

    const pdpInfo = await evaluate(`
      (() => {
        const title = document.getElementById('product-title')?.textContent?.trim();
        const price = document.getElementById('product-price')?.textContent?.trim();
        const compare = document.getElementById('product-compare-price')?.textContent?.trim();
        const badge = document.getElementById('product-save-badge')?.textContent?.trim();
        const badgeStyle = document.getElementById('product-save-badge') ? window.getComputedStyle(document.getElementById('product-save-badge')) : null;
        const bodyBg = window.getComputedStyle(document.body).backgroundColor;

        // Check for red text on PDP
        const redEls = Array.from(document.querySelectorAll('.pdp-details *')).filter(el => {
          const col = window.getComputedStyle(el).color;
          return col.includes('229, 9, 20') || col.includes('255, 0, 0') || col.includes('197, 49, 45');
        });

        return {
          title,
          price,
          compare,
          badge,
          badgeBg: badgeStyle?.backgroundColor,
          badgeColor: badgeStyle?.color,
          bodyBg,
          redCount: redEls.length
        };
      })()
    `);
    console.log('PDP Info for STREATBEAR HOODIES:', pdpInfo);
    check(pdpInfo.title?.toUpperCase().includes('STREATBEAR'), `PDP title matches STREATBEAR (got: ${pdpInfo.title})`);
    check(pdpInfo.price?.includes('1,000') || pdpInfo.price?.includes('1000'), `PDP shows Selling Price ₹ 1,000.00 (got: ${pdpInfo.price})`);
    check(pdpInfo.compare?.includes('2,000') || pdpInfo.compare?.includes('2000'), `PDP shows Strikethrough Real Price ₹ 2,000.00 (got: ${pdpInfo.compare})`);
    check(pdpInfo.badge === '-50%', `PDP shows exact -50% discount badge (got: ${pdpInfo.badge})`);
    check(pdpInfo.badgeBg === 'rgb(0, 0, 0)', 'PDP discount badge is solid black background');
    check(pdpInfo.badgeColor === 'rgb(255, 255, 255)', 'PDP discount badge has clean white text');
    check(pdpInfo.bodyBg === 'rgb(196, 196, 196)', 'PDP body background is seamless #C4C4C4');
    check(pdpInfo.redCount === 0, 'Zero red text in PDP details');

    await takeScreenshot('pdp_streatbear_hoodies.png');

    // 2.6 Test Quick-Buy Bottom Sheet on Homepage
    console.log('\n2.6 Testing Quick-Buy Modal for STREATBEAR HOODIES');
    await send('Page.navigate', { url: 'http://localhost:3000/' });
    await new Promise(r => setTimeout(r, 4000));

    const qbOpenRes = await evaluate(`
      (() => {
        const cards = Array.from(document.querySelectorAll('product-card, .product-card'));
        const sb = cards.find(c => (c.querySelector('.product-title')?.textContent || '').toUpperCase().includes('STREATBEAR'));
        if (!sb) return 'sb not found';
        const qbBtn = sb.querySelector('.product-card__quick-add-button');
        if (!qbBtn) return 'qbBtn not found';
        
        // Open via QuickBuyEngine
        if (window.QuickBuyEngine && typeof window.QuickBuyEngine.openWithCardData === 'function') {
          window.QuickBuyEngine.openWithCardData(sb);
          return 'opened_via_engine';
        } else {
          qbBtn.click();
          return 'clicked';
        }
      })()
    `);
    console.log('Quick-buy trigger result:', qbOpenRes);
    await new Promise(r => setTimeout(r, 1500));

    const qbModalData = await evaluate(`
      (() => {
        const drawer = document.getElementById('quick-buy-drawer');
        if (!drawer) return { found: false };
        const price = drawer.querySelector('.qb-price-current')?.textContent?.trim();
        const compare = drawer.querySelector('.qb-price-compare')?.textContent?.trim();
        const badge = drawer.querySelector('.qb-save-badge')?.textContent?.trim();
        const badgeStyle = drawer.querySelector('.qb-save-badge') ? window.getComputedStyle(drawer.querySelector('.qb-save-badge')) : null;

        const redEls = Array.from(drawer.querySelectorAll('*')).filter(el => {
          const col = window.getComputedStyle(el).color;
          return col.includes('229, 9, 20') || col.includes('255, 0, 0') || col.includes('197, 49, 45') || col.includes('185, 28, 28');
        });

        return {
          found: true,
          price,
          compare,
          badge,
          badgeBg: badgeStyle?.backgroundColor,
          badgeColor: badgeStyle?.color,
          redCount: redEls.length
        };
      })()
    `);
    console.log('Quick-Buy Drawer Data:', qbModalData);
    check(qbModalData.found === true, 'Quick-Buy drawer is rendered');
    check(qbModalData.price?.includes('1,000') || qbModalData.price?.includes('1000'), `Quick-Buy price is ₹ 1,000.00 (got: ${qbModalData.price})`);
    check(qbModalData.compare?.includes('2,000') || qbModalData.compare?.includes('2000'), `Quick-Buy compare is ₹ 2,000.00 (got: ${qbModalData.compare})`);
    check(qbModalData.badge === '-50%', `Quick-Buy badge is -50% (got: ${qbModalData.badge})`);
    check(qbModalData.badgeBg === 'rgb(0, 0, 0)', 'Quick-Buy badge has solid black background');
    check(qbModalData.badgeColor === 'rgb(255, 255, 255)', 'Quick-Buy badge has clean white text');
    check(qbModalData.redCount === 0, 'Zero red text in Quick-Buy drawer');

    await takeScreenshot('quick_buy_drawer_streatbear.png');

    killChrome();
  } catch (err) {
    console.error('Test execution error:', err);
    allPassed = false;
  }

  console.log('\n========================================');
  console.log(allPassed ? '🎉 ALL DEEP VERIFICATIONS PASSED!' : '❌ SOME TESTS FAILED');
  console.log('========================================\n');

  process.exit(allPassed ? 0 : 1);
}

runDeepVerification();
