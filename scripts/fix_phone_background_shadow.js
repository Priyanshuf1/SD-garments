const fs = require('fs');

// 1. Edit index.html
let index = fs.readFileSync('index.html', 'utf8');

// Replace background-image on .allyrich-hero-page
index = index.replace(
  /background-image:\s*url\('\/assets\/spline-phone-poster\.webp'\),\s*url\('\/assets\/allyrich-hero-bg\.png\?v=4'\);[\r\n\s]*background-size:\s*contain,\s*cover;/g,
  "background-image: url('/assets/allyrich-hero-bg.png?v=4');\r\n      background-size: cover;"
);

// Add dedicated temporary poster overlay inside allyrich-3d-hero-container
index = index.replace(
  '<div id="allyrich-3d-hero-container" class="allyrich-hero-page">\r\n    <canvas id="allyrich-spline-canvas"></canvas>',
  '<div id="allyrich-3d-hero-container" class="allyrich-hero-page">\r\n    <div id="spline-phone-poster" style="position:absolute; inset:0; background: url(\'/assets/spline-phone-poster.webp\') center center / contain no-repeat; pointer-events:none; transition: opacity 0.4s ease; z-index: 1;"></div>\r\n    <canvas id="allyrich-spline-canvas" style="z-index: 2;"></canvas>'
);

// Bump version cache-buster in index.html
index = index.replace(/allyrich-3d-hero\.js\?v=[^"']+/g, 'allyrich-3d-hero.js?v=clean-bg-v7');

fs.writeFileSync('index.html', index, 'utf8');
console.log('index.html updated successfully!');

// 2. Edit assets/js/allyrich-3d-hero.js
let hero = fs.readFileSync('assets/js/allyrich-3d-hero.js', 'utf8');

hero = hero.replace(
  `      if (loaderBadge) {
        loaderBadge.style.opacity = '0';
        setTimeout(() => loaderBadge.remove(), 400);
      }`,
  `      if (loaderBadge) {
        loaderBadge.style.opacity = '0';
        setTimeout(() => loaderBadge.remove(), 400);
      }
      const poster = document.getElementById('spline-phone-poster');
      if (poster) {
        poster.style.opacity = '0';
        setTimeout(() => poster.remove(), 400);
      }
      if (container) {
        container.style.backgroundImage = "url('/assets/allyrich-hero-bg.png?v=4')";
      }`
);

fs.writeFileSync('assets/js/allyrich-3d-hero.js', hero, 'utf8');
console.log('assets/js/allyrich-3d-hero.js updated successfully!');
