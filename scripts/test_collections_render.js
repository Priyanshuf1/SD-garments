const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE_DIR = 'C:\\Users\\apriy\\.gemini\\antigravity\\scratch\\chrome_test_profile_shirts';

// Start server on 3370 mimicking server.js routes for /collections/* and /api/*
const server = http.createServer((req, res) => {
  let url = req.url.split('?')[0];
  if (url === '/' || url === '/index') url = '/index.html';
  if (url.startsWith('/collections')) {
    const filePath = './collections.html';
    res.writeHead(200, { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' });
    fs.createReadStream(filePath).pipe(res);
    return;
  }
  if (url === '/api/products') {
    const productsData = fs.readFileSync('./data/products.json', 'utf8');
    const parsed = JSON.parse(productsData);
    const prods = parsed.products || (Array.isArray(parsed) ? parsed : []);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ success: true, count: prods.length, products: prods }));
    return;
  }
  if (url === '/api/collections') {
    const collsData = fs.readFileSync('./data/collections.json', 'utf8');
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(collsData);
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

server.listen(3370, async () => {
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9270',
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
    const consoleLogs = [];

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && callbacks.has(data.id)) {
        callbacks.get(data.id)(data.result);
        callbacks.delete(data.id);
      }
      if (data.method === 'Runtime.consoleAPICalled') {
        consoleLogs.push({ type: data.params.type, args: data.params.args.map(a => a.value) });
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
    console.log('Navigating to http://localhost:3370/collections/shirts ...');
    await send('Page.navigate', { url: 'http://localhost:3370/collections/shirts' });
    await new Promise(r => setTimeout(r, 4000));

    // Remove cookie banner
    await send('Runtime.evaluate', {
      expression: `
        (() => {
          document.querySelectorAll('.cookie-banner, #cookie-consent, [class*="cookie"]').forEach(el => el.remove());
        })()
      `
    });

    const state = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const ce = window.CollectionEngine;
          if (!ce) return { error: 'No CollectionEngine' };
          const grid = document.getElementById('product-grid');
          const countEl = document.getElementById('page-count-text');
          return {
            activeCategory: ce.activeCategory,
            allProductsCount: ce.allProducts.length,
            filteredProductsCount: ce.filteredProducts.length,
            countText: countEl ? countEl.textContent.trim() : null,
            gridChildNodesCount: grid ? grid.children.length : 0,
            firstCardTitle: grid && grid.firstElementChild ? grid.firstElementChild.querySelector('.product-card__title')?.textContent.trim() : null
          };
        })()
      `,
      returnByValue: true
    });

    console.log('COLLECTIONS STATE:\n', JSON.stringify(state.result.value, null, 2));
    console.log('CONSOLE LOGS:\n', JSON.stringify(consoleLogs, null, 2));

    const ss = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('scripts/test_shirts_page.png', Buffer.from(ss.data, 'base64'));
    console.log('Saved screenshot to scripts/test_shirts_page.png');

    ws.close();
  } catch (err) {
    console.error(err);
  } finally {
    cleanup();
    process.exit(0);
  }
});
