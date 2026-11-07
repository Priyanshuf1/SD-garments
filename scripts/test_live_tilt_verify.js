const { spawn } = require('child_process');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE_DIR = 'C:\\Users\\apriy\\.gemini\\antigravity\\scratch\\chrome_test_profile_live_tilt';

async function run() {
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9268',
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
        const res = await fetch('http://127.0.0.1:9268/json/version');
        if (res.ok) break;
      } catch (e) {}
    }

    const targetsRes = await fetch('http://127.0.0.1:9268/json');
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

    await send('Page.navigate', { url: 'https://alleyrich.com/?t=' + Date.now() });
    await new Promise(r => setTimeout(r, 3000));

    await send('Runtime.evaluate', {
      expression: `(() => {
        const hero = document.getElementById('shopify-section-allyrich-3d-hero') || document.getElementById('allyrich-3d-hero-container');
        if (hero) hero.scrollIntoView({ behavior: 'instant', block: 'center' });
      })()`
    });

    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const res = await send('Runtime.evaluate', {
        expression: `(() => ({ isLoaded: !!window.__splineLoaded }))()`,
        returnByValue: true
      });
      if (res.result.value.isLoaded) break;
    }

    // Dismiss cookie modal if present so it doesn't block view
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btn = document.querySelector('button[onclick*="accept"], button[onclick*="consent"], .cookie-btn');
        if (btn) btn.click();
        const cookieBanner = document.querySelector('[class*="cookie"]');
        if (cookieBanner) cookieBanner.style.display = 'none';
      })()`
    });

    // Move mouse to extreme right to tilt phone to angle shown in user screenshot
    console.log('Dispatching mouse movements to tilt phone...');
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1200, y: 300 });
    await new Promise(r => setTimeout(r, 600));
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1350, y: 200 });
    await new Promise(r => setTimeout(r, 1500));

    // Request render to capture tilted frame
    await send('Runtime.evaluate', {
      expression: `(() => {
        if (window.__splineApp && window.__splineApp.requestRender) {
          window.__splineApp.requestRender();
        }
      })()`
    });
    await new Promise(r => setTimeout(r, 500));

    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('scripts/live_phone_tilted_verification.png', Buffer.from(shot.data, 'base64'));
    console.log('Saved tilted screenshot to scripts/live_phone_tilted_verification.png');

    cleanup();
  } catch (err) {
    console.error('Error:', err);
    cleanup();
  }
}

run();
