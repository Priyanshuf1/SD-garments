/**
 * GENRAGE - Official Frontend Application Engine
 * Handles State, Cart Drawer, Wishlist, Search, Modals, Product Catalog
 */

const GenrageApp = {
  products: [],
  collections: [],
  cart: [],
  wishlist: [],
  
  // Storage Keys
  STORAGE_CART: 'genrage_cart',
  STORAGE_WISHLIST: 'genrage_wishlist',

  async init() {
    this.loadState();
    await this.fetchData();
    this.setupCountdown();
    this.setupAnnouncement();
    this.setupEventListeners();
    this.renderDynamicSections();
    this.updateCartUI();
    this.updateWishlistUI();
  },

  loadState() {
    try {
      const rawCart = localStorage.getItem(this.STORAGE_CART) || localStorage.getItem('genrage_cart_v1');
      this.cart = rawCart ? JSON.parse(rawCart) : [];
      const rawWish = localStorage.getItem(this.STORAGE_WISHLIST) || localStorage.getItem('genrage_wishlist_v1');
      this.wishlist = rawWish ? JSON.parse(rawWish) : [];
    } catch (e) {
      this.cart = [];
      this.wishlist = [];
    }
  },

  saveCart() {
    const json = JSON.stringify(this.cart);
    localStorage.setItem(this.STORAGE_CART, json);
    localStorage.setItem('genrage_cart_v1', json);
    this.updateCartUI();
  },

  saveWishlist() {
    const json = JSON.stringify(this.wishlist);
    localStorage.setItem(this.STORAGE_WISHLIST, json);
    localStorage.setItem('genrage_wishlist_v1', json);
    this.updateWishlistUI();
  },

  async fetchData() {
    try {
      let loadedProds = false;
      try {
        const pRes = await fetch('/api/products');
        if (pRes.ok) {
          const pData = await pRes.json();
          this.products = pData.products || (Array.isArray(pData) ? pData : []);
          if (this.products.length > 0) loadedProds = true;
        }
      } catch (e) {}

      if (!loadedProds) {
        const pRes2 = await fetch('/data/products.json');
        if (pRes2.ok) {
          const pData2 = await pRes2.json();
          this.products = pData2.products || (Array.isArray(pData2) ? pData2 : []);
        }
      }
      
      const cRes = await fetch('/data/collections.json');
      if (cRes.ok) {
        const cData = await cRes.json();
        this.collections = cData.collections || [];
      }
    } catch (err) {
      console.warn('Local data fetch error:', err);
    }
  },

  // -------------------------------------------------------------
  // Dynamic Catalog Rendering
  // -------------------------------------------------------------
  renderDynamicSections() {
    // 1. Featured Basics Section
    const basicsContainer = document.getElementById('grid-basics');
    if (basicsContainer && this.products.length > 0) {
      // Find basic pants
      const basics = this.products.filter(p => 
        p.title.toLowerCase().includes('basic') || 
        p.title.toLowerCase().includes('balloon') || 
        p.tags.some(t => t.toLowerCase().includes('bottom') || t.toLowerCase().includes('pant'))
      ).slice(0, 8);
      
      basicsContainer.innerHTML = basics.map(p => this.createProductCardHtml(p)).join('');
    }

    // 2. Just Dropped Section
    const droppedContainer = document.getElementById('grid-dropped');
    if (droppedContainer && this.products.length > 0) {
      const dropped = this.products.filter(p => 
        p.title.toLowerCase().includes('hoodie') || 
        p.title.toLowerCase().includes('vest') || 
        p.title.toLowerCase().includes('sleeves') ||
        p.title.toLowerCase().includes('corduroy')
      ).slice(0, 8);
      
      droppedContainer.innerHTML = dropped.map(p => this.createProductCardHtml(p)).join('');
    }

    // 3. New Arrivals Main Section
    const arrivalsContainer = document.getElementById('grid-new-arrivals');
    if (arrivalsContainer && this.products.length > 0) {
      const arrivals = this.products.slice(0, 16);
      arrivalsContainer.innerHTML = arrivals.map(p => this.createProductCardHtml(p)).join('');
    }

    this.bindCardEvents();
  },

  createProductCardHtml(p) {
    const primaryImg = p.images && p.images[0] ? p.images[0].src : '';
    const secondaryImg = p.images && p.images[1] ? p.images[1].src : primaryImg;
    const variant = p.variants && p.variants[0] ? p.variants[0] : null;
    
    const price = variant ? parseFloat(variant.price) : 1499;
    const comparePrice = variant && variant.compare_at_price ? parseFloat(variant.compare_at_price) : (price * 1.5).toFixed(0);
    const discountPercent = Math.round(((comparePrice - price) / comparePrice) * 100);
    
    const isWishlisted = this.wishlist.includes(p.id);

    return `
      <div class="product-card" data-id="${p.id}" data-handle="${p.handle}">
        <div class="product-media">
          <div class="product-badges">
            ${discountPercent > 0 ? `<span class="badge-sale">SAVE ${discountPercent}%</span>` : ''}
          </div>
          <button class="wishlist-btn ${isWishlisted ? 'active' : ''}" data-id="${p.id}" title="Wishlist">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="${isWishlisted ? '#ff3b30' : 'none'}" stroke="currentColor" stroke-width="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
          </button>
          
          <a href="/product.html?handle=${p.handle}">
            <img class="img-primary" src="${primaryImg}" alt="${p.title}" loading="lazy">
            <img class="img-secondary" src="${secondaryImg}" alt="${p.title}" loading="lazy">
          </a>

          <button class="quick-buy-btn" data-id="${p.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
            QUICK VIEW / BUY
          </button>
        </div>

        <div class="product-info">
          <span class="product-vendor">${p.vendor || 'ALLY RICH'}</span>
          <a href="/product.html?handle=${p.handle}" class="product-title" title="${p.title}">${p.title}</a>
          <div class="product-rating">
            ★★★★★ <span class="count">(4.8)</span>
          </div>
          <div class="product-pricing">
            <span class="price-current">Rs. ${price.toLocaleString('en-IN')}</span>
            ${comparePrice > price ? `<span class="price-compare">Rs. ${parseFloat(comparePrice).toLocaleString('en-IN')}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  },

  bindCardEvents() {
    // Quick buy trigger
    document.querySelectorAll('.quick-buy-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        const id = parseInt(btn.dataset.id);
        const p = this.products.find(x => x.id === id);
        if (p) {
          if (window.QuickBuyEngine && typeof window.QuickBuyEngine.open === 'function') {
            e.stopPropagation();
            window.QuickBuyEngine.open(p);
          } else {
            this.openQuickView(p);
          }
        }
      };
    });

    // Wishlist toggle
    document.querySelectorAll('.wishlist-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        this.toggleWishlist(id, btn);
      };
    });
  },

  // -------------------------------------------------------------
  // Wishlist Handling
  // -------------------------------------------------------------
  toggleWishlist(id, btn) {
    const idx = this.wishlist.indexOf(id);
    if (idx > -1) {
      this.wishlist.splice(idx, 1);
      btn.classList.remove('active');
      btn.querySelector('svg').setAttribute('fill', 'none');
      this.showToast('Removed from wishlist');
    } else {
      this.wishlist.push(id);
      btn.classList.add('active');
      btn.querySelector('svg').setAttribute('fill', '#ff3b30');
      this.showToast('Added to your wishlist ❤️');
    }
    this.saveWishlist();
  },

  updateWishlistUI() {
    const countEl = document.getElementById('wishlist-count');
    if (countEl) {
      countEl.textContent = this.wishlist.length;
      countEl.style.display = this.wishlist.length > 0 ? 'flex' : 'none';
    }
  },

  // -------------------------------------------------------------
  // Cart Logic & Drawer
  // -------------------------------------------------------------
  addToCart(product, selectedVariant, quantity = 1) {
    const variant = selectedVariant || (product.variants && product.variants[0]) || {};
    const size = variant.title || 'M';
    const price = parseFloat(variant.price || 1499);
    const img = (product.images && product.images[0]) ? product.images[0].src : '';

    const existingIndex = this.cart.findIndex(item => item.id === product.id && item.size === size);

    if (existingIndex > -1) {
      this.cart[existingIndex].quantity += quantity;
    } else {
      this.cart.push({
        id: product.id,
        handle: product.handle,
        title: product.title,
        size: size,
        price: price,
        image: img,
        quantity: quantity
      });
    }

    this.saveCart();
    this.openCart();
    this.showToast(`Added ${product.title} to cart!`);
  },

  updateQuantity(index, delta) {
    if (!this.cart[index]) return;
    this.cart[index].quantity += delta;
    if (this.cart[index].quantity <= 0) {
      this.cart.splice(index, 1);
    }
    this.saveCart();
  },

  updateCartUI() {
    // Header cart badge
    const totalCount = this.cart.reduce((sum, item) => sum + item.quantity, 0);
    const cartBadges = document.querySelectorAll('.cart-badge-count');
    cartBadges.forEach(b => {
      b.textContent = totalCount;
      b.style.display = totalCount > 0 ? 'flex' : 'none';
    });

    // Cart items in drawer
    const list = document.getElementById('cart-items-list');
    const subtotalEl = document.getElementById('cart-subtotal-price');
    const shippingProgress = document.getElementById('shipping-progress');
    const shippingMsg = document.getElementById('shipping-msg');
    const checkoutBtns = document.querySelectorAll('.checkout-btn');

    if (this.cart.length === 0) {
      checkoutBtns.forEach(btn => {
        btn.disabled = true;
        btn.setAttribute('aria-disabled', 'true');
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
        btn.onclick = (e) => {
          if (e) { e.preventDefault(); e.stopImmediatePropagation(); }
          alert('Your cart is empty. Please add items before checking out.');
          return false;
        };
      });

      if (!list) return;

      list.innerHTML = `
        <div style="text-align: center; padding: 4rem 1rem; color: #888;">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 1rem; opacity: 0.5;">
            <circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
          </svg>
          <p style="font-weight: 700; text-transform: uppercase; font-size: 0.95rem; color: #fff; margin-bottom: 0.5rem;">Your Cart is Empty</p>
          <p style="font-size: 0.8rem; margin-bottom: 1.5rem;">Discover our latest streetwear drop</p>
          <a href="/collections.html" class="btn-primary" style="padding: 0.6rem 1.5rem; font-size: 0.75rem;">SHOP NEW ARRIVALS</a>
        </div>
      `;
      if (subtotalEl) subtotalEl.textContent = 'Rs. 0';
      if (shippingProgress) shippingProgress.style.width = '0%';
      if (shippingMsg) shippingMsg.innerHTML = 'Add Rs. 999 for <strong>FREE DELIVERY</strong>';
      return;
    }

    checkoutBtns.forEach(btn => {
      btn.disabled = false;
      btn.removeAttribute('aria-disabled');
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
      btn.onclick = () => {
        window.location.href = '/checkout';
      };
    });

    if (!list) return;

    const subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    if (subtotalEl) subtotalEl.textContent = `Rs. ${subtotal.toLocaleString('en-IN')}`;

    // Free shipping threshold (Rs. 999)
    const threshold = 999;
    const progress = Math.min(100, Math.round((subtotal / threshold) * 100));
    if (shippingProgress) shippingProgress.style.width = `${progress}%`;
    if (shippingMsg) {
      if (subtotal >= threshold) {
        shippingMsg.innerHTML = '🎉 You qualify for <strong>FREE DELIVERY PAN INDIA!</strong>';
      } else {
        const remaining = threshold - subtotal;
        shippingMsg.innerHTML = `Add Rs. ${remaining.toLocaleString('en-IN')} more for <strong>FREE DELIVERY</strong>`;
      }
    }

    list.innerHTML = this.cart.map((item, index) => `
      <div class="cart-item">
        <img class="cart-item-img" src="${item.image}" alt="${item.title}">
        <div class="cart-item-details">
          <div class="cart-item-title">${item.title}</div>
          <div class="cart-item-variant">Size: <strong>${item.size}</strong></div>
          <div class="cart-item-bottom">
            <div class="qty-control">
              <button class="qty-btn" onclick="GenrageApp.updateQuantity(${index}, -1)">−</button>
              <span class="qty-val">${item.quantity}</span>
              <button class="qty-btn" onclick="GenrageApp.updateQuantity(${index}, 1)">+</button>
            </div>
            <div class="cart-item-price">Rs. ${(item.price * item.quantity).toLocaleString('en-IN')}</div>
          </div>
        </div>
      </div>
    `).join('');
  },

  openCart() {
    document.getElementById('cart-drawer')?.classList.add('active');
    document.getElementById('drawer-backdrop')?.classList.add('active');
    document.body.style.overflow = 'hidden';
  },

  closeCart() {
    document.getElementById('cart-drawer')?.classList.remove('active');
    document.getElementById('drawer-backdrop')?.classList.remove('active');
    document.body.style.overflow = '';
  },

  // -------------------------------------------------------------
  // Quick View Modal
  // -------------------------------------------------------------
  openQuickView(product) {
    if (window.QuickBuyEngine && typeof window.QuickBuyEngine.open === 'function') {
      window.QuickBuyEngine.open(product);
      return;
    }
    const modal = document.getElementById('quick-view-modal');
    const container = document.getElementById('quick-view-body');
    if (!modal || !container) return;

    const variant = product.variants && product.variants[0] ? product.variants[0] : {};
    const price = parseFloat(variant.price || 1499);
    const comparePrice = variant.compare_at_price ? parseFloat(variant.compare_at_price) : (price * 1.5).toFixed(0);
    const images = product.images && product.images.length > 0 ? product.images : [{ src: '' }];

    container.innerHTML = `
      <div style="display: grid; grid-template-columns: 1fr; gap: 2rem; padding: 2rem;" class="quick-view-grid">
        <div>
          <img id="qv-main-img" src="${images[0].src}" style="width: 100%; aspect-ratio: 3/4; object-fit: cover; border-radius: 4px; margin-bottom: 1rem;">
          <div style="display: flex; gap: 0.5rem; overflow-x: auto;">
            ${images.slice(0, 5).map(img => `
              <img src="${img.src}" style="width: 60px; height: 75px; object-fit: cover; border-radius: 2px; cursor: pointer; border: 1px solid #333;" onclick="document.getElementById('qv-main-img').src='${img.src}'">
            `).join('')}
          </div>
        </div>

        <div style="display: flex; flex-direction: column;">
          <span style="font-size: 0.75rem; color: #888; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 0.5rem;">${product.vendor || 'ALLY RICH'}</span>
          <h2 style="font-size: 1.5rem; margin-bottom: 0.75rem;">${product.title}</h2>
          
          <div style="display: flex; align-items: baseline; gap: 1rem; margin-bottom: 1.25rem;">
            <span style="font-size: 1.35rem; font-weight: 800; color: #fff;">Rs. ${price.toLocaleString('en-IN')}</span>
            ${comparePrice > price ? `<span style="text-decoration: line-through; color: #888; font-size: 0.95rem;">Rs. ${parseFloat(comparePrice).toLocaleString('en-IN')}</span>` : ''}
            <span style="background: #c5312d; color: #fff; font-size: 0.7rem; font-weight: 800; padding: 0.2rem 0.5rem; border-radius: 2px;">SALE</span>
          </div>

          <p style="font-size: 0.85rem; color: #bbb; line-height: 1.6; margin-bottom: 1.5rem;">
            ${product.body_html ? product.body_html.replace(/<[^>]+>/g, ' ').slice(0, 180) + '...' : 'Crafted from premium heavyweight combed cotton with custom relaxed streetwear tailoring.'}
          </p>

          <div style="margin-bottom: 1.5rem;">
            <label style="display: block; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; margin-bottom: 0.5rem;">SELECT SIZE</label>
            <div style="display: flex; gap: 0.5rem;" id="qv-size-selector">
              ${(product.variants && product.variants.length > 1 ? product.variants : [{title: 'S'}, {title: 'M'}, {title: 'L'}, {title: 'XL'}]).map((v, i) => `
                <button class="size-pill ${i === 1 ? 'selected' : ''}" style="border: 1px solid #444; background: ${i === 1 ? '#fff' : '#1a1a1a'}; color: ${i === 1 ? '#000' : '#fff'}; padding: 0.4rem 0.9rem; font-weight: 700; border-radius: 2px; font-size: 0.8rem;" onclick="GenrageApp.selectSize(this)">
                  ${v.title}
                </button>
              `).join('')}
            </div>
          </div>

          <div style="display: flex; gap: 1rem; margin-top: auto;">
            <button id="qv-add-btn" class="btn-primary" style="flex: 1; padding: 0.9rem;">
              ADD TO CART
            </button>
            <a href="/product.html?handle=${product.handle}" class="btn-outline" style="padding: 0.9rem 1.25rem;">
              DETAILS
            </a>
          </div>
        </div>
      </div>
    `;

    document.getElementById('qv-add-btn').onclick = () => {
      const selectedSize = document.querySelector('#qv-size-selector .size-pill.selected')?.innerText || 'M';
      this.addToCart(product, { title: selectedSize, price: price });
      this.closeQuickView();
    };

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  },

  selectSize(btn) {
    document.querySelectorAll('#qv-size-selector .size-pill').forEach(b => {
      b.style.background = '#1a1a1a';
      b.style.color = '#fff';
      b.classList.remove('selected');
    });
    btn.style.background = '#fff';
    btn.style.color = '#000';
    btn.classList.add('selected');
  },

  closeQuickView() {
    document.getElementById('quick-view-modal')?.classList.remove('active');
    document.body.style.overflow = '';
  },

  // -------------------------------------------------------------
  // Instant Search Engine
  // -------------------------------------------------------------
  setupSearch() {
    const input = document.getElementById('search-modal-input');
    const resultsContainer = document.getElementById('search-results');
    if (!input || !resultsContainer) return;

    input.oninput = (e) => {
      const q = e.target.value.trim().toLowerCase();
      if (!q) {
        resultsContainer.innerHTML = '<p style="color: #666; font-size: 0.85rem; text-align: center; padding: 2rem;">Search for baggy pants, hoodies, vests, tees...</p>';
        return;
      }

      const matches = this.products.filter(p => 
        p.title.toLowerCase().includes(q) || 
        p.tags.some(t => t.toLowerCase().includes(q)) ||
        (p.product_type && p.product_type.toLowerCase().includes(q))
      ).slice(0, 10);

      if (matches.length === 0) {
        resultsContainer.innerHTML = `<p style="color: #888; text-align: center; padding: 2rem;">No items found for "${q}"</p>`;
        return;
      }

      resultsContainer.innerHTML = matches.map(p => {
        const img = p.images && p.images[0] ? p.images[0].src : '';
        const price = p.variants && p.variants[0] ? p.variants[0].price : '1,499';
        return `
          <a href="/product.html?handle=${p.handle}" class="search-result-item">
            <img src="${img}" alt="${p.title}">
            <div style="flex-grow: 1;">
              <h4 style="font-size: 0.85rem; margin-bottom: 0.2rem; color: #fff;">${p.title}</h4>
              <span style="font-size: 0.8rem; font-weight: 700; color: #aaa;">Rs. ${parseFloat(price).toLocaleString('en-IN')}</span>
            </div>
            <span style="font-size: 0.75rem; text-transform: uppercase; color: #fff; background: #222; padding: 0.3rem 0.6rem; border-radius: 2px;">VIEW</span>
          </a>
        `;
      }).join('');
    };
  },

  openSearch() {
    const modal = document.getElementById('search-modal');
    modal?.classList.add('active');
    setTimeout(() => document.getElementById('search-modal-input')?.focus(), 100);
    document.body.style.overflow = 'hidden';
  },

  closeSearch() {
    document.getElementById('search-modal')?.classList.remove('active');
    document.body.style.overflow = '';
  },

  // -------------------------------------------------------------
  // Countdown Timer
  // -------------------------------------------------------------
  setupCountdown() {
    const dEl = document.getElementById('cd-days');
    const hEl = document.getElementById('cd-hours');
    const mEl = document.getElementById('cd-mins');
    const sEl = document.getElementById('cd-secs');

    if (!dEl) return;

    // Set countdown target 24 hours into future
    const target = new Date();
    target.setHours(target.getHours() + 23);
    target.setMinutes(target.getMinutes() + 59);

    const update = () => {
      const now = new Date().getTime();
      const diff = target.getTime() - now;

      if (diff <= 0) {
        target.setDate(target.getDate() + 1);
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diff % (1000 * 60)) / 1000);

      dEl.textContent = String(days).padStart(2, '0');
      hEl.textContent = String(hours).padStart(2, '0');
      mEl.textContent = String(mins).padStart(2, '0');
      sEl.textContent = String(secs).padStart(2, '0');
    };

    update();
    setInterval(update, 1000);
  },

  // -------------------------------------------------------------
  // Announcement Slider
  // -------------------------------------------------------------
  setupAnnouncement() {
    const slider = document.getElementById('announcement-slider');
    if (!slider) return;

    let index = 0;
    const slides = slider.querySelectorAll('.announcement-slide');
    const total = slides.length;

    const goSlide = (i) => {
      index = (i + total) % total;
      slider.style.transform = `translateX(-${index * 100}%)`;
    };

    document.getElementById('ann-prev')?.addEventListener('click', () => goSlide(index - 1));
    document.getElementById('ann-next')?.addEventListener('click', () => goSlide(index + 1));

    setInterval(() => goSlide(index + 1), 4000);
  },

  // -------------------------------------------------------------
  // Toast Notifications
  // -------------------------------------------------------------
  showToast(message) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4cd964" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
      <span>${message}</span>
    `;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  },

  // -------------------------------------------------------------
  // Setup Global Listeners
  // -------------------------------------------------------------
  setupEventListeners() {
    // Open/Close Cart
    document.querySelectorAll('.cart-trigger').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        this.openCart();
      });
    });

    document.getElementById('cart-close')?.addEventListener('click', () => this.closeCart());
    document.getElementById('drawer-backdrop')?.addEventListener('click', () => {
      this.closeCart();
      this.closeMobileMenu();
    });

    // Search Trigger
    document.querySelectorAll('.search-trigger').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        this.openSearch();
      });
    });

    document.getElementById('search-modal-close')?.addEventListener('click', () => this.closeSearch());
    document.getElementById('quick-view-close')?.addEventListener('click', () => this.closeQuickView());

    // Mobile Drawer
    document.getElementById('mobile-menu-trigger')?.addEventListener('click', () => {
      document.getElementById('mobile-drawer')?.classList.add('active');
      document.getElementById('drawer-backdrop')?.classList.add('active');
    });

    document.getElementById('mobile-drawer-close')?.addEventListener('click', () => this.closeMobileMenu());

    // Escape Key closes modals
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeCart();
        this.closeSearch();
        this.closeQuickView();
        this.closeMobileMenu();
      }
    });

    this.setupSearch();
  },

  closeMobileMenu() {
    document.getElementById('mobile-drawer')?.classList.remove('active');
    document.getElementById('drawer-backdrop')?.classList.remove('active');
  }
};

// Auto start when DOM is ready
document.addEventListener('DOMContentLoaded', () => GenrageApp.init());
