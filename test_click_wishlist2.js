const { spawn } = require('child_process');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE_DIR = 'C:\\Users\\apriy\\.gemini\\antigravity\\scratch\\chrome_click_test2';

async function testClick(url, pageName) {
  console.log(`\n================ Testing ${pageName} (${url}) ================`);
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9231',
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
        const res = await fetch('http://127.0.0.1:9231/json/version');
        if (res.ok) break;
      } catch (e) {}
    }

    const targetsRes = await fetch('http://127.0.0.1:9231/json');
    const targets = await targetsRes.json();
    const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });

    let id = 1;
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
        const msgId = id++;
        callbacks.set(msgId, resolve);
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });
    }

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url });

    // Wait up to 6 seconds for .wishlist-btn
    let ready = false;
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 400));
      const chk = await send('Runtime.evaluate', {
        expression: `document.querySelectorAll('.wishlist-btn').length`,
        returnByValue: true
      });
      const cnt = chk.result.value;
      if (cnt > 0) {
        console.log(`Found ${cnt} wishlist buttons after ${(i + 1) * 400}ms`);
        ready = true;
        break;
      }
    }

    if (!ready) {
      console.log('No wishlist buttons found!');
      return;
    }

    // Now test clicking the first button
    const clickRes = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const btn = document.querySelector('.wishlist-btn');
          const initialPressed = btn.getAttribute('aria-pressed');
          const initialClass = btn.className;
          
          btn.click();
          
          const afterList = localStorage.getItem('genrage_wishlist');
          const isPressed = btn.getAttribute('aria-pressed');
          const afterClass = btn.className;
          const badge = document.querySelector('.wishlist-count-badge')?.textContent;
          const currentUrl = window.location.href;
          
          return {
            initialPressed,
            initialClass,
            isPressed,
            afterClass,
            badge,
            afterList,
            currentUrl
          };
        })()
      `,
      returnByValue: true
    });

    console.log('Click result:', clickRes.result.value);

    // Click again to toggle back
    const click2Res = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const btn = document.querySelector('.wishlist-btn');
          btn.click();
          return {
            afterList: localStorage.getItem('genrage_wishlist'),
            isPressed: btn.getAttribute('aria-pressed'),
            badge: document.querySelector('.wishlist-count-badge')?.textContent
          };
        })()
      `,
      returnByValue: true
    });

    console.log('Toggle back result:', click2Res.result.value);

    ws.close();
  } catch (err) {
    console.error('Error:', err);
  } finally {
    cleanup();
  }
}

async function run() {
  await testClick('http://localhost:3000/', 'Homepage');
  await testClick('http://localhost:3000/collections/shop', 'Collections');
}

run();
