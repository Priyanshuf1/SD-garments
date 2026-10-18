const fs = require('fs');
const path = require('path');

const baseDir = __dirname;

const allyRichFooter = `<!-- BEGIN sections: footer-group -->
<footer id="shopify-section-sections--footer" class="shopify-section shopify-section-group-footer-group site-footer-wrapper">
  <div class="site-footer full-width">
    <div class="site-footer__bg" aria-hidden="true">
      <img src="/assets/footer-ruins.webp" alt="" loading="lazy">
      <div class="site-footer__bg-gradient"></div>
    </div>

    <div class="site-footer__content">
      <div class="site-footer__band">
        <a class="site-footer__logo" href="/" aria-label="AllyRich">
          <img src="/assets/ar-logo.png" alt="AR" width="100" height="126">
          <span class="site-footer__brand-name">AllyRich</span>
        </a>
      </div>

      <div class="site-footer__columns">
        <div class="site-footer__column site-footer__column--shop">
          <p class="site-footer__heading site-footer__heading--shop">Shop</p>
          <a href="/collections/shop">All Products</a>
          <a href="/collections/baggy-pants">Baggy Pants</a>
          <a href="/collections/boxy-oversized-tshirt">Boxy Tees</a>
          <a href="/collections/hoodies-for-men">Hoodies</a>
        </div>

        <div class="site-footer__column">
          <p class="site-footer__heading">Brand</p>
          <a href="/account">My Account</a>
          <a href="/pages/contact.html">Track Order</a>
          <a href="/collections/clearance-sale">Clearance</a>
        </div>
      </div>

      <div class="site-footer__social">
        <!-- Instagram -->
        <a class="site-footer__social-instagram" href="https://www.instagram.com/gen.rage" aria-label="Instagram" target="_blank" rel="noopener me">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g id="Social-Icons" clip-path="url(#clip-icon-social-instagram)">
              <path d="M12 2.16094C15.2063 2.16094 15.5859 2.175 16.8469 2.23125C18.0188 2.28281 18.6516 2.47969 19.0734 2.64375C19.6313 2.85938 20.0344 3.12188 20.4516 3.53906C20.8734 3.96094 21.1313 4.35938 21.3469 4.91719C21.5109 5.33906 21.7078 5.97656 21.7594 7.14375C21.8156 8.40937 21.8297 8.78906 21.8297 11.9906C21.8297 15.1969 21.8156 15.5766 21.7594 16.8375C21.7078 18.0094 21.5109 18.6422 21.3469 19.0641C21.1313 19.6219 20.8687 20.025 20.4516 20.4422C20.0297 20.8641 19.6313 21.1219 19.0734 21.3375C18.6516 21.5016 18.0141 21.6984 16.8469 21.75C15.5813 21.8062 15.2016 21.8203 12 21.8203C8.79375 21.8203 8.41406 21.8062 7.15313 21.75C5.98125 21.6984 5.34844 21.5016 4.92656 21.3375C4.36875 21.1219 3.96563 20.8594 3.54844 20.4422C3.12656 20.0203 2.86875 19.6219 2.65313 19.0641C2.48906 18.6422 2.29219 18.0047 2.24063 16.8375C2.18438 15.5719 2.17031 15.1922 2.17031 11.9906C2.17031 8.78438 2.18438 8.40469 2.24063 7.14375C2.29219 5.97187 2.48906 5.33906 2.65313 4.91719C2.86875 4.35938 3.13125 3.95625 3.54844 3.53906C3.97031 3.11719 4.36875 2.85938 4.92656 2.64375C5.34844 2.47969 5.98594 2.28281 7.15313 2.23125C8.41406 2.175 8.79375 2.16094 12 2.16094ZM12 0C8.74219 0 8.33438 0.0140625 7.05469 0.0703125C5.77969 0.126563 4.90313 0.332812 4.14375 0.628125C3.35156 0.9375 2.68125 1.34531 2.01563 2.01562C1.34531 2.68125 0.9375 3.35156 0.628125 4.13906C0.332812 4.90313 0.126563 5.775 0.0703125 7.05C0.0140625 8.33437 0 8.74219 0 12C0 15.2578 0.0140625 15.6656 0.0703125 16.9453C0.126563 18.2203 0.332812 19.0969 0.628125 19.8563C0.9375 20.6484 1.34531 21.3188 2.01563 21.9844C2.68125 22.65 3.35156 23.0625 4.13906 23.3672C4.90313 23.6625 5.775 23.8687 7.05 23.925C8.32969 23.9812 8.7375 23.9953 11.9953 23.9953C15.2531 23.9953 15.6609 23.9812 16.9406 23.925C18.2156 23.8687 19.0922 23.6625 19.8516 23.3672C20.6391 23.0625 21.3094 22.65 21.975 21.9844C22.6406 21.3188 23.0531 20.6484 23.3578 19.8609C23.6531 19.0969 23.8594 18.225 23.9156 16.95C23.9719 15.6703 23.9859 15.2625 23.9859 12.0047C23.9859 8.74688 23.9719 8.33906 23.9156 7.05938C23.8594 5.78438 23.6531 4.90781 23.3578 4.14844C23.0625 3.35156 22.6547 2.68125 21.9844 2.01562C21.3188 1.35 20.6484 0.9375 19.8609 0.632812C19.0969 0.3375 18.225 0.13125 16.95 0.075C15.6656 0.0140625 15.2578 0 12 0Z" fill="currentColor"/>
              <path d="M12 5.83594C8.59688 5.83594 5.83594 8.59688 5.83594 12C5.83594 15.4031 8.59688 18.1641 12 18.1641C15.4031 18.1641 18.1641 15.4031 18.1641 12C18.1641 8.59688 15.4031 5.83594 12 5.83594ZM12 15.9984C9.79219 15.9984 8.00156 14.2078 8.00156 12C8.00156 9.79219 9.79219 8.00156 12 8.00156C14.2078 8.00156 15.9984 9.79219 15.9984 12C15.9984 14.2078 14.2078 15.9984 12 15.9984Z" fill="currentColor"/>
              <path d="M19.8469 5.59214C19.8469 6.38902 19.2 7.03121 18.4078 7.03121C17.6109 7.03121 16.9688 6.38433 16.9688 5.59214C16.9688 4.79526 17.6156 4.15308 18.4078 4.15308C19.2 4.15308 19.8469 4.79995 19.8469 5.59214Z" fill="currentColor"/>
            </g>
            <defs>
              <clipPath id="clip-icon-social-instagram">
                <rect width="24" height="24" fill="white"/>
              </clipPath>
            </defs>
          </svg>
        </a>

        <!-- TikTok -->
        <a href="https://www.tiktok.com/@forumcases" aria-label="TikTok" target="_blank" rel="noopener me">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12.525 0.02C13.835 0 15.135 0.01 16.435 0C16.515 1.53 17.065 3.09 18.185 4.17C19.305 5.28 20.885 5.79 22.425 5.96V9.99C20.985 9.94 19.535 9.64 18.225 9.02C17.655 8.76 17.125 8.43 16.605 8.09C16.595 11.01 16.615 13.93 16.585 16.84C16.505 18.24 16.045 19.63 15.235 20.78C13.925 22.7 11.655 23.95 9.325 23.99C7.895 24.07 6.465 23.68 5.245 22.96C3.225 21.77 1.805 19.59 1.595 17.25C1.575 16.75 1.565 16.25 1.585 15.76C1.765 13.86 2.705 12.04 4.165 10.8C5.825 9.36 8.145 8.67 10.315 9.08C10.335 10.56 10.275 12.04 10.275 13.52C9.285 13.2 8.125 13.29 7.255 13.89C6.625 14.3 6.145 14.93 5.895 15.64C5.685 16.15 5.745 16.71 5.755 17.25C5.995 18.89 7.575 20.27 9.255 20.12C10.375 20.11 11.445 19.46 12.025 18.51C12.215 18.18 12.425 17.84 12.435 17.45C12.535 15.66 12.495 13.88 12.505 12.09C12.515 8.06 12.495 4.04 12.525 0.02Z" fill="currentColor"/>
          </svg>
        </a>

        <!-- YouTube -->
        <a href="https://www.youtube.com/@forumcases" aria-label="YouTube" target="_blank" rel="noopener me">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M23.4761 6.22362C23.3381 5.71459 23.0692 5.25055 22.6963 4.87761C22.3233 4.50467 21.8593 4.23581 21.3503 4.09774C19.4865 3.58887 11.985 3.58887 11.985 3.58887C11.985 3.58887 4.48313 3.60387 2.619 4.11274C2.10997 4.25081 1.64594 4.51967 1.27299 4.89261C0.900053 5.26555 0.631192 5.72959 0.493125 6.23862C0 8.10274 0 12.0001 0 12.0001C0 12.0001 0 15.8975 0.5085 17.7766C0.646567 18.2856 0.915428 18.7497 1.28837 19.1226C1.66131 19.4956 2.12535 19.7644 2.63438 19.9025C4.49813 20.4114 12 20.4114 12 20.4114C12 20.4114 19.5019 20.4114 21.366 19.9029C21.875 19.7648 22.3391 19.4959 22.712 19.123C23.0849 18.7501 23.3538 18.286 23.4919 17.777C24 15.9129 24 12.0001 24 12.0001C24 12.0001 23.985 8.10274 23.4761 6.22362Z" fill="currentColor"/>
            <path d="M9.59699 15.6045L15.8201 12L9.59662 8.39551L9.59699 15.6045Z" fill="#111112"/>
          </svg>
        </a>

        <!-- X -->
        <a href="https://x.com/forumcases" aria-label="X" target="_blank" rel="noopener me">
          <svg width="23" height="24" viewBox="0 0 23 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g id="logo-1" clip-path="url(#clip-icon-social-x)">
              <path d="M13.6881 10.1571L22.2504 0H20.2214L12.7868 8.81931L6.84879 0H0L8.97943 13.3364L0 23.9877H2.0291L9.88025 14.6742L16.1512 23.9877H23L13.6876 10.1571H13.6881ZM10.909 13.4538L9.99919 12.1258L2.76021 1.55881H5.87679L11.7187 10.0867L12.6285 11.4147L20.2224 22.4998H17.1058L10.909 13.4544V13.4538Z" fill="currentColor"/>
            </g>
            <defs>
              <clipPath id="clip-icon-social-x">
                <rect width="23" height="24" fill="currentColor"/>
              </clipPath>
            </defs>
          </svg>
        </a>
      </div>

      <p class="site-footer__copyright">&copy; 2026 AllyRich - All rights reserved</p>

      <div class="site-footer__legal">
        <a href="/policies/terms-of-service" target="_blank" rel="noopener">Terms &amp; Conditions</a>
        <a href="/policies/privacy-policy" target="_blank" rel="noopener">Privacy Policy</a>
        <a href="/policies/refund-policy" target="_blank" rel="noopener">Refund Policy</a>
        <a href="/policies/shipping-policy" target="_blank" rel="noopener">Shipping Policy</a>
      </div>
    </div>
  </div>
</footer>
`;

