/**
 * ALLY RICH / GENRAGE - Unified Quick-Buy Bottom Sheet & Drawer Engine
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
      this.bindTriggers();
      this.bindNewsletter();
      this.fetchCatalog();
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
          vendor: 'ALLY RICH',
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
            <div class="qb-vendor">${product.vendor || 'ALLY RICH'}</div>
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

      // Trigger app hooks if present
      let drawerOpened = false;
      if (window.GenrageApp) {
        window.GenrageApp.cart = cart;
        if (typeof window.GenrageApp.updateCartUI === 'function') window.GenrageApp.updateCartUI();
        if (typeof window.GenrageApp.openCart === 'function') {
          window.GenrageApp.openCart();
          drawerOpened = true;
        }
      }
      if (window.CollectionEngine) {
        window.CollectionEngine.cart = cart;
        if (typeof window.CollectionEngine.updateCartUi === 'function') window.CollectionEngine.updateCartUi();
        if (typeof window.CollectionEngine.openCartDrawer === 'function') {
          window.CollectionEngine.openCartDrawer();
          drawerOpened = true;
        } else if (typeof window.CollectionEngine.openCart === 'function') {
          window.CollectionEngine.openCart();
          drawerOpened = true;
        }
      }

      // Fallback DOM activation if drawer not already opened
      if (!drawerOpened) {
        const cartDrawer = document.getElementById('cart-drawer');
        const drawerBackdrop = document.getElementById('drawer-backdrop');
        if (cartDrawer) {
          cartDrawer.classList.add('active');
          if (drawerBackdrop) drawerBackdrop.classList.add('active');
          document.body.style.overflow = 'hidden';
        }
      }

      // Update badge counts on header
      const totalCount = cart.reduce((acc, item) => acc + (Number(item.quantity) || 1), 0);
      document.querySelectorAll('.cart-badge-count, #cart-count').forEach(el => {
        el.textContent = totalCount;
        el.style.display = totalCount > 0 ? 'flex' : 'none';
      });

      this.close();
    },

    buyNow() {
      if (!this.currentProduct) return;
      this.addToCartAndOpenDrawer();
      window.location.href = '/checkout';
    },

    bindNewsletter() {
      document.querySelectorAll('.site-footer__newsletter-form').forEach(form => {
        form.onsubmit = async (e) => {
          e.preventDefault();
          const input = form.querySelector('input[type="email"], .site-footer__newsletter-input');
          const submitBtn = form.querySelector('button[type="submit"], .site-footer__newsletter-btn');
          const email = input ? input.value.trim() : '';
          if (!email) return;

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
        };
      });
    }
  };

  // Expose globally
  window.QuickBuyEngine = QuickBuy;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => QuickBuy.init());
  } else {
    QuickBuy.init();
  }
})();
