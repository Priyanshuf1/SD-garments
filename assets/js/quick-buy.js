/**
 * ALLYRICH / GENRAGE - Unified Quick-Buy Bottom Sheet & Drawer Engine
 * Powers 1-click mobile quick-buy, desktop quick-view drawer, cart synchronization,
 * and Inner Circle newsletter integration.
 */
(function () {
  'use strict';

  const QuickBuy = {
    products: [],
    currentProduct: null,
    selectedSize: 'M',
    quantity: 1,

    async init() {
      this.injectDom();
      this.injectCartDrawer();
      this.bindTriggers();
      this.bindCartTriggers();
      this.bindNewsletter();
      this.hydrateCloudCart();
      this.updateAllBadges();
      this.checkUrlForCart();
      this.fetchCatalog();
    },

    async hydrateCloudCart() {
      try {
        const userRaw = localStorage.getItem('genrage_user');
        if (!userRaw) return;
        const user = JSON.parse(userRaw);
        if (!user || (!user.id && !user.email)) return;
        const identifier = user.id || user.email;

        // If local cart is empty and user has cart, check cloud cart
        const localCart = this.getCart();
        if (localCart.length === 0 && Array.isArray(user.cart) && user.cart.length > 0) {
          this.saveCart(user.cart);
          return;
        }

        const res = await fetch(`/api/cart?userId=${encodeURIComponent(identifier)}&email=${encodeURIComponent(user.email || '')}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.success && Array.isArray(data.cart) && data.cart.length > 0) {
            if (localCart.length === 0) {
              this.saveCart(data.cart);
            }
          }
        }
      } catch (e) {}
    },

    async fetchCatalog() {
      try {
        const res = await fetch('/api/products');
        if (res.ok) {
          const data = await res.json();
          this.products = data.products || (Array.isArray(data) ? data : []);
        }
      } catch (e) {
        try {
          const res2 = await fetch('/data/products.json');
          if (res2.ok) {
            const data2 = await res2.json();
            this.products = data2.products || [];
          }
        } catch (e2) {}
      }
    },

    injectDom() {
      if (document.getElementById('quick-buy-drawer')) return;

      const backdrop = document.createElement('div');
      backdrop.className = 'quick-buy-backdrop';
      backdrop.id = 'quick-buy-backdrop';
      backdrop.onclick = () => this.close();

      const drawer = document.createElement('div');
      drawer.className = 'quick-buy-drawer';
      drawer.id = 'quick-buy-drawer';
      drawer.setAttribute('role', 'dialog');
      drawer.setAttribute('aria-modal', 'true');
      drawer.setAttribute('aria-label', 'Quick Add to Bag');

      drawer.innerHTML = `
        <div class="quick-buy-handle-bar"></div>
        <button type="button" class="quick-buy-close-btn" id="quick-buy-close-btn" aria-label="Close">✕</button>
        <div class="quick-buy-content" id="quick-buy-content">
          <!-- Rendered dynamically -->
        </div>
      `;

      document.body.appendChild(backdrop);
      document.body.appendChild(drawer);

      document.getElementById('quick-buy-close-btn').onclick = () => this.close();
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this.close();
      });
    },

    bindTriggers() {
      // Delegate click on document for any quick add button (capture phase ensures no child swallows it)
      document.addEventListener('click', (e) => {
        const btn = e.target.closest('.product-card__quick-add-button, .quick-buy-btn, [data-quick-buy]');
        if (!btn) return;

        e.preventDefault();
        e.stopPropagation();

        this.handleTriggerClick(btn);
      }, true);
    },

    async handleTriggerClick(btn) {
      const card = btn.closest('product-card, .product-card, .product-item, .card');
      let handle = btn.getAttribute('data-handle') || (card ? card.getAttribute('handle') : null);
      let id = btn.getAttribute('data-id') || (card ? card.getAttribute('data-id') : null);

      if (!handle && card) {
        const link = card.querySelector('a[href*="/products/"]');
        if (link) {
          const href = link.getAttribute('href');
          const parts = href.split('/products/')[1];
          if (parts) handle = parts.split('?')[0].split('/')[0].trim();
        }
      }

      let product = null;
      if (handle) {
        product = this.products.find(p => p.handle === handle);
      }
      if (!product && id) {
        product = this.products.find(p => String(p.id) === String(id));
      }

      // If not in preloaded catalog, fetch product by handle
      if (!product && handle) {
        try {
          const res = await fetch(`/api/products/${encodeURIComponent(handle)}`);
          if (res.ok) {
            const data = await res.json();
            product = data.product || data;
          }
        } catch (e) {}
      }

      // Fallback: extract info directly from Card DOM
      if (!product && card) {
        const titleEl = card.querySelector('.product-title, .product-card__title, h6, h3');
        const title = titleEl ? titleEl.textContent.trim() : 'Streetwear Essential';
        const imgEl = card.querySelector('.product-card__image--primary, .product-card__image, img');
        const img = imgEl ? (imgEl.currentSrc || imgEl.src) : '';
        const priceEl = card.querySelector('.price-list .money, .price-current, .price');
        let price = 1899;
        if (priceEl) {
          const match = priceEl.textContent.replace(/[^\d.]/g, '');
          if (match) price = parseFloat(match);
        }
        const compEl = card.querySelector('.compare-at-price .money, .price-compare');
        let comparePrice = Math.round(price * 1.5);
        if (compEl) {
          const matchComp = compEl.textContent.replace(/[^\d.]/g, '');
          if (matchComp) comparePrice = parseFloat(matchComp);
        }

        product = {
          id: id || Date.now(),
          handle: handle || 'streetwear-item',
          title: title,
          vendor: 'ALLYRICH',
          price: price,
          compare_at_price: comparePrice,
          images: [{ src: img }],
          variants: [
            { title: 'S', price: price },
            { title: 'M', price: price },
            { title: 'L', price: price },
            { title: 'XL', price: price },
            { title: 'XXL', price: price }
          ]
        };
      }

      if (product) {
        this.open(product);
      }
    },

    open(product) {
      this.currentProduct = product;
      this.selectedSize = 'M';
      this.quantity = 1;

      const content = document.getElementById('quick-buy-content');
      if (!content) return;

      const variant = (product.variants && product.variants[0]) ? product.variants[0] : {};
      const price = Number(variant.price || product.price || 1899);
      const comparePrice = Number(variant.compare_at_price || product.compare_at_price || Math.round(price * 1.45));
      const hasDiscount = comparePrice > price;
      const discountPct = hasDiscount ? Math.round(((comparePrice - price) / comparePrice) * 100) : 0;
      const img = (product.images && product.images[0]) ? (product.images[0].src || product.images[0]) : (product.image || '');

      const availableSizes = (product.variants && product.variants.length > 0)
        ? product.variants.map(v => v.title || v.option1 || 'Regular').filter(Boolean)
        : ['S', 'M', 'L', 'XL', 'XXL'];

      content.innerHTML = `
        <div class="qb-product-header">
          <img src="${img || 'https://cdn.shopify.com/s/files/1/0633/9339/9022/files/1_cd34702d-ac3b-4ee4-a9d4-1733e518d430.png?v=1792222977'}" alt="${product.title}" class="qb-thumb">
          <div class="qb-meta">
            <div class="qb-vendor">${product.vendor || 'ALLYRICH'}</div>
            <div class="qb-title" title="${product.title}">${product.title}</div>
            <div class="qb-pricing">
              <span class="qb-price-current">Rs. ${price.toLocaleString('en-IN')}</span>
              ${hasDiscount ? `<span class="qb-price-compare">Rs. ${comparePrice.toLocaleString('en-IN')}</span>` : ''}
              ${hasDiscount ? `<span class="qb-save-badge">SAVE ${discountPct}%</span>` : ''}
            </div>
          </div>
        </div>

        <div class="qb-section-label">
          <span>SELECT SIZE</span>
          <a href="/products/${product.handle || ''}" style="color:#666; font-size:0.7rem; text-decoration:underline;">View Details →</a>
        </div>

        <div class="qb-sizes" id="qb-size-container">
          ${availableSizes.map(sz => `
            <button type="button" class="qb-size-pill ${sz === 'M' ? 'selected' : ''}" data-size="${sz}">
              ${sz}
            </button>
          `).join('')}
        </div>

        <div class="qb-actions-row">
          <div class="qb-qty-control">
            <button type="button" class="qb-qty-btn" id="qb-qty-minus">−</button>
            <span class="qb-qty-val" id="qb-qty-val">1</span>
            <button type="button" class="qb-qty-btn" id="qb-qty-plus">+</button>
          </div>
          <button type="button" class="qb-btn-add" id="qb-btn-add">
            ADD TO BAG
          </button>
        </div>

        <button type="button" class="qb-btn-buy-now" id="qb-btn-buy-now">
          ⚡ BUY NOW (1-CLICK CHECKOUT)
        </button>

        <div class="qb-perk-hint">
          <span>🚚 Express Doorstep Delivery</span>
          <span>•</span>
          <span>🔒 256-Bit SSL Encrypted</span>
        </div>
      `;

      // Bind size pills
      const sizeButtons = content.querySelectorAll('.qb-size-pill');
      sizeButtons.forEach(btn => {
        btn.onclick = () => {
          sizeButtons.forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          this.selectedSize = btn.getAttribute('data-size');
        };
      });

      // Bind quantity
      const valEl = document.getElementById('qb-qty-val');
      document.getElementById('qb-qty-minus').onclick = () => {
        if (this.quantity > 1) {
          this.quantity--;
          valEl.textContent = this.quantity;
        }
      };
      document.getElementById('qb-qty-plus').onclick = () => {
        if (this.quantity < 10) {
          this.quantity++;
          valEl.textContent = this.quantity;
        }
      };

      // Bind Add to Cart
      document.getElementById('qb-btn-add').onclick = () => {
        this.addToCartAndOpenDrawer();
      };

      // Bind Buy Now
      document.getElementById('qb-btn-buy-now').onclick = () => {
        this.buyNow();
      };

      // Open drawer & backdrop
      document.getElementById('quick-buy-backdrop').classList.add('active');
      document.getElementById('quick-buy-drawer').classList.add('active');
      document.body.style.overflow = 'hidden';
    },

    close() {
      document.getElementById('quick-buy-backdrop')?.classList.remove('active');
      document.getElementById('quick-buy-drawer')?.classList.remove('active');
      document.body.style.overflow = '';
      this.currentProduct = null;
    },

    addToCartAndOpenDrawer() {
      if (!this.currentProduct) return;
      const p = this.currentProduct;
      const variant = (p.variants && p.variants[0]) ? p.variants[0] : {};
      const price = Number(variant.price || p.price || 1899);
      const img = (p.images && p.images[0]) ? (p.images[0].src || p.images[0]) : (p.image || '');

      let cart = [];
      try {
        const raw = localStorage.getItem('genrage_cart') || localStorage.getItem('genrage_cart_v1');
        if (raw) cart = JSON.parse(raw);
        if (!Array.isArray(cart)) cart = [];
      } catch (e) { cart = []; }

      const existingIndex = cart.findIndex(item => (String(item.id) === String(p.id) || item.handle === p.handle) && item.size === this.selectedSize);

      if (existingIndex > -1) {
        cart[existingIndex].quantity += this.quantity;
      } else {
        cart.push({
          id: p.id || Date.now(),
          handle: p.handle || 'product',
          title: p.title,
          size: this.selectedSize,
          price: price,
          image: img,
          quantity: this.quantity
        });
      }

      localStorage.setItem('genrage_cart', JSON.stringify(cart));
      localStorage.setItem('genrage_cart_v1', JSON.stringify(cart));
      this.syncWithServer(cart);

      // Trigger app hooks if present
      if (window.GenrageApp) {
        window.GenrageApp.cart = cart;
        if (typeof window.GenrageApp.updateCartUI === 'function') window.GenrageApp.updateCartUI();
      }
      if (window.CollectionEngine) {
        window.CollectionEngine.cart = cart;
        if (typeof window.CollectionEngine.updateCartUi === 'function') window.CollectionEngine.updateCartUi();
      }

      this.updateAllBadges();
      this.close();
      this.openCartDrawer();
    },

    syncWithServer(cart) {
      try {
        const userRaw = localStorage.getItem('genrage_user');
        if (!userRaw) return;
        const user = JSON.parse(userRaw);
        if (!user || (!user.id && !user.email)) return;
        const identifier = user.id || user.email;
        fetch('/api/cart/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: identifier, email: user.email, cart: cart || this.getCart() })
        }).catch(() => {});
      } catch (e) {}
    },

    buyNow() {
      if (!this.currentProduct) return;
      this.addToCartAndOpenDrawer();
      window.location.href = '/checkout';
    },

    getCart() {
      try {
        const raw = localStorage.getItem('genrage_cart') || localStorage.getItem('genrage_cart_v1');
        return raw ? JSON.parse(raw) : [];
      } catch (e) {
        return [];
      }
    },

    saveCart(cart) {
      try {
        const json = JSON.stringify(cart);
        localStorage.setItem('genrage_cart', json);
        localStorage.setItem('genrage_cart_v1', json);
      } catch (e) {}
      this.syncWithServer(cart);
      this.updateAllBadges();
      this.renderGlobalCart();
      if (window.CollectionEngine && typeof window.CollectionEngine.updateCartUi === 'function') {
        window.CollectionEngine.cart = cart;
        window.CollectionEngine.updateCartUi();
      }
      if (window.GenrageApp && typeof window.GenrageApp.updateCartUI === 'function') {
        window.GenrageApp.cart = cart;
        window.GenrageApp.updateCartUI();
      }
    },

    updateAllBadges() {
      const cart = this.getCart();
      const totalCount = cart.reduce((acc, item) => acc + (Number(item.quantity) || 1), 0);
      document.querySelectorAll('.cart-badge-count, #cart-count, #header-cart-badge, .header__cart-dot').forEach(el => {
        if (el.tagName === 'CART-DOT') {
          el.style.display = totalCount > 0 ? 'block' : 'none';
        } else {
          el.textContent = totalCount;
          el.style.display = totalCount > 0 ? 'flex' : 'none';
        }
      });
    },

    checkUrlForCart() {
      try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('openCart') === 'true' || window.location.hash === '#cart') {
          setTimeout(() => this.openCartDrawer(), 300);
        }
      } catch (e) {}
    },

    bindCartTriggers() {
      // Infallible event listener on capture phase across all pages (touch and click)
      let lastTriggerTime = 0;
      const handleCartOpen = (e) => {
        const trigger = e.target.closest('a[href*="/cart"], a[aria-controls="cart-drawer"], .header__cart-link, .header__cart-link a, .cart-trigger, [data-open-cart], #header-cart-badge, .header__cart-dot');
        if (trigger) {
          const now = Date.now();
          if (now - lastTriggerTime < 350) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          lastTriggerTime = now;
          e.preventDefault();
          e.stopPropagation();
          this.openCartDrawer();
        }
      };

      document.addEventListener('click', handleCartOpen, true);
      document.addEventListener('touchend', handleCartOpen, { passive: false, capture: true });
    },

    injectCartDrawer() {
      if (document.getElementById('global-cart-drawer') || document.getElementById('cart-drawer-aside')) return;

      const backdrop = document.createElement('div');
      backdrop.id = 'global-cart-backdrop';
      backdrop.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.65); z-index:99998; backdrop-filter:blur(3px);';
      backdrop.onclick = () => this.closeCartDrawer();

      const drawer = document.createElement('aside');
      drawer.id = 'global-cart-drawer';
      drawer.setAttribute('role', 'dialog');
      drawer.setAttribute('aria-label', 'Shopping Bag');
      drawer.style.cssText = `
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        width: min(420px, 100vw);
        background: #ffffff;
        color: #111111;
        z-index: 99999;
        transform: translateX(100%);
        transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        display: flex;
        flex-direction: column;
        padding: 1.5rem;
        box-shadow: -10px 0 30px rgba(0,0,0,0.15);
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      `;

      drawer.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; padding-bottom:1rem; border-bottom:1px solid #eee;">
          <h3 style="font-size:1.15rem; font-weight:800; text-transform:uppercase; margin:0; letter-spacing:0.04em; color:#111;">Shopping Bag</h3>
          <button type="button" id="global-cart-close" aria-label="Close Bag" style="background:none; border:none; color:#111; font-size:1.25rem; cursor:pointer; padding:4px;">✕</button>
        </div>

        <div style="background:#e8f5e9; border:1px solid #c8e6c9; border-radius:3px; padding:0.75rem; margin:1rem 0; font-size:0.75rem; text-align:center; color:#111;">
          <span style="color:#2e7d32; font-weight:800;">✓ FREE EXPRESS AIR DELIVERY</span> ON ALL ORDERS IN INDIA
        </div>

        <div id="global-cart-items" style="flex:1; overflow-y:auto; padding:0.5rem 0;"></div>

        <div style="border-top:1px solid #eee; padding-top:1.25rem;">
          <div style="display:flex; justify-content:space-between; margin-bottom:1rem; font-weight:700; font-size:0.95rem; color:#111;">
            <span>Estimated Subtotal</span>
            <span id="global-cart-total" style="font-weight:900;">Rs. 0</span>
          </div>
          <button type="button" id="global-cart-checkout-btn" style="width:100%; background:#000000; color:#ffffff; border:none; padding:15px; font-size:0.9rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; cursor:pointer; border-radius:2px; transition:background 0.2s;">
            PROCEED TO CHECKOUT
          </button>
          <div style="text-align:center; font-size:0.7rem; color:#777; margin-top:8px;">
            Taxes and shipping calculated at checkout
          </div>
        </div>
      `;

      document.body.appendChild(backdrop);
      document.body.appendChild(drawer);

      document.getElementById('global-cart-close').onclick = () => this.closeCartDrawer();
      document.getElementById('global-cart-checkout-btn').onclick = () => {
        const cart = this.getCart();
        if (cart.length === 0) {
          alert('Your cart is empty. Please add items before checking out.');
          return;
        }
        window.location.href = '/checkout';
      };
    },

    openCartDrawer() {
      if (window.CollectionEngine && typeof window.CollectionEngine.openCartDrawer === 'function') {
        window.CollectionEngine.openCartDrawer();
        return;
      }
      if (window.GenrageApp && typeof window.GenrageApp.openCart === 'function') {
        window.GenrageApp.openCart();
        return;
      }

      this.injectCartDrawer();
      this.renderGlobalCart();
      const backdrop = document.getElementById('global-cart-backdrop');
      const drawer = document.getElementById('global-cart-drawer');
      if (backdrop && drawer) {
        backdrop.style.display = 'block';
        drawer.style.transform = 'translateX(0)';
        document.body.style.overflow = 'hidden';
      }
    },

    closeCartDrawer() {
      const backdrop = document.getElementById('global-cart-backdrop');
      const drawer = document.getElementById('global-cart-drawer');
      if (backdrop && drawer) {
        backdrop.style.display = 'none';
        drawer.style.transform = 'translateX(100%)';
        document.body.style.overflow = '';
      }
    },

    renderGlobalCart() {
      const container = document.getElementById('global-cart-items');
      const totalEl = document.getElementById('global-cart-total');
      const checkoutBtn = document.getElementById('global-cart-checkout-btn');
      if (!container) return;

      const cart = this.getCart();
      if (cart.length === 0) {
        container.innerHTML = `
          <div style="text-align:center; padding:3rem 1rem; color:#888;">
            Your bag is currently empty.<br>
            <a href="/collections/shop" style="display:inline-block; margin-top:1rem; background:#000; color:#fff; padding:8px 16px; border-radius:2px; font-size:0.78rem; font-weight:800; text-transform:uppercase; text-decoration:none;">EXPLORE DROPS</a>
          </div>
        `;
        if (totalEl) totalEl.textContent = 'Rs. 0';
        if (checkoutBtn) {
          checkoutBtn.style.opacity = '0.5';
          checkoutBtn.style.cursor = 'not-allowed';
        }
        return;
      }

      if (checkoutBtn) {
        checkoutBtn.style.opacity = '1';
        checkoutBtn.style.cursor = 'pointer';
      }

      let subtotal = 0;
      container.innerHTML = cart.map((item, idx) => {
        const price = Number(item.price || 1899);
        const qty = Number(item.quantity || 1);
        subtotal += price * qty;
        const img = item.image || 'https://cdn.shopify.com/s/files/1/0633/9339/9022/files/1_cd34702d-ac3b-4ee4-a9d4-1733e518d430.png?v=1792222977';

        return `
          <div style="display:flex; gap:12px; margin-bottom:1rem; padding-bottom:1rem; border-bottom:1px solid #f0f0f0; align-items:center;">
            <img src="${img}" alt="${item.title}" style="width:60px; height:80px; object-fit:cover; border-radius:2px; background:#f5f5f5;">
            <div style="flex:1;">
              <div style="font-weight:700; font-size:0.85rem; color:#111; line-height:1.2;">${item.title}</div>
              <div style="font-size:0.75rem; color:#666; margin:3px 0;">Size: <strong>${item.size || 'M'}</strong></div>
              <div style="font-weight:800; font-size:0.85rem; color:#000;">Rs. ${(price * qty).toLocaleString('en-IN')}</div>
            </div>
            <div style="display:flex; align-items:center; gap:6px;">
              <button type="button" onclick="window.QuickBuyEngine.changeCartQty(${idx}, -1)" style="width:26px; height:26px; background:#f0f0f0; border:1px solid #ccc; border-radius:2px; font-weight:800; cursor:pointer;">−</button>
              <span style="font-size:0.85rem; font-weight:700; min-width:18px; text-align:center;">${qty}</span>
              <button type="button" onclick="window.QuickBuyEngine.changeCartQty(${idx}, 1)" style="width:26px; height:26px; background:#f0f0f0; border:1px solid #ccc; border-radius:2px; font-weight:800; cursor:pointer;">+</button>
            </div>
          </div>
        `;
      }).join('');

      if (totalEl) totalEl.textContent = `Rs. ${subtotal.toLocaleString('en-IN')}`;
    },

    changeCartQty(idx, delta) {
      const cart = this.getCart();
      if (!cart[idx]) return;
      cart[idx].quantity = (Number(cart[idx].quantity) || 1) + delta;
      if (cart[idx].quantity <= 0) {
        cart.splice(idx, 1);
      }
      this.saveCart(cart);
    },

    bindNewsletter() {
      const submitHandler = async (form, e) => {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        const input = form.querySelector('input[type="email"], .site-footer__newsletter-input');
        const submitBtn = form.querySelector('button[type="submit"], .site-footer__newsletter-btn');
        const email = input ? input.value.trim() : '';
        if (!email) return false;

        const originalBtnText = submitBtn ? submitBtn.textContent : 'SUBSCRIBE';
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'JOINING...';
        }

        try {
          const res = await fetch('/api/newsletter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
          });
          const data = await res.json();

          let msgEl = form.parentElement.querySelector('.newsletter-feedback-msg');
          if (!msgEl) {
            msgEl = document.createElement('div');
            msgEl.className = 'newsletter-feedback-msg';
            msgEl.style.cssText = 'font-size: 0.8rem; font-weight: 700; margin-top: 10px; color: #4ade80; letter-spacing: 0.04em; text-transform: uppercase;';
            form.parentElement.appendChild(msgEl);
          }
          msgEl.textContent = '✓ Welcome to the Inner Circle. Exclusive drop access confirmed.';
          msgEl.style.color = '#4ade80';
          if (input) input.value = '';
          if (submitBtn) {
            submitBtn.textContent = 'JOINED ✓';
            submitBtn.style.background = '#2e7d32';
            submitBtn.style.borderColor = '#2e7d32';
          }
        } catch (err) {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalBtnText;
          }
        }
        return false;
      };

      window.submitNewsletter = submitHandler;

      document.querySelectorAll('.site-footer__newsletter-form').forEach(form => {
        form.onsubmit = (e) => submitHandler(form, e);
      });
    }
  };

  window.submitNewsletter = async function(form, e) {
    if (window.QuickBuyEngine?.bindNewsletter) {
      window.QuickBuyEngine.bindNewsletter();
    }
    const input = form.querySelector('input[type="email"], .site-footer__newsletter-input');
    const submitBtn = form.querySelector('button[type="submit"], .site-footer__newsletter-btn');
    const email = input ? input.value.trim() : '';
    if (!email) return false;
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'JOINING...'; }
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      let msgEl = form.parentElement.querySelector('.newsletter-feedback-msg');
      if (!msgEl) {
        msgEl = document.createElement('div');
        msgEl.className = 'newsletter-feedback-msg';
        msgEl.style.cssText = 'font-size: 0.8rem; font-weight: 700; margin-top: 10px; color: #4ade80; letter-spacing: 0.04em; text-transform: uppercase;';
        form.parentElement.appendChild(msgEl);
      }
      msgEl.textContent = '✓ Welcome to the Inner Circle. Exclusive drop access confirmed.';
      if (input) input.value = '';
      if (submitBtn) { submitBtn.textContent = 'JOINED ✓'; submitBtn.style.background = '#2e7d32'; }
    } catch (e) {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'SUBSCRIBE'; }
    }
    return false;
  };

  // Expose globally
  window.QuickBuyEngine = QuickBuy;
  window.QuickBuy = QuickBuy;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => QuickBuy.init());
  } else {
    QuickBuy.init();
  }
})();