// 1. Update index.html
const indexPath = path.join(baseDir, 'index.html');
let indexHtml = fs.readFileSync(indexPath, 'utf8');

const startMarker = '<!-- BEGIN sections: footer-group -->';
const endMarker = '<!-- END sections: footer-group -->';

const startIdx = indexHtml.indexOf(startMarker);
const endIdx = indexHtml.indexOf(endMarker);

if (startIdx !== -1 && endIdx !== -1) {
  indexHtml = indexHtml.slice(0, startIdx) + allyRichFooter + indexHtml.slice(endIdx);
  if (!indexHtml.includes('/assets/js/allyrich-loader.js')) {
    indexHtml = indexHtml.replace('</body>', '<script src="/assets/js/allyrich-loader.js"></script>\n</body>');
  }
  fs.writeFileSync(indexPath, indexHtml, 'utf8');
  console.log('Updated index.html successfully!');
} else {
  console.warn('Could not find footer-group markers in index.html');
}

// 2. Update collections.html
const colPath = path.join(baseDir, 'collections.html');
let colHtml = fs.readFileSync(colPath, 'utf8');

if (!colHtml.includes('allyrich.css')) {
  colHtml = colHtml.replace('</head>', `  <!-- AllyRich Fonts & Styles -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400&family=Barlow:ital,wght@0,200;0,300;0,400;0,500;0,600;0,700;1,300&family=Shippori+Mincho+B1:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/assets/css/allyrich.css">
</head>`);
}

