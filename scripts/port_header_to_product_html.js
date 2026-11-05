const fs = require('fs');

let prodHtml = fs.readFileSync('product.html', 'utf8');

// 1. Navigation CSS for dropdowns & accordions
const navStyles = `
    /* Mega Dropdowns & Mobile Accordion Navigation */
    .nav-item-dropdown {
      position: relative;
    }
    .nav-dropdown-menu {
      display: none;
      position: absolute;
      top: 100%;
      left: 0;
      background: #111111;
      border: 1px solid #222222;
      border-radius: 4px;
      padding: 0.5rem 0;
      min-width: 220px;
      z-index: 99999;
      box-shadow: 0 10px 30px rgba(0,0,0,0.8);
    }
    .nav-dropdown-menu::before {
      content: '';
      position: absolute;
      top: -20px;
      left: 0;
      right: 0;
      height: 20px;
      background: transparent;
    }
    .nav-item-dropdown:hover .nav-dropdown-menu,
    .nav-item-dropdown.is-open .nav-dropdown-menu {
      display: block !important;
    }
    .nav-item-dropdown:hover .nav-dropdown-menu.mega-dropdown,
    .nav-item-dropdown.is-open .nav-dropdown-menu.mega-dropdown {
      display: grid !important;
    }
    .nav-dropdown-link {
      display: block;
      padding: 8px 18px;
      color: #ffffff;
      text-decoration: none;
      font-size: 0.8rem;
      letter-spacing: 0.04em;
      transition: background 0.15s, color 0.15s;
    }
    .nav-dropdown-link:hover {
      background: #222222;
      color: #ffffff;
    }
    .nav-dropdown-menu.mega-dropdown {
      min-width: 580px;
      padding: 1.25rem 1.5rem;
      display: none;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.25rem;
    }
    .nav-dropdown-menu.mega-dropdown-2col {
      min-width: 420px;
      grid-template-columns: repeat(2, 1fr);
    }
    .nav-mega-col {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .nav-mega-col-title {
      font-size: 0.75rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      color: #ff8585;
      text-transform: uppercase;
      padding-bottom: 6px;
      border-bottom: 1px solid #222222;
      margin-bottom: 4px;
    }
    .nav-dropdown-menu.mega-dropdown .nav-dropdown-link {
      padding: 4px 0;
      font-size: 0.78rem;
      color: #cccccc;
    }
    .nav-dropdown-menu.mega-dropdown .nav-dropdown-link:hover {
      color: #ffffff;
      background: transparent;
      text-decoration: underline;
    }
    .nav-item-dropdown:nth-last-child(-n+3) .nav-dropdown-menu.mega-dropdown {
      left: auto;
      right: -20px;
    }

    /* Mobile Accordion Drawer Styles */
    .mobile-accordion {
      border-bottom: 1px solid #1a1a1a;
    }
    .mobile-accordion-header {
      padding: 1rem 1.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: #ffffff;
      font-weight: 800;
      font-size: 0.88rem;
      letter-spacing: 0.06em;
      cursor: pointer;
      user-select: none;
      background: transparent;
    }
    .mobile-accordion-arrow {
      transition: transform 0.25s ease;
    }
    .mobile-accordion.is-open .mobile-accordion-arrow {
      transform: rotate(180deg);
    }
    .mobile-accordion-body {
      display: none;
      flex-direction: column;
      gap: 8px;
      padding: 0 1.5rem 1.25rem 1.75rem;
      background: rgba(255,255,255,0.02);
    }
    .mobile-accordion.is-open .mobile-accordion-body {
      display: flex;
    }
    .mobile-subgroup-title {
      font-size: 0.72rem;
      font-weight: 800;
      color: #ff8585;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-top: 10px;
      margin-bottom: 2px;
    }
    .mobile-accordion-body a {
      color: #cccccc;
      text-decoration: none;
      font-size: 0.82rem;
      padding: 4px 0;
    }
    .mobile-accordion-body a:hover {
      color: #ffffff;
    }
`;

// Insert navStyles inside <style>
prodHtml = prodHtml.replace('</style>', navStyles + '\n  </style>');

