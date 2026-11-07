const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE_DIR = 'C:\\Users\\apriy\\.gemini\\antigravity\\scratch\\chrome_test_profile_layers_try';

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

server.listen(3352, async () => {
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9252',
    `--user-data-dir=${PROFILE_DIR}`,
    '--no-sandbox',
    '--disable-gpu',
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
        const res = await fetch('http://127.0.0.1:9252/json/version');
        if (res.ok) break;
      } catch (e) {}
    }

    const targetsRes = await fetch('http://127.0.0.1:9252/json');
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
    await send('Page.navigate', { url: 'http://localhost:3352/' });
    await new Promise(r => setTimeout(r, 2000));

    await send('Runtime.evaluate', {
      expression: `
        (() => {
          const sec = document.getElementById('shopify-section-allyrich-3d-hero');
          if (sec) sec.scrollIntoView({ behavior: 'instant', block: 'center' });
        })()
      `
    });

    await new Promise(r => setTimeout(r, 5000));

    const evalRes = await send('Runtime.evaluate', {
      expression: `
        (() => {
          try {
            const app = window.__splineApp;
            if (!app) return { err: 'NO_APP' };
            const screen = app.findObjectByName('Place your image here 2');
            if (!screen) return { err: 'NO_SCREEN' };
            const mat = screen.material;

            const res = {
              layers: []
            };

            for (let i = 0; i < (mat.layers || []).length; i++) {
              const l = mat.layers[i];
              let texInfo = null;
              if (l.texture) {
                texInfo = {
                  isTexture: !!l.texture.isTexture,
                  isVideoTexture: !!l.texture.isVideoTexture,
                  hasImage: !!l.texture.image,
                  imageType: l.texture.image ? (l.texture.image.tagName || typeof l.texture.image) : null,
                  imageSrc: l.texture.image && l.texture.image.src ? String(l.texture.image.src).slice(0, 100) : null
                };
              }
              res.layers.push({
                index: i,
                type: l.type,
                visible: l.visible,
                hasTexture: !!l.texture,
                texture: texInfo
              });
            }

            return res;
          } catch(e) {
            return { err: e.message, stack: e.stack };
          }
        })()
      `,
      returnByValue: true
    });

    console.log('LAYERS EVAL RES:\n', JSON.stringify(evalRes.result.value, null, 2));

    ws.close();
  } catch (err) {
    console.error(err);
  } finally {
    cleanup();
    process.exit(0);
  }
});
