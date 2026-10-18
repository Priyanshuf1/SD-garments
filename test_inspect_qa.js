const { spawn } = require('child_process');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE_DIR = 'C:\\Users\\apriy\\.gemini\\antigravity\\scratch\\chrome_test_profile_qa';

async function testPage(url, pageName) {
  console.log(`\n================ Testing ${pageName} (${url}) ================`);
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9227',
    `--user-data-dir=${PROFILE_DIR}_${pageName}`,
    '--no-sandbox',
    '--disable-gpu',
    'about:blank'
  ]);

  let killed = false;
  function cleanup() {
    if (!killed) {
      killed = true;
      try { chrome.kill(); } catch (e) {}
    }
  }

  try {
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 250));
      try {
        const res = await fetch('http://127.0.0.1:9227/json/version');
        if (res.ok) break;
      } catch (e) {}
    }

    const targetsRes = await fetch('http://127.0.0.1:9227/json');
    const targets = await targetsRes.json();
    const pageTarget = targets.find(t => t.type === 'page') || targets[0];

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    let id = 1;
    const callbacks = new Map();
    const consoleLogs = [];
    const pageErrors = [];

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && callbacks.has(data.id)) {
        callbacks.get(data.id)(data.result);
        callbacks.delete(data.id);
      }
      if (data.method === 'Runtime.consoleAPICalled') {
        consoleLogs.push(data.params);
      }
      if (data.method === 'Runtime.exceptionThrown') {
        pageErrors.push(data.params);
      }
    };

    function send(method, params = {}) {
      return new Promise((resolve) => {
        const msgId = id++;
        callbacks.set(msgId, resolve);
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });
    }

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url });

    await new Promise(r => setTimeout(r, 3500));

    const evalRes = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const header = document.querySelector('.site-header') || document.querySelector('header') || document.querySelector('.header');
          const footer = document.querySelector('footer');
          const wishlistBtns = document.querySelectorAll('.wishlist-btn');
          const cards = document.querySelectorAll('product-card, .product-card');
          const headerWishlist = document.querySelector('a[title*="Wishlist"], a[href*="wishlist"], .header__wishlist-link');
          const secondaryImgs = document.querySelectorAll('.product-card__image--secondary');

          const headerComputedBg = header ? window.getComputedStyle(header).backgroundColor : null;
          const footerComputedBg = footer ? window.getComputedStyle(footer).backgroundColor : null;

          let firstWishlistBtnStyle = null;
          if (wishlistBtns.length > 0) {
            const b = wishlistBtns[0];
            const s = window.getComputedStyle(b);
            const rect = b.getBoundingClientRect();
            firstWishlistBtnStyle = {
              display: s.display,
              visibility: s.visibility,
              opacity: s.opacity,
              zIndex: s.zIndex,
              position: s.position,
              width: rect.width,
              height: rect.height,
              top: rect.top,
              left: rect.left,
              parentClass: b.parentElement ? b.parentElement.className : null
            };
          }

          let firstSecImgInfo = null;
          if (secondaryImgs.length > 0) {
            const img = secondaryImgs[0];
            const s = window.getComputedStyle(img);
            firstSecImgInfo = {
              src: img.src ? img.src.slice(0, 70) + '...' : null,
              loading: img.getAttribute('loading'),
              transition: s.transition,
              opacity: s.opacity,
              complete: img.complete,
              naturalWidth: img.naturalWidth
            };
          }

          return {
            headerFound: !!header,
            headerComputedBg,
            footerFound: !!footer,
            footerComputedBg,
            headerWishlistFound: !!headerWishlist,
            cardCount: cards.length,
            wishlistBtnCount: wishlistBtns.length,
            firstWishlistBtnStyle,
            secondaryImgCount: secondaryImgs.length,
            firstSecImgInfo,
            errorsCount: window.__errorsCount || 0
          };
        })()
      `,
      returnByValue: true
    });

    console.log('Result:', JSON.stringify(evalRes.result.value, null, 2));
    if (pageErrors.length > 0) {
      console.log('Page Errors:', pageErrors.map(e => e.exceptionDetails.text));
    }

    ws.close();
  } catch (err) {
    console.error('Test error:', err);
  } finally {
    cleanup();
  }
}

async function run() {
  await testPage('http://localhost:3000/', 'Homepage');
  await testPage('http://localhost:3000/collections/shop', 'Collections');
}

run();
