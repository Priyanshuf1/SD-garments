const { spawn } = require('child_process');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE_DIR = 'C:\\Users\\apriy\\.gemini\\antigravity\\scratch\\chrome_fetch_trace';

async function main() {
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9238',
    `--user-data-dir=${PROFILE_DIR}`,
    '--no-sandbox',
    '--disable-gpu',
    'about:blank'
  ]);

  let killed = false;
  function cleanup() {
    if (!killed) {
      killed = true;
      try { chrome.kill(); } catch (e) {}
    }
  }

  try {
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 250));
      try {
        const res = await fetch('http://127.0.0.1:9238/json/version');
        if (res.ok) break;
      } catch (e) {}
    }

    const targetsRes = await fetch('http://127.0.0.1:9238/json');
    const targets = await targetsRes.json();
    const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });

    let id = 1;
    const callbacks = new Map();
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && callbacks.has(data.id)) {
        callbacks.get(data.id)(data.result);
        callbacks.delete(data.id);
      }
      if (data.method === 'Runtime.consoleAPICalled') {
        console.log('PAGE LOG:', data.params.type, data.params.args.map(a => a.value).join(' '));
      }
      if (data.method === 'Runtime.exceptionThrown') {
        console.log('EXCEPTION DETAILS:', JSON.stringify(data.params.exceptionDetails, null, 2));
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

    // Hook fetch before scripts run
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        const _origFetch = window.fetch;
        window.fetch = async function(...args) {
          console.log('[TRACE FETCH]', args[0]);
          try {
            const resp = await _origFetch.apply(this, args);
            console.log('[TRACE FETCH RESULT]', args[0], 'Status:', resp.status);
            return resp;
          } catch (e) {
            console.log('[TRACE FETCH ERROR]', args[0], e.message);
            throw e;
          }
        };
      `
    });

    await send('Page.navigate', { url: 'http://localhost:3000/' });
    await new Promise(r => setTimeout(r, 3500));

    ws.close();
  } catch (err) {
    console.error('Error:', err);
  } finally {
    cleanup();
  }
}

main();
