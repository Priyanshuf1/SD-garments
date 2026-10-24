const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE_DIR = 'C:\\Users\\palr8\\.gemini\\antigravity\\scratch\\chrome_test_profile_mobile_hero';

async function runMobileHeroVerification() {
  console.log('📱 Starting AllyRich Mobile View, Image, Scroll & Gyroscope ("Zyro") Test Suite...\n');

  try {
    fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
  } catch (e) {}

  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9255',
    `--user-data-dir=${PROFILE_DIR}`,
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=390,844',
    'about:blank'
  ]);

  let chromeKilled = false;
  function cleanup() {
    if (!chromeKilled) {
      chromeKilled = true;
      try { chrome.kill(); } catch (e) {}
      try { fs.rmSync(PROFILE_DIR, { recursive: true, force: true }); } catch (e) {}
    }
  }
  process.on('exit', cleanup);

  // Wait for Chrome port
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 200));
    try {
      const res = await fetch('http://127.0.0.1:9255/json/version');
      if (res.ok) break;
    } catch (e) {}
  }

  const targetsRes = await fetch('http://127.0.0.1:9255/json');
  const targets = await targetsRes.json();
  const pageTarget = targets.find(t => t.type === 'page' && !t.url.startsWith('chrome-extension://')) || targets[0];

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let msgId = 1;
  const callbacks = new Map();

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.method === 'Runtime.consoleAPICalled') {
      console.log('  [BROWSER]', data.params.type, data.params.args.map(a => a.value || a.description).join(' '));
    }
    if (data.method === 'Runtime.exceptionThrown') {
      console.error('  [BROWSER EXCEPTION]', data.params.exceptionDetails);
    }
    if (data.id && callbacks.has(data.id)) {
      callbacks.get(data.id)(data.result);
      callbacks.delete(data.id);
    }
  };

  function send(method, params = {}) {
    return new Promise((resolve) => {
      const id = msgId++;
      callbacks.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');

  // Emulate iPhone 14 (390 x 844, touch device)
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    mobile: true
  });
  await send('Emulation.setTouchEmulationEnabled', {
    enabled: true,
    maxTouchPoints: 5
  });

  console.log('[1] Navigating to http://localhost:3000/ on Mobile Viewport (390x844)...');
  await send('Page.navigate', { url: 'http://localhost:3000/' });

  // Wait for page and 3D Spline scene to initialize
  console.log('Waiting for Spline 3D scene to load...');
  let splineLoaded = false;
  for (let i = 0; i < 90; i++) {
    const check = await send('Runtime.evaluate', {
      expression: `!!(window.__splineLoaded && window.__splineHand)`,
      returnByValue: true
    });
    if (check && check.result && check.result.value) {
      console.log(`Spline 3D model loaded after ${(i * 500) / 1000}s`);
      splineLoaded = true;
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  if (!splineLoaded) {
    throw new Error('Spline 3D scene failed to load within 45 seconds');
  }

  let passed = 0;
  function check(cond, msg) {
    if (cond) {
      console.log(`  ✅ [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${msg}`);
      throw new Error(`Assertion failed: ${msg}`);
    }
  }

  console.log('\n[2] Verifying Mobile 3D Section Styles, Background Image & Margins:');
  const styleCheck = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const section = document.getElementById('shopify-section-allyrich-3d-hero');
        const container = document.getElementById('allyrich-3d-hero-container');
        const canvas = document.getElementById('allyrich-spline-canvas');

        if (!section || !container || !canvas) {
          return { error: 'elements not found', section: !!section, container: !!container, canvas: !!canvas };
        }

        const secStyle = window.getComputedStyle(section);
        const contStyle = window.getComputedStyle(container);
        const canStyle = window.getComputedStyle(canvas);

        return {
          sectionHeight: secStyle.height,
          marginTop: secStyle.marginTop,
          marginBottom: secStyle.marginBottom,
          bgImage: contStyle.backgroundImage,
          bgSize: contStyle.backgroundSize,
          bgPos: contStyle.backgroundPosition,
          canvasPointerEvents: canStyle.pointerEvents,
          canvasTouchAction: canStyle.touchAction,
          containerTouchAction: contStyle.touchAction
        };
      })()
    `,
    returnByValue: true
  });

  const res = styleCheck.result.value;
  console.log('Mobile Hero Section Computed Styles:', res);

  check(res && !res.error, 'Mobile 3D hero section elements found in DOM');
  check(res.bgImage && res.bgImage.includes('allyrich-hero-bg-mobile.png'), `Mobile background image is allyrich-hero-bg-mobile.png (got: ${res.bgImage})`);
  check(parseFloat(res.marginTop) >= 20, `Upper margin (marginTop) cleanly adjusted for mobile: ${res.marginTop}`);
  check(parseFloat(res.marginBottom) >= 20, `Lower margin (marginBottom) cleanly adjusted for mobile: ${res.marginBottom}`);
  check(res.canvasPointerEvents === 'none', `Canvas pointerEvents is 'none' on mobile to avoid trapping touch: ${res.canvasPointerEvents}`);
  check(res.canvasTouchAction === 'pan-y', `Canvas touchAction is 'pan-y' on mobile for smooth vertical scroll: ${res.canvasTouchAction}`);
  check(res.containerTouchAction === 'pan-y', `Container touchAction is 'pan-y' on mobile: ${res.containerTouchAction}`);

  console.log('\n[3] Verifying Mobile Scrolling Past the 3D Section (Zero Stuck / Uninhibited Scroll):');
  const scrollTest = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const section = document.getElementById('shopify-section-allyrich-3d-hero');
        const container = document.getElementById('allyrich-3d-hero-container');
        const canvas = document.getElementById('allyrich-spline-canvas');
        const app = window.__splineApp;

        // 1. Check hit testing pass-through
        section.scrollIntoView({ behavior: 'instant', block: 'center' });
        const hit = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);

        // 2. Test touch event dispatch (must NOT call preventDefault)
        const t1 = new Touch({ identifier: 1, target: canvas, clientX: 100, clientY: 200 });
        const touchEvent = new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [t1] });
        const dispatchResult = canvas.dispatchEvent(touchEvent); // true means preventDefault was NOT called

        // 3. Test OrbitControls disabled
        const controls = app ? app._controls : null;
        const orbitTouchDisabled = !controls || controls.enableRotate === false || controls.touches?.ONE === null;

        // 4. Verify smooth scroll past the 3D hero section
        const secTop = section.getBoundingClientRect().top + window.scrollY;
        window.scrollTo(0, secTop - 200);
        const pos1 = window.scrollY;

        window.scrollTo(0, secTop + 150);
        const pos2 = window.scrollY;

        window.scrollTo(0, secTop + 550);
        const pos3 = window.scrollY;

        return {
          hitTag: hit ? hit.tagName : null,
          hitId: hit ? hit.id : null,
          touchNotPrevented: dispatchResult,
          controlsInfo: controls ? { enableRotate: controls.enableRotate, touches: controls.touches } : null,
          orbitTouchDisabled,
          pos1,
          pos2,
          pos3,
          canScrollPast: pos3 > pos2 && pos2 > pos1
        };
      })()
    `,
    returnByValue: true
  });

  const sRes = scrollTest.result.value;
  console.log('Mobile Scroll & Touch Pass-Through Results:', sRes);
  check(sRes.touchNotPrevented, 'Touch events on canvas do NOT call preventDefault (native scroll enabled)');
  check(sRes.orbitTouchDisabled, 'Spline OrbitControls touch gestures disabled (no gesture capturing)');
  check(sRes.canScrollPast, `User can scroll freely past the 3D hero section without getting stuck (pos1=${sRes.pos1}, pos2=${sRes.pos2}, pos3=${sRes.pos3})`);

  // Verify mobile adaptive base layout centering
  const motionInit = await send('Runtime.evaluate', {
    expression: `window.__allyrichGetMotionState()`,
    returnByValue: true
  });
  console.log('Mobile Motion Initial State:', motionInit.result.value);
  check(motionInit.result.value.basePosX === -15, `3D model is adaptively centered on mobile (basePosX = ${motionInit.result.value.basePosX})`);

  console.log('\n[4] Verifying Gyroscope ("Zyro") Motion Tracking (DeviceOrientation):');
  // Scroll 3D section into viewport so IntersectionObserver activates motion loop
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const sec = document.getElementById('shopify-section-allyrich-3d-hero');
        sec.scrollIntoView({ behavior: 'instant', block: 'center' });
      })()
    `
  });
  await new Promise(r => setTimeout(r, 600));

  // Get initial rotation values of the 3D model
  const initialRot = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const hand = window.__splineHand || (window.__splineApp && (window.__splineApp.findObjectByName('phone_hand') || window.__splineApp.findObjectByName('Phone') || window.__splineApp.findObjectByName('hand')));
        if (!hand) return { error: 'no hand object' };
        return {
          rotX: hand.rotation.x,
          rotY: hand.rotation.y,
          rotZ: hand.rotation.z
        };
      })()
    `,
    returnByValue: true
  });
  console.log('Initial Model Rotation:', initialRot.result.value);

  // Emit physical mobile gyroscope tilt: gamma = 20 deg (tilt right), beta = 65 deg (tilt back)
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        if (typeof window.__allyrichSimulateOrientation === 'function') {
          window.__allyrichSimulateOrientation(20, 65, 0);
        } else {
          window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', {
            gamma: 20,
            beta: 65,
            alpha: 0
          }));
        }
      })()
    `
  });

  // Wait for smooth dampening to interpolate and settle
  await new Promise(r => setTimeout(r, 1200));

  const tiltedRot = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const hand = window.__splineHand || (window.__splineApp && (window.__splineApp.findObjectByName('phone_hand') || window.__splineApp.findObjectByName('Phone') || window.__splineApp.findObjectByName('hand')));
        return {
          rotX: hand.rotation.x,
          rotY: hand.rotation.y,
          rotZ: hand.rotation.z
        };
      })()
    `,
    returnByValue: true
  });
  console.log('Tilted Model Rotation via Gyroscope:', tiltedRot.result.value);

  // Model should have reacted to phone tilt!
  check(
    Math.abs(tiltedRot.result.value.rotY - initialRot.result.value.rotY) > 0.05 ||
    Math.abs(tiltedRot.result.value.rotX - initialRot.result.value.rotX) > 0.05,
    `Model responded to physical gyroscope ("zyro") tilt (rotY changed from ${initialRot.result.value.rotY.toFixed(3)} to ${tiltedRot.result.value.rotY.toFixed(3)})`
  );

  console.log('\n[5] Verifying Finger Touch Movement Does NOT Hijack Model Rotation:');
  const motionStateBefore = await send('Runtime.evaluate', {
    expression: `window.__allyrichGetMotionState()`,
    returnByValue: true
  });
  console.log('Motion State Before Touch:', motionStateBefore.result.value);

  // Simulate a massive finger drag swipe across the canvas (delta 250px)
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const canvas = document.getElementById('allyrich-spline-canvas');
        const container = document.getElementById('allyrich-3d-hero-container');
        
        // Dispatch touchstart and huge touchmove across canvas & container
        const t1 = new Touch({ identifier: 1, target: canvas, clientX: 50, clientY: 50 });
        const t2 = new Touch({ identifier: 1, target: canvas, clientX: 300, clientY: 300 });
        
        canvas.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [t1] }));
        canvas.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [t2] }));
        container.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [t2] }));
      })()
    `
  });

  await new Promise(r => setTimeout(r, 400));

  const motionStateAfter = await send('Runtime.evaluate', {
    expression: `window.__allyrichGetMotionState()`,
    returnByValue: true
  });
  console.log('Motion State After Touch:', motionStateAfter.result.value);

  check(
    Math.abs(motionStateAfter.result.value.targetRotY - motionStateBefore.result.value.targetRotY) < 0.0001,
    `Target rotation was completely unaffected by finger drag (targetRotY remained ${motionStateAfter.result.value.targetRotY.toFixed(4)})`
  );
  check(
    motionStateAfter.result.value.lastInteractionType === 'gyro',
    `Interaction type remained 'gyro', never hijacked by touch (got: ${motionStateAfter.result.value.lastInteractionType})`
  );

  console.log('\n[6] Capturing Mobile View Screenshot:');
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const sec = document.getElementById('shopify-section-allyrich-3d-hero');
        sec.scrollIntoView({ behavior: 'instant', block: 'center' });
      })()
    `
  });
  await new Promise(r => setTimeout(r, 600));

  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('mobile_3d_hero_section.png', Buffer.from(screenshot.data, 'base64'));
  console.log('  📸 Saved mobile screenshot: mobile_3d_hero_section.png');

  console.log('\n[7] Verifying Desktop Compatibility (1440x900):');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  });
  await send('Emulation.setTouchEmulationEnabled', { enabled: false });

  await send('Runtime.evaluate', { expression: `window.dispatchEvent(new Event('resize'));` });
  await new Promise(r => setTimeout(r, 500));

  const desktopCheck = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const container = document.getElementById('allyrich-3d-hero-container');
        const canvas = document.getElementById('allyrich-spline-canvas');
        const motion = window.__allyrichGetMotionState();

        // Dispatch desktop mouse pointer event
        window.dispatchEvent(new PointerEvent('pointermove', {
          clientX: window.innerWidth * 0.75,
          clientY: window.innerHeight * 0.75,
          pointerType: 'mouse'
        }));

        const motionAfterMouse = window.__allyrichGetMotionState();

        // Dispatch synthetic deviceorientation to simulate laptop motion sensor
        window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', {
          gamma: 25,
          beta: 60,
          alpha: 0
        }));

        const motionAfterGyro = window.__allyrichGetMotionState();

        return {
          bgImage: window.getComputedStyle(container).backgroundImage,
          canvasPointerEvents: window.getComputedStyle(canvas).pointerEvents,
          desktopBasePosX: motion.basePosX,
          mouseInteraction: motionAfterMouse.lastInteractionType,
          interactionAfterLaptopTilt: motionAfterGyro.lastInteractionType
        };
      })()
    `,
    returnByValue: true
  });
  console.log('Desktop Hero Section Styles & Behavior:', desktopCheck.result.value);
  check(desktopCheck.result.value.bgImage.includes('allyrich-hero-bg.png'), 'Desktop maintains landscape allyrich-hero-bg.png');
  check(desktopCheck.result.value.canvasPointerEvents === 'auto', 'Desktop enables canvas pointer-events: auto for mouse tracking');
  check(desktopCheck.result.value.desktopBasePosX === -127.8, `Desktop maintains left-center positioning (basePosX = ${desktopCheck.result.value.desktopBasePosX})`);
  check(desktopCheck.result.value.mouseInteraction === 'mouse', 'Desktop tracks mouse pointer interactions smoothly');
  check(desktopCheck.result.value.interactionAfterLaptopTilt === 'mouse', 'Desktop mouse tracking is immune to laptop deviceorientation events (never hijacked)');

  cleanup();

  console.log(`\n========================================`);
  console.log(`🎉 ALL MOBILE HERO & GYROSCOPE TESTS PASSED! (${passed}/${passed} assertions)`);
  console.log(`========================================\n`);
}

runMobileHeroVerification().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
