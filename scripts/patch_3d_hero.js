const fs = require('fs');
const path = require('path');

// 1. Patch assets/js/allyrich-3d-hero.js
const heroJsPath = path.join(__dirname, '..', 'assets', 'js', 'allyrich-3d-hero.js');
let heroJs = fs.readFileSync(heroJsPath, 'utf8');

const isHeroCRLF = heroJs.includes('\r\n');
heroJs = heroJs.replace(/\r\n/g, '\n');

// Replace material layers in applyARToScreen
const oldMatLayers = `    // 3. Port exact material layer handling from allyrich-loader
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
    }`;

const newMatLayers = `    const screenUrl = '/assets/spline-phone-screen.jpg?v=20261106';

    // 3. Port exact material layer handling from allyrich-loader
    if (mat.layers && Array.isArray(mat.layers)) {
      for (let i = 0; i < mat.layers.length; i++) {
        const layer = mat.layers[i];

        // Layer 1: Hide video ("Put your screen here" video)
        if (layer.type === 'video') {
          layer.visible = false;
          layer.alpha = 0;
          if (typeof layer.updateTexture === 'function') {
            try {
              layer.updateTexture(screenUrl);
            } catch (e) {}
          }
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

        // Layer 0: Texture layer (Base screen)
        if (layer.type === 'texture') {
          layer.visible = true;
          layer.alpha = 1;
          // Spline runtime requires layer.updateTexture to bind the texture sampler uniform
          if (typeof layer.updateTexture === 'function') {
            try {
              console.log('[AllyRich 3D] Updating layer 0 texture via updateTexture to phone screen image...');
              layer.updateTexture(screenUrl);
            } catch (e) {
              console.debug('[AllyRich 3D] updateTexture error:', e);
            }
          }
          if (layer.texture) {
            layer.texture.image = arCanvas;
            layer.texture.needsUpdate = true;
          }
        }
      }
    }`;

if (heroJs.includes(oldMatLayers)) {
  heroJs = heroJs.replace(oldMatLayers, newMatLayers);
  console.log('1. Updated applyARToScreen to use updateTexture with screenUrl');
} else {
  console.warn('1. Target oldMatLayers not found in allyrich-3d-hero.js');
}

// Replace scene.bin load with direct scene.splinecode load
const oldSplineLoad = `      try {
        await splineApp.load('/assets/spline/scene.bin');
      } catch (e) {
        console.warn('[AllyRich 3D] scene.bin load failed, trying scene.splinecode:', e);
        try {
          await splineApp.load('/assets/spline/scene.splinecode');
        } catch (e2) {
          console.warn('[AllyRich 3D] local splinecode failed, trying CDN:', e2);
          await splineApp.load('https://prod.spline.design/VVdTRfsKk3fopW3m/scene.splinecode');
        }
      }`;

const newSplineLoad = `      try {
        await splineApp.load('/assets/spline/scene.splinecode');
      } catch (e) {
        console.warn('[AllyRich 3D] local scene.splinecode load failed, trying CDN:', e);
        try {
          await splineApp.load('https://prod.spline.design/VVdTRfsKk3fopW3m/scene.splinecode');
        } catch (e2) {
          console.error('[AllyRich 3D] Spline load failed:', e2);
        }
      }`;

if (heroJs.includes(oldSplineLoad)) {
  heroJs = heroJs.replace(oldSplineLoad, newSplineLoad);
  console.log('2. Updated splineApp.load to directly load scene.splinecode');
} else {
  console.warn('2. Target oldSplineLoad not found in allyrich-3d-hero.js');
}

if (isHeroCRLF) {
  heroJs = heroJs.replace(/\n/g, '\r\n');
}
fs.writeFileSync(heroJsPath, heroJs, 'utf8');
console.log('assets/js/allyrich-3d-hero.js saved successfully!');

// 2. Patch index.html preloads and script tags
const indexHtmlPath = path.join(__dirname, '..', 'index.html');
let indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
const isIndexCRLF = indexHtml.includes('\r\n');
indexHtml = indexHtml.replace(/\r\n/g, '\n');

// Replace scene.bin preload
indexHtml = indexHtml.replace(
  '<link rel="preload" href="/assets/spline/scene.bin" as="fetch" crossorigin="anonymous">',
  '<link rel="preload" href="/assets/spline/scene.splinecode" as="fetch" crossorigin="anonymous">\n    <link rel="preload" href="/assets/spline-phone-screen.jpg?v=20261106" as="image">'
);

// Cache-bust allyrich-3d-hero.js
indexHtml = indexHtml.replace(
  '/assets/js/allyrich-3d-hero.js?v=lux-v3',
  '/assets/js/allyrich-3d-hero.js?v=20261106-screen-v4'
);

if (isIndexCRLF) {
  indexHtml = indexHtml.replace(/\n/g, '\r\n');
}
fs.writeFileSync(indexHtmlPath, indexHtml, 'utf8');
console.log('index.html 3D preloads & script tag updated successfully!');
