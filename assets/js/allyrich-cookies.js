/**
 * AllyRich Privacy & Cookie Consent Controller
 * Clean, lightweight, zero-tracking by default with full DPDP 2023 / GDPR compliance.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'alleyrich_cookie_consent';
  const DISMISSED_KEY = 'alleyrich_cookie_dismissed';

  function createPopupElement() {
    let popup = document.getElementById('cookie-consent-popup');
    if (popup) return popup;

    popup = document.createElement('aside');
    popup.id = 'cookie-consent-popup';
    popup.className = 'cookie-popup cookie-popup--hidden';
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-modal', 'true');
    popup.setAttribute('aria-labelledby', 'cookie-popup-heading');
    popup.style.display = 'none';

    popup.innerHTML = `
      <button type="button" class="cookie-popup__close" aria-label="Close Privacy and Cookies Notice" onclick="window.dismissCookiePopup ? window.dismissCookiePopup() : null">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <line x1="1" y1="1" x2="13" y2="13"></line>
          <line x1="13" y1="1" x2="1" y2="13"></line>
        </svg>
      </button>
      <div class="cookie-popup__header">
        <h3 id="cookie-popup-heading" class="cookie-popup__heading">PRIVACY &amp; COOKIES</h3>
      </div>
      <p class="cookie-popup__text">
        We use strictly necessary cookies to power your cart and secure checkout, and optional analytics to optimize browsing speed. Learn more in our <a href="/pages/privacy-policy.html#cookies" class="cookie-popup__link">Cookie Policy</a>.
      </p>
      <div class="cookie-popup__actions">
        <button type="button" class="cookie-popup__btn cookie-popup__btn--accept" onclick="window.acceptAllCookies ? window.acceptAllCookies() : null">ACCEPT ALL</button>
        <button type="button" class="cookie-popup__btn cookie-popup__btn--essential" onclick="window.acceptEssentialCookies ? window.acceptEssentialCookies() : null">ESSENTIAL ONLY</button>
      </div>
    `;

    document.body.appendChild(popup);
    return popup;
  }

  function initCookieConsent() {
    const popup = createPopupElement();
    if (!popup) return;

    function showPopup() {
      popup.style.display = 'block';
      requestAnimationFrame(() => {
        popup.classList.remove('cookie-popup--hidden');
      });
    }

    function hidePopup() {
      popup.classList.add('cookie-popup--hidden');
      setTimeout(() => {
        popup.style.display = 'none';
      }, 300);
    }

    window.acceptAllCookies = function () {
      try {
        localStorage.setItem(STORAGE_KEY, 'all');
      } catch (e) {}
      hidePopup();
    };

    window.acceptEssentialCookies = function () {
      try {
        localStorage.setItem(STORAGE_KEY, 'essential');
      } catch (e) {}
      hidePopup();
    };

    window.dismissCookiePopup = function () {
      try {
        sessionStorage.setItem(DISMISSED_KEY, 'true');
      } catch (e) {}
      hidePopup();
    };

    window.openCookieSettings = function () {
      showPopup();
    };

    // Global listener for "COOKIES" links
    document.addEventListener('click', function (e) {
      const target = e.target.closest('a[href="#cookies"], [data-open-cookie-popup]');
      if (target) {
        e.preventDefault();
        showPopup();
      }
    });

    let consent = null;
    let dismissed = null;
    try {
      consent = localStorage.getItem(STORAGE_KEY);
      dismissed = sessionStorage.getItem(DISMISSED_KEY);
    } catch (e) {}

    if (!consent && !dismissed) {
      // Delay slightly for smooth page entry
      setTimeout(showPopup, 600);
    } else {
      popup.classList.add('cookie-popup--hidden');
      popup.style.display = 'none';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCookieConsent);
  } else {
    initCookieConsent();
  }
})();
