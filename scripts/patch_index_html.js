const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// Replace the summary click handler
const oldHandler = `  // Follow mega menu summary links on click/tap (e.g. TOPS -> /collections/tops, BOTTOMS -> /collections/bottoms)
  document.addEventListener('click', (e) => {
    const summary = e.target.closest('summary[data-follow-link]');
    if (summary) {
      const link = summary.getAttribute('data-follow-link');
      if (link) {
        window.location.href = link;
      }
    }
  });`;

const newHandler = `  // Follow mega menu summary links on click/tap: First tap opens dropdown, second tap navigates
  document.addEventListener('click', (e) => {
    const summary = e.target.closest('summary[data-follow-link]');
    if (summary) {
      const details = summary.closest('details');
      const isAlreadyOpen = details && details.hasAttribute('open');
      const isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches || ('ontouchstart' in window);

      if (!isAlreadyOpen && isTouch) {
        // On phone/touch, first tap opens the mega dropdown so customers can see subcategories
        e.preventDefault();
        e.stopPropagation();
        document.querySelectorAll('details.header__menu-disclosure[open]').forEach(d => {
          if (d !== details) d.removeAttribute('open');
        });
        if (details) details.setAttribute('open', '');
        return;
      }

      const link = summary.getAttribute('data-follow-link');
      if (link && isAlreadyOpen) {
        window.location.href = link;
      }
    }
  });`;

html = html.replace(oldHandler, newHandler);

// Also replace any genrage image URLs in index.html promo links
html = html.replaceAll(
  'https://genrage.com/cdn/shop/files/Artboard_11_7.png?v=1789208189&amp;width=1500',
  '/images/photo_1.webp'
);
html = html.replaceAll(
  'https://genrage.com/cdn/shop/files/Artboard_11_7.png?v=1789208189&width=1500',
  '/images/photo_1.webp'
);

fs.writeFileSync('index.html', html, 'utf8');
console.log('index.html patched successfully');
