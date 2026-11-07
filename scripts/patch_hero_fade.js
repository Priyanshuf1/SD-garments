const fs = require('fs');
let hero = fs.readFileSync('assets/js/allyrich-3d-hero.js', 'utf8');

const target = `      if (loaderBadge) {
        loaderBadge.style.opacity = '0';
        setTimeout(() => loaderBadge.remove(), 400);
      }`.replace(/\n/g, '\r\n');

const repl = `      if (loaderBadge) {
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
      }`.replace(/\n/g, '\r\n');

if (!hero.includes(target)) {
  console.error('Target not found in hero.js!');
  process.exit(1);
}

hero = hero.replace(target, repl);
fs.writeFileSync('assets/js/allyrich-3d-hero.js', hero, 'utf8');
console.log('hero.js updated successfully!');
