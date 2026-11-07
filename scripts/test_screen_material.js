const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE_DIR = 'C:\\Users\\apriy\\.gemini\\antigravity\\scratch\\chrome_test_profile_spline_tilt';

const server = http.createServer((req, res) => {
  let filePath = '.' + req.url.split('?')[0];
  if (filePath === './' || filePath === './index') filePath = './index.html';
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    let contentType = 'text/plain';
    if (filePath.endsWith('.html')) contentType = 'text/html';
    else if (filePath.endsWith('.js')) contentType = 'application/javascript';
    else if (filePath.endsWith('.css')) contentType = 'text/css';
    else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) contentType = 'image/jpeg';
    else if (filePath.endsWith('.png')) contentType = 'image/png';
    else if (filePath.endsWith('.webp')) contentType = 'image/webp';
    else if (filePath.endsWith('.splinecode')) contentType = 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(3360, async () => {
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9260',
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
        const res = await fetch('http://127.0.0.1:9260/json/version');
        if (res.ok) break;
      } catch (e) {}
    }

    const targetsRes = await fetch('http://127.0.0.1:9260/json');
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
    await send('Page.navigate', { url: 'http://localhost:3360/' });
    await new Promise(r => setTimeout(r, 3000));

    // Remove cookie banner and scroll to 3D hero section
    await send('Runtime.evaluate', {
      expression: `
        (() => {
          document.querySelectorAll('.cookie-banner, #cookie-consent, [class*="cookie"]').forEach(el => el.remove());
          const sec = document.getElementById('shopify-section-allyrich-3d-hero');
          if (sec) sec.scrollIntoView({ behavior: 'instant', block: 'center' });
        })()
      `
    });

    await new Promise(r => setTimeout(r, 4000));

    // Simulate mouse movement across the container to tilt the 3D phone
    await send('Runtime.evaluate', {
      expression: `
        (() => {
          const container = document.getElementById('allyrich-3d-hero-container');
          if (container) {
            const rect = container.getBoundingClientRect();
            const evt = new MouseEvent('mousemove', {
              clientX: rect.left + rect.width * 0.85,
              clientY: rect.top + rect.height * 0.25,
              bubbles: true
            });
            window.dispatchEvent(evt);
            container.dispatchEvent(evt);
          }
        })()
      `
    });

    await new Promise(r => setTimeout(r, 1000));

    // Capture screenshot of hero while tilted
    const ss = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('scripts/test_screen_tilted.png', Buffer.from(ss.data, 'base64'));
    console.log('Saved screenshot to scripts/test_screen_tilted.png');

    ws.close();
  } catch (err) {
    console.error(err);
  } finally {
    cleanup();
    process.exit(0);
  }
});