if (!colHtml.includes('id="ForumLoader"')) {
  colHtml = colHtml.replace('<body', `<div class="loader" id="ForumLoader" aria-hidden="true">
    <div class="loader__stack">
      <div class="loader__brand">
        <span class="loader__mark">
          <img src="/assets/ar-logo.png" alt="AR" width="124" height="157">
        </span>
        <span class="loader__name">AllyRich</span>
      </div>
      <span class="loader__track">
        <span class="loader__progress"></span>
      </span>
    </div>
  </div>
  <noscript>
    <style>.loader { display: none; }</style>
  </noscript>
  <body`);
}

// Replace footer in collections.html
const colFooterStart = colHtml.indexOf('<!-- 8. SITE FOOTER');
const colFooterEnd = colHtml.indexOf('<!-- Scripts -->', colFooterStart);
if (colFooterStart !== -1 && colFooterEnd !== -1) {
  colHtml = colHtml.slice(0, colFooterStart) + allyRichFooter + '\n  ' + colHtml.slice(colFooterEnd);
} else {
  // Fallback to replacing <footer ...> ... </footer>
  const fStart = colHtml.indexOf('<footer style="background:#000000');
  const fEnd = colHtml.indexOf('</footer>', fStart);
  if (fStart !== -1 && fEnd !== -1) {
    colHtml = colHtml.slice(0, fStart) + allyRichFooter + colHtml.slice(fEnd + 9);
  }
}

