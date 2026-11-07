const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE_DIR = 'C:\\Users\\apriy\\.gemini\\antigravity\\scratch\\chrome_test_profile_col_hover';

const server = http.createServer((req, res) => {
  let url = req.url.split('?')[0];
  if (url.startsWith('/collections')) {
    const filePath = './collections.html';
    res.writeHead(200, { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' });
    fs.createReadStream(filePath).pipe(res);
    return;
  }
  let filePath = '.' + url;
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    let contentType = 'text/plain';
    if (filePath.endsWith('.html')) contentType = 'text/html';
    else if (filePath.endsWith('.js')) contentType = 'application/javascript';
    else if (filePath.endsWith('.css')) contentType = 'text/css';
    else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) contentType = 'image/jpeg';
    else if (filePath.endsWith('.png')) contentType = 'image/png';
    else if (filePath.endsWith('.webp')) contentType = 'image/webp';
    res.writeHead(200, { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(3380, async () => {
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9280',
    `--user-data-dir=${PROFILE_DIR}`,
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1400,900',
    'about:blank'
  ]);

  function cleanup() {
    try { chrome.kill(); } catch (e) {}
    try { server.close(); } catch (e) {}
  }

  try {
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 250));
      try {
        const res = await fetch('http://127.0.0.1:9280/json/version');
        if (res.ok) break;
      } catch (e) {}
    }

    const targetsRes = await fetch('http://127.0.0.1:9280/json');
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
    await send('Page.navigate', { url: 'http://localhost:3380/collections/shop' });
    await new Promise(r => setTimeout(r, 3000));

    // Remove cookie banner
    await send('Runtime.evaluate', {
      expression: `
        (() => {
          document.querySelectorAll('.cookie-banner, #cookie-consent, [class*="cookie"]').forEach(el => el.remove());
        })()
      `
    });

    // Force is-open on MEN'S WEAR dropdown and inspect its rect
    const hoverRes = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const links = Array.from(document.querySelectorAll('.header-nav-link'));
          const mensLink = links.find(l => l.textContent.includes("MEN'S WEAR"));
          if (!mensLink) return { error: 'MEN\\'S WEAR not found' };

          const dropdown = mensLink.closest('.nav-item-dropdown');
          if (!dropdown) return { error: 'Dropdown container not found' };

          dropdown.classList.add('is-open');

          const menu = dropdown.querySelector('.nav-dropdown-menu');
          const compMenu = menu ? window.getComputedStyle(menu) : null;
          const r = menu ? menu.getBoundingClientRect() : null;

          return {
            hasIsOpenClass: dropdown.classList.contains('is-open'),
            menuDisplay: compMenu ? compMenu.display : null,
            menuVisibility: compMenu ? compMenu.visibility : null,
            menuOpacity: compMenu ? compMenu.opacity : null,
            menuHeight: menu ? menu.offsetHeight : null,
            menuZIndex: compMenu ? compMenu.zIndex : null,
            menuRect: r ? { top: r.top, left: r.left, width: r.width, height: r.height } : null
          };
        })()
      `,
      returnByValue: true
    });

    console.log('COLLECTIONS HOVER RES:\n', JSON.stringify(hoverRes.result.value, null, 2));

    await new Promise(r => setTimeout(r, 500));
    const ss = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('scripts/test_collections_nav_hover.png', Buffer.from(ss.data, 'base64'));
    console.log('Saved screenshot to scripts/test_collections_nav_hover.png');

    ws.close();
  } catch (err) {
    console.error(err);
  } finally {
    cleanup();
    process.exit(0);
  }
});
