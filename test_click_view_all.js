const { spawn } = require('child_process');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE_DIR = 'C:\\Users\\apriy\\.gemini\\antigravity\\scratch\\chrome_test_profile';

async function main() {
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9235',
    `--user-data-dir=${PROFILE_DIR}_nav`,
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
  process.on('exit', cleanup);
  process.on('SIGINT', cleanup);

  try {
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 250));
      try {
        const res = await fetch('http://127.0.0.1:9235/json/version');
        if (res.ok) break;
      } catch (e) {}
    }

    const targetsRes = await fetch('http://127.0.0.1:9235/json');
    const targets = await targetsRes.json();
    const pageTarget = targets.find(t => t.type === 'page') || targets[0];

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

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
    await send('Page.navigate', { url: 'http://localhost:3000/' });
    await new Promise(r => setTimeout(r, 3000));

    console.log('Current URL on load:', (await send('Runtime.evaluate', { expression: 'window.location.href' })).result.value);

    // Find the VIEW ALL button
    const clickResult = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const btn = Array.from(document.querySelectorAll('a')).find(a => a.textContent.trim().toUpperCase() === 'VIEW ALL');
          if (!btn) return { found: false };
          const href = btn.getAttribute('href');
          btn.click();
          return { found: true, href };
        })()
      `,
      returnByValue: true
    });

    console.log('Click VIEW ALL button:', clickResult.result.value);

    await new Promise(r => setTimeout(r, 2000));

    const newUrl = (await send('Runtime.evaluate', { expression: 'window.location.href' })).result.value;
    console.log('URL after clicking VIEW ALL:', newUrl);

    const pageInfo = await send('Runtime.evaluate', {
      expression: `
        (() => {
          return {
            title: document.title,
            cardCount: document.querySelectorAll('product-card').length,
            bodyBg: window.getComputedStyle(document.body).backgroundColor,
            h1: document.querySelector('h1')?.textContent
          };
        })()
      `,
      returnByValue: true
    });

    console.log('Page info after click:', pageInfo.result.value);

  } finally {
    cleanup();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
