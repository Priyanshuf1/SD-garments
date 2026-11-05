const fs = require('fs');

// 1. Update index.html
let indexHtml = fs.readFileSync('index.html', 'utf8');

// Update .allyrich-hero-page background with instant poster
indexHtml = indexHtml.replace(
  /\.allyrich-hero-page\s*\{[\s\S]*?will-change:\s*transform;\s*\}/,
  `.allyrich-hero-page {
      position: relative;
      width: 100%;
      height: 100%;
      background-color: #c4c4c4;
      background-image: url('/assets/spline-phone-poster.webp'), url('/assets/allyrich-hero-bg.png?v=4');
      background-size: contain, cover;
      background-position: center center;
      background-repeat: no-repeat;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      touch-action: pan-y;
      transform: translateZ(0);
      will-change: transform;
    }`
);

// Canvas transition and loader hide
indexHtml = indexHtml.replace(
  /#allyrich-spline-canvas\s*\{[\s\S]*?outline:\s*none;\s*\}/,
  `#allyrich-spline-canvas {
      position: absolute;
      inset: 0;
      width: 100% !important;
      height: 100% !important;
      display: block;
      outline: none;
      opacity: 0;
      transition: opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1);
    }
    #allyrich-spline-canvas.is-ready {
      opacity: 1 !important;
    }
    .spline-loading-pulse {
      display: none !important;
    }`
);

fs.writeFileSync('index.html', indexHtml, 'utf8');
console.log('index.html 3D hero poster & transitions updated');

// 2. Update assets/js/allyrich-3d-hero.js
let heroJs = fs.readFileSync('assets/js/allyrich-3d-hero.js', 'utf8');

// Hardware & Adaptive DPR logic
heroJs = heroJs.replace(
  /splineApp\._getPixelRatio\s*=\s*function\(\)\s*\{[\s\S]*?return Math\.min\(window\.devicePixelRatio \|\| 1, maxDpr\);\s*\};/,
  `splineApp._getPixelRatio = function() {
        const isLowEnd = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) ||
                         (navigator.deviceMemory && navigator.deviceMemory <= 4) ||
                         /Android.*Chrome\\/[.0-9]*\\s+(Mobile)?/i.test(navigator.userAgent);
        const isMobile = window.innerWidth < 900 || ('ontouchstart' in window) || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        const maxDpr = isLowEnd ? 0.75 : (isMobile ? 1.0 : (window.chrome ? 1.0 : 1.25));
        return Math.min(window.devicePixelRatio || 1, maxDpr);
      };`
);

// Canvas fade-in when ready
heroJs = heroJs.replace(
  /console\.log\('\[AllyRich 3D\] Spline scene loaded successfully!'\);/,
  `console.log('[AllyRich 3D] Spline scene loaded successfully!');
      canvas.classList.add('is-ready');
      canvas.style.opacity = '1';`
);

// Gyro deadband threshold
heroJs = heroJs.replace(
  /if \(Math\.abs\(deltaGamma - smoothGamma\) < 0\.22 && Math\.abs\(deltaBeta - smoothBeta\) < 0\.22/,
  `if (Math.abs(deltaGamma - smoothGamma) < 0.35 && Math.abs(deltaBeta - smoothBeta) < 0.35`
);

// Ambient breathing time reduction (4000 -> 1200) for instant sleep
heroJs = heroJs.replace(
  /if \(t - lastInteractionTime < 4000\)\s*\{\s*const fade = Math\.max\(0, 1 - \(t - lastInteractionTime\) \/ 4000\);/g,
  `if (t - lastInteractionTime < 1200) {\n        const fade = Math.max(0, 1 - (t - lastInteractionTime) / 1200);`
);

fs.writeFileSync('assets/js/allyrich-3d-hero.js', heroJs, 'utf8');
console.log('allyrich-3d-hero.js adaptive DPR and sleep performance updated');
