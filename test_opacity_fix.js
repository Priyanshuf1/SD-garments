const { spawn } = require('child_process');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE_DIR = 'C:\\Users\\apriy\\.gemini\\antigravity\\scratch\\chrome_test_profile';

async function main() {
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9229',
    `--user-data-dir=${PROFILE_DIR}_col4`,
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
        const res = await fetch('http://127.0.0.1:9229/json/version');
        if (res.ok) break;
      } catch (e) {}
    }

    const targetsRes = await fetch('http://127.0.0.1:9229/json');
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
    await send('Page.navigate', { url: 'http://localhost:3000/collections/shop' });
    await new Promise(r => setTimeout(r, 2000));

    // Inject the opacity fix
    await send('Runtime.evaluate', {
      expression: `
        (() => {
          const style = document.createElement('style');
          style.textContent = \`
            .product-grid product-card, product-card {
              opacity: 1 !important;
              visibility: visible !important;
            }
          \`;
          document.head.appendChild(style);
        })()
      `
    });

    await new Promise(r => setTimeout(r, 1000));

    // Capture screenshot
    const screenshotRes = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('collections_fixed_screenshot.png', Buffer.from(screenshotRes.data, 'base64'));
    console.log('Saved collections_fixed_screenshot.png (size:', screenshotRes.data.length, 'bytes)');

    ws.close();
  } catch (err) {
    console.error(err);
  } finally {
    cleanup();
  }
}
main();
