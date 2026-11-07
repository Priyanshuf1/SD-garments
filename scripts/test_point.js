const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE_DIR = 'C:\\Users\\apriy\\.gemini\\antigravity\\scratch\\chrome_test_profile_point2';

const server = http.createServer((req, res) => {
  let url = req.url.split('?')[0];
  if (url.startsWith('/collections')) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    fs.createReadStream('./collections.html').pipe(res);
    return;
  }
  let filePath = '.' + url;
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(3386, async () => {
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9286',
    `--user-data-dir=${PROFILE_DIR}`,
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1400,900',
    'about:blank'
  ]);

  try {
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 250));
      try {
        const res = await fetch('http://127.0.0.1:9286/json/version');
        if (res.ok) break;
      } catch (e) {}
    }

    const targetsRes = await fetch('http://127.0.0.1:9286/json');
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
    await send('Page.navigate', { url: 'http://localhost:3386/collections/shop' });
    await new Promise(r => setTimeout(r, 3000));

    const pointRes = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const links = Array.from(document.querySelectorAll('.header-nav-link'));
          const mensLink = links.find(l => l.textContent.includes("MEN'S WEAR"));
          const dropdown = mensLink.closest('.nav-item-dropdown');
          dropdown.classList.add('is-open');

          const menu = dropdown.querySelector('.nav-dropdown-menu');
          const r = menu.getBoundingClientRect();
          const centerX = r.left + r.width / 2;
          const centerY = r.top + r.height / 2;
          const elAtPoint = document.elementFromPoint(centerX, centerY);

          function getStack(el) {
            const arr = [];
            let curr = el;
            while(curr && curr !== document.body) {
              const cs = window.getComputedStyle(curr);
              arr.push({
                tag: curr.tagName,
                cls: curr.className,
                pos: cs.position,
                zIndex: cs.zIndex,
                overflow: cs.overflow,
                opacity: cs.opacity
              });
              curr = curr.parentElement;
            }
            return arr;
          }

          return {
            menuRect: { top: r.top, left: r.left, width: r.width, height: r.height },
            menuStack: getStack(menu),
            elStack: elAtPoint ? getStack(elAtPoint) : null
          };
        })()
      `,
      returnByValue: true
    });

    console.log('STACK TRACE:\n', JSON.stringify(pointRes.result.value, null, 2));

    ws.close();
  } catch(e) {
    console.error(e);
  } finally {
    try { chrome.kill(); } catch (e) {}
    try { server.close(); } catch (e) {}
    process.exit(0);
  }
});
