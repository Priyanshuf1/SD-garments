/**
 * AllyRich 3D Interactive Phone Screen Hero Section
 * Ported directly from https://github.com/RitikPal26/allyrich-loader
 */

import { Application } from '/assets/spline/runtime.js';

(function initAllyrich3DHero() {
  const canvas = document.getElementById('allyrich-spline-canvas');
  if (!canvas) return;

  const container = document.getElementById('allyrich-3d-hero-container');
  const loaderBadge = document.getElementById('spline-loader-indicator');

  let canvasPromise = null;

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
        console.error('[AllyRich 3D] Failed to load /assets/ar-logo.jpg', e);
        resolve(offCanvas);
      };
      img.src = '/assets/ar-logo.jpg';
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

    // Pause all video elements in document
    document.querySelectorAll('video').forEach((v) => {
      try {
        v.pause();
        v.currentTime = 0;
      } catch (e) {}
    });

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

    const baseRotX = phoneHand.rotation ? phoneHand.rotation.x : 0.454;
    const baseRotY = phoneHand.rotation ? phoneHand.rotation.y : 0;
    const baseRotZ = phoneHand.rotation ? phoneHand.rotation.z : 0;
    const basePosX = phoneHand.position ? phoneHand.position.x : -127.8;
    const basePosY = phoneHand.position ? phoneHand.position.y : -549.2;

    let targetRotX = baseRotX;
    let targetRotY = baseRotY;
    let targetRotZ = baseRotZ;
    let targetPosX = basePosX;
    let targetPosY = basePosY;

    let currentRotX = baseRotX;
    let currentRotY = baseRotY;
    let currentRotZ = baseRotZ;
    let currentPosX = basePosX;
    let currentPosY = basePosY;

    let lastInteractionType = 'none'; // 'gyro' or 'mouse'
    let lastGyroTime = 0;

    // 1. Phone Gyroscope (DeviceOrientation) Handler
    function handleDeviceOrientation(e) {
      if (!e || (typeof e.gamma !== 'number' && typeof e.beta !== 'number')) return;
      lastInteractionType = 'gyro';
      lastGyroTime = performance.now();

      const gamma = typeof e.gamma === 'number' ? e.gamma : 0;
      const beta = typeof e.beta === 'number' ? e.beta : 45;

      // Neutral portrait holding posture: gamma = 0 deg (lateral tilt), beta = 45 deg (handheld viewing angle)
      // Max tilt angle sensitivity (degrees)
      const maxTilt = 25;
      const normX = Math.max(-1, Math.min(1, gamma / maxTilt));
      const normY = Math.max(-1, Math.min(1, (beta - 45) / maxTilt));

      // Map to 3D rotation and subtle parallax translation
      targetRotY = baseRotY + normX * 0.48;
      targetRotX = baseRotX + normY * 0.36;
      targetRotZ = baseRotZ - normX * 0.12;
      targetPosX = basePosX + normX * 36;
      targetPosY = basePosY - normY * 20;
    }

    // Always register deviceorientation directly
    window.addEventListener('deviceorientation', handleDeviceOrientation, true);

    // iOS 13+ requires user gesture permission
    if (
      typeof window.DeviceOrientationEvent !== 'undefined' &&
      typeof window.DeviceOrientationEvent.requestPermission === 'function'
    ) {
      const requestGyroPermission = () => {
        try {
          window.DeviceOrientationEvent.requestPermission()
            .then((state) => {
              if (state === 'granted') {
                window.addEventListener('deviceorientation', handleDeviceOrientation, true);
                console.log('[AllyRich 3D] iOS DeviceOrientation permission granted.');
              }
            })
            .catch((err) => console.debug('[AllyRich 3D] Gyro permission request:', err));
        } catch (e) {}
      };
      window.addEventListener('touchstart', requestGyroPermission, { passive: true, once: true });
      window.addEventListener('click', requestGyroPermission, { passive: true, once: true });
    }

    // 2. Laptop / Desktop Mouse Tracker (throttled to requestAnimationFrame)
    let pendingMouseX = null;
    let pendingMouseY = null;
    let mouseRafPending = false;

    function handleMouseMove(e) {
      // If active gyro events are firing on mobile, ignore mouse moves
      if (lastInteractionType === 'gyro' && performance.now() - lastGyroTime < 1000) {
        if (e.pointerType === 'touch' || 'ontouchstart' in window) return;
      }
      lastInteractionType = 'mouse';
      pendingMouseX = e.clientX;
      pendingMouseY = e.clientY;

      if (!mouseRafPending) {
        mouseRafPending = true;
        requestAnimationFrame(() => {
          mouseRafPending = false;
          if (pendingMouseX === null || pendingMouseY === null) return;
          const rect = container
            ? container.getBoundingClientRect()
            : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;

          const normX = Math.max(-1, Math.min(1, (pendingMouseX - centerX) / (window.innerWidth * 0.5)));
          const normY = Math.max(-1, Math.min(1, (pendingMouseY - centerY) / (window.innerHeight * 0.5)));

          targetRotY = baseRotY + normX * 0.46;
          targetRotX = baseRotX + normY * 0.34;
          targetRotZ = baseRotZ - normX * 0.14;
          targetPosX = basePosX + normX * 36;
          targetPosY = basePosY - normY * 22;
        });
      }
    }

    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    // 3. Touch Drag fallback for mobile when gyro is unavailable
    let touchStartX = 0;
    let touchStartY = 0;
    function handleTouchStart(e) {
      if (e.touches && e.touches.length > 0) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      }
    }
    function handleTouchMove(e) {
      if (lastInteractionType === 'gyro') return;
      if (e.touches && e.touches.length > 0) {
        const dx = e.touches[0].clientX - touchStartX;
        const dy = e.touches[0].clientY - touchStartY;
        const normX = Math.max(-1, Math.min(1, dx / 150));
        const normY = Math.max(-1, Math.min(1, dy / 150));

        targetRotY = baseRotY + normX * 0.46;
        targetRotX = baseRotX + normY * 0.34;
        targetRotZ = baseRotZ - normX * 0.14;
        targetPosX = basePosX + normX * 36;
        targetPosY = basePosY - normY * 22;
      }
    }
    if (canvas) {
      canvas.addEventListener('touchstart', handleTouchStart, { passive: true });
      canvas.addEventListener('touchmove', handleTouchMove, { passive: true });
    }

    // 4. Smooth Animation Loop with Viewport Visibility Observer (Zero CPU/GPU when scrolled off-screen)
    let isHeroVisible = true;
    let motionRafId = null;

    function animateMotion() {
      if (!isHeroVisible) {
        motionRafId = null;
        return;
      }
      motionRafId = requestAnimationFrame(animateMotion);

      currentRotY += (targetRotY - currentRotY) * 0.10;
      currentRotX += (targetRotX - currentRotX) * 0.10;
      currentRotZ += (targetRotZ - currentRotZ) * 0.10;
      currentPosX += (targetPosX - currentPosX) * 0.10;
      currentPosY += (targetPosY - currentPosY) * 0.10;

      phoneHand.rotation.y = currentRotY;
      phoneHand.rotation.x = currentRotX;
      phoneHand.rotation.z = currentRotZ;
      phoneHand.position.x = currentPosX;
      phoneHand.position.y = currentPosY;

      if (typeof splineApp.requestRender === 'function') {
        splineApp.requestRender();
      }
    }

    animateMotion();

    if ('IntersectionObserver' in window && container) {
      const heroObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          isHeroVisible = entry.isIntersecting;
          if (isHeroVisible) {
            if (typeof splineApp.play === 'function') {
              try { splineApp.play(); } catch (e) {}
            }
            if (!motionRafId) {
              motionRafId = requestAnimationFrame(animateMotion);
            }
          } else {
            if (typeof splineApp.stop === 'function') {
              try { splineApp.stop(); } catch (e) {}
            }
            if (motionRafId) {
              cancelAnimationFrame(motionRafId);
              motionRafId = null;
            }
          }
        });
      }, { threshold: 0.05 });
      heroObserver.observe(container);
    }
    console.log('[AllyRich 3D] Motion interaction (Laptop mouse + Phone gyroscope) initialized successfully.');
  }

  async function startSpline() {
    try {
      const splineApp = new Application(canvas, { renderer: 'webgl' });
      window.__splineApp = splineApp;
      await splineApp.load('https://prod.spline.design/VVdTRfsKk3fopW3m/scene.splinecode');

      if (loaderBadge) {
        loaderBadge.style.opacity = '0';
        setTimeout(() => loaderBadge.remove(), 400);
      }

      console.log('[AllyRich 3D] Spline scene loaded successfully!');
      // Clamp WebGL renderer pixelRatio across ALL devices (laptops, desktops, phones) to avoid high-res GPU overloads
      if (splineApp._renderer && typeof splineApp._renderer.setPixelRatio === 'function') {
        splineApp._renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
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
