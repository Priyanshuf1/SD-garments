const fs = require('fs');
let css = fs.readFileSync('assets/css/custom.css', 'utf8');

const target = `.product-card__figure {
    position: relative !important;
    width: 100% !important;
    background: transparent !important;
    overflow: hidden !important;
    margin: 0 0 0.5rem 0 !important;
  }`;

const replacement = `.product-card__figure {
    position: relative !important;
    width: 100% !important;
    aspect-ratio: 3 / 4 !important;
    max-height: 480px !important;
    background: transparent !important;
    overflow: hidden !important;
    margin: 0 0 0.5rem 0 !important;
  }

  .product-card__media {
    display: block !important;
    width: 100% !important;
    height: 100% !important;
    position: relative !important;
    overflow: hidden !important;
  }

  .product-card__image,
  .product-card__image--primary,
  .product-card__image--secondary {
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    height: 100% !important;
    object-fit: cover !important;
    object-position: center top !important;
    display: block !important;
  }`;

// Handle both CRLF and LF
if (css.includes(target.replace(/\n/g, '\r\n'))) {
  css = css.replace(target.replace(/\n/g, '\r\n'), replacement.replace(/\n/g, '\r\n'));
} else {
  css = css.replace(target, replacement);
}

fs.writeFileSync('assets/css/custom.css', css, 'utf8');
console.log('custom.css card aspect-ratio patched successfully');
