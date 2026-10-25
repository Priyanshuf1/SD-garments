/**
 * AllyRich 3D Interactive Phone Screen Hero Section
 * Ported directly from https://github.com/RitikPal26/allyrich-loader
 */

import { Application } from '/assets/spline/runtime.js?v=60fps';

(function initAllyrich3DHero() {
  const canvas = document.getElementById('allyrich-spline-canvas');
  if (!canvas) return;

  const container = document.getElementById('allyrich-3d-hero-container');
  const loaderBadge = document.getElementById('spline-loader-indicator');

  let canvasPromise = null;
  let cachedDataUrl = null;

  // Cached AR canvas generator matching https://github.com/RitikPal26/allyrich-loader
  function getARCanvas() {
    if (canvasPromise) return canvasPromise;

    canvasPromise = new Promise((resolve) => {
      const offCanvas = document.createElement('canvas');
      offCanvas.width = 1080;
      offCanvas.height = 2400;
      const ctx = offCanvas.getContext('2d');
      if (!ctx) return resolve(offCanvas);

      // 1. Pure solid black background matching phone frame and OLED display
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, offCanvas.width, offCanvas.height);

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        // The central white AR emblem is ~360px wide within the 1024x571 original image.
        // Scale so the white emblem spans ~62% of the mobile screen width (sharp & prominent)
        const targetWidth = offCanvas.width * 1.7;
        const targetHeight = img.height * (targetWidth / img.width);

        const x = (offCanvas.width - targetWidth) / 2;
        const y = (offCanvas.height - targetHeight) / 2;

        ctx.drawImage(img, x, y, targetWidth, targetHeight);
        console.log('[AllyRich 3D] AR canvas drawn successfully:', { targetWidth, targetHeight, x, y });
        resolve(offCanvas);
      };
      img.onerror = (e) => {
        console.warn('[AllyRich 3D] Failed to load /assets/ar-logo.jpg, falling back to /assets/ar-logo.png', e);
        const fallbackImg = new Image();
        fallbackImg.crossOrigin = 'anonymous';
        fallbackImg.onload = () => {
          const targetWidth = offCanvas.width * 1.7;
          const targetHeight = fallbackImg.height * (targetWidth / fallbackImg.width);
          const x = (offCanvas.width - targetWidth) / 2;
          const y = (offCanvas.height - targetHeight) / 2;
          ctx.drawImage(fallbackImg, x, y, targetWidth, targetHeight);
          resolve(offCanvas);
        };
        fallbackImg.onerror = () => resolve(offCanvas);
        fallbackImg.src = '/assets/ar-logo.png';
        if (fallbackImg.complete && fallbackImg.naturalWidth !== 0) {
          fallbackImg.onload();
        }
      };
      img.src = '/assets/ar-logo.jpg';
      if (img.complete && img.naturalWidth !== 0) {
        img.onload();
      }
    });

    return canvasPromise;
  }

  function getScreenMesh(splineApp) {
    if (!splineApp) return null;
    return (
      splineApp.findObjectByName('Place your image here 2') ||
      splineApp.findObjectByName('screen') ||
      splineApp.findObjectByName('Screen') ||
      (splineApp.getAllObjects &&
        splineApp.getAllObjects().find(
          (o) =>
            o.name === 'Place your image here 2' ||
            (o.name && o.name.toLowerCase().includes('place your image')) ||
            (o.name && o.name.toLowerCase().includes('screen'))
        ))
    );
  }

  // Ensure phone screen meshes write depth, set shader alpha uniforms, and block background transmission
  function ensureOpaqueScreen(splineApp) {
    if (!splineApp || !splineApp._scene) return;
    try {
      splineApp._scene.traverse((o) => {
        if (o.isMesh && (o.name === 'Place your image here 2' || o.name === 'Front')) {
          if (o.material) {
            o.material.transparent = false;
            o.material.opacity = 1.0;
            o.material.depthWrite = true;
            o.material.depthTest = true;

            // In Spline's compiled fragment shader, nodeU7 is the alpha multiplier for layer 0 (Texture).
            // Default Spline scene has nodeU7 = 0.0 which causes the screen to blend with the HTML canvas background.
            // Setting nodeU7.value = 1.0 and nodeU16.value = 0.0 ensures 100% solid opacity.
            if (o.material.uniforms) {
              if (o.material.uniforms.nodeU7) {
                o.material.uniforms.nodeU7.value = 1.0;
              }
              if (o.material.uniforms.nodeU16) {
                o.material.uniforms.nodeU16.value = 0.0;
              }
              if (o.material.uniforms.nodeU28) {
                o.material.uniforms.nodeU28.value = 1.0;
              }
              if (o.material.uniforms.nodeU30) {
                o.material.uniforms.nodeU30.value = 1.0;
              }
            }
          }

          // Hook onBeforeRender to guarantee uniforms remain 1.0 on every frame
          o.onBeforeRender = function () {
            if (this.material && this.material.uniforms) {
              if (this.material.uniforms.nodeU7) this.material.uniforms.nodeU7.value = 1.0;
              if (this.material.uniforms.nodeU16) this.material.uniforms.nodeU16.value = 0.0;
              if (this.material.uniforms.nodeU28) this.material.uniforms.nodeU28.value = 1.0;
              if (this.material.uniforms.nodeU30) this.material.uniforms.nodeU30.value = 1.0;
            }
          };
        }
      });
    } catch (e) {
      console.debug('[AllyRich 3D] ensureOpaqueScreen error:', e);
    }
  }

  async function applyARToScreen(splineApp) {
    if (!splineApp) return;

    const screenObj = getScreenMesh(splineApp);
    if (!screenObj || !screenObj.material) {
      console.warn('[AllyRich 3D] Screen mesh not ready yet...');
      return;
    }

    // 1. Enforce opaque screen materials
    ensureOpaqueScreen(splineApp);

    // 2. Await the fully drawn AR canvas
    const arCanvas = await getARCanvas();

    const mat = screenObj.material;

    // 3. Port exact material layer handling from allyrich-loader
    if (mat.layers && Array.isArray(mat.layers)) {
      for (let i = 0; i < mat.layers.length; i++) {
        const layer = mat.layers[i];

        // Layer 1: Hide video ("Put your screen here" video)
        if (layer.type === 'video') {
          layer.visible = false;
          layer.alpha = 0;
          if (layer.texture) {
            if (layer.texture.video) {
              try {
                layer.texture.video.pause();
              } catch (e) {}
            }
            layer.texture.image = arCanvas;
            layer.texture.isVideoTexture = false;
            layer.texture.needsUpdate = true;
          }
        }

        // Layer 0: Texture layer (Base screen) - directly bind canvas to avoid 250ms synchronous toDataURL main-thread freeze
        if (layer.type === 'texture') {
          layer.visible = true;
          layer.alpha = 1;
          if (layer.texture) {
            layer.texture.image = arCanvas;
            layer.texture.needsUpdate = true;
          }
        }
      }
    }

    if (mat.map) {
      mat.map.image = arCanvas;
      mat.map.isVideoTexture = false;
      mat.map.needsUpdate = true;
    }

    mat.needsUpdate = true;

    // Re-enforce shader uniforms and depth writing
    ensureOpaqueScreen(splineApp);

    // Remove "Built with Spline" watermark
    removeWatermark(splineApp);
    screenObj.userData = screenObj.userData || {};
    screenObj.userData.__arApplied = true;

    if (splineApp.requestRender) {
      splineApp.requestRender();
    }
    console.log('[AllyRich 3D] AR screen successfully mapped onto 3D phone mesh!');
  }

  function removeWatermark(splineApp) {
    // 1. Disable WebGL Pipeline Logo Overlay Pass in runtime
    try {
      if (splineApp?._renderer?.pipeline) {
        const pipeline = splineApp._renderer.pipeline;
        if (typeof pipeline.setWatermark === 'function') {
          pipeline.setWatermark(null);
        }
        if (pipeline.logoOverlayPass) {
          pipeline.logoOverlayPass.enabled = false;
        }
      }
    } catch (e) {
      console.debug('Error disabling WebGL watermark pass:', e);
    }

    // 2. Remove any DOM watermark / link badges
    try {
      const root = container || document;
      root.querySelectorAll('a, div, span, button').forEach((el) => {
        const text = (el.textContent || '').trim();
        const href = el.href || '';
        const id = (el.id || '').toLowerCase();
        const className = (typeof el.className === 'string' ? el.className : '').toLowerCase();
        if (
          text.includes('Built with Spline') ||
          text.includes('Made with Spline') ||
          href.includes('spline.design') ||
          id.includes('watermark') ||
          className.includes('watermark')
        ) {
          el.remove();
        }
      });
    } catch (e) {}
  }

  // Hide the 3D environment dome/mesh in the Spline scene so custom CSS background is revealed
  function hideEnvironment(app) {
    try {
      const envObj = app.findObjectByName('Environment');
      if (envObj) {
        envObj.visible = false;
        console.log('[AllyRich 3D] Environment mesh hidden successfully!');
      }
      if (app._scene) {
        app._scene.traverse((obj) => {
          if (obj.name && obj.name.toLowerCase().includes('environment')) {
            obj.visible = false;
          }
        });
      }
    } catch (e) {
      console.debug('[AllyRich 3D] hideEnvironment:', e);
    }
  }

  // Enable WebGL transparency so custom background image shines through
  function enableTransparency(app) {
    try {
      hideEnvironment(app);
      if (app._renderer) {
        app._renderer.setClearColor(0x000000, 0);
        app._renderer.setClearAlpha(0);
        if (app._renderer.domElement) {
          app._renderer.domElement.style.background = 'transparent';
          app._renderer.domElement.style.backgroundColor = 'transparent';
        }
      }
      if (app._scene) {
        app._scene.background = null;
        if (app._scene.activePage?.bgColor) {
          app._scene.activePage.bgColor.a = 0;
        }
      }
      if (typeof app.setBackgroundColor === 'function') {
        app.setBackgroundColor('transparent');
      }
    } catch (e) {
      console.debug('[AllyRich 3D] transparency setup:', e);
    }
  }

  function updateAll(app) {
    enableTransparency(app);
    removeWatermark(app);
    applyARToScreen(app);
  }

  /**
   * Dual Motion Controller:
   * - Laptop / Desktop: follows mouse cursor movement across viewport
   * - Mobile / Phone: follows physical phone gyroscope (DeviceOrientation gamma & beta)
   */
  function setupMotionInteraction(splineApp) {
    const phoneHand =
      splineApp.findObjectByName('phone_hand') ||
      splineApp.findObjectByName('Phone') ||
      splineApp.findObjectByName('hand');

    if (!phoneHand) {
      console.warn('[AllyRich 3D] phone_hand object not found for motion tracking.');
      return;
    }

    window.__splineHand = phoneHand;
    window.__splineLoaded = true;

    // Helper: detect mobile or touch viewport
    function isMobileView() {
      return (
        window.innerWidth <= 900 ||
        ('ontouchstart' in window && window.innerWidth <= 1024) ||
        (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
      );
    }

    // Adaptive Base Layout: centers the 3D phone on mobile portrait view so it doesn't clip off-screen
    function getBaseLayout() {
      if (isMobileView()) {
        return {
          posX: -15,
          posY: -505,
          posZ: 290.88,
          scale: 0.95
        };
      }
      return {
        posX: -127.8,
        posY: -549.2,
        posZ: 290.88,
        scale: 1.0
      };
    }

    const baseRotX = phoneHand.rotation ? phoneHand.rotation.x : 0.454;
    const baseRotY = phoneHand.rotation ? phoneHand.rotation.y : 0;
    const baseRotZ = phoneHand.rotation ? phoneHand.rotation.z : 0;

    let currentLayout = getBaseLayout();
    let basePosX = currentLayout.posX;
    let basePosY = currentLayout.posY;
    let basePosZ = currentLayout.posZ;

    let targetRotX = baseRotX;
    let targetRotY = baseRotY;
    let targetRotZ = baseRotZ;
    let targetPosX = basePosX;
    let targetPosY = basePosY;
    let targetPosZ = basePosZ;

    let currentRotX = baseRotX;
    let currentRotY = baseRotY;
    let currentRotZ = baseRotZ;
    let currentPosX = basePosX;
    let currentPosY = basePosY;
    let currentPosZ = basePosZ;

    let lastInteractionType = 'none'; // 'gyro' or 'mouse'
    let lastGyroTime = 0;

    let isWindowScrolling = false;
    let scrollDebounceTimer = null;

    // Always disable pointer-events on the canvas so wheel and touch scrolls pass unhindered to browser compositor.
    // Desktop mouse tracking operates via window-level mousemove events.
    function syncCanvasTouchBehavior() {
      if (!canvas) return;
      canvas.style.pointerEvents = 'none';
      canvas.style.touchAction = 'pan-y';
      if (container) {
        container.style.touchAction = 'pan-y';
      }

      currentLayout = getBaseLayout();
      basePosX = currentLayout.posX;
      basePosY = currentLayout.posY;
      basePosZ = currentLayout.posZ;

      if (phoneHand && phoneHand.scale && typeof phoneHand.scale.set === 'function') {
        phoneHand.scale.set(currentLayout.scale, currentLayout.scale, currentLayout.scale);
      }

      if (lastInteractionType === 'none') {
        targetPosX = basePosX;
        targetPosY = basePosY;
        targetPosZ = basePosZ;
      }
    }
    syncCanvasTouchBehavior();
    window.addEventListener('resize', syncCanvasTouchBehavior, { passive: true });
    window.addEventListener('orientationchange', syncCanvasTouchBehavior, { passive: true });

    // Active page scroll listener: pauses WebGL rendering and disables pointer-events for 60fps Chrome scrolling
    function handleWindowScroll() {
      if (!isWindowScrolling) {
        isWindowScrolling = true;
        window.__isPageScrolling = true;
        document.body.classList.add('is-scrolling');
        if (canvas) canvas.style.pointerEvents = 'none';
        if (container) container.style.pointerEvents = 'none';

        // Pause Spline WebGL during active scrolling
        if (typeof splineApp.stop === 'function') {
          try { splineApp.stop(); } catch (e) {}
        }
        if (motionRafId) {
          cancelAnimationFrame(motionRafId);
          motionRafId = null;
        }
      }

      clearTimeout(scrollDebounceTimer);
      scrollDebounceTimer = setTimeout(() => {
        isWindowScrolling = false;
        window.__isPageScrolling = false;
        document.body.classList.remove('is-scrolling');
        syncCanvasTouchBehavior();

        // Render exactly 1 frame on scroll rest if visible, without starting a redundant 60fps loop
        if (isHeroVisible) {
          if (typeof splineApp.requestRender === 'function') {
            splineApp.requestRender();
          }
        }

        // Resume review fisheye if in viewport
        if (window.__reviewGallery && window.__reviewGallery.isInViewport && !window.__reviewGallery.rafId) {
          window.__reviewGallery.lastFrameTime = performance.now();
          window.__reviewGallery.rafId = requestAnimationFrame(window.__reviewGallery.animate);
        }
      }, 150);
    }
    window.addEventListener('scroll', handleWindowScroll, { passive: true });

    // Disable any internal Spline orbit/camera touch rotation to prevent gesture capture
    try {
      if (splineApp._controls) {
        if (splineApp._controls.touches) {
          splineApp._controls.touches.ONE = null;
          splineApp._controls.touches.TWO = null;
        }
        splineApp._controls.enableRotate = false;
        splineApp._controls.enablePan = false;
        splineApp._controls.enableZoom = false;
      }
    } catch (e) {}

    let cachedContainerRect = null;
    let lastInteractionTime = performance.now();

    function wakeMotionLoop() {
      if (!isHeroVisible || isWindowScrolling || window.__isPageScrolling) return;
      if (typeof splineApp.play === 'function') {
        try { splineApp.play(); } catch (e) {}
      }
      if (!motionRafId) {
        motionRafId = requestAnimationFrame(animateMotion);
      }
      if (typeof splineApp.requestRender === 'function') {
        splineApp.requestRender();
      }
    }

    // Touch interactions when hero is visible wake the motion loop
    window.addEventListener('touchstart', () => {
      if (isHeroVisible && motionRafId === null) {
        lastInteractionTime = performance.now();
        wakeMotionLoop();
      }
    }, { passive: true });

    // 1. Mobile Gyroscope ("Zyro") Motion Tracking (DeviceOrientation gamma & beta)
    function handleDeviceOrientation(e) {
      if (!e) return;
      // Strictly ignore gyro on desktop to prevent laptop motion sensors from hijacking mouse tracking
      if (!isMobileView()) return;

      const rawGamma = typeof e.gamma === 'number' ? e.gamma : null;
      const rawBeta = typeof e.beta === 'number' ? e.beta : null;
      if (rawGamma === null && rawBeta === null) return;

      lastInteractionType = 'gyro';
      lastGyroTime = performance.now();
      lastInteractionTime = lastGyroTime;

      const gamma = rawGamma !== null ? rawGamma : 0;
      const beta = rawBeta !== null ? rawBeta : 45;

      // Neutral portrait holding posture: gamma = 0 deg (lateral tilt), beta = 45 deg (handheld viewing angle)
      // Max tilt angle sensitivity (degrees)
      const maxTilt = 24;
      const normX = Math.max(-1, Math.min(1, gamma / maxTilt));
      const normY = Math.max(-1, Math.min(1, (beta - 45) / maxTilt));

      // Map phone tilt directly to 3D rotation and subtle parallax translation
      targetRotY = baseRotY + normX * 0.50;
      targetRotX = baseRotX + normY * 0.38;
      targetRotZ = baseRotZ - normX * 0.14;
      targetPosX = basePosX + normX * 38;
      targetPosY = basePosY - normY * 22;

      wakeMotionLoop();
    }

    // Register device orientation events (both standard and absolute)
    window.addEventListener('deviceorientation', handleDeviceOrientation, { passive: true });
    window.addEventListener('deviceorientationabsolute', handleDeviceOrientation, { passive: true });

    // Expose window simulation helper for test suites and mobile verification
    window.__allyrichSimulateOrientation = function (gamma, beta, alpha = 0) {
      // Force mobile simulation path if invoked in test
      const originalIsMob = isMobileView();
      if (!originalIsMob) {
        const rawGamma = typeof gamma === 'number' ? gamma : 0;
        const rawBeta = typeof beta === 'number' ? beta : 45;
        lastInteractionType = 'gyro';
        lastGyroTime = performance.now();
        lastInteractionTime = lastGyroTime;
        const maxTilt = 24;
        const normX = Math.max(-1, Math.min(1, rawGamma / maxTilt));
        const normY = Math.max(-1, Math.min(1, (rawBeta - 45) / maxTilt));
        targetRotY = baseRotY + normX * 0.50;
        targetRotX = baseRotX + normY * 0.38;
        targetRotZ = baseRotZ - normX * 0.14;
        targetPosX = basePosX + normX * 38;
        targetPosY = basePosY - normY * 22;
        wakeMotionLoop();
        return;
      }
      handleDeviceOrientation({ gamma, beta, alpha });
    };

    window.__allyrichGetMotionState = function () {
      return {
        targetRotX,
        targetRotY,
        targetRotZ,
        targetPosX,
        targetPosY,
        currentRotX,
        currentRotY,
        currentRotZ,
        currentPosX,
        currentPosY,
        basePosX,
        basePosY,
        lastInteractionType
      };
    };

    // iOS 13+ requires user gesture permission
    if (
      typeof window.DeviceOrientationEvent !== 'undefined' &&
      typeof window.DeviceOrientationEvent.requestPermission === 'function'
    ) {
      let permissionRequested = false;
      const requestGyroPermission = () => {
        if (permissionRequested) return;
        try {
          const promise = window.DeviceOrientationEvent.requestPermission();
          if (promise && typeof promise.then === 'function') {
            promise
              .then((state) => {
                if (state === 'granted') {
                  permissionRequested = true;
                  window.addEventListener('deviceorientation', handleDeviceOrientation, { passive: true });
                  window.addEventListener('deviceorientationabsolute', handleDeviceOrientation, { passive: true });
                  console.log('[AllyRich 3D] iOS DeviceOrientation permission granted.');
                  window.removeEventListener('click', requestGyroPermission);
                  window.removeEventListener('touchend', requestGyroPermission);
                }
              })
              .catch((err) => console.debug('[AllyRich 3D] Gyro permission request:', err));
          }
        } catch (e) {}
      };
      // In iOS Safari, user gestures on touchend or click reliably permit DeviceOrientation
      window.addEventListener('touchend', requestGyroPermission, { passive: true });
      window.addEventListener('click', requestGyroPermission, { passive: true });
    }

    // 2. Laptop / Desktop Mouse Tracker (throttled to requestAnimationFrame)
    let pendingMouseX = null;
    let pendingMouseY = null;
    let mouseRafPending = false;

    function handleMouseMove(e) {
      if (isWindowScrolling || window.__isPageScrolling) return;
      // Mobile / touch view must NEVER track finger movements
      if (isMobileView()) return;
      if (e.pointerType && e.pointerType !== 'mouse') return;

      lastInteractionType = 'mouse';
      lastInteractionTime = performance.now();
      pendingMouseX = e.clientX;
      pendingMouseY = e.clientY;

      if (!mouseRafPending) {
        mouseRafPending = true;
        requestAnimationFrame(() => {
          mouseRafPending = false;
          if (pendingMouseX === null || pendingMouseY === null) return;
          if (!cachedContainerRect) {
            cachedContainerRect = container
              ? container.getBoundingClientRect()
              : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
          }
          const centerX = cachedContainerRect.left + cachedContainerRect.width / 2;
          const centerY = cachedContainerRect.top + cachedContainerRect.height / 2;

          const normX = Math.max(-1, Math.min(1, (pendingMouseX - centerX) / (window.innerWidth * 0.5)));
          const normY = Math.max(-1, Math.min(1, (pendingMouseY - centerY) / (window.innerHeight * 0.5)));

          targetRotY = baseRotY + normX * 0.46;
          targetRotX = baseRotX + normY * 0.34;
          targetRotZ = baseRotZ - normX * 0.14;
          targetPosX = basePosX + normX * 36;
          targetPosY = basePosY - normY * 22;

          wakeMotionLoop();
        });
      }
    }

    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    // 4. Smooth Animation Loop with Viewport Visibility Observer (Zero CPU/GPU when idle or off-screen)
    let isHeroVisible = true;
    let motionRafId = null;

    function animateMotion() {
      if (!isHeroVisible || isWindowScrolling || window.__isPageScrolling) {
        motionRafId = null;
        if (typeof splineApp.stop === 'function') {
          try { splineApp.stop(); } catch (e) {}
        }
        return;
      }

      const now = performance.now();
      const timeSinceInteraction = now - lastInteractionTime;

      // Subtle ambient breathing sway ONLY after active user interaction
      let ambientRotX = 0;
      let ambientRotY = 0;
      if (lastInteractionType !== 'none' && timeSinceInteraction < 1200) {
        const t = now * 0.001;
        const fade = Math.max(0, 1 - (timeSinceInteraction / 1200));
        ambientRotX = Math.sin(t * 0.8) * (0.015 * fade);
        ambientRotY = Math.cos(t * 0.7) * (0.02 * fade);
      }

      const effTargetRotY = targetRotY + ambientRotY;
      const effTargetRotX = targetRotX + ambientRotX;
      const effTargetRotZ = targetRotZ;
      const effTargetPosX = targetPosX;
      const effTargetPosY = targetPosY;

      const dRotY = effTargetRotY - currentRotY;
      const dRotX = effTargetRotX - currentRotX;
      const dRotZ = effTargetRotZ - currentRotZ;
      const dPosX = effTargetPosX - currentPosX;
      const dPosY = effTargetPosY - currentPosY;

      // Convergence / sleep threshold check: stops GPU rendering once at rest
      const isSettled =
        Math.abs(dRotY) < 0.0015 &&
        Math.abs(dRotX) < 0.0015 &&
        Math.abs(dRotZ) < 0.0015 &&
        Math.abs(dPosX) < 0.15 &&
        Math.abs(dPosY) < 0.15;

      if (isSettled) {
        currentRotY = effTargetRotY;
        currentRotX = effTargetRotX;
        currentRotZ = effTargetRotZ;
        currentPosX = effTargetPosX;
        currentPosY = effTargetPosY;

        phoneHand.rotation.y = currentRotY;
        phoneHand.rotation.x = currentRotX;
        phoneHand.rotation.z = currentRotZ;
        phoneHand.position.x = currentPosX;
        phoneHand.position.y = currentPosY;

        if (typeof splineApp.requestRender === 'function') {
          splineApp.requestRender();
        }

        // GO TO SLEEP: completely stop Spline WebGL render loop and RAF at rest (true 0% GPU)
        if (typeof splineApp.stop === 'function') {
          try { splineApp.stop(); } catch (e) {}
        }
        motionRafId = null;
        return;
      }

      currentRotY += dRotY * 0.10;
      currentRotX += dRotX * 0.10;
      currentRotZ += dRotZ * 0.10;
      currentPosX += dPosX * 0.10;
      currentPosY += dPosY * 0.10;

      phoneHand.rotation.y = currentRotY;
      phoneHand.rotation.x = currentRotX;
      phoneHand.rotation.z = currentRotZ;
      phoneHand.position.x = currentPosX;
      phoneHand.position.y = currentPosY;

      if (typeof splineApp.requestRender === 'function') {
        splineApp.requestRender();
      }

      motionRafId = requestAnimationFrame(animateMotion);
    }

    animateMotion();

    if ('IntersectionObserver' in window && container) {
      const heroObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          isHeroVisible = entry.isIntersecting;
          if (isHeroVisible) {
            if (!isWindowScrolling && !window.__isPageScrolling) {
              if (typeof splineApp.requestRender === 'function') {
                splineApp.requestRender();
              }
            }
          } else {
            if (motionRafId) {
              cancelAnimationFrame(motionRafId);
              motionRafId = null;
            }
            if (typeof splineApp.stop === 'function') {
              try { splineApp.stop(); } catch (e) {}
            }
            if (motionRafId) {
              cancelAnimationFrame(motionRafId);
              motionRafId = null;
            }
          }
        });
      }, { threshold: 0 });
      heroObserver.observe(container);
    }
    window.__allyrichHeroState = {
      get isMotionSleeping() { return motionRafId === null; },
      get isVisible() { return isHeroVisible; },
      get lastInteractionTime() { return lastInteractionTime; },
      wake() { wakeMotionLoop(); }
    };

    console.log('[AllyRich 3D] Motion interaction (Laptop mouse + Phone gyroscope) initialized successfully.');
  }

  async function startSpline() {
    try {
      const splineApp = new Application(canvas, { renderer: 'webgl' });
      splineApp.renderMode = 'manual';
      window.__splineApp = splineApp;

      // Cap pixel ratio across all devices to prevent choking high-DPI GPUs
      splineApp._getPixelRatio = function() {
        const isMobile = window.innerWidth < 900 || ('ontouchstart' in window) || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        const maxDpr = isMobile ? 1.0 : (window.chrome ? 1.0 : 1.25);
        return Math.min(window.devicePixelRatio || 1, maxDpr);
      };

      try {
        await splineApp.load('/assets/spline/scene.splinecode');
      } catch (e) {
        await splineApp.load('https://prod.spline.design/VVdTRfsKk3fopW3m/scene.splinecode');
      }

      if (loaderBadge) {
        loaderBadge.style.opacity = '0';
        setTimeout(() => loaderBadge.remove(), 400);
      }

      console.log('[AllyRich 3D] Spline scene loaded successfully!');
      // Clamp WebGL renderer pixelRatio across ALL devices (laptops, desktops, phones) to avoid high-res GPU overloads
      const heroMaxDpr = window.chrome ? 1.0 : 1.25;
      if (splineApp._renderer && typeof splineApp._renderer.setPixelRatio === 'function') {
        splineApp._renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        if (heroMaxDpr < 1.5) splineApp._renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, heroMaxDpr));
      }
      updateAll(splineApp);

      // Initialize Laptop Mouse & Phone Gyroscope 3D Hand Motion Tracking
      setupMotionInteraction(splineApp);

      setTimeout(() => updateAll(splineApp), 200);
      setTimeout(() => updateAll(splineApp), 600);
      setTimeout(() => updateAll(splineApp), 1400);
      setTimeout(() => updateAll(splineApp), 3000);

      // Keep canvas resolution synced to viewport for crisp Retina rendering without GPU overloads
      if ('ResizeObserver' in window && container) {
        const resizeObs = new ResizeObserver(() => {
          if (splineApp?._renderer && typeof splineApp._renderer.setPixelRatio === 'function') {
            splineApp._renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
            if (heroMaxDpr < 1.5) splineApp._renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, heroMaxDpr));
          }
          if (splineApp && typeof splineApp.requestRender === 'function') {
            splineApp.requestRender();
          }
        });
        resizeObs.observe(container);
      }
    } catch (err) {
      console.error('[AllyRich 3D] Spline load error:', err);
    }
  }

  // Eagerly preload AR logo
  getARCanvas();

  // Start Spline immediately
  startSpline();
})();