// 2. Replace desktop-nav with full mega dropdowns
const newDesktopNav = `
      <nav class="desktop-nav site-header__nav" style="display: flex; align-items: center; gap: clamp(0.6rem, 1.2vw, 1.5rem); white-space: nowrap; flex-shrink: 1; min-width: 0;">
        <a href="/collections/new-arrivals" class="nav-link header-nav-link" data-cat="new-arrivals">NEW ARRIVALS</a>

        <!-- MEN'S WEAR Mega Dropdown -->
        <div class="nav-item-dropdown">
          <a href="/collections/mens-wear" class="nav-link header-nav-link" data-cat="mens-wear" style="display:inline-flex; align-items:center; gap:4px;">
            MEN'S WEAR
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="m1 3 4 4 4-4" stroke="currentColor" stroke-width="1.5"/></svg>
          </a>
          <div class="nav-dropdown-menu mega-dropdown">
            <div class="nav-mega-col">
              <div class="nav-mega-col-title">BOTTOM WEAR</div>
              <a href="/collections/mens-bottom-wear" class="nav-dropdown-link" style="font-weight:800; color:#fff;">All Bottom Wear</a>
              <a href="/collections/mens-jeans" class="nav-dropdown-link">Jeans</a>
              <a href="/collections/straight-fit-jeans" class="nav-dropdown-link" style="padding-left:8px; opacity:0.85;">— Straight Fit</a>
              <a href="/collections/baggy-fit-jeans" class="nav-dropdown-link" style="padding-left:8px; opacity:0.85;">— Baggy Fit</a>
              <a href="/collections/narrow-fit-jeans" class="nav-dropdown-link" style="padding-left:8px; opacity:0.85;">— Narrow Fit</a>
              <a href="/collections/cargo-joggers" class="nav-dropdown-link">Cargo / Jogger Pants</a>
              <a href="/collections/formal-pants" class="nav-dropdown-link">Formal Pants</a>
              <a href="/collections/trousers" class="nav-dropdown-link">Trousers</a>
              <a href="/collections/lowers" class="nav-dropdown-link">Lowers</a>
            </div>
            <div class="nav-mega-col">
              <div class="nav-mega-col-title">TOP WEAR</div>
              <a href="/collections/mens-top-wear" class="nav-dropdown-link" style="font-weight:800; color:#fff;">All Top Wear</a>
              <a href="/collections/shirts" class="nav-dropdown-link">Shirts</a>
              <a href="/collections/t-shirts" class="nav-dropdown-link">T-Shirts</a>
              <a href="/collections/hoodies" class="nav-dropdown-link">Hoodies</a>
              <a href="/collections/sweatshirts" class="nav-dropdown-link">Sweatshirts</a>
              <a href="/collections/sweaters" class="nav-dropdown-link">Sweaters</a>
              <a href="/collections/jackets" class="nav-dropdown-link">Jackets</a>
              <a href="/collections/half-jackets" class="nav-dropdown-link">Half Jackets</a>
              <a href="/collections/short-kurtas" class="nav-dropdown-link">Short Kurtas</a>
            </div>
            <div class="nav-mega-col">
              <div class="nav-mega-col-title">SPECIALTY</div>
              <a href="/collections/mens-coord-sets" class="nav-dropdown-link">Co-ord Sets</a>
              <a href="/collections/clearance-sale" class="nav-dropdown-link" style="color:#ff4d4d; font-weight:800;">SALE ARCHIVE</a>
            </div>
          </div>
        </div>

        <!-- PARTY WEAR Mega Dropdown -->
        <div class="nav-item-dropdown">
          <a href="/collections/party-wear" class="nav-link header-nav-link" data-cat="party-wear" style="display:inline-flex; align-items:center; gap:4px;">
            PARTY WEAR
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="m1 3 4 4 4-4" stroke="currentColor" stroke-width="1.5"/></svg>
          </a>
          <div class="nav-dropdown-menu mega-dropdown mega-dropdown-2col">
            <div class="nav-mega-col">
              <div class="nav-mega-col-title">CEREMONIAL & SUITS</div>
              <a href="/collections/party-wear" class="nav-dropdown-link" style="font-weight:800; color:#fff;">All Party Wear</a>
              <a href="/collections/jodhpuri-suits" class="nav-dropdown-link">Jodhpuri Suits</a>
              <a href="/collections/blazers" class="nav-dropdown-link">Blazers</a>
              <a href="/collections/three-piece-suits" class="nav-dropdown-link">Three-Piece Suits</a>
            </div>
            <div class="nav-mega-col">
              <div class="nav-mega-col-title">FESTIVE & ETHNIC</div>
              <a href="/collections/indo-western" class="nav-dropdown-link">Indo-Western Wear</a>
              <a href="/collections/koti-kurta-sets" class="nav-dropdown-link">Koti-Kurta Sets</a>
              <a href="/collections/long-kurtas" class="nav-dropdown-link">Long Kurtas</a>
              <a href="/collections/nehru-jackets" class="nav-dropdown-link">Nehru Jackets</a>
            </div>
          </div>
        </div>

        <!-- KIDS WEAR Mega Dropdown -->
        <div class="nav-item-dropdown">
          <a href="/collections/kids-wear" class="nav-link header-nav-link" data-cat="kids-wear" style="display:inline-flex; align-items:center; gap:4px;">
            KIDS WEAR
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="m1 3 4 4 4-4" stroke="currentColor" stroke-width="1.5"/></svg>
          </a>
          <div class="nav-dropdown-menu mega-dropdown">
            <div class="nav-mega-col">
              <div class="nav-mega-col-title">BOYS' CLOTHING</div>
              <a href="/collections/boys-clothing" class="nav-dropdown-link" style="font-weight:800; color:#fff;">All Boys' Wear</a>
              <a href="/collections/boys-casual-wear" class="nav-dropdown-link">Casual Wear (Tees, Shirts)</a>
              <a href="/collections/boys-ethnic-wear" class="nav-dropdown-link">Ethnic (Kurtas, Sherwanis)</a>
            </div>
            <div class="nav-mega-col">
              <div class="nav-mega-col-title">GIRLS' CLOTHING</div>
              <a href="/collections/girls-clothing" class="nav-dropdown-link" style="font-weight:800; color:#fff;">All Girls' Wear</a>
              <a href="/collections/girls-casual-wear" class="nav-dropdown-link">Casual (Tops, Jeans)</a>
              <a href="/collections/girls-party-wear" class="nav-dropdown-link">Party Wear (Frocks, Gowns)</a>
            </div>
            <div class="nav-mega-col">
              <div class="nav-mega-col-title">BABY CLOTHING (0–2Y)</div>
              <a href="/collections/baby-clothing" class="nav-dropdown-link" style="font-weight:800; color:#fff;">All Baby Clothing</a>
              <a href="/collections/baby-rompers" class="nav-dropdown-link">Rompers & Jumpsuits</a>
              <a href="/collections/baby-coord-sets" class="nav-dropdown-link">Baby Co-ord Sets</a>
            </div>
          </div>
        </div>

        <a href="/collections/accessories" class="nav-link header-nav-link" data-cat="accessories">ACCESSORIES</a>
        <a href="/track" target="_blank" rel="noopener" class="nav-link header-nav-link">TRACK ORDER</a>
        <a href="/pages/contact.html" class="nav-link header-nav-link" onclick="if(window.openChatModal){window.openChatModal(); return false;}">CHAT WITH US</a>
      </nav>
`;

