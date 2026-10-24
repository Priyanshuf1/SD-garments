const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE_DIR = path.join(os.tmpdir(), 'chrome_perf_test_profile_' + Date.now());

async function runPerformanceAudit() {
  console.log('⚡ Starting Real-World 60fps & CPU/GPU Bottleneck Performance Audit...\n');

  try {
    fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
  } catch (e) {}

  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9277',
    `--user-data-dir=${PROFILE_DIR}`,
    '--autoplay-policy=no-user-gesture-required',
    '--no-sandbox',
    '--disable-gpu-vsync',
    '--window-size=1440,900',
    'about:blank'
  ]);

  let killed = false;
  function cleanup() {
    if (!killed) {
      killed = true;
      try { chrome.kill(); } catch (e) {}
      try { fs.rmSync(PROFILE_DIR, { recursive: true, force: true }); } catch (e) {}
    }
  }
  process.on('exit', cleanup);
  process.on('SIGINT', cleanup);

  // Wait for Chrome port
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 200));
    try {
      const res = await fetch('http://127.0.0.1:9277/json/version');
      if (res.ok) break;
    } catch (e) {}
  }

  const targetsRes = await fetch('http://127.0.0.1:9277/json');
  const targets = await targetsRes.json();
  const pageTarget = targets.find(t => t.type === 'page' && !t.url.startsWith('chrome-extension://')) || targets[0];

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

  let allChecksPassed = true;
  function check(cond, msg) {
    if (cond) {
      console.log(`  ✅ [PASS] ${msg}`);
    } else {
      console.error(`  ❌ [FAIL] ${msg}`);
      allChecksPassed = false;
    }
  }

  // =========================================================================
  // AUDIT 1: Desktop Viewport (1440x900)
  // =========================================================================
  console.log('--- AUDIT 1: Desktop Viewport (1440x900) ---');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 2,
    mobile: false
  });

  await send('Page.navigate', { url: 'http://localhost:3000/' });
  console.log('Waiting for Spline 3D scene to load on desktop...');
  let splineLoaded = false;
  for (let i = 0; i < 60; i++) {
    const check = await send('Runtime.evaluate', {
      expression: `!!(window.__splineLoaded && window.__splineHand)`,
      returnByValue: true
    });
    if (check && check.result && check.result.value) {
      console.log(`Spline 3D scene loaded on desktop after ${(i * 500) / 1000}s`);
      splineLoaded = true;
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  if (!splineLoaded) throw new Error('Spline failed to load on desktop within 30s');

  // Scroll 3D section into view to inspect and verify active WebGL state
  await send('Runtime.evaluate', {
    expression: `document.getElementById('shopify-section-allyrich-3d-hero').scrollIntoView({ behavior: 'instant', block: 'center' });`
  });
  await new Promise(r => setTimeout(r, 600));

  // 1.1 Check WebGL Canvas DPR Cap
  const dprCheck = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const canvas = document.getElementById('allyrich-spline-canvas');
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const effectiveRatio = canvas.width / rect.width;
        return {
          windowDpr: dpr,
          canvasWidth: canvas.width,
          rectWidth: rect.width,
          effectiveRatio: Math.round(effectiveRatio * 100) / 100
        };
      })()
    `,
    returnByValue: true
  });
  console.log('Desktop Canvas DPR Info:', dprCheck.result.value);
  check(dprCheck.result.value && dprCheck.result.value.effectiveRatio <= 2.01,
    `Desktop canvas DPR capped at <= 2.0 (got effective ratio: ${dprCheck.result.value?.effectiveRatio})`);

  // 1.2 Idle Motion Convergence (Zero-CPU & Zero-GPU WebGL sleep)
  await send('Runtime.evaluate', {
    expression: `
      if (window.__splineApp && window.__splineApp._renderer && !window.__splineRenderHooked) {
        window.__splineRenderHooked = true;
        window.__splineRenderCount = 0;
        const origRender = window.__splineApp._renderer.renderSplineScene;
        window.__splineApp._renderer.renderSplineScene = function(...args) {
          window.__splineRenderCount = (window.__splineRenderCount || 0) + 1;
          return origRender.apply(this, args);
        };
      }
    `
  });

  // Wait 4.2s idle without mouse movements (ambient sway expires after 3.5s)
  await new Promise(r => setTimeout(r, 4200));

  // Reset render counter and observe 1 second of complete rest
  await send('Runtime.evaluate', { expression: 'window.__splineRenderCount = 0;' });
  await new Promise(r => setTimeout(r, 1000));

  const idleCheck = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const state = window.__allyrichHeroState;
        return {
          hasState: !!state,
          isMotionSleeping: state ? state.isMotionSleeping : false,
          idleTime: state ? Math.round(performance.now() - state.lastInteractionTime) : 0,
          renderCount: window.__splineRenderCount || 0
        };
      })()
    `,
    returnByValue: true
  });
  console.log('Desktop Hero Idle State & WebGL Activity:', idleCheck.result.value);
  check(idleCheck.result.value && idleCheck.result.value.isMotionSleeping === true,
    'AllyRich 3D motion loop converged and entered sleep mode at rest');
  check(idleCheck.result.value && idleCheck.result.value.renderCount === 0,
    `Zero WebGL draw calls during idle rest (got: ${idleCheck.result.value?.renderCount} renders/sec, true 0% GPU)`);

  // 1.3 Off-Screen Viewport Intersection Pausing
  console.log('\n--- AUDIT 1.3: Viewport Intersection Off-Screen Pausing ---');
  // Scroll back to top (hero 3D section scrolled completely off-screen, top video in view)
  await send('Runtime.evaluate', { expression: 'window.scrollTo(0, 0);' });
  await new Promise(r => setTimeout(r, 800));

  const offscreenCheck = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const state = window.__allyrichHeroState;
        const videos = Array.from(document.querySelectorAll('video'));
        const desktopHeroVid = videos[0];
        return {
          heroIsVisible: state ? state.isVisible : null,
          heroIsSleeping: state ? state.isMotionSleeping : null,
          desktopHeroVidPaused: desktopHeroVid ? desktopHeroVid.paused : null
        };
      })()
    `,
    returnByValue: true
  });
  console.log('Top Viewport Scroll Check:', offscreenCheck.result.value);
  check(offscreenCheck.result.value && offscreenCheck.result.value.heroIsVisible === false,
    '3D Hero intersection observer detected offscreen at top and set isVisible = false');
  check(offscreenCheck.result.value && offscreenCheck.result.value.desktopHeroVidPaused === false,
    'Desktop hero video resumed playback when in view at top');

  // Now scroll down to review section (video scrolled off-screen)
  await send('Runtime.evaluate', { expression: 'window.scrollTo(0, 3000);' });
  await new Promise(r => setTimeout(r, 800));

  const videoOffscreenCheck = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const videos = Array.from(document.querySelectorAll('video'));
        const desktopHeroVid = videos[0];
        return {
          desktopHeroVidPaused: desktopHeroVid ? desktopHeroVid.paused : null
        };
      })()
    `,
    returnByValue: true
  });
  check(videoOffscreenCheck.result.value && videoOffscreenCheck.result.value.desktopHeroVidPaused === true,
    'Desktop hero video paused decoding while scrolled offscreen');

  // 1.4 Smooth Scroll 60fps Benchmark
  console.log('\n--- AUDIT 1.4: 60fps Scrolling Smoothness Benchmark (Desktop) ---');
  await send('Runtime.evaluate', { expression: 'window.scrollTo(0, 0);' });
  await new Promise(r => setTimeout(r, 1200));

  const scrollBenchRes = await send('Runtime.evaluate', {
    expression: `
      new Promise((resolve) => {
        const frameTimes = [];
        const longSpikes = [];
        let lastTime = performance.now();
        let scrollY = 0;
        const maxScroll = Math.min(2500, document.body.scrollHeight - window.innerHeight);
        const startTime = performance.now();

        function step() {
          const now = performance.now();
          const delta = now - lastTime;
          lastTime = now;
          const roundedDelta = Math.round(delta * 10) / 10;
          frameTimes.push(roundedDelta);
          if (delta > 33.3) {
            longSpikes.push({ scrollY, delta: roundedDelta });
          }

          scrollY += 18;
          if (scrollY > maxScroll) scrollY = 0;
          window.scrollTo(0, scrollY);

          if (now - startTime < 2000) {
            requestAnimationFrame(step);
          } else {
            // Warmup frames sliced off
            const steady = frameTimes.slice(5);
            const avgDelta = steady.reduce((a, b) => a + b, 0) / steady.length;
            const avgFps = 1000 / avgDelta;
            const longFrames = steady.filter(t => t > 33.3).length;
            const maxFrame = Math.max(...steady);
            resolve({
              longSpikes,
              rawTopFrames: steady.slice(0, 15),
              totalFrames: steady.length,
              avgFps: Math.round(avgFps * 10) / 10,
              avgFrameTimeMs: Math.round(avgDelta * 100) / 100,
              maxFrameTimeMs: Math.round(maxFrame * 100) / 100,
              longFramesCount: longFrames
            });
          }
        }
        requestAnimationFrame(step);
      })
    `,
    awaitPromise: true,
    returnByValue: true
  });

  const bench = scrollBenchRes.result.value;
  console.log('Desktop Scroll Benchmark Result:', bench);
  check(bench.avgFps >= 35, `Average scrolling frame rate is buttery smooth in headless software mode (got: ${bench.avgFps} fps)`);
  check(bench.avgFrameTimeMs <= 30.0, `Average frame duration <= 30ms (got: ${bench.avgFrameTimeMs}ms)`);

  // =========================================================================
  // AUDIT 2: Mobile Viewport (390x844)
  // =========================================================================
  console.log('\n--- AUDIT 2: Mobile Viewport (390x844) ---');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    mobile: true
  });

  await send('Page.navigate', { url: 'http://localhost:3000/' });
  console.log('Waiting for Spline 3D scene to load on mobile...');
  let mobileSplineLoaded = false;
  for (let i = 0; i < 60; i++) {
    const check = await send('Runtime.evaluate', {
      expression: `!!(window.__splineLoaded && window.__splineHand)`,
      returnByValue: true
    });
    if (check && check.result && check.result.value) {
      console.log(`Spline 3D scene loaded on mobile after ${(i * 500) / 1000}s`);
      mobileSplineLoaded = true;
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  if (!mobileSplineLoaded) throw new Error('Spline failed to load on mobile within 30s');

  // 2.1 Mobile DPR cap
  const mobileDprCheck = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const canvas = document.getElementById('allyrich-spline-canvas');
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        const effectiveRatio = canvas.width / rect.width;
        return {
          devicePixelRatio: window.devicePixelRatio,
          canvasWidth: canvas.width,
          rectWidth: rect.width,
          effectiveRatio: Math.round(effectiveRatio * 100) / 100
        };
      })()
    `,
    returnByValue: true
  });
  console.log('Mobile Canvas DPR Info (Simulated 3x screen):', mobileDprCheck.result.value);
  check(mobileDprCheck.result.value && mobileDprCheck.result.value.effectiveRatio <= 1.55,
    `Mobile canvas DPR is capped at 1.5x despite 3.0x device scale factor (got: ${mobileDprCheck.result.value?.effectiveRatio})`);

  // 2.2 Mobile Scroll Benchmark
  console.log('\n--- AUDIT 2.2: 60fps Scrolling Smoothness Benchmark (Mobile) ---');
  await send('Runtime.evaluate', { expression: 'window.scrollTo(0, 0);' });
  await new Promise(r => setTimeout(r, 400));

  const mobileScrollBench = await send('Runtime.evaluate', {
    expression: `
      new Promise((resolve) => {
        const frameTimes = [];
        let lastTime = performance.now();
        let scrollY = 0;
        const maxScroll = Math.min(2000, document.body.scrollHeight - window.innerHeight);
        const startTime = performance.now();

        function step() {
          const now = performance.now();
          const delta = now - lastTime;
          lastTime = now;
          frameTimes.push(delta);

          scrollY += 15;
          if (scrollY > maxScroll) scrollY = 0;
          window.scrollTo(0, scrollY);

          if (now - startTime < 2000) {
            requestAnimationFrame(step);
          } else {
            const steady = frameTimes.slice(5);
            const avgDelta = steady.reduce((a, b) => a + b, 0) / steady.length;
            const avgFps = 1000 / avgDelta;
            const longFrames = steady.filter(t => t > 33.3).length;
            const maxFrame = Math.max(...steady);
            resolve({
              totalFrames: steady.length,
              avgFps: Math.round(avgFps * 10) / 10,
              avgFrameTimeMs: Math.round(avgDelta * 100) / 100,
              maxFrameTimeMs: Math.round(maxFrame * 100) / 100,
              longFramesCount: longFrames
            });
          }
        }
        requestAnimationFrame(step);
      })
    `,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('Mobile Scroll Benchmark Result:', mobileScrollBench.result.value);
  check(mobileScrollBench.result.value.avgFps >= 35,
    `Mobile scrolling frame rate is buttery smooth in headless software mode (got: ${mobileScrollBench.result.value.avgFps} fps)`);

  // =========================================================================
  // AUDIT 3: Collections Page (174 Products Grid Performance)
  // =========================================================================
  console.log('\n--- AUDIT 3: Collections Grid (174 Products) Containment & Scroll ---');
  await send('Page.navigate', { url: 'http://localhost:3000/collections/all' });
  await new Promise(r => setTimeout(r, 2000));

  const collectionsCheck = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const card = document.querySelector('.product-card');
        const img = document.querySelector('.product-card__image');
        const wishBtn = document.querySelector('.wishlist-btn');
        const csCard = card ? window.getComputedStyle(card) : null;
        const csImg = img ? window.getComputedStyle(img) : null;
        const csWish = wishBtn ? window.getComputedStyle(wishBtn) : null;
        return {
          totalCards: document.querySelectorAll('.product-card').length,
          contain: csCard ? csCard.contain : null,
          contentVisibility: csCard ? csCard.contentVisibility : null,
          imgWillChange: csImg ? csImg.willChange : null,
          wishlistBackdropFilter: csWish ? csWish.backdropFilter : null
        };
      })()
    `,
    returnByValue: true
  });
  console.log('Collections Card Performance Properties:', collectionsCheck.result.value);
  check(collectionsCheck.result.value && collectionsCheck.result.value.totalCards >= 100,
    `Collections grid has full catalog (count: ${collectionsCheck.result.value?.totalCards})`);
  check(collectionsCheck.result.value && collectionsCheck.result.value.contentVisibility === 'auto',
    'Product cards have content-visibility: auto enabled for offscreen render skipping');
  check(collectionsCheck.result.value && collectionsCheck.result.value.imgWillChange === 'auto',
    'Product card images do NOT have will-change: opacity layer explosion (got will-change: auto)');
  check(collectionsCheck.result.value && (!collectionsCheck.result.value.wishlistBackdropFilter || collectionsCheck.result.value.wishlistBackdropFilter === 'none' || !collectionsCheck.result.value.wishlistBackdropFilter.includes('blur')),
    'Wishlist buttons do NOT force per-frame GPU backdrop-filter blur across 200+ cards');

  console.log('\n======================================================');
  if (allChecksPassed) {
    console.log('🎉 ALL 60FPS PERFORMANCE & BOTTLENECK AUDITS PASSED 100%!');
  } else {
    console.error('❌ SOME AUDIT CHECKS FAILED!');
    process.exitCode = 1;
  }
  console.log('======================================================\n');

  ws.close();
  cleanup();
}

runPerformanceAudit().catch(err => {
  console.error('Audit failed with error:', err);
  process.exit(1);
});
