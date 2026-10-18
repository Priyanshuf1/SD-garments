const { spawn } = require('child_process');

const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new',
  '--remote-debugging-port=9237',
  '--user-data-dir=C:\\Users\\apriy\\.gemini\\antigravity\\scratch\\chrome_dbg_hp2',
  '--no-sandbox',
  '--disable-gpu',
  'about:blank'
]);

setTimeout(async () => {
  try {
    const targets = await (await fetch('http://127.0.0.1:9237/json')).json();
    const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
    let id = 1;
    const callbacks = new Map();
    ws.onmessage = (e) => {
      const d = JSON.parse(e.data);
      if (d.id && callbacks.has(d.id)) {
        callbacks.get(d.id)(d.result);
        callbacks.delete(d.id);
      }
    };
    function send(m, p = {}) {
      return new Promise(r => {
        const msgId = id++;
        callbacks.set(msgId, r);
        ws.send(JSON.stringify({ id: msgId, method: m, params: p }));
      });
    }
    ws.onopen = async () => {
      await send('Runtime.enable');
      await send('Page.enable');
      await send('Page.navigate', { url: 'http://localhost:3000/' });
      await new Promise(r => setTimeout(r, 4000));

      const res = await send('Runtime.evaluate', {
        expression: `
          (() => {
            const btn = document.querySelector('.wishlist-btn');
            if (!btn) return { error: 'No button' };

            const rect = btn.getBoundingClientRect();
            // Test elementFromPoint to see if btn or something else is on top!
            const hitEl = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
            
            // Try clicking it with real click event
            const beforeList = localStorage.getItem('genrage_wishlist');
            btn.click();
            const afterList = localStorage.getItem('genrage_wishlist');
            
            return {
              rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
              style: {
                zIndex: window.getComputedStyle(btn).zIndex,
                pointerEvents: window.getComputedStyle(btn).pointerEvents,
                display: window.getComputedStyle(btn).display,
                visibility: window.getComputedStyle(btn).visibility,
                opacity: window.getComputedStyle(btn).opacity,
                position: window.getComputedStyle(btn).position
              },
              hitElement: hitEl ? {
                tag: hitEl.tagName,
                className: hitEl.className,
                isBtn: hitEl === btn || btn.contains(hitEl)
              } : null,
              beforeList,
              afterList,
              isWishlisted: btn.classList.contains('is-wishlisted')
            };
          })()
        `,
        returnByValue: true
      });
      console.log('HOMEPAGE BTN INSPECT:', JSON.stringify(res.result.value, null, 2));

      ws.close();
      chrome.kill();
      process.exit(0);
    };
  } catch (err) {
    console.error(err);
    chrome.kill();
    process.exit(1);
  }
}, 1000);