prodHtml = prodHtml.replace(
  /<nav class="desktop-nav"[\s\S]*?<\/nav>/,
  newDesktopNav
);

// 3. Replace mobile-drawer with full mobile drawer containing accordions
const newMobileDrawer = `
  <!-- Mobile Navigation Drawer with Sub-Category Accordions -->
  <aside id="mobile-nav-drawer" style="position:fixed; top:0; left:0; bottom:0; width:min(340px, 86vw); background:#0c0c0c; border-right:1px solid #222; z-index:99999; transform:translateX(-100%); transition:transform 0.3s cubic-bezier(0.16,1,0.3,1); display:flex; flex-direction:column; overflow-y:auto; -webkit-overflow-scrolling:touch; box-shadow:8px 0 30px rgba(0,0,0,0.8);">
    <div style="padding:1.25rem 1.5rem; display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid #1a1a1a;">
      <a href="/" style="display:flex; align-items:center; gap:8px; text-decoration:none;">
        <img src="/assets/ar-logo.png" alt="AR" width="32" height="32">
        <span style="font-weight:900; color:#fff; letter-spacing:0.12em; font-size:1rem;">ALLEYRICH</span>
      </a>
      <button type="button" onclick="closeMobileNav()" aria-label="Close Menu" style="background:none; border:none; color:#fff; font-size:1.5rem; cursor:pointer; line-height:1; padding:4px;">✕</button>
    </div>

    <div style="display:flex; flex-direction:column;">
      <a href="/collections/new-arrivals" onclick="closeMobileNav()" style="padding:1rem 1.5rem; color:#fff; font-weight:800; font-size:0.88rem; text-decoration:none; border-bottom:1px solid #1a1a1a; letter-spacing:0.06em;">NEW ARRIVALS</a>

      <!-- MEN'S WEAR Accordion -->
      <div class="mobile-accordion is-open">
        <div class="mobile-accordion-header" onclick="toggleProdAccordion(this)">
          <span>MEN'S WEAR</span>
          <svg class="mobile-accordion-arrow" width="12" height="12" viewBox="0 0 10 10" fill="none"><path d="m1 3 4 4 4-4" stroke="currentColor" stroke-width="1.5"/></svg>
        </div>
        <div class="mobile-accordion-body">
          <a href="/collections/mens-wear" onclick="closeMobileNav()" style="font-weight:800; color:#fff;">ALL MEN'S WEAR</a>
          <div class="mobile-subgroup-title">TOP WEAR</div>
          <a href="/collections/mens-top-wear" onclick="closeMobileNav()">All Top Wear</a>
          <a href="/collections/shirts" onclick="closeMobileNav()">Shirts</a>
          <a href="/collections/t-shirts" onclick="closeMobileNav()">T-Shirts</a>
          <a href="/collections/hoodies" onclick="closeMobileNav()">Hoodies</a>
          <a href="/collections/sweatshirts" onclick="closeMobileNav()">Sweatshirts</a>
          <a href="/collections/sweaters" onclick="closeMobileNav()">Sweaters</a>
          <a href="/collections/jackets" onclick="closeMobileNav()">Jackets</a>
          <div class="mobile-subgroup-title">BOTTOM WEAR</div>
          <a href="/collections/mens-bottom-wear" onclick="closeMobileNav()">All Bottom Wear</a>
          <a href="/collections/mens-jeans" onclick="closeMobileNav()">Jeans</a>
          <a href="/collections/cargo-joggers" onclick="closeMobileNav()">Cargo / Joggers</a>
          <a href="/collections/trousers" onclick="closeMobileNav()">Trousers</a>
          <a href="/collections/lowers" onclick="closeMobileNav()">Lowers</a>
        </div>
      </div>

      <!-- PARTY WEAR Accordion -->
      <div class="mobile-accordion">
        <div class="mobile-accordion-header" onclick="toggleProdAccordion(this)">
          <span>PARTY WEAR</span>
          <svg class="mobile-accordion-arrow" width="12" height="12" viewBox="0 0 10 10" fill="none"><path d="m1 3 4 4 4-4" stroke="currentColor" stroke-width="1.5"/></svg>
        </div>
        <div class="mobile-accordion-body">
          <a href="/collections/party-wear" onclick="closeMobileNav()" style="font-weight:800; color:#fff;">ALL PARTY WEAR</a>
          <div class="mobile-subgroup-title">CEREMONIAL & SUITS</div>
          <a href="/collections/jodhpuri-suits" onclick="closeMobileNav()">Jodhpuri Suits</a>
          <a href="/collections/blazers" onclick="closeMobileNav()">Blazers</a>
          <a href="/collections/three-piece-suits" onclick="closeMobileNav()">Three-Piece Suits</a>
          <div class="mobile-subgroup-title">FESTIVE & ETHNIC</div>
          <a href="/collections/indo-western" onclick="closeMobileNav()">Indo-Western Wear</a>
          <a href="/collections/koti-kurta-sets" onclick="closeMobileNav()">Koti-Kurta Sets</a>
          <a href="/collections/long-kurtas" onclick="closeMobileNav()">Long Kurtas</a>
          <a href="/collections/nehru-jackets" onclick="closeMobileNav()">Nehru Jackets</a>
        </div>
      </div>

      <!-- KIDS WEAR Accordion -->
      <div class="mobile-accordion">
        <div class="mobile-accordion-header" onclick="toggleProdAccordion(this)">
          <span>KIDS WEAR</span>
          <svg class="mobile-accordion-arrow" width="12" height="12" viewBox="0 0 10 10" fill="none"><path d="m1 3 4 4 4-4" stroke="currentColor" stroke-width="1.5"/></svg>
        </div>
        <div class="mobile-accordion-body">
          <a href="/collections/kids-wear" onclick="closeMobileNav()" style="font-weight:800; color:#fff;">ALL KIDS WEAR</a>
          <div class="mobile-subgroup-title">BOYS</div>
          <a href="/collections/boys-clothing" onclick="closeMobileNav()">Boys' Wear</a>
          <div class="mobile-subgroup-title">GIRLS</div>
          <a href="/collections/girls-clothing" onclick="closeMobileNav()">Girls' Wear</a>
          <div class="mobile-subgroup-title">BABY (0–2Y)</div>
          <a href="/collections/baby-clothing" onclick="closeMobileNav()">Baby Clothing</a>
        </div>
      </div>

      <a href="/collections/accessories" onclick="closeMobileNav()" style="padding:1rem 1.5rem; color:#fff; font-weight:800; font-size:0.88rem; text-decoration:none; border-bottom:1px solid #1a1a1a; letter-spacing:0.06em;">ACCESSORIES</a>
      <a href="/track" target="_blank" rel="noopener" style="padding:1rem 1.5rem; color:#fff; font-weight:800; font-size:0.88rem; text-decoration:none; border-bottom:1px solid #1a1a1a; letter-spacing:0.06em;">TRACK ORDER</a>
      <a href="/pages/contact.html" onclick="if(window.openChatModal){window.openChatModal(); closeMobileNav(); return false;}" style="padding:1rem 1.5rem; color:#fff; font-weight:800; font-size:0.88rem; text-decoration:none; border-bottom:1px solid #1a1a1a; letter-spacing:0.06em;">CHAT WITH US</a>
    </div>
  </aside>
  <div id="mobile-nav-backdrop" onclick="closeMobileNav()" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:99998; backdrop-filter:blur(2px);"></div>
`;

