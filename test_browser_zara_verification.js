const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE_DIR = 'C:\\Users\\palr8\\.gemini\\antigravity\\scratch\\chrome_test_profile_zara';

async function runBrowserTests() {
  console.log('🌐 Starting Headless Chrome Verification for Zara Layout, Discounts & Collections...\n');

  try {
    if (fs.existsSync(PROFILE_DIR)) {
      fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
    }
  } catch (e) {}

  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9235',
    `--user-data-dir=${PROFILE_DIR}`,
    '--no-sandbox',
    '--disable-gpu',
    '--disable-extensions',
    '--window-size=1440,1080',
    'about:blank'
  ]);

  let killed = false;
  function cleanup() {
    if (!killed) {
      killed = true;
      try { chrome.kill(); } catch (e) {}
    }
  }
  process.on('exit', cleanup);
  process.on('SIGINT', cleanup);

  try {
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 200));
      try {
        const res = await fetch('http://127.0.0.1:9235/json/version');
        if (res.ok) break;
      } catch (e) {}
    }

    const targetsRes = await fetch('http://127.0.0.1:9235/json');
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

    let allPassed = true;
    function check(cond, msg) {
      if (cond) {
        console.log(`  ✅ [PASS] ${msg}`);
      } else {
        console.error(`  ❌ [FAIL] ${msg}`);
        allPassed = false;
      }
    }

    // ==============================================================
    // TEST 1: HOMEPAGE VERIFICATION (STREATBEAR HOODIES & SECTIONS)
    // ==============================================================
    console.log('\n--- 1. Testing Homepage (http://localhost:3000/) ---');
    await send('Page.navigate', { url: 'http://localhost:3000/' });
    await new Promise(r => setTimeout(r, 4500));

    await evaluate(`
      new Promise(resolve => {
        const start = Date.now();
        const check = () => {
          const cards = Array.from(document.querySelectorAll('product-card, .product-card'));
          const sb = cards.find(c => (c.querySelector('.product-title')?.textContent || '').toUpperCase().includes('STREATBEAR'));
          if (sb && sb.querySelector('.zara-pct')) {
            resolve(true);
          } else if (Date.now() - start > 8000) {
            resolve(false);
          } else {
            setTimeout(check, 100);
          }
        };
        check();
      })
    `);

    const hpData = await evaluate(`
      (() => {
        const cards = Array.from(document.querySelectorAll('product-card, .product-card'));
        const sbCard = cards.find(c => {
          const title = c.querySelector('.product-title')?.textContent || '';
          return title.toUpperCase().includes('STREATBEAR');
        });

        let sbDetails = null;
        if (sbCard) {
          const titleEl = sbCard.querySelector('.product-title');
          const quickAdd = sbCard.querySelector('.product-card__quick-add-button');
          const compareEl = sbCard.querySelector('.product-card__compare-price .money, .price-compare');
          const discountTag = sbCard.querySelector('.product-card__discount-tag');
          const pctEl = sbCard.querySelector('.zara-pct');
          const salePriceEl = sbCard.querySelector('.zara-price, .price');
          const regularPriceEl = sbCard.querySelector('.product-card__regular-price');
          const titleStyle = titleEl ? window.getComputedStyle(titleEl) : null;
          const discountTagStyle = discountTag ? window.getComputedStyle(discountTag) : null;
          const compareStyle = compareEl ? window.getComputedStyle(compareEl) : null;

          // Check for any red text in card
          const allTextEls = Array.from(sbCard.querySelectorAll('*'));
          const redElements = allTextEls.filter(el => {
            const color = window.getComputedStyle(el).color;
            return color.includes('229, 9, 20') || color.includes('255, 0, 0') || color.includes('197, 49, 45') || color.includes('red');
          });

          sbDetails = {
            found: true,
            title: titleEl?.textContent?.trim(),
            titleTextAlign: titleStyle?.textAlign,
            hasQuickAdd: !!quickAdd,
            quickAddText: quickAdd?.textContent?.trim(),
            compareText: compareEl?.textContent?.trim(),
            compareLineThrough: compareStyle?.textDecorationLine,
            discountTagExists: !!discountTag,
            pctText: pctEl?.textContent?.trim(),
            salePriceText: salePriceEl?.textContent?.trim(),
            tagBg: discountTagStyle?.backgroundColor,
            tagColor: discountTagStyle?.color,
            redTextCount: redElements.length,
            regularPriceExists: !!regularPriceEl
          };
        }

        const addedProds = [
          'VORTEX ACID WASH BOX TEE',
          'PHANTOM CARGO SKATER PANTS',
          'CYBERPUNK OVERSIZED HEAVY HOODIE',
          'RAW ESSENTIALS MINIMAL BALLOON PANT'
        ];
        const addedFound = {};
        for (const t of addedProds) {
          const found = cards.find(c => (c.querySelector('.product-title')?.textContent || '').toUpperCase().includes(t));
          if (found) {
            addedFound[t] = {
              title: found.querySelector('.product-title')?.textContent?.trim(),
              compareText: found.querySelector('.product-card__compare-price .money, .price-compare')?.textContent?.trim(),
              pctText: found.querySelector('.zara-pct')?.textContent?.trim(),
              priceText: found.querySelector('.zara-price, .price')?.textContent?.trim(),
              quickAdd: found.querySelector('.product-card__quick-add-button')?.textContent?.trim()
            };
          }
        }

        return {
          totalCards: cards.length,
          sbDetails,
          addedFound
        };
      })()
    `);

    console.log('Homepage STREATBEAR Details:', hpData?.sbDetails);
    check(hpData?.sbDetails?.found === true, 'STREATBEAR HOODIES card is rendered on homepage');
    check(hpData?.sbDetails?.compareText?.includes('2,000') || hpData?.sbDetails?.compareText?.includes('2000'), `STREATBEAR shows strikethrough Real Price ₹ 2,000.00 (found: ${hpData?.sbDetails?.compareText})`);
    check(hpData?.sbDetails?.pctText === '-50%', `STREATBEAR shows exact -50% discount badge (found: ${hpData?.sbDetails?.pctText})`);
    check(hpData?.sbDetails?.salePriceText?.includes('1,000') || hpData?.sbDetails?.salePriceText?.includes('1000'), `STREATBEAR shows Selling Price ₹ 1,000.00 (found: ${hpData?.sbDetails?.salePriceText})`);
    check(hpData?.sbDetails?.hasQuickAdd === true && hpData?.sbDetails?.quickAddText === '+', 'STREATBEAR has "+" quick add button');
    check(hpData?.sbDetails?.tagBg === 'rgb(0, 0, 0)', 'STREATBEAR discount badge has solid black background (Zara styling)');
    check(hpData?.sbDetails?.tagColor === 'rgb(255, 255, 255)', 'STREATBEAR discount badge has clean white text');
    check(hpData?.sbDetails?.redTextCount === 0, 'STREATBEAR card has ZERO red text');

    console.log('\nHomepage Newly Added Products:', hpData?.addedFound);
    check(!!hpData?.addedFound['VORTEX ACID WASH BOX TEE'], 'VORTEX ACID WASH BOX TEE rendered in Homepage Showcase');
    check(!!hpData?.addedFound['PHANTOM CARGO SKATER PANTS'], 'PHANTOM CARGO SKATER PANTS rendered in Homepage Showcase');
    check(!!hpData?.addedFound['CYBERPUNK OVERSIZED HEAVY HOODIE'], 'CYBERPUNK OVERSIZED HEAVY HOODIE rendered in Homepage Showcase');
    check(!!hpData?.addedFound['RAW ESSENTIALS MINIMAL BALLOON PANT'], 'RAW ESSENTIALS MINIMAL BALLOON PANT rendered in Homepage Showcase');

    await takeScreenshot('homepage_streatbear_and_products.png');

    // ==============================================================
    // TEST 2: COLLECTIONS TOPS (/collections/tops)
    // ==============================================================
    console.log('\n--- 2. Testing /collections/tops ---');
    await send('Page.navigate', { url: 'http://localhost:3000/collections/tops' });
    await new Promise(r => setTimeout(r, 4000));

    const topsData = await evaluate(`
      (() => {
        const cards = Array.from(document.querySelectorAll('product-card, .product-card'));
        const title = document.getElementById('page-title')?.textContent;
        const count = document.getElementById('page-count-text')?.textContent;
        const bodyBg = window.getComputedStyle(document.body).backgroundColor;

        const hasStreatbear = cards.some(c => (c.querySelector('.product-title')?.textContent || '').toUpperCase().includes('STREATBEAR'));
        const hasVortex = cards.some(c => (c.querySelector('.product-title')?.textContent || '').toUpperCase().includes('VORTEX'));

        // Check red text across all rendered cards
        const redElements = Array.from(document.querySelectorAll('.product-card *')).filter(el => {
          const color = window.getComputedStyle(el).color;
          return color.includes('229, 9, 20') || color.includes('255, 0, 0') || color.includes('197, 49, 45') || color.includes('red');
        });

        return {
          cardCount: cards.length,
          title,
          count,
          bodyBg,
          hasStreatbear,
          hasVortex,
          redTextCount: redElements.length
        };
      })()
    `);

    console.log('Tops Collection Data:', topsData);
    check(topsData.cardCount > 0, `Tops collection populated with products (found: ${topsData.cardCount})`);
    check(topsData.hasStreatbear === true, 'STREATBEAR HOODIES appears under /collections/tops');
    check(topsData.hasVortex === true, 'VORTEX ACID WASH BOX TEE appears under /collections/tops');
    check(topsData.bodyBg === 'rgb(196, 196, 196)', `Background is seamless #C4C4C4 (rgb(196, 196, 196)) (found: ${topsData.bodyBg})`);
    check(topsData.redTextCount === 0, `Zero red text in /collections/tops cards (found: ${topsData.redTextCount})`);

    await takeScreenshot('collections_tops.png');

    // ==============================================================
    // TEST 3: COLLECTIONS NEW ARRIVALS (/collections/new-arrivals)
    // ==============================================================
    console.log('\n--- 3. Testing /collections/new-arrivals ---');
    await send('Page.navigate', { url: 'http://localhost:3000/collections/new-arrivals' });
    await new Promise(r => setTimeout(r, 4000));

    const newData = await evaluate(`
      (() => {
        const cards = Array.from(document.querySelectorAll('product-card, .product-card'));
        const title = document.getElementById('page-title')?.textContent;
        const count = document.getElementById('page-count-text')?.textContent;

        const sbCard = cards.find(c => (c.querySelector('.product-title')?.textContent || '').toUpperCase().includes('STREATBEAR'));
        let sbInfo = null;
        if (sbCard) {
          sbInfo = {
            title: sbCard.querySelector('.product-title')?.textContent?.trim(),
            compare: sbCard.querySelector('.product-card__compare-price .money, .price-compare')?.textContent?.trim(),
            pct: sbCard.querySelector('.zara-pct')?.textContent?.trim(),
            price: sbCard.querySelector('.zara-price, .price')?.textContent?.trim(),
            quickAdd: sbCard.querySelector('.product-card__quick-add-button')?.textContent?.trim()
          };
        }

        const hasCyberpunk = cards.some(c => (c.querySelector('.product-title')?.textContent || '').toUpperCase().includes('CYBERPUNK'));
        const hasVortex = cards.some(c => (c.querySelector('.product-title')?.textContent || '').toUpperCase().includes('VORTEX'));

        return {
          cardCount: cards.length,
          title,
          count,
          sbInfo,
          hasCyberpunk,
          hasVortex
        };
      })()
    `);

    console.log('New Arrivals Data:', newData);
    check(newData.cardCount > 0, `New Arrivals populated with products (found: ${newData.cardCount})`);
    check(newData.sbInfo !== null, 'STREATBEAR HOODIES found in /collections/new-arrivals');
    check(newData.sbInfo?.pct === '-50%', `STREATBEAR displays -50% in /collections/new-arrivals (found: ${newData.sbInfo?.pct})`);
    check(newData.sbInfo?.compare?.includes('2,000') || newData.sbInfo?.compare?.includes('2000'), `STREATBEAR displays ₹ 2,000.00 compare in /collections/new-arrivals (found: ${newData.sbInfo?.compare})`);
    check(newData.hasCyberpunk === true, 'CYBERPUNK OVERSIZED HEAVY HOODIE found in /collections/new-arrivals');
    check(newData.hasVortex === true, 'VORTEX ACID WASH BOX TEE found in /collections/new-arrivals');

    await takeScreenshot('collections_new_arrivals.png');

    // ==============================================================
    // TEST 4: COLLECTIONS PANTS (/collections/baggy-pants)
    // ==============================================================
    console.log('\n--- 4. Testing /collections/baggy-pants ---');
    await send('Page.navigate', { url: 'http://localhost:3000/collections/baggy-pants' });
    await new Promise(r => setTimeout(r, 4000));

    const pantsData = await evaluate(`
      (() => {
        const cards = Array.from(document.querySelectorAll('product-card, .product-card'));
        const hasPhantom = cards.some(c => (c.querySelector('.product-title')?.textContent || '').toUpperCase().includes('PHANTOM CARGO'));
        const hasRawEssentials = cards.some(c => (c.querySelector('.product-title')?.textContent || '').toUpperCase().includes('RAW ESSENTIALS'));
        const phantomCard = cards.find(c => (c.querySelector('.product-title')?.textContent || '').toUpperCase().includes('PHANTOM CARGO'));
        let phantomInfo = null;
        if (phantomCard) {
          phantomInfo = {
            title: phantomCard.querySelector('.product-title')?.textContent?.trim(),
            compare: phantomCard.querySelector('.product-card__compare-price .money, .price-compare')?.textContent?.trim(),
            pct: phantomCard.querySelector('.zara-pct')?.textContent?.trim(),
            price: phantomCard.querySelector('.zara-price, .price')?.textContent?.trim()
          };
        }
        return {
          cardCount: cards.length,
          hasPhantom,
          hasRawEssentials,
          phantomInfo
        };
      })()
    `);

    console.log('Pants Collection Data:', pantsData);
    check(pantsData.cardCount > 0, `Pants collection populated (found: ${pantsData.cardCount})`);
    check(pantsData.hasPhantom === true, 'PHANTOM CARGO SKATER PANTS found in /collections/baggy-pants');
    check(pantsData.phantomInfo?.pct === '-40%', `PHANTOM CARGO displays -40% (found: ${pantsData.phantomInfo?.pct})`);
    check(pantsData.phantomInfo?.compare?.includes('2,999') || pantsData.phantomInfo?.compare?.includes('2999'), `PHANTOM CARGO displays ₹ 2,999.00 compare price (found: ${pantsData.phantomInfo?.compare})`);

    await takeScreenshot('collections_pants.png');

    // ==============================================================
    // TEST 5: COLLECTIONS BASICS (/collections/basics-genrage)
    // ==============================================================
    console.log('\n--- 5. Testing /collections/basics-genrage ---');
    await send('Page.navigate', { url: 'http://localhost:3000/collections/basics-genrage' });
    await new Promise(r => setTimeout(r, 4000));

    const basicsData = await evaluate(`
      (() => {
        const cards = Array.from(document.querySelectorAll('product-card, .product-card'));
        const hasRaw = cards.some(c => (c.querySelector('.product-title')?.textContent || '').toUpperCase().includes('RAW ESSENTIALS'));
        const rawCard = cards.find(c => (c.querySelector('.product-title')?.textContent || '').toUpperCase().includes('RAW ESSENTIALS'));
        let rawInfo = null;
        if (rawCard) {
          rawInfo = {
            title: rawCard.querySelector('.product-title')?.textContent?.trim(),
            compare: rawCard.querySelector('.product-card__compare-price .money, .price-compare')?.textContent?.trim(),
            pct: rawCard.querySelector('.zara-pct')?.textContent?.trim(),
            price: rawCard.querySelector('.zara-price, .price')?.textContent?.trim()
          };
        }
        return {
          cardCount: cards.length,
          hasRaw,
          rawInfo
        };
      })()
    `);

    console.log('Basics Collection Data:', basicsData);
    check(basicsData.cardCount > 0, `Basics collection populated (found: ${basicsData.cardCount})`);
    check(basicsData.hasRaw === true, 'RAW ESSENTIALS MINIMAL BALLOON PANT found in /collections/basics-genrage');
    check(basicsData.rawInfo?.pct === '-50%', `RAW ESSENTIALS displays -50% (found: ${basicsData.rawInfo?.pct})`);

    await takeScreenshot('collections_basics.png');

    // ==============================================================
    // TEST 6: COLLECTIONS HOODIES (/collections/hoodies-for-men)
    // ==============================================================
    console.log('\n--- 6. Testing /collections/hoodies-for-men ---');
    await send('Page.navigate', { url: 'http://localhost:3000/collections/hoodies-for-men' });
    await new Promise(r => setTimeout(r, 4000));

    const hoodiesData = await evaluate(`
      (() => {
        const cards = Array.from(document.querySelectorAll('product-card, .product-card'));
        const hasStreatbear = cards.some(c => (c.querySelector('.product-title')?.textContent || '').toUpperCase().includes('STREATBEAR'));
        const hasCyberpunk = cards.some(c => (c.querySelector('.product-title')?.textContent || '').toUpperCase().includes('CYBERPUNK'));
        const sbCard = cards.find(c => (c.querySelector('.product-title')?.textContent || '').toUpperCase().includes('STREATBEAR'));
        let sbInfo = null;
        if (sbCard) {
          sbInfo = {
            title: sbCard.querySelector('.product-title')?.textContent?.trim(),
            compare: sbCard.querySelector('.product-card__compare-price .money, .price-compare')?.textContent?.trim(),
            pct: sbCard.querySelector('.zara-pct')?.textContent?.trim(),
            price: sbCard.querySelector('.zara-price, .price')?.textContent?.trim()
          };
        }
        return {
          cardCount: cards.length,
          hasStreatbear,
          hasCyberpunk,
          sbInfo
        };
      })()
    `);

    console.log('Hoodies Collection Data:', hoodiesData);
    check(hoodiesData.cardCount > 0, `Hoodies collection populated (found: ${hoodiesData.cardCount})`);
    check(hoodiesData.hasStreatbear === true, 'STREATBEAR HOODIES found in /collections/hoodies-for-men');
    check(hoodiesData.hasCyberpunk === true, 'CYBERPUNK OVERSIZED HEAVY HOODIE found in /collections/hoodies-for-men');
    check(hoodiesData.sbInfo?.pct === '-50%', `STREATBEAR displays -50% in /collections/hoodies-for-men (found: ${hoodiesData.sbInfo?.pct})`);
    check(hoodiesData.sbInfo?.compare?.includes('2,000') || hoodiesData.sbInfo?.compare?.includes('2000'), `STREATBEAR displays ₹ 2,000.00 in /collections/hoodies-for-men (found: ${hoodiesData.sbInfo?.compare})`);

    await takeScreenshot('collections_hoodies.png');

    // ==============================================================
    // TEST 7: CATEGORY CHIP CLICK INTERACTION
    // ==============================================================
    console.log('\n--- 7. Testing In-Page Category Chip Clicking ---');
    const chipClickResult = await evaluate(`
      (() => {
        const topsChip = document.querySelector('.category-chip[data-cat="tops"]');
        if (!topsChip) return { found: false };
        topsChip.click();
        return {
          found: true,
          activeCat: CollectionEngine.activeCategory,
          chipActive: topsChip.classList.contains('active'),
          filteredCount: CollectionEngine.filteredProducts.length
        };
      })()
    `);
    console.log('Chip Click Result:', chipClickResult);
    check(chipClickResult.found === true, 'Tops chip is clickable');
    check(chipClickResult.activeCat === 'tops', `Clicking Tops chip activates 'tops' category (found: ${chipClickResult.activeCat})`);
    check(chipClickResult.chipActive === true, 'Tops chip gains .active styling');
    check(chipClickResult.filteredCount > 0, `Product grid updates with tops products (found: ${chipClickResult.filteredCount})`);

    await takeScreenshot('collections_chip_click_tops.png');

    ws.close();

    console.log('\n========================================');
    if (allPassed) {
      console.log('🎉 ALL BROWSER & ZARA LAYOUT VERIFICATIONS PASSED SUCCESSFULLY!');
    } else {
      console.error('❌ SOME BROWSER VERIFICATIONS FAILED!');
      process.exit(1);
    }
    console.log('========================================\n');
  } catch (err) {
    console.error('Fatal Browser Error:', err);
    process.exit(1);
  } finally {
    cleanup();
  }
}

runBrowserTests();
