const { spawn } = require('child_process');
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new',
  '--remote-debugging-port=9232',
  '--user-data-dir=C:\\Users\\apriy\\.gemini\\antigravity\\scratch\\chrome_test_profile_pos',
  '--no-sandbox',
  '--disable-gpu',
  'about:blank'
]);
async function run() {
  await new Promise(r => setTimeout(r, 1500));
  const targets = await (await fetch('http://127.0.0.1:9232/json')).json();
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 1;
  const send = (method, params = {}) => new Promise(res => {
    const mid = id++;
    const h = (e) => {
      const d = JSON.parse(e.data);
      if (d.id === mid) { ws.removeEventListener('message', h); res(d.result); }
    };
    ws.addEventListener('message', h);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  await send('Page.enable');
  await send('Page.navigate', { url: 'http://localhost:3000/collections/shop' });
  await new Promise(r => setTimeout(r, 2000));
  const evalRes = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const sec = document.querySelector(".collection-toolbar-bar");
        const lt = document.querySelector(".layout-toggles");
        const ft = document.querySelector(".btn-filter-toggle");
        const cnt = document.getElementById("page-count-text");
        return {
          secRect: { x: sec.getBoundingClientRect().x, y: sec.getBoundingClientRect().y, w: sec.getBoundingClientRect().width, h: sec.getBoundingClientRect().height },
          ltRect: { x: lt.getBoundingClientRect().x, y: lt.getBoundingClientRect().y, w: lt.getBoundingClientRect().width, h: lt.getBoundingClientRect().height },
          ftRect: { x: ft.getBoundingClientRect().x, y: ft.getBoundingClientRect().y, w: ft.getBoundingClientRect().width, h: ft.getBoundingClientRect().height },
          cntRect: { x: cnt.getBoundingClientRect().x, y: cnt.getBoundingClientRect().y, w: cnt.getBoundingClientRect().width, h: cnt.getBoundingClientRect().height },
          cntParentTag: cnt.parentElement.tagName,
          cntParentClass: cnt.parentElement.className,
          secDisplay: window.getComputedStyle(sec).display,
          cntPosition: window.getComputedStyle(cnt).position
        };
      })()
    `,
    returnByValue: true
  });
  console.log('Positions:', JSON.stringify(evalRes.result.value, null, 2));
  ws.close();
  chrome.kill();
}
run();