if (!colHtml.includes('/assets/js/allyrich-loader.js')) {
  colHtml = colHtml.replace('</body>', '<script src="/assets/js/allyrich-loader.js"></script>\n</body>');
}
fs.writeFileSync(colPath, colHtml, 'utf8');
console.log('Updated collections.html successfully!');

// 3. Update product.html
const prodPath = path.join(baseDir, 'product.html');
let prodHtml = fs.readFileSync(prodPath, 'utf8');

if (!prodHtml.includes('allyrich.css')) {
  prodHtml = prodHtml.replace('</head>', `  <!-- AllyRich Fonts & Styles -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400&family=Barlow:ital,wght@0,200;0,300;0,400;0,500;0,600;0,700;1,300&family=Shippori+Mincho+B1:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/assets/css/allyrich.css">
</head>`);
}

if (!prodHtml.includes('id="ForumLoader"')) {
  prodHtml = prodHtml.replace('<body>', `<body>
  <!-- AllyRich Preloader Animation -->
  <div class="loader" id="ForumLoader" aria-hidden="true">
    <div class="loader__stack">
      <div class="loader__brand">
        <span class="loader__mark">
          <img src="/assets/ar-logo.png" alt="AR" width="124" height="157">
        </span>
        <span class="loader__name">AllyRich</span>
      </div>
      <span class="loader__track">
        <span class="loader__progress"></span>
      </span>
    </div>
  </div>
  <noscript>
    <style>.loader { display: none; }</style>
  </noscript>`);
}

const prodFooterStart = prodHtml.indexOf('<!-- Footer -->');
const prodFooterEnd = prodHtml.indexOf('<!-- Drawer & Modals -->', prodFooterStart);
if (prodFooterStart !== -1 && prodFooterEnd !== -1) {
  prodHtml = prodHtml.slice(0, prodFooterStart) + allyRichFooter + '\n  ' + prodHtml.slice(prodFooterEnd);
} else {
  const fStart = prodHtml.indexOf('<footer class="site-footer">');
  const fEnd = prodHtml.indexOf('</footer>', fStart);
  if (fStart !== -1 && fEnd !== -1) {
    prodHtml = prodHtml.slice(0, fStart) + allyRichFooter + prodHtml.slice(fEnd + 9);
  }
}

if (!prodHtml.includes('/assets/js/allyrich-loader.js')) {
  prodHtml = prodHtml.replace('</body>', '<script src="/assets/js/allyrich-loader.js"></script>\n</body>');
}
fs.writeFileSync(prodPath, prodHtml, 'utf8');
console.log('Updated product.html successfully!');
