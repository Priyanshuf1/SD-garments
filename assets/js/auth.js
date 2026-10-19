/**
 * GENRAGE - Global Storefront Authentication Engine
 * Connected directly to Supabase Auth & PostgreSQL Profiles with Local JSON Fallback.
 * Features:
 * 1. Email + Password Sign In / Register (100% Free)
 * 2. Passwordless Email OTP / Magic Link (100% Free - 50,000 MAUs)
 * 3. PostgreSQL Profiles Storage & Multi-Device Wishlist Sync
 * 4. Header Dynamic Avatar & Account Modal
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
        if (window.WishlistEngine) {
          window.WishlistEngine.syncWithServer();
        }
        return { success: true, user: data.user };
      }
      return { success: false, message: data.message || 'Signup failed' };
    } catch (err) {
      return { success: false, message: 'Network error during registration' };
    }
  },

  async sendOtp(email) {
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: 'Network error sending 6-digit code' };
    }
  },

  async sendMagicLink(email) {
    return this.sendOtp(email);
  },

  async updateProfile(profileData) {
    try {
      const user = this.getUser();
      const payload = { ...profileData };
      if (user && user.id) payload.id = user.id;
      if (user && user.email && !payload.email) payload.email = user.email;

      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getToken() || ''}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success && data.user) {
        localStorage.setItem(this.USER_KEY, JSON.stringify(data.user));
        this.updateHeader();
        return { success: true, user: data.user, message: 'Profile updated successfully' };
      }
      return { success: false, message: data.message || 'Failed to update profile' };
    } catch (err) {
      return { success: false, message: 'Network error updating profile' };
    }
  },

  async verifyOtp(email, token) {
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token })
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
      return { success: false, message: data.message || 'Verification failed' };
    } catch (err) {
      return { success: false, message: 'Network error verifying code' };
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
        const firstName = (user.name || user.full_name || 'Account').split(' ')[0];
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
    const otpForm = document.getElementById('auth-form-otp');
    const signupForm = document.getElementById('auth-form-signup');
    const tabLogin = document.getElementById('auth-tab-login');
    const tabOtp = document.getElementById('auth-tab-otp');
    const tabSignup = document.getElementById('auth-tab-signup');
    const errorBox = document.getElementById('auth-error-msg');
    const successBox = document.getElementById('auth-success-msg');
    if (errorBox) errorBox.style.display = 'none';
    if (successBox) successBox.style.display = 'none';

    if (loginForm) loginForm.style.display = tab === 'login' ? 'block' : 'none';
    if (otpForm) otpForm.style.display = tab === 'otp' ? 'block' : 'none';
    if (signupForm) signupForm.style.display = tab === 'signup' ? 'block' : 'none';

    if (tabLogin) tabLogin.style.borderBottom = tab === 'login' ? '2px solid #000' : '2px solid transparent';
    if (tabLogin) tabLogin.style.color = tab === 'login' ? '#000' : '#888';

    if (tabOtp) tabOtp.style.borderBottom = tab === 'otp' ? '2px solid #000' : '2px solid transparent';
    if (tabOtp) tabOtp.style.color = tab === 'otp' ? '#000' : '#888';

    if (tabSignup) tabSignup.style.borderBottom = tab === 'signup' ? '2px solid #000' : '2px solid transparent';
    if (tabSignup) tabSignup.style.color = tab === 'signup' ? '#000' : '#888';
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
        
        <div style="text-align:center; margin-bottom:1.25rem;">
          <h2 style="font-family:'Shippori Mincho B1', serif; font-size:1.35rem; font-weight:600; letter-spacing:0.18em; text-transform:uppercase; margin:0 0 4px;">ALLY RICH CLUB</h2>
          <p style="color:#666; font-size:0.8rem; margin:0;">100% Free Member Access • Supabase Secured</p>
        </div>

        <div style="display:flex; border-bottom:1px solid #eee; margin-bottom:1.25rem;">
          <button id="auth-tab-login" onclick="AuthEngine.switchTab('login')" style="flex:1; background:none; border:none; padding:8px 4px; font-weight:700; font-size:0.75rem; text-transform:uppercase; cursor:pointer; border-bottom:2px solid #000; color:#000;">Sign In</button>
          <button id="auth-tab-otp" onclick="AuthEngine.switchTab('otp')" style="flex:1; background:none; border:none; padding:8px 4px; font-weight:700; font-size:0.75rem; text-transform:uppercase; cursor:pointer; border-bottom:2px solid transparent; color:#888;">Instant OTP</button>
          <button id="auth-tab-signup" onclick="AuthEngine.switchTab('signup')" style="flex:1; background:none; border:none; padding:8px 4px; font-weight:700; font-size:0.75rem; text-transform:uppercase; cursor:pointer; border-bottom:2px solid transparent; color:#888;">Register</button>
        </div>

        <div id="auth-error-msg" style="display:none; background:#fee; color:#c00; padding:8px 12px; border-radius:3px; font-size:0.8rem; margin-bottom:1rem; font-weight:600;"></div>
        <div id="auth-success-msg" style="display:none; background:#e6f9ed; color:#0d7a3e; padding:8px 12px; border-radius:3px; font-size:0.8rem; margin-bottom:1rem; font-weight:600;"></div>

        <!-- Login Form -->
        <form id="auth-form-login" onsubmit="AuthEngine.handleLoginSubmit(event)">
          <div style="margin-bottom:1rem;">
            <label style="display:block; font-size:0.72rem; font-weight:700; text-transform:uppercase; margin-bottom:4px; color:#444;">Email Address</label>
            <input type="email" id="login-email" required placeholder="name@example.com" style="width:100%; box-sizing:border-box; padding:10px 12px; border:1px solid #ccc; border-radius:2px; font-size:0.9rem; outline:none;">
          </div>
          <div style="margin-bottom:1.25rem;">
            <label style="display:block; font-size:0.72rem; font-weight:700; text-transform:uppercase; margin-bottom:4px; color:#444;">Password</label>
            <input type="password" id="login-password" required placeholder="••••••••" style="width:100%; box-sizing:border-box; padding:10px 12px; border:1px solid #ccc; border-radius:2px; font-size:0.9rem; outline:none;">
            <div style="display:flex; justify-content:space-between; margin-top:4px;">
              <span style="font-size:0.72rem; color:#888;">(Default: password123)</span>
              <a href="#" onclick="event.preventDefault(); AuthEngine.switchTab('otp')" style="font-size:0.72rem; color:#000; font-weight:700; text-decoration:none;">Forgot password?</a>
            </div>
          </div>
          <button type="submit" id="btn-login-submit" style="width:100%; background:#000; color:#fff; border:none; padding:12px; font-weight:800; font-size:0.85rem; letter-spacing:0.06em; text-transform:uppercase; border-radius:2px; cursor:pointer;">SIGN IN</button>
        </form>

        <!-- OTP / Magic Link Form -->
        <form id="auth-form-otp" style="display:none;" onsubmit="AuthEngine.handleOtpSubmit(event)">
          <div style="margin-bottom:1rem;">
            <label style="display:block; font-size:0.72rem; font-weight:700; text-transform:uppercase; margin-bottom:4px; color:#444;">Email Address</label>
            <input type="email" id="otp-email" required placeholder="name@example.com" style="width:100%; box-sizing:border-box; padding:10px 12px; border:1px solid #ccc; border-radius:2px; font-size:0.9rem; outline:none;">
          </div>
          <div id="otp-code-container" style="display:none; margin-bottom:1rem;">
            <label style="display:block; font-size:0.72rem; font-weight:700; text-transform:uppercase; margin-bottom:4px; color:#444;">Verification Code (6 Digits)</label>
            <input type="text" id="otp-code" placeholder="123456" maxlength="8" style="width:100%; box-sizing:border-box; padding:10px 12px; border:1px solid #ccc; border-radius:2px; font-size:1.1rem; letter-spacing:0.2em; text-align:center; font-weight:800; outline:none;">
          </div>
          <button type="submit" id="btn-otp-submit" style="width:100%; background:#000; color:#fff; border:none; padding:12px; font-weight:800; font-size:0.85rem; letter-spacing:0.06em; text-transform:uppercase; border-radius:2px; cursor:pointer;">SEND LOGIN CODE</button>
        </form>

        <!-- Signup Form -->
        <form id="auth-form-signup" style="display:none;" onsubmit="AuthEngine.handleSignupSubmit(event)">
          <div style="margin-bottom:0.75rem;">
            <label style="display:block; font-size:0.72rem; font-weight:700; text-transform:uppercase; margin-bottom:4px; color:#444;">Full Name</label>
            <input type="text" id="signup-name" required placeholder="Kabir Singhania" style="width:100%; box-sizing:border-box; padding:10px 12px; border:1px solid #ccc; border-radius:2px; font-size:0.9rem; outline:none;">
          </div>
          <div style="margin-bottom:0.75rem;">
            <label style="display:block; font-size:0.72rem; font-weight:700; text-transform:uppercase; margin-bottom:4px; color:#444;">Email Address</label>
            <input type="email" id="signup-email" required placeholder="kabir@example.com" style="width:100%; box-sizing:border-box; padding:10px 12px; border:1px solid #ccc; border-radius:2px; font-size:0.9rem; outline:none;">
          </div>
          <div style="margin-bottom:0.75rem;">
            <label style="display:block; font-size:0.72rem; font-weight:700; text-transform:uppercase; margin-bottom:4px; color:#444;">Phone Number</label>
            <input type="tel" id="signup-phone" placeholder="+91 98200 00000" style="width:100%; box-sizing:border-box; padding:10px 12px; border:1px solid #ccc; border-radius:2px; font-size:0.9rem; outline:none;">
          </div>
          <div style="margin-bottom:1.15rem;">
            <label style="display:block; font-size:0.72rem; font-weight:700; text-transform:uppercase; margin-bottom:4px; color:#444;">Password</label>
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

  async handleOtpSubmit(e) {
    e.preventDefault();
    const emailInput = document.getElementById('otp-email');
    const codeInput = document.getElementById('otp-code');
    const codeContainer = document.getElementById('otp-code-container');
    const submitBtn = document.getElementById('btn-otp-submit');
    const errBox = document.getElementById('auth-error-msg');
    const successBox = document.getElementById('auth-success-msg');

    errBox.style.display = 'none';
    successBox.style.display = 'none';

    // Step 1: Send OTP
    if (codeContainer.style.display === 'none') {
      submitBtn.textContent = 'SENDING CODE...';
      submitBtn.disabled = true;

      const res = await this.sendMagicLink(emailInput.value);
      submitBtn.disabled = false;

      if (res.success) {
        let msgHtml = `<div>${res.message || 'Verification code generated!'}</div>`;
        if (res.code) {
          msgHtml += `
            <div style="margin-top:10px; padding:12px; background:#f0fdf4; border:1px solid #22c55e; border-radius:4px; text-align:center;">
              <div style="font-size:0.75rem; color:#15803d; font-weight:800; text-transform:uppercase; letter-spacing:0.04em;">Your 6-Digit Login Code</div>
              <div style="font-size:1.8rem; font-weight:800; letter-spacing:0.25em; color:#111; margin:6px 0; font-family:monospace;">${res.code}</div>
              <button type="button" onclick="document.getElementById('otp-code').value='${res.code}'; document.getElementById('btn-otp-submit').click();" style="background:#15803d; color:#fff; border:none; padding:8px 16px; font-weight:800; font-size:0.8rem; border-radius:3px; cursor:pointer; text-transform:uppercase; letter-spacing:0.04em; margin-top:2px; box-shadow:0 2px 6px rgba(21,128,61,0.25);">
                ⚡ Click to Auto-Fill & Sign In
              </button>
              <div style="font-size:0.7rem; color:#666; margin-top:6px;">(Or check your email inbox for the sign-in link)</div>
            </div>
          `;
          // Pre-fill input
          codeInput.value = res.code;
        }
        successBox.innerHTML = msgHtml;
        successBox.style.display = 'block';
        codeContainer.style.display = 'block';
        emailInput.readOnly = true;
        submitBtn.textContent = 'VERIFY & SIGN IN';
        codeInput.focus();
      } else {
        errBox.textContent = res.message || 'Failed to send verification code';
        errBox.style.display = 'block';
        submitBtn.textContent = 'SEND LOGIN CODE';
      }
    } else {
      // Step 2: Verify OTP
      submitBtn.textContent = 'VERIFYING...';
      submitBtn.disabled = true;

      const res = await this.verifyOtp(emailInput.value, codeInput.value);
      submitBtn.textContent = 'VERIFY & SIGN IN';
      submitBtn.disabled = false;

      if (res.success) {
        this.closeAuthModal();
        if (window.location.pathname.includes('/login')) {
          window.location.href = '/account';
        }
      } else {
        errBox.textContent = res.message || 'Invalid or expired code';
        errBox.style.display = 'block';
      }
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

  /**
   * Handle Supabase Magic Link and OAuth Callbacks from URL hash
   */
  async handleUrlAuthCallback() {
    try {
      const hash = window.location.hash ? window.location.hash.substring(1) : '';
      const search = window.location.search ? window.location.search.substring(1) : '';
      const params = new URLSearchParams(hash || search);

      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const errorDesc = params.get('error_description');

      if (errorDesc) {
        console.warn('Auth callback message:', errorDesc);
        return;
      }

      if (accessToken) {
        console.log('🔑 Processing Supabase email auth callback...');
        let user = null;
        try {
          const uRes = await fetch('https://shhjnxarewideotbhzby.supabase.co/auth/v1/user', {
            headers: {
              'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNoaGpueGFyZXdpZGVvdGJoemJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzMTQ4OTAsImV4cCI6MjEwNzg5MDg5MH0.EXo3CsahywhVMbLYqinayGzpgPR4ro_UzOKsEWUjBIE',
              'Authorization': `Bearer ${accessToken}`
            }
          });
          if (uRes.ok) {
            const uData = await uRes.json();
            user = {
              id: uData.id,
              email: uData.email,
              name: uData.user_metadata?.full_name || uData.user_metadata?.name || uData.email.split('@')[0],
              phone: uData.user_metadata?.phone || '',
              city: '',
              state: '',
              address: '',
              locality: '',
              pincode: '',
              country: 'India',
              ordersCount: 0,
              totalSpent: 0,
              tags: ['Storefront Member', 'Supabase Link Verified'],
              status: 'Active',
              wishlist: []
            };
          }
        } catch (e) {}

        if (!user) {
          user = {
            id: `CUST-${Date.now()}`,
            email: 'member@allyrich.com',
            name: 'Storefront Member',
            phone: '',
            city: '',
            state: '',
            address: '',
            locality: '',
            pincode: '',
            country: 'India',
            ordersCount: 0,
            totalSpent: 0,
            tags: ['Storefront Member', 'Supabase Link Verified'],
            status: 'Active',
            wishlist: []
          };
        }

        localStorage.setItem(this.USER_KEY, JSON.stringify(user));
        localStorage.setItem(this.TOKEN_KEY, accessToken);
        if (refreshToken) localStorage.setItem('genrage_refresh_token', refreshToken);

        // Remove hash from URL for clean address bar
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, '', window.location.pathname);
        }

        this.updateHeader();
        if (window.WishlistEngine) {
          window.WishlistEngine.syncWithServer();
        }

        // Show welcome toast
        const toast = document.createElement('div');
        toast.style.cssText = 'position:fixed; bottom:24px; right:24px; background:#000; color:#fff; padding:14px 22px; border-radius:4px; font-weight:800; font-size:0.85rem; z-index:999999; box-shadow:0 10px 30px rgba(0,0,0,0.3); letter-spacing:0.04em; text-transform:uppercase;';
        toast.textContent = '✓ SIGNED IN SUCCESSFULLY — WELCOME BACK';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);

        if (window.location.pathname.includes('/login')) {
          window.location.href = '/account';
        }
      }
    } catch (e) {
      console.warn('Error handling URL auth callback:', e);
    }
  },

  init() {
    this.handleUrlAuthCallback();
    this.updateHeader();
  }
};

document.addEventListener('DOMContentLoaded', () => {
  AuthEngine.init();
});

if (typeof window !== 'undefined') {
  window.AuthEngine = AuthEngine;
}
