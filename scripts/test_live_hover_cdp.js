const { spawn } = require('child_process');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE_DIR = 'C:\\Users\\apriy\\.gemini\\antigravity\\scratch\\chrome_test_profile_live_hover';

async function run() {
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9262',
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
        const res = await fetch('http://127.0.0.1:9262/json/version');
        if (res.ok) break;
      } catch (e) {}
    }

    const targetsRes = await fetch('http://127.0.0.1:9262/json');
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

    console.log('Navigating to https://alleyrich.com/ ...');
    await send('Page.navigate', { url: 'https://alleyrich.com/' });
    await new Promise(r => setTimeout(r, 4000));

    // Get position of MEN'S WEAR nav item
    const boxRes = await send('Runtime.evaluate', {
      expression: `(() => {
        const summaries = Array.from(document.querySelectorAll('summary, a'));
        const el = summaries.find(s => s.textContent.trim().toUpperCase().includes("MEN'S WEAR"));
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, text: el.textContent.trim() };
      })()`,
      returnByValue: true
    });

    console.log('MEN LINK POS:', boxRes.result.value);

    if (boxRes.result.value) {
      const { x, y } = boxRes.result.value;
      // Dispatch mouse move to hover
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await new Promise(r => setTimeout(r, 1200));

      const menuRes = await send('Runtime.evaluate', {
        expression: `(() => {
          const megas = Array.from(document.querySelectorAll('.mega-menu'));
          return megas.map(m => {
            const style = window.getComputedStyle(m);
            const rect = m.getBoundingClientRect();
            const parent = m.closest('details');
            return {
              isOpen: parent ? parent.open : false,
              display: style.display,
              visibility: style.visibility,
              opacity: style.opacity,
              width: rect.width,
              height: rect.height,
              top: rect.top,
              left: rect.left,
              text: m.innerText.slice(0, 100)
            };
          });
        })()`,
        returnByValue: true
      });

      console.log('MEGA MENUS STATUS ON LIVE HOVER:', JSON.stringify(menuRes.result.value, null, 2));

      const shot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync('scripts/live_home_hover_capture.png', Buffer.from(shot.data, 'base64'));
      console.log('Saved screenshot to scripts/live_home_hover_capture.png');
    }

    cleanup();
  } catch (err) {
    console.error('Error:', err);
    cleanup();
  }
}

run();
