const fs = require('fs');

// 1. Update assets/js/allyrich-3d-hero.js
let hero = fs.readFileSync('assets/js/allyrich-3d-hero.js', 'utf8');
hero = hero.replace('/assets/spline/runtime.js?v=60fps', '/assets/spline/runtime.js?v=gold-screen-v6');
fs.writeFileSync('assets/js/allyrich-3d-hero.js', hero, 'utf8');

// 2. Update index.html
let index = fs.readFileSync('index.html', 'utf8');
index = index.replace('allyrich-3d-hero.js?v=20261106-screen-v4', 'allyrich-3d-hero.js?v=gold-screen-v6');
index = index.replace('allyrich-3d-hero.js?v=lux-v3', 'allyrich-3d-hero.js?v=gold-screen-v6');
fs.writeFileSync('index.html', index, 'utf8');

console.log('Cache busters updated successfully in hero and index.html');
