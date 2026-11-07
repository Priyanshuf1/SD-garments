const { spawn } = require('child_process');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE_DIR = 'C:\\Users\\apriy\\.gemini\\antigravity\\scratch\\chrome_test_profile_live_final_verify';

async function run() {
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9265',
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
        const res = await fetch('http://127.0.0.1:9265/json/version');
        if (res.ok) break;
      } catch (e) {}
    }

    const targetsRes = await fetch('http://127.0.0.1:9265/json');
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

    // Wait for 3D Spline scene to initialize and screen texture to render
    console.log('Waiting for Spline phone hero to load and render...');
    for (let sec = 1; sec <= 10; sec++) {
      await new Promise(r => setTimeout(r, 1000));
      const status = await send('Runtime.evaluate', {
        expression: `(() => {
          return {
            splineLoaded: !!window.__splineLoaded,
            hasApp: !!window.__splineApp
          };
        })()`,
        returnByValue: true
      });
      console.log(`Sec ${sec}:`, status.result.value);
      if (status.result.value.splineLoaded) break;
    }

    // Wait extra 2 seconds for texture to settle
    await new Promise(r => setTimeout(r, 2000));

    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('scripts/live_final_hero_verification.png', Buffer.from(shot.data, 'base64'));
    console.log('Saved live hero screenshot to scripts/live_final_hero_verification.png');

    // Inspect phone screen canvas pixel data
    const screenAnalysis = await send('Runtime.evaluate', {
      expression: `(() => {
        const canvas = document.getElementById('allyrich-spline-canvas');
        if (!canvas) return 'no canvas';
        // Check WebGL context
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        if (!gl) return 'no gl';
        return {
          width: canvas.width,
          height: canvas.height,
          splineLoaded: !!window.__splineLoaded
        };
      })()`,
      returnByValue: true
    });
    console.log('Screen analysis:', screenAnalysis.result.value);

    cleanup();
  } catch (err) {
    console.error('Error:', err);
    cleanup();
  }
}

run();
