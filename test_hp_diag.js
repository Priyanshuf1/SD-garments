const { spawn } = require('child_process');

const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new',
  '--remote-debugging-port=9236',
  '--user-data-dir=C:\\Users\\apriy\\.gemini\\antigravity\\scratch\\chrome_dbg_hp',
  '--no-sandbox',
  '--disable-gpu',
  'about:blank'
]);

setTimeout(async () => {
  try {
    const targets = await (await fetch('http://127.0.0.1:9236/json')).json();
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
            const hasEngine = typeof window.WishlistEngine !== 'undefined';
            const cardsCount = document.querySelectorAll('product-card').length;
            const classCardsCount = document.querySelectorAll('.product-card').length;
            const btnsBefore = document.querySelectorAll('.wishlist-btn').length;
            
            // Try manually calling decorateCards
            let decorateErr = null;
            if (hasEngine) {
              try {
                window.WishlistEngine.decorateCards();
              } catch (e) {
                decorateErr = e.message;
              }
            }
            const btnsAfter = document.querySelectorAll('.wishlist-btn').length;

            return {
              currentUrl: window.location.href, hasEngine,
              cardsCount,
              classCardsCount,
              btnsBefore,
              decorateErr,
              btnsAfter,
              firstCardHtml: document.querySelector('product-card')?.outerHTML?.slice(0, 400)
            };
          })()
        `,
        returnByValue: true
      });
      console.log('HOMEPAGE DIAGNOSTIC:', JSON.stringify(res.result.value, null, 2));

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
