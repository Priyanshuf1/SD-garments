const { spawn } = require('child_process');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE_DIR = 'C:\\Users\\apriy\\.gemini\\antigravity\\scratch\\chrome_click_test';

async function testClick(url, pageName) {
  console.log(`\nTesting Wishlist Click on ${pageName} (${url})...`);
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9230',
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
        const res = await fetch('http://127.0.0.1:9230/json/version');
        if (res.ok) break;
      } catch (e) {}
    }

    const targetsRes = await fetch('http://127.0.0.1:9230/json');
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
    await new Promise(r => setTimeout(r, 3000));

    // Evaluate before click
    const res1 = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const btn = document.querySelector('.wishlist-btn');
          const initialList = localStorage.getItem('genrage_wishlist');
          return {
            btnFound: !!btn,
            btnHandle: btn ? btn.getAttribute('data-wishlist-handle') : null,
            initialList
          };
        })()
      `,
      returnByValue: true
    });
    console.log('Before click:', res1.result.value);

    // Simulate clicking the wishlist button
    const clickRes = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const btn = document.querySelector('.wishlist-btn');
          if (!btn) return { clicked: false, error: 'Button not found' };
          
          btn.click();
          
          const afterList = localStorage.getItem('genrage_wishlist');
          const isPressed = btn.getAttribute('aria-pressed');
          const hasClass = btn.classList.contains('is-wishlisted');
          const badge = document.querySelector('.wishlist-count-badge')?.textContent;
          const currentUrl = window.location.href;
          
          return {
            clicked: true,
            isPressed,
            hasClass,
            badge,
            afterList,
            currentUrl
          };
        })()
      `,
      returnByValue: true
    });
    console.log('After click:', clickRes.result.value);

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
