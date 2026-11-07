const { spawn } = require('child_process');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE_DIR = 'C:\\Users\\apriy\\.gemini\antigravity\\scratch\\chrome_test_profile_live_shirts';

async function run() {
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9261',
    `--user-data-dir=${PROFILE_DIR}`,
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1440,900',
    'about:blank'
  ]);

  function cleanup() {
    try { chrome.kill(); } catch (e) {}
  }

  try {
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 250));
      try {
        const res = await fetch('http://127.0.0.1:9261/json/version');
        if (res.ok) break;
      } catch (e) {}
    }

    const targetsRes = await fetch('http://127.0.0.1:9261/json');
    const targets = await targetsRes.json();
    const pageTarget = targets.find(t => t.type === 'page') || targets[0];

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((resolve) => ws.onopen = resolve);

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

    console.log('Navigating to https://alleyrich.com/collections/shirts ...');
    await send('Page.navigate', { url: 'https://alleyrich.com/collections/shirts' });

    // Wait for network and render
    await new Promise(r => setTimeout(r, 5000));

    const evalRes = await send('Runtime.evaluate', {
      expression: `(() => {
        const countText = document.getElementById('page-count-text')?.textContent?.trim();
        const grid = document.getElementById('product-grid');
        const cards = grid ? grid.querySelectorAll('.product-card').length : 0;
        const activeChip = document.querySelector('.category-chip.active')?.textContent?.trim();
        const allCount = window.CollectionEngine ? window.CollectionEngine.allProducts.length : 'no engine';
        const filteredCount = window.CollectionEngine ? window.CollectionEngine.filteredProducts.length : 'no engine';
        const activeCat = window.CollectionEngine ? window.CollectionEngine.activeCategory : 'no engine';
        const emptyMsg = grid ? grid.querySelector('h3')?.textContent : '';
        return JSON.stringify({ countText, cards, activeChip, allCount, filteredCount, activeCat, emptyMsg });
      })()`
    });

    console.log('LIVE PAGE STATE:', evalRes.result.value);

    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('scripts/live_shirts_page_capture.png', Buffer.from(shot.data, 'base64'));
    console.log('Saved screenshot to scripts/live_shirts_page_capture.png');

    cleanup();
  } catch (err) {
    console.error('Error:', err);
    cleanup();
  }
}

run();
