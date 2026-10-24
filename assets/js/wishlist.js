/**
 * GENRAGE - Global Wishlist Engine
 * Handles client-side wishlist via localStorage and syncs with backend customer profile
 */

const WishlistEngine = {
  STORAGE_KEY: 'genrage_wishlist',
  _syncTimer: null,
  _observer: null,

  getWishlist() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY) || localStorage.getItem('wishlist');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      // Fallback: check genrage_user in localStorage if genrage_wishlist is empty
      const userRaw = localStorage.getItem('genrage_user');
      if (userRaw) {
        const u = JSON.parse(userRaw);
        if (Array.isArray(u.wishlist) && u.wishlist.length > 0) {
          const formatted = u.wishlist.map(item => typeof item === 'string' ? { handle: item, addedAt: new Date().toISOString() } : item);
          try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(formatted));
            localStorage.setItem('wishlist', JSON.stringify(formatted));
          } catch (e) {}
          return formatted;
        }
      }
      return [];
    } catch (e) {
      return [];
    }
  },

  has(handle) {
    if (!handle) return false;
    const cleanHandle = String(handle).split('?')[0].split('#')[0].trim();
    const list = this.getWishlist();
    return list.some(item => {
      const itemHandle = typeof item === 'string' ? item : item.handle;
      return itemHandle && String(itemHandle).split('?')[0].split('#')[0].trim() === cleanHandle;
    });
  },

  _lastToggleMap: {},

  toggle(handle, productData = null, event = null) {
    if (event) {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      if (typeof event.stopPropagation === 'function') event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    }
    if (!handle) return false;

    const cleanHandle = String(handle).split('?')[0].split('#')[0].trim();

    // Prevent duplicate toggle within 300ms for the same product (e.g. multi-events / rapid clicks)
    const now = Date.now();
    if (this._lastToggleMap[cleanHandle] && (now - this._lastToggleMap[cleanHandle] < 300)) {
      return this.has(cleanHandle);
    }
    this._lastToggleMap[cleanHandle] = now;

    // Instant Optimistic Toggle
    let list = this.getWishlist();
    const existingIndex = list.findIndex(item => {
      const itemHandle = typeof item === 'string' ? item : item.handle;
      return itemHandle && String(itemHandle).split('?')[0].split('#')[0].trim() === cleanHandle;
    });
    let isAdded = false;

    if (existingIndex > -1) {
      list.splice(existingIndex, 1);
      this.showToast('✕ Removed from Wishlist', false);
    } else {
      const itemToSave = productData ? {
        handle: cleanHandle,
        title: productData.title || cleanHandle,
        price: productData.price || '',
        compare_at_price: productData.compare_at_price || '',
        image: productData.image || '',
        addedAt: new Date().toISOString()
      } : { handle: cleanHandle, addedAt: new Date().toISOString() };
      list.push(itemToSave);
      isAdded = true;
      this.showToast('♥ Saved to Wishlist!', true);
    }

    // Immediately persist to localStorage
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(list));
      localStorage.setItem('wishlist', JSON.stringify(list));

      // Synchronously update genrage_user.wishlist so other components never read stale state
      const userRaw = localStorage.getItem('genrage_user');
      if (userRaw) {
        const u = JSON.parse(userRaw);
        u.wishlist = list.map(item => typeof item === 'string' ? item : item.handle).filter(Boolean);
        localStorage.setItem('genrage_user', JSON.stringify(u));
      }
    } catch (e) {}

    // Instant UI DOM update
    this.updateButtons(cleanHandle, isAdded);
    this.updateBadge();

    // Pulse animation for tactile feedback
    const buttons = document.querySelectorAll(`[data-wishlist-handle="${cleanHandle}"]`);
    buttons.forEach(btn => {
      btn.style.transform = 'scale(1.25)';
      setTimeout(() => { btn.style.transform = ''; }, 160);
    });

    // Synchronize to server immediately with keepalive so page unload won't cancel it
    this.syncWithServer();

    // Notify listeners of change
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wishlist:updated', { detail: { count: list.length, wishlist: list } }));
      if (typeof window.loadWishlist === 'function') {
        window.loadWishlist();
      }
    }

    return isAdded;
  },

  updateButtons(handle, isWishlisted) {
    const cleanHandle = String(handle).split('?')[0].split('#')[0].trim();
    const buttons = document.querySelectorAll(`[data-wishlist-handle="${cleanHandle}"]`);
    const targetPressed = isWishlisted ? 'true' : 'false';
    buttons.forEach(btn => {
      const currentPressed = btn.getAttribute('aria-pressed');
      if (currentPressed !== targetPressed) {
        btn.setAttribute('aria-pressed', targetPressed);
        btn.setAttribute('aria-label', isWishlisted ? 'Remove from wishlist' : 'Add to wishlist');
        btn.classList.toggle('is-wishlisted', isWishlisted);
        btn.innerHTML = this.getHeartSvg(isWishlisted);
      }
    });
  },

  getHeartSvg(filled) {
    if (filled) {
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="#e50914" stroke="#e50914" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="heart-icon heart-icon--filled"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`;
    }
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="heart-icon heart-icon--outline"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`;
  },

  renderButtons() {
    const list = this.getWishlist();
    const handles = new Set(list.map(i => {
      const h = typeof i === 'string' ? i : i.handle;
      return h ? String(h).split('?')[0].split('#')[0].trim() : '';
    }));

    document.querySelectorAll('[data-wishlist-handle]').forEach(btn => {
      const h = btn.getAttribute('data-wishlist-handle');
      const cleanHandle = h ? String(h).split('?')[0].split('#')[0].trim() : '';
      const isWishlisted = handles.has(cleanHandle);
      const targetPressed = isWishlisted ? 'true' : 'false';
      const currentPressed = btn.getAttribute('aria-pressed');
      if (currentPressed !== targetPressed) {
        btn.setAttribute('aria-pressed', targetPressed);
        btn.setAttribute('aria-label', isWishlisted ? 'Remove from wishlist' : 'Add to wishlist');
        btn.classList.toggle('is-wishlisted', isWishlisted);
        btn.innerHTML = this.getHeartSvg(isWishlisted);
      }
    });

    this.updateBadge();
  },

  updateBadge() {
    const count = this.getWishlist().length;
    document.querySelectorAll('.wishlist-count-badge, #header-wishlist-badge, #wishlist-count').forEach(badge => {
      badge.textContent = count;
      badge.style.display = count > 0 ? 'inline-flex' : 'none';
    });
  },

  loadUserWishlist(user) {
    if (!user) return;
    const cloudWish = Array.isArray(user.wishlist) ? user.wishlist : [];
    let localList = this.getWishlist();
    
    const localHandles = new Set(localList.map(i => {
      const h = typeof i === 'string' ? i : i.handle;
      return h ? String(h).split('?')[0].split('#')[0].trim() : '';
    }).filter(Boolean));

    let updated = false;
    for (const item of cloudWish) {
      const h = typeof item === 'string' ? item : item.handle;
      const cleanH = h ? String(h).split('?')[0].split('#')[0].trim() : '';
      if (cleanH && !localHandles.has(cleanH)) {
        localList.push(typeof item === 'string' ? { handle: cleanH, addedAt: new Date().toISOString() } : item);
        localHandles.add(cleanH);
        updated = true;
      }
    }

    if (updated || (localList.length === 0 && cloudWish.length > 0)) {
      if (localList.length === 0 && cloudWish.length > 0) {
        localList = cloudWish.map(item => typeof item === 'string' ? { handle: item, addedAt: new Date().toISOString() } : item);
      }
      try {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(localList));
        localStorage.setItem('wishlist', JSON.stringify(localList));
      } catch (e) {}
    }

    this.renderButtons();
    this.updateBadge();

    // Trigger page re-renders across views
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wishlist:updated', { detail: { count: localList.length, wishlist: localList } }));
      if (typeof window.loadWishlist === 'function') {
        window.loadWishlist();
      }
      if (window.CollectionEngine && typeof window.CollectionEngine.filterAndRender === 'function') {
        window.CollectionEngine.filterAndRender();
      }
    }

    // If local had new items not yet in cloud, sync to server
    if (localList.length > cloudWish.length) {
      this.syncWithServer();
    }
  },

  async syncWithServer() {
    try {
      const userRaw = localStorage.getItem('genrage_user');
      if (!userRaw) return;
      const user = JSON.parse(userRaw);
      if (!user || (!user.id && !user.email)) return;

      const wishlist = this.getWishlist();
      const cleanHandles = Array.from(new Set(wishlist.map(i => typeof i === 'string' ? i : i.handle).filter(Boolean)));
      const identifier = user.id || user.email;

      // Ensure local genrage_user has the updated wishlist array
      user.wishlist = cleanHandles;
      try { localStorage.setItem('genrage_user', JSON.stringify(user)); } catch (e) {}

      // Keepalive ensures request completes even if user navigates away or closes tab!
      fetch('/api/wishlist/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: identifier, email: user.email, wishlist: cleanHandles }),
        keepalive: true
      }).catch(() => {});
    } catch (e) {
      console.warn('Could not sync wishlist to backend:', e.message);
    }
  },

  showToast(message, isAdded = false) {
    let toast = document.getElementById('wishlist-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'wishlist-toast';
      toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        background: #000;
        color: #fff;
        padding: 12px 18px;
        border-radius: 4px;
        font-family: inherit;
        font-size: 0.85rem;
        font-weight: 700;
        letter-spacing: 0.03em;
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        z-index: 100000;
        display: flex;
        align-items: center;
        gap: 12px;
        border: 1px solid rgba(255,255,255,0.25);
        opacity: 0;
        transform: translateY(10px);
        transition: opacity 0.2s, transform 0.2s;
        pointer-events: auto;
      `;
      document.body.appendChild(toast);
    }

    if (isAdded) {
      toast.innerHTML = `
        <span style="display:inline-flex; align-items:center; gap:6px;">${message}</span>
        <a href="/collections/shop?view=wishlist" style="color:#ffffff; background:#e50914; padding:5px 12px; border-radius:2px; text-decoration:none; font-size:0.75rem; font-weight:800; letter-spacing:0.05em; text-transform:uppercase; margin-left:6px; white-space:nowrap; display:inline-block; transition: background 0.15s;" onmouseover="this.style.background='#ff1f2d'" onmouseout="this.style.background='#e50914'">VIEW WISHLIST →</a>
      `;
    } else {
      toast.innerHTML = `<span>${message}</span>`;
    }

    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';

    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
    }, 3200);
  },

  decorateCards() {
    try {
      // Purge any third-party app injected buttons
      document.querySelectorAll('.vitals-wishlist, .sqa-wishlist, [class*="wishlist-by-square"], .swym-button, .swym-btn-container').forEach(el => el.remove());

      const list = this.getWishlist();
      const handles = new Set(list.map(i => {
        const h = typeof i === 'string' ? i : i.handle;
        return h ? String(h).split('?')[0].split('#')[0].trim() : '';
      }));

      document.querySelectorAll('product-card, .product-card').forEach(card => {
        // Deduplicate: if multiple buttons exist on the card, keep only one
        const existingBtns = card.querySelectorAll('.wishlist-btn');
        if (existingBtns.length > 1) {
          for (let i = 1; i < existingBtns.length; i++) {
            existingBtns[i].remove();
          }
        }

        const rawHandle = card.getAttribute('handle') || card.querySelector('a[href*="/products/"]')?.getAttribute('href')?.split('/products/')?.[1]?.split('?')?.[0];
        if (!rawHandle) return;
        const cleanHandle = String(rawHandle).split('?')[0].split('#')[0].trim();
        const isWishlisted = handles.has(cleanHandle);
        const targetPressed = isWishlisted ? 'true' : 'false';

        if (existingBtns.length >= 1) {
          const btn = existingBtns[0];
          const curHandle = btn.getAttribute('data-wishlist-handle');
          const curPressed = btn.getAttribute('aria-pressed');
          if (curHandle !== cleanHandle) btn.setAttribute('data-wishlist-handle', cleanHandle);
          if (curPressed !== targetPressed) {
            btn.setAttribute('aria-pressed', targetPressed);
            btn.setAttribute('aria-label', isWishlisted ? 'Remove from wishlist' : 'Add to wishlist');
            btn.classList.toggle('is-wishlisted', isWishlisted);
            btn.innerHTML = this.getHeartSvg(isWishlisted);
          }
          return;
        }

        const figure = card.querySelector('.product-card__figure') || card;
        if (!figure) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'wishlist-btn' + (isWishlisted ? ' is-wishlisted' : '');
        btn.setAttribute('data-wishlist-handle', cleanHandle);
        btn.setAttribute('aria-label', isWishlisted ? 'Remove from wishlist' : 'Add to wishlist');
        btn.setAttribute('aria-pressed', targetPressed);
        btn.innerHTML = this.getHeartSvg(isWishlisted);

        // Bind direct click and pointer down handlers to guarantee isolation from carousel drag
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          handleWishlistTrigger(btn, e);
        });

        ['pointerdown', 'mousedown', 'touchstart', 'touchend', 'mouseup'].forEach(evt => {
          btn.addEventListener(evt, (e) => {
            e.stopPropagation();
          }, { passive: evt === 'touchstart' || evt === 'touchend', capture: true });
        });

        figure.style.position = 'relative';
        figure.appendChild(btn);
      });
    } catch (e) {}
  },

  init() {
    this.renderButtons();
    this.decorateCards();
    
    // Auto cloud-fetch for logged in user to hydrate multi-device wishlist
    try {
      const userRaw = localStorage.getItem('genrage_user');
      if (userRaw) {
        const user = JSON.parse(userRaw);
        if (user && user.id) {
          fetch(`/api/wishlist?userId=${encodeURIComponent(user.id)}`)
            .then(r => r.json())
            .then(data => {
              if (data && data.success && Array.isArray(data.wishlist) && data.wishlist.length > 0) {
                this.loadUserWishlist({ wishlist: data.wishlist });
              }
            })
            .catch(() => {});
        }
      }
    } catch (e) {}

    // Multiple delayed sweeps to ensure asynchronous cards get decorated
    [300, 800, 1500, 3000].forEach(delay => {
      setTimeout(() => {
        this.renderButtons();
        this.decorateCards();
      }, delay);
    });

    // Auto-observe DOM mutations ONLY for genuinely added product cards
    if (typeof MutationObserver !== 'undefined' && document.body && !this._observer) {
      let debounceTimer = null;
      this._observer = new MutationObserver((mutations) => {
        let hasNewCards = false;
        for (const m of mutations) {
          if (m.type === 'childList' && m.addedNodes.length > 0) {
            for (const n of m.addedNodes) {
              if (n.nodeType === 1) {
                if (n.tagName === 'PRODUCT-CARD' || n.classList?.contains('product-card') || n.querySelector?.('product-card, .product-card')) {
                  hasNewCards = true;
                  break;
                }
              }
            }
          }
          if (hasNewCards) break;
        }
        if (!hasNewCards) return;

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          this.renderButtons();
          this.decorateCards();
        }, 150);
      });
      this._observer.observe(document.body, { childList: true, subtree: true });
    }
  }
};

function handleWishlistTrigger(btn, e) {
  if (e) {
    if (typeof e.preventDefault === 'function') e.preventDefault();
    if (typeof e.stopPropagation === 'function') e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
  }
  const handle = btn.getAttribute('data-wishlist-handle');
  if (!handle) return;
  const card = btn.closest('product-card') || btn.closest('.product-card') || btn.closest('.product-card__figure')?.parentElement;
  const title = card ? (card.querySelector('.product-title, h6')?.textContent?.trim() || handle) : handle;
  
  // Pick the single sale price or regular price cleanly, avoiding combined concatenated strings
  const priceEl = card ? (card.querySelector('sale-price .money') || card.querySelector('.text-on-sale .money') || card.querySelector('.price-list .money') || card.querySelector('.money')) : null;
  const price = priceEl ? priceEl.textContent.replace(/[^0-9]/g, '') : '';
  const imgEl = card ? card.querySelector('.product-card__image--primary') : null;
  const image = imgEl ? (imgEl.currentSrc || imgEl.src) : '';
  WishlistEngine.toggle(handle, { title, price, image }, e);
}

// Global capture listeners to intercept pointer/mouse events on wishlist buttons
// This stops <scroll-carousel> from interpreting clicks as drags!
['pointerdown', 'mousedown', 'touchstart', 'touchend', 'mouseup'].forEach(evt => {
  document.addEventListener(evt, (e) => {
    const btn = e.target.closest('.wishlist-btn');
    if (btn) {
      e.stopPropagation();
    }
  }, true);
});

// Unified infallible click capture handler for all devices (laptops, desktops, touchscreens)
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.wishlist-btn');
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  handleWishlistTrigger(btn, e);
}, true);

document.addEventListener('DOMContentLoaded', () => {
  WishlistEngine.init();
});

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  WishlistEngine.init();
}

if (typeof window !== 'undefined') {
  window.WishlistEngine = WishlistEngine;
}