prodHtml = prodHtml.replace(
  /<nav class="mobile-drawer" id="mobile-drawer">[\s\S]*?<\/nav>/,
  newMobileDrawer
);

// 4. Client Script for mobile drawer & dropdown interactions
const drawerScript = `
  <script>
    function openMobileNav() {
      const drawer = document.getElementById('mobile-nav-drawer');
      const backdrop = document.getElementById('mobile-nav-backdrop');
      if (drawer && backdrop) {
        backdrop.style.display = 'block';
        drawer.style.transform = 'translateX(0)';
        document.body.style.overflow = 'hidden';
      }
    }
    function closeMobileNav() {
      const drawer = document.getElementById('mobile-nav-drawer');
      const backdrop = document.getElementById('mobile-nav-backdrop');
      if (drawer && backdrop) {
        backdrop.style.display = 'none';
        drawer.style.transform = 'translateX(-100%)';
        document.body.style.overflow = '';
      }
    }
    function toggleProdAccordion(header) {
      const acc = header.closest('.mobile-accordion');
      if (acc) acc.classList.toggle('is-open');
    }

    document.addEventListener('DOMContentLoaded', () => {
      const trigger = document.getElementById('mobile-menu-trigger');
      if (trigger) {
        trigger.addEventListener('click', (e) => {
          e.preventDefault();
          openMobileNav();
        });
      }

      // Dropdown hover & mobile tap-to-toggle
      document.querySelectorAll('.nav-item-dropdown').forEach(dropdown => {
        let timer = null;
        dropdown.addEventListener('mouseenter', () => {
          clearTimeout(timer);
          document.querySelectorAll('.nav-item-dropdown.is-open').forEach(d => { if (d !== dropdown) d.classList.remove('is-open'); });
          dropdown.classList.add('is-open');
        });
        dropdown.addEventListener('mouseleave', () => {
          timer = setTimeout(() => dropdown.classList.remove('is-open'), 250);
        });

        const link = dropdown.querySelector('.nav-link');
        if (link) {
          link.addEventListener('click', (e) => {
            const isOpen = dropdown.classList.contains('is-open');
            if (!isOpen) {
              e.preventDefault();
              e.stopPropagation();
              document.querySelectorAll('.nav-item-dropdown.is-open').forEach(d => { if (d !== dropdown) d.classList.remove('is-open'); });
              dropdown.classList.add('is-open');
            }
          });
        }
      });
    });
  </script>
`;

prodHtml = prodHtml.replace('</body>', drawerScript + '\n</body>');

fs.writeFileSync('product.html', prodHtml, 'utf8');
console.log('product.html header and mobile drawer updated successfully');
