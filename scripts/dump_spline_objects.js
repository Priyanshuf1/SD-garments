const { spawn } = require('child_process');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE_DIR = 'C:\\Users\\apriy\\.gemini\\antigravity\\scratch\\chrome_test_profile_dump_spline_objects';

async function run() {
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9270',
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
        const res = await fetch('http://127.0.0.1:9270/json/version');
        if (res.ok) break;
      } catch (e) {}
    }

    const targetsRes = await fetch('http://127.0.0.1:9270/json');
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

    const dump = await send('Runtime.evaluate', {
      expression: `(() => {
        const app = window.__splineApp;
        if (!app || !app._scene) return 'no scene';
        const objects = [];
        app._scene.traverse(o => {
          objects.push({
            name: o.name,
            type: o.type,
            visible: o.visible,
            isMesh: !!o.isMesh,
            materialName: o.material?.name || (Array.isArray(o.material) ? o.material.map(m=>m.name).join(',') : '')
          });
        });
        return objects;
      })()`,
      returnByValue: true
    });

    console.log('ALL SPLINE SCENE OBJECTS:');
    console.log(JSON.stringify(dump.result.value, null, 2));

    cleanup();
  } catch (err) {
    console.error('Error:', err);
    cleanup();
  }
}

run();
