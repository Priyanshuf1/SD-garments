const { spawn } = require('child_process');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE_DIR = 'C:\\Users\\apriy\\.gemini\\antigravity\\scratch\\chrome_test_profile';

async function main() {
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9237',
    `--user-data-dir=${PROFILE_DIR}_chips`,
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
        const res = await fetch('http://127.0.0.1:9237/json/version');
        if (res.ok) break;
      } catch (e) {}
    }

    const targetsRes = await fetch('http://127.0.0.1:9237/json');
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
    const jsExceptions = [];

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.method === 'Runtime.consoleAPICalled') {
        consoleLogs.push({ type: data.params.type, args: data.params.args.map(a => a.value || a.description) });
      }
      if (data.method === 'Runtime.exceptionThrown') {
        jsExceptions.push(data.params.exceptionDetails);
      }
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

    // 1. Load /collections/shop
    await send('Page.navigate', { url: 'http://localhost:3000/collections/shop' });
    await new Promise(r => setTimeout(r, 2000));

    const checkAll = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const cards = document.querySelectorAll('product-card');
          const title = document.getElementById('page-title')?.textContent;
          const count = document.getElementById('page-count-text')?.textContent;
          const activeChip = document.querySelector('.category-chip.active')?.textContent.trim();
          return { cardCount: cards.length, title, count, activeChip };
        })()
      `,
      returnByValue: true
    });
    console.log('Category ALL check:', checkAll.result.value);

    // 2. Click Bottoms & Pants chip
    const clickBottoms = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const chip = document.querySelector('.category-chip[data-cat="bottoms"]');
          if (chip) chip.click();
          return { clicked: !!chip };
        })()
      `,
      returnByValue: true
    });
    await new Promise(r => setTimeout(r, 500));

    const checkBottoms = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const cards = document.querySelectorAll('product-card');
          const title = document.getElementById('page-title')?.textContent;
          const count = document.getElementById('page-count-text')?.textContent;
          const activeChip = document.querySelector('.category-chip.active')?.textContent.trim();
          const url = window.location.href;
          return { cardCount: cards.length, title, count, activeChip, url };
        })()
      `,
      returnByValue: true
    });
    console.log('Category BOTTOMS check:', checkBottoms.result.value);

    // 3. Click Vests & Tanks chip
    await send('Runtime.evaluate', {
      expression: `document.querySelector('.category-chip[data-cat="vests"]')?.click()`
    });
    await new Promise(r => setTimeout(r, 500));

    const checkVests = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const cards = document.querySelectorAll('product-card');
          const title = document.getElementById('page-title')?.textContent;
          const count = document.getElementById('page-count-text')?.textContent;
          const activeChip = document.querySelector('.category-chip.active')?.textContent.trim();
          return { cardCount: cards.length, title, count, activeChip };
        })()
      `,
      returnByValue: true
    });
    console.log('Category VESTS check:', checkVests.result.value);

    // 4. Click Clearance Sale chip
    await send('Runtime.evaluate', {
      expression: `document.querySelector('.category-chip[data-cat="clearance"]')?.click()`
    });
    await new Promise(r => setTimeout(r, 500));

    const checkClearance = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const cards = document.querySelectorAll('product-card');
          const title = document.getElementById('page-title')?.textContent;
          const count = document.getElementById('page-count-text')?.textContent;
          const activeChip = document.querySelector('.category-chip.active')?.textContent.trim();
          return { cardCount: cards.length, title, count, activeChip };
        })()
      `,
      returnByValue: true
    });
    console.log('Category CLEARANCE check:', checkClearance.result.value);

    // 5. Test direct URL navigation to /collections/hoodies-for-men
    await send('Page.navigate', { url: 'http://localhost:3000/collections/hoodies-for-men' });
    await new Promise(r => setTimeout(r, 2000));

    const checkHoodies = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const cards = document.querySelectorAll('product-card');
          const title = document.getElementById('page-title')?.textContent;
          const count = document.getElementById('page-count-text')?.textContent;
          const activeChip = document.querySelector('.category-chip.active')?.textContent.trim();
          return { cardCount: cards.length, title, count, activeChip };
        })()
      `,
      returnByValue: true
    });
    console.log('Direct URL HOODIES check:', checkHoodies.result.value);

    console.log('Console logs:', consoleLogs);
    console.log('JS Exceptions:', jsExceptions);

  } finally {
    cleanup();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
