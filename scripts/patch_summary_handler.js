const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const newHandler = `// Follow mega menu summary links on click/tap: First tap opens dropdown, second tap navigates
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

const idx = html.indexOf("summary[data-follow-link]");
if (idx > -1) {
  const start = html.lastIndexOf("// Follow mega menu", idx);
  const end = html.indexOf("});", idx) + 3;
  html = html.substring(0, start) + newHandler + html.substring(end);
  fs.writeFileSync('index.html', html, 'utf8');
  console.log('Successfully replaced summary click handler in index.html');
}
