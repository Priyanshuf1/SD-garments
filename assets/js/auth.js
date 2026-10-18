/**
 * GENRAGE - Global Storefront Authentication Engine
 * Manages JWT/session tokens, login/signup modals, profile state, and header integration
 */

const AuthEngine = {
  USER_KEY: 'genrage_user',
  TOKEN_KEY: 'genrage_token',

  getUser() {
    try {
      const raw = localStorage.getItem(this.USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },

  getToken() {
    return localStorage.getItem(this.TOKEN_KEY) || null;
  },

  isLoggedIn() {
    return !!this.getUser();
  },

  async login(email, password) {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (data.success && data.user) {
        localStorage.setItem(this.USER_KEY, JSON.stringify(data.user));
        if (data.token) localStorage.setItem(this.TOKEN_KEY, data.token);
        this.updateHeader();
        if (window.WishlistEngine) {
          window.WishlistEngine.syncWithServer();
        }
        return { success: true, user: data.user };
      }
      return { success: false, message: data.message || 'Login failed' };
    } catch (err) {
      return { success: false, message: 'Network error during login' };
    }
  },

  async signup(userData) {
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      });
      const data = await res.json();
      if (data.success && data.user) {
        localStorage.setItem(this.USER_KEY, JSON.stringify(data.user));
        if (data.token) localStorage.setItem(this.TOKEN_KEY, data.token);
        this.updateHeader();
        return { success: true, user: data.user };
      }
      return { success: false, message: data.message || 'Signup failed' };
    } catch (err) {
      return { success: false, message: 'Network error during registration' };
    }
  },

  async logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {}
    localStorage.removeItem(this.USER_KEY);
    localStorage.removeItem(this.TOKEN_KEY);
    this.updateHeader();
    if (window.location.pathname.includes('/account')) {
      window.location.href = '/';
    }
  },

  updateHeader() {
    const user = this.getUser();
    document.querySelectorAll('.header-account-link, shopify-account, [data-account-trigger]').forEach(el => {
      if (user) {
        const firstName = (user.name || 'Account').split(' ')[0];
        el.setAttribute('href', '/account');
        el.innerHTML = `
          <div style="display:flex; align-items:center; gap:6px; text-decoration:none; color:inherit; font-weight:700; font-size:0.8rem; letter-spacing:0.04em; text-transform:uppercase;">
            <span style="display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; border-radius:50%; background:#111; color:#fff; font-size:0.75rem; font-weight:800;">
              ${firstName.charAt(0).toUpperCase()}
            </span>
            <span class="sm-max:hidden">${firstName}</span>
          </div>
        `;
        el.onclick = (e) => {
          // let normal navigation to /account happen
        };
      } else {
        el.setAttribute('href', '/login');
        el.innerHTML = `
          <svg aria-hidden="true" fill="none" focusable="false" width="22" height="22" class="header__nav-icon icon icon-account" viewBox="0 0 24 24">
            <path d="M16.125 8.75c-.184 2.478-2.063 4.5-4.125 4.5s-3.944-2.021-4.125-4.5c-.187-2.578 1.64-4.5 4.125-4.5 2.484 0 4.313 1.969 4.125 4.5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M3.017 20.747C3.783 16.5 7.922 14.25 12 14.25s8.217 2.25 8.984 6.497" stroke="currentColor" stroke-width="2" stroke-miterlimit="10"/>
          </svg>
        `;
        el.onclick = (e) => {
          if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/account')) {
            e.preventDefault();
            this.openAuthModal();
          }
        };
      }
    });
  },

  openAuthModal(defaultTab = 'login') {
    let modal = document.getElementById('genrage-auth-modal');
    if (!modal) {
      this.injectModalDom();
      modal = document.getElementById('genrage-auth-modal');
    }
    this.switchTab(defaultTab);
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  },

  closeAuthModal() {
    const modal = document.getElementById('genrage-auth-modal');
    if (modal) {
      modal.style.display = 'none';
      document.body.style.overflow = '';
    }
  },

  switchTab(tab) {
    const loginForm = document.getElementById('auth-form-login');
    const signupForm = document.getElementById('auth-form-signup');
    const tabLogin = document.getElementById('auth-tab-login');
    const tabSignup = document.getElementById('auth-tab-signup');
    const errorBox = document.getElementById('auth-error-msg');
    if (errorBox) errorBox.style.display = 'none';

    if (tab === 'login') {
      if (loginForm) loginForm.style.display = 'block';
      if (signupForm) signupForm.style.display = 'none';
      if (tabLogin) tabLogin.style.borderBottom = '2px solid #000';
      if (tabSignup) tabSignup.style.borderBottom = '2px solid transparent';
    } else {
      if (loginForm) loginForm.style.display = 'none';
      if (signupForm) signupForm.style.display = 'block';
      if (tabLogin) tabLogin.style.borderBottom = '2px solid transparent';
      if (tabSignup) tabSignup.style.borderBottom = '2px solid #000';
    }
  },

  injectModalDom() {
    const modal = document.createElement('div');
    modal.id = 'genrage-auth-modal';
    modal.style.cssText = `
      position:fixed; inset:0; z-index:99999;
      background:rgba(0,0,0,0.65); backdrop-filter:blur(6px);
      display:none; align-items:center; justify-content:center;
      padding:1.5rem;
    `;

    modal.innerHTML = `
      <div style="background:#fff; color:#111; width:min(440px, 100%); border-radius:4px; padding:2rem; box-shadow:0 20px 50px rgba(0,0,0,0.3); position:relative; font-family:inherit;">
        <button type="button" onclick="AuthEngine.closeAuthModal()" style="position:absolute; top:16px; right:16px; background:none; border:none; font-size:1.5rem; cursor:pointer; color:#777; line-height:1;">✕</button>
        
        <div style="text-align:center; margin-bottom:1.5rem;">
          <h2 style="font-size:1.4rem; font-weight:800; letter-spacing:-0.02em; text-transform:uppercase; margin:0 0 4px;">GENRAGE CLUB</h2>
          <p style="color:#666; font-size:0.8rem; margin:0;">Access your VIP drops, orders, and wishlist</p>
        </div>

        <div style="display:flex; border-bottom:1px solid #eee; margin-bottom:1.5rem;">
          <button id="auth-tab-login" onclick="AuthEngine.switchTab('login')" style="flex:1; background:none; border:none; padding:10px; font-weight:700; font-size:0.85rem; text-transform:uppercase; cursor:pointer; border-bottom:2px solid #000;">Sign In</button>
          <button id="auth-tab-signup" onclick="AuthEngine.switchTab('signup')" style="flex:1; background:none; border:none; padding:10px; font-weight:700; font-size:0.85rem; text-transform:uppercase; cursor:pointer; border-bottom:2px solid transparent; color:#666;">Create Account</button>
        </div>

        <div id="auth-error-msg" style="display:none; background:#fee; color:#c00; padding:8px 12px; border-radius:3px; font-size:0.8rem; margin-bottom:1rem; font-weight:600;"></div>

        <!-- Login Form -->
        <form id="auth-form-login" onsubmit="AuthEngine.handleLoginSubmit(event)">
          <div style="margin-bottom:1rem;">
            <label style="display:block; font-size:0.75rem; font-weight:700; text-transform:uppercase; margin-bottom:4px; color:#444;">Email Address</label>
            <input type="email" id="login-email" required placeholder="name@example.com" style="width:100%; box-sizing:border-box; padding:10px 12px; border:1px solid #ccc; border-radius:2px; font-size:0.9rem; outline:none;">
          </div>
          <div style="margin-bottom:1.25rem;">
            <label style="display:block; font-size:0.75rem; font-weight:700; text-transform:uppercase; margin-bottom:4px; color:#444;">Password</label>
            <input type="password" id="login-password" required placeholder="••••••••" style="width:100%; box-sizing:border-box; padding:10px 12px; border:1px solid #ccc; border-radius:2px; font-size:0.9rem; outline:none;">
            <div style="text-align:right; margin-top:4px;">
              <span style="font-size:0.75rem; color:#888;">(Default: password123)</span>
            </div>
          </div>
          <button type="submit" id="btn-login-submit" style="width:100%; background:#000; color:#fff; border:none; padding:12px; font-weight:800; font-size:0.85rem; letter-spacing:0.06em; text-transform:uppercase; border-radius:2px; cursor:pointer;">SIGN IN</button>
        </form>

        <!-- Signup Form -->
        <form id="auth-form-signup" style="display:none;" onsubmit="AuthEngine.handleSignupSubmit(event)">
          <div style="margin-bottom:0.85rem;">
            <label style="display:block; font-size:0.75rem; font-weight:700; text-transform:uppercase; margin-bottom:4px; color:#444;">Full Name</label>
            <input type="text" id="signup-name" required placeholder="Kabir Singhania" style="width:100%; box-sizing:border-box; padding:10px 12px; border:1px solid #ccc; border-radius:2px; font-size:0.9rem; outline:none;">
          </div>
          <div style="margin-bottom:0.85rem;">
            <label style="display:block; font-size:0.75rem; font-weight:700; text-transform:uppercase; margin-bottom:4px; color:#444;">Email Address</label>
            <input type="email" id="signup-email" required placeholder="kabir@example.com" style="width:100%; box-sizing:border-box; padding:10px 12px; border:1px solid #ccc; border-radius:2px; font-size:0.9rem; outline:none;">
          </div>
          <div style="margin-bottom:0.85rem;">
            <label style="display:block; font-size:0.75rem; font-weight:700; text-transform:uppercase; margin-bottom:4px; color:#444;">Phone Number</label>
            <input type="tel" id="signup-phone" placeholder="+91 98200 00000" style="width:100%; box-sizing:border-box; padding:10px 12px; border:1px solid #ccc; border-radius:2px; font-size:0.9rem; outline:none;">
          </div>
          <div style="margin-bottom:1.25rem;">
            <label style="display:block; font-size:0.75rem; font-weight:700; text-transform:uppercase; margin-bottom:4px; color:#444;">Password</label>
            <input type="password" id="signup-password" required placeholder="Choose a password" style="width:100%; box-sizing:border-box; padding:10px 12px; border:1px solid #ccc; border-radius:2px; font-size:0.9rem; outline:none;">
          </div>
          <button type="submit" id="btn-signup-submit" style="width:100%; background:#000; color:#fff; border:none; padding:12px; font-weight:800; font-size:0.85rem; letter-spacing:0.06em; text-transform:uppercase; border-radius:2px; cursor:pointer;">CREATE ACCOUNT</button>
        </form>
      </div>
    `;

    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.closeAuthModal();
    });
  },

  async handleLoginSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errBox = document.getElementById('auth-error-msg');
    const submitBtn = document.getElementById('btn-login-submit');

    submitBtn.textContent = 'SIGNING IN...';
    submitBtn.disabled = true;

    const res = await this.login(email, password);
    submitBtn.textContent = 'SIGN IN';
    submitBtn.disabled = false;

    if (res.success) {
      this.closeAuthModal();
      if (window.location.pathname.includes('/login')) {
        window.location.href = '/account';
      }
    } else {
      errBox.textContent = res.message || 'Login failed';
      errBox.style.display = 'block';
    }
  },

  async handleSignupSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const phone = document.getElementById('signup-phone').value;
    const password = document.getElementById('signup-password').value;
    const errBox = document.getElementById('auth-error-msg');
    const submitBtn = document.getElementById('btn-signup-submit');

    submitBtn.textContent = 'CREATING...';
    submitBtn.disabled = true;

    const res = await this.signup({ name, email, phone, password });
    submitBtn.textContent = 'CREATE ACCOUNT';
    submitBtn.disabled = false;

    if (res.success) {
      this.closeAuthModal();
      if (window.location.pathname.includes('/login')) {
        window.location.href = '/account';
      }
    } else {
      errBox.textContent = res.message || 'Signup failed';
      errBox.style.display = 'block';
    }
  },

  init() {
    this.updateHeader();
  }
};

document.addEventListener('DOMContentLoaded', () => {
  AuthEngine.init();
});

if (typeof window !== 'undefined') {
  window.AuthEngine = AuthEngine;
}
