const { spawn } = require('child_process');
const fs = require('fs');

const os = require('os');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE_DIR = path.join(os.tmpdir(), 'chrome_video_test_profile');

async function testViewport(ws, send, width, height, isMobile) {
  console.log(`\n======================================================`);
  console.log(`Testing Viewport: ${width}x${height} (Mobile: ${isMobile})`);
  console.log(`======================================================`);

  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 2,
    mobile: isMobile
  });

  await send('Page.navigate', { url: 'http://localhost:3000/' });
  await new Promise(r => setTimeout(r, 3500));

  const evalRes = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const videos = Array.from(document.querySelectorAll('video'));
        return videos.map((v, i) => {
          const rect = v.getBoundingClientRect();
          const parentMedia = v.closest('video-media');
          const parentCs = parentMedia ? window.getComputedStyle(parentMedia) : null;
          return {
            index: i,
            file: (v.currentSrc || '').split('/').pop(),
            paused: v.paused,
            currentTime: Math.round(v.currentTime * 100) / 100,
            rect: { width: Math.round(rect.width), height: Math.round(rect.height) },
            parentDisplay: parentCs ? parentCs.display : 'none'
          };
        });
      })()
    `,
    returnByValue: true
  });

  const results = evalRes.result.value;
  console.table(results);
  return results;
}

async function main() {
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9225',
    `--user-data-dir=${PROFILE_DIR}`,
    '--autoplay-policy=no-user-gesture-required',
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

  let versionData = null;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 250));
    try {
      const res = await fetch('http://127.0.0.1:9225/json/version');
      if (res.ok) {
        versionData = await res.json();
        break;
      }
    } catch (e) {}
  }

  const targetsRes = await fetch('http://127.0.0.1:9225/json');
  const targets = await targetsRes.json();
  const pageTarget = targets.find(t => t.type === 'page') || targets[0];

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let msgId = 1;
  const pending = new Map();
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(data.error);
      else resolve(data.result);
    }
  };

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');

  // Test 1: Desktop Viewport (1440x900)
  const desktop = await testViewport(ws, send, 1440, 900, false);
  // Verify: desktop hero visible and playing; mobile hero hidden and paused
  if (desktop[0].parentDisplay !== 'block' || desktop[0].paused) throw new Error('Desktop hero video failed!');
  if (desktop[1].parentDisplay !== 'none' || !desktop[1].paused) throw new Error('Mobile hero video should be hidden on desktop!');
  if (desktop.length > 2) {
    if (desktop[2].parentDisplay !== 'none' || !desktop[2].paused) throw new Error('Mobile lookbook video should be hidden on desktop!');
    if (desktop[3].parentDisplay !== 'block' || desktop[3].paused) throw new Error('Desktop lookbook video failed!');
  }

  // Test 2: Mobile Viewport (390x844)
  const mobile = await testViewport(ws, send, 390, 844, true);
  // Verify: mobile hero visible and playing; desktop hero hidden and paused
  if (mobile[0].parentDisplay !== 'none' || !mobile[0].paused) throw new Error('Desktop hero video should be hidden on mobile!');
  if (mobile[1].parentDisplay !== 'block' || mobile[1].paused) throw new Error('Mobile hero video failed on mobile view!');
  if (mobile.length > 2) {
    if (mobile[2].parentDisplay !== 'block' || mobile[2].paused) throw new Error('Mobile lookbook video failed on mobile view!');
    if (mobile[3].parentDisplay !== 'none' || !mobile[3].paused) throw new Error('Desktop lookbook video should be hidden on mobile!');
  }

  console.log('\n======================================================');
  console.log('✅ BOTH DESKTOP & MOBILE RESPONSIVE VIDEO PLAYBACK VERIFIED!');
  console.log('======================================================');

  ws.close();
  cleanup();
  process.exit(0);
}

main().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
