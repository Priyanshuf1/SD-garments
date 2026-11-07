const { spawn } = require('child_process');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE_DIR = 'C:\\Users\\apriy\\.gemini\\antigravity\\scratch\\chrome_test_profile_shirts_hover';

async function run() {
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9263',
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
        const res = await fetch('http://127.0.0.1:9263/json/version');
        if (res.ok) break;
      } catch (e) {}
    }

    const targetsRes = await fetch('http://127.0.0.1:9263/json');
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
    await new Promise(r => setTimeout(r, 4000));

    // Inspect navigation elements in collections.html
    const navInspection = await send('Runtime.evaluate', {
      expression: `(() => {
        const items = Array.from(document.querySelectorAll('.site-header a, .site-header button, .site-header summary, .nav-item-dropdown, .header-nav-link'));
        return items.map(el => ({
          tag: el.tagName,
          className: el.className,
          text: el.innerText.trim(),
          hasDropdown: !!el.querySelector('.nav-dropdown-menu'),
          rect: el.getBoundingClientRect()
        }));
      })()`,
      returnByValue: true
    });

    console.log('SITE HEADER NAV ITEMS:', JSON.stringify(navInspection.result.value, null, 2));

    // Find MEN'S WEAR in collections header
    const mensRes = await send('Runtime.evaluate', {
      expression: `(() => {
        const links = Array.from(document.querySelectorAll('.site-header a, .site-header .nav-item-dropdown, .header-nav-link'));
        const target = links.find(el => el.textContent.trim().toUpperCase().includes("MEN'S WEAR"));
        if (!target) return null;
        const rect = target.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, text: target.textContent.trim() };
      })()`,
      returnByValue: true
    });

    console.log('MEN LINK POS ON COLLECTIONS:', mensRes.result.value);

    if (mensRes.result.value) {
      const { x, y } = mensRes.result.value;
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await new Promise(r => setTimeout(r, 1200));

      const dropdownState = await send('Runtime.evaluate', {
        expression: `(() => {
          const menus = Array.from(document.querySelectorAll('.nav-dropdown-menu, [class*="dropdown-menu"]'));
          return menus.map(m => {
            const style = window.getComputedStyle(m);
            const rect = m.getBoundingClientRect();
            return {
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

      console.log('DROPDOWN MENUS AFTER HOVER:', JSON.stringify(dropdownState.result.value, null, 2));

      const shot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync('scripts/live_shirts_hover_capture.png', Buffer.from(shot.data, 'base64'));
      console.log('Saved screenshot to scripts/live_shirts_hover_capture.png');
    }

    cleanup();
  } catch (err) {
    console.error('Error:', err);
    cleanup();
  }
}

run();
