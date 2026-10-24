/**
 * ALLYRICH Luxury Cookie Consent Banner
 * DPDP Act 2023 & GDPR Compliant
 * 
 * Provides:
 * - Non-intrusive floating pill banner
 * - Strict separation of "Accept All" vs "Essential Only"
 * - Persistent choice in localStorage
 * - Re-triggerable via window.openCookieConsentBanner()
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'allyrich_cookie_consent';

  function createBanner() {
    if (document.getElementById('allyrich-cookie-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'allyrich-cookie-banner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Cookie Consent');
    banner.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(120%);
      width: min(92vw, 560px);
      background: #0f0f11;
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 8px;
      padding: 18px 22px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05);
      z-index: 9999999;
      font-family: 'Instrument Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
      opacity: 0;
    `;

    banner.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:12px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
          <div style="font-size:0.85rem; font-weight:800; letter-spacing:0.06em; text-transform:uppercase; color:#ffffff; display:flex; align-items:center; gap:6px;">
            <span>🛡️</span> Privacy &amp; Cookies
          </div>
          <button type="button" id="cookie-banner-close" aria-label="Dismiss banner" style="background:none; border:none; color:#888; font-size:1.1rem; cursor:pointer; padding:0; line-height:1; transition:color 0.2s;">&times;</button>
        </div>
        <p style="margin:0; font-size:0.8rem; line-height:1.55; color:#b0b0b5;">
          We use strictly necessary cookies to power your cart and secure checkout, and optional analytics to optimize browsing speed. Learn more in our <a href="/cookie-policy" style="color:#ffffff; text-decoration:underline; font-weight:700;">Cookie Policy</a>.
        </p>
        <div style="display:flex; gap:10px; margin-top:4px; flex-wrap:wrap;">
          <button type="button" id="cookie-btn-accept" style="flex:1; min-width:130px; background:#ffffff; color:#000000; border:none; padding:10px 16px; border-radius:4px; font-weight:800; font-size:0.75rem; letter-spacing:0.05em; text-transform:uppercase; cursor:pointer; transition:background 0.2s;">
            Accept All
          </button>
          <button type="button" id="cookie-btn-essential" style="flex:1; min-width:130px; background:rgba(255, 255, 255, 0.06); color:#dddddd; border:1px solid rgba(255, 255, 255, 0.15); padding:10px 16px; border-radius:4px; font-weight:700; font-size:0.75rem; letter-spacing:0.05em; text-transform:uppercase; cursor:pointer; transition:all 0.2s;">
            Essential Only
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(banner);

    // Event listeners
    const closeBtn = document.getElementById('cookie-banner-close');
    const acceptBtn = document.getElementById('cookie-btn-accept');
    const essentialBtn = document.getElementById('cookie-btn-essential');

    function dismiss(val) {
      try {
        localStorage.setItem(STORAGE_KEY, val);
      } catch (e) {}
      banner.style.transform = 'translateX(-50%) translateY(120%)';
      banner.style.opacity = '0';
      setTimeout(() => {
        if (banner.parentNode) banner.parentNode.removeChild(banner);
      }, 400);
    }

    if (closeBtn) closeBtn.onclick = () => dismiss('essential');
    if (acceptBtn) acceptBtn.onclick = () => dismiss('all');
    if (essentialBtn) essentialBtn.onclick = () => dismiss('essential');

    // Trigger animation
    requestAnimationFrame(() => {
      banner.style.transform = 'translateX(-50%) translateY(0)';
      banner.style.opacity = '1';
    });
  }

  function init() {
    try {
      const consent = localStorage.getItem(STORAGE_KEY);
      if (!consent) {
        // Small delay so user sees page smoothly first
        setTimeout(createBanner, 1000);
      }
    } catch (e) {
      setTimeout(createBanner, 1000);
    }
  }

  window.openCookieConsentBanner = function () {
    createBanner();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
