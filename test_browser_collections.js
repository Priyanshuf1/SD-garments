const { spawn } = require('child_process');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE_DIR = 'C:\\Users\\apriy\\.gemini\\antigravity\\scratch\\chrome_test_profile';

async function main() {
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9226',
    `--user-data-dir=${PROFILE_DIR}_col`,
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
  process.on('exit', cleanup);
  process.on('SIGINT', cleanup);

  try {
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 250));
      try {
        const res = await fetch('http://127.0.0.1:9226/json/version');
        if (res.ok) break;
      } catch (e) {}
    }

    const targetsRes = await fetch('http://127.0.0.1:9226/json');
    const targets = await targetsRes.json();
    const pageTarget = targets.find(t => t.type === 'page') || targets[0];

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    let id = 1;
    const callbacks = new Map();
    const consoleLogs = [];
    const pageErrors = [];

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && callbacks.has(data.id)) {
        callbacks.get(data.id)(data.result);
        callbacks.delete(data.id);
      }
      if (data.method === 'Runtime.consoleAPICalled') {
        consoleLogs.push(data.params);
      }
      if (data.method === 'Runtime.exceptionThrown') {
        pageErrors.push(data.params);
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

    console.log('Navigating to http://localhost:3000/collections/shop ...');
    await send('Page.navigate', { url: 'http://localhost:3000/collections/shop' });

    await new Promise(r => setTimeout(r, 3000));

    console.log('Console logs count:', consoleLogs.length);
    consoleLogs.forEach(log => console.log('LOG:', log.type, log.args.map(a => a.value)));
    console.log('Page errors count:', pageErrors.length);
    pageErrors.forEach(err => console.log('ERROR:', err.exceptionDetails));

    const evalRes = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const grid = document.getElementById('product-grid');
          const cards = document.querySelectorAll('product-card');
          const bodyBg = window.getComputedStyle(document.body).backgroundColor;
          const empty = document.querySelector('.collection-empty');
          const title = document.getElementById('page-title')?.textContent;
          const count = document.getElementById('page-count-text')?.textContent;
          const cardDisplay = cards[0] ? window.getComputedStyle(cards[0]).display : null;
          const cardHeight = cards[0] ? cards[0].getBoundingClientRect().height : null;
          return {
            gridExists: !!grid,
            cardCount: cards.length,
            bodyBg,
            hasEmpty: !!empty,
            title,
            count,
            cardDisplay,
            cardHeight,
            firstCardHtml: cards[0]?.outerHTML?.slice(0, 300)
          };
        })()
      `,
      returnByValue: true
    });

    console.log('DOM Evaluation:', evalRes.result.value);

    ws.close();
  } catch (err) {
    console.error('Error:', err);
  } finally {
    cleanup();
  }
}

main();
