const { spawn } = require('child_process');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE_DIR = 'C:\\Users\\apriy\\.gemini\\antigravity\\scratch\\chrome_test_profile_live_wait_load';

async function run() {
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9266',
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
        const res = await fetch('http://127.0.0.1:9266/json/version');
        if (res.ok) break;
      } catch (e) {}
    }

    const targetsRes = await fetch('http://127.0.0.1:9266/json');
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

    console.log('Navigating to live https://alleyrich.com/ ...');
    await send('Page.navigate', { url: 'https://alleyrich.com/?t=' + Date.now() });
    await new Promise(r => setTimeout(r, 2000));

    // Move mouse to trigger interactive load
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 500, y: 400 });

    console.log('Polling for spline scene load on live server...');
    for (let i = 0; i < 25; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const res = await send('Runtime.evaluate', {
        expression: `(() => {
          return {
            hasApp: !!window.__splineApp,
            isLoaded: !!window.__splineLoaded,
            hasHand: !!window.__splineHand,
            loaderHidden: document.getElementById('spline-loader-indicator')?.style.display === 'none'
          };
        })()`,
        returnByValue: true
      });
      console.log(`Second ${i+1}:`, res.result.value);
      if (res.result.value.isLoaded) {
        console.log('Spline scene fully loaded and initialized on live site!');
        break;
      }
    }

    // Capture screenshot
    await new Promise(r => setTimeout(r, 2000));
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('scripts/live_phone_screen_rendered.png', Buffer.from(shot.data, 'base64'));
    console.log('Saved screenshot to scripts/live_phone_screen_rendered.png');

    cleanup();
  } catch (err) {
    console.error('Error:', err);
    cleanup();
  }
}

run();
