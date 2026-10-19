/**
 * ALLYRICH Luxury Client Concierge & Direct Chat Widget
 * Provides a floating "CHAT WITH US" trigger pill and modal
 * with direct WhatsApp, Instagram DM, Delhivery Tracking & Email actions.
 */

(function () {
  'use strict';

  // Prevent multiple initializations
  if (window.__allyrichChatWidgetInitialized) return;
  window.__allyrichChatWidgetInitialized = true;

  const WHATSAPP_NUMBER = '919876543210';
  const WHATSAPP_MESSAGE = encodeURIComponent('Hi ALLYRICH Team, I have a query regarding my order / product.');
  const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${WHATSAPP_MESSAGE}`;
  const INSTAGRAM_URL = 'https://ig.me/m/allyrich_';
  const INSTAGRAM_WEB_URL = 'https://www.instagram.com/allyrich_/';
  const SUPPORT_EMAIL = 'care@allyrich.com';
  const TRACK_ORDER_URL = '/track';

  // Inject CSS Styles
  const styleEl = document.createElement('style');
  styleEl.id = 'allyrich-chat-widget-styles';
  styleEl.textContent = `
    /* Floating Chat Pill Trigger */
    .ar-chat-trigger {
      position: fixed;
      bottom: 24px;
      left: 24px;
      z-index: 99998;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      background: #0d0d0d;
      background: linear-gradient(135deg, rgba(20,20,20,0.95), rgba(10,10,10,0.98));
      border: 1px solid rgba(255, 255, 255, 0.22);
      color: #ffffff;
      padding: 10px 18px 10px 14px;
      border-radius: 999px;
      font-family: 'Instrument Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      text-decoration: none;
      cursor: pointer;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6), 0 0 1px 1px rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      user-select: none;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    }

    .ar-chat-trigger:hover {
      transform: translateY(-2px);
      border-color: rgba(255, 255, 255, 0.45);
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.8), 0 0 15px rgba(255, 255, 255, 0.12);
      color: #ffffff;
    }

    .ar-chat-trigger:active {
      transform: translateY(0) scale(0.98);
    }

    .ar-chat-trigger__status {
      position: relative;
      width: 8px;
      height: 8px;
      background: #25D366;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .ar-chat-trigger__status::after {
      content: '';
      position: absolute;
      top: -2px;
      left: -2px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: rgba(37, 211, 102, 0.4);
      animation: arPulse 2s infinite ease-out;
    }

    @keyframes arPulse {
      0% { transform: scale(0.9); opacity: 0.9; }
      50% { transform: scale(1.6); opacity: 0.2; }
      100% { transform: scale(2.2); opacity: 0; }
    }

    .ar-chat-trigger__icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      flex-shrink: 0;
    }

    .ar-chat-trigger__label {
      line-height: 1;
      padding-top: 1px;
    }

    /* Modal Backdrop & Container */
    .ar-chat-modal-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.72);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      z-index: 99999;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.3s ease, visibility 0.3s ease;
      display: flex;
      align-items: flex-end;
      justify-content: flex-start;
      padding: 24px;
    }

    .ar-chat-modal-backdrop.is-open {
      opacity: 1;
      visibility: visible;
    }

    .ar-chat-modal {
      width: 100%;
      max-width: 410px;
      background: #0e0e0e;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 12px;
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.85);
      overflow: hidden;
      transform: translateY(20px) scale(0.97);
      transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      font-family: 'Instrument Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #ffffff;
    }

    .ar-chat-modal-backdrop.is-open .ar-chat-modal {
      transform: translateY(0) scale(1);
    }

    /* Modal Header */
    .ar-chat-modal__header {
      padding: 20px 20px 16px;
      background: #141414;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }

    .ar-chat-modal__brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .ar-chat-modal__crest {
      width: 26px;
      height: 32px;
      object-fit: contain;
    }

    .ar-chat-modal__title-wrap {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .ar-chat-modal__brand-title {
      font-size: 0.95rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #ffffff;
      margin: 0;
      line-height: 1.2;
    }

    .ar-chat-modal__brand-subtitle {
      font-size: 0.75rem;
      color: #999999;
      margin: 0;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .ar-chat-modal__close {
      background: none;
      border: none;
      color: #888888;
      cursor: pointer;
      padding: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      transition: all 0.2s;
    }

    .ar-chat-modal__close:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #ffffff;
    }

    /* Modal Body / Action Cards */
    .ar-chat-modal__body {
      padding: 16px 20px 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-height: calc(85vh - 120px);
      overflow-y: auto;
    }

    .ar-chat-card {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 16px;
      background: #151515;
      border: 1px solid rgba(255, 255, 255, 0.09);
      border-radius: 8px;
      text-decoration: none;
      color: #ffffff;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      position: relative;
    }

    .ar-chat-card:hover {
      background: #1c1c1c;
      border-color: rgba(255, 255, 255, 0.28);
      transform: translateX(3px);
    }

    .ar-chat-card--whatsapp:hover {
      border-color: rgba(37, 211, 102, 0.5);
      box-shadow: 0 4px 20px rgba(37, 211, 102, 0.15);
    }

    .ar-chat-card--instagram:hover {
      border-color: rgba(225, 48, 108, 0.5);
      box-shadow: 0 4px 20px rgba(225, 48, 108, 0.15);
    }

    .ar-chat-card__icon-box {
      width: 42px;
      height: 42px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .ar-chat-card--whatsapp .ar-chat-card__icon-box {
      background: rgba(37, 211, 102, 0.12);
      color: #25D366;
    }

    .ar-chat-card--instagram .ar-chat-card__icon-box {
      background: linear-gradient(45deg, rgba(240, 148, 51, 0.15), rgba(230, 44, 144, 0.15), rgba(188, 24, 136, 0.15));
      color: #E1306C;
    }

    .ar-chat-card--track .ar-chat-card__icon-box {
      background: rgba(255, 255, 255, 0.08);
      color: #ffffff;
    }

    .ar-chat-card--email .ar-chat-card__icon-box {
      background: rgba(255, 255, 255, 0.06);
      color: #bbbbbb;
    }

    .ar-chat-card__content {
      flex: 1;
      min-width: 0;
    }

    .ar-chat-card__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      margin-bottom: 2px;
    }

    .ar-chat-card__title {
      font-size: 0.85rem;
      font-weight: 700;
      letter-spacing: 0.02em;
      margin: 0;
      color: #ffffff;
    }

    .ar-chat-card__badge {
      font-size: 0.65rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      padding: 2px 6px;
      border-radius: 4px;
      text-transform: uppercase;
    }

    .ar-chat-card__badge--green {
      background: rgba(37, 211, 102, 0.18);
      color: #25D366;
    }

    .ar-chat-card__badge--insta {
      background: rgba(225, 48, 108, 0.18);
      color: #ff6b95;
    }

    .ar-chat-card__desc {
      font-size: 0.75rem;
      color: #999999;
      margin: 0;
      line-height: 1.35;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .ar-chat-card__arrow {
      color: #666666;
      font-size: 1rem;
      transition: transform 0.2s, color 0.2s;
      flex-shrink: 0;
    }

    .ar-chat-card:hover .ar-chat-card__arrow {
      color: #ffffff;
      transform: translateX(2px);
    }

    /* Modal Footer Note */
    .ar-chat-modal__footer-note {
      font-size: 0.7rem;
      color: #777777;
      text-align: center;
      margin: 4px 0 0;
      line-height: 1.4;
    }

    /* Responsive adjustments */
    @media (max-width: 768px) {
      .ar-chat-trigger {
        bottom: 18px;
        left: 16px;
        padding: 9px 14px 9px 12px;
        font-size: 0.7rem;
      }
      .ar-chat-modal-backdrop {
        padding: 0;
      }
      .ar-chat-modal {
        max-width: 100%;
        border-radius: 16px 16px 0 0;
        border-bottom: none;
      }
    }

    /* Reduced Motion */
    @media (prefers-reduced-motion: reduce) {
      .ar-chat-trigger,
      .ar-chat-modal,
      .ar-chat-card {
        transition: none !important;
      }
      .ar-chat-trigger__status::after {
        animation: none !important;
      }
    }
  `;
  document.head.appendChild(styleEl);

  // Build Floating Trigger Pill
  const triggerBtn = document.createElement('button');
  triggerBtn.type = 'button';
  triggerBtn.className = 'ar-chat-trigger';
  triggerBtn.id = 'ar-chat-trigger-btn';
  triggerBtn.setAttribute('aria-label', 'Chat with Us on WhatsApp or Instagram');
  triggerBtn.innerHTML = `
    <span class="ar-chat-trigger__status" aria-hidden="true"></span>
    <span class="ar-chat-trigger__icon" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
      </svg>
    </span>
    <span class="ar-chat-trigger__label">CHAT WITH US</span>
  `;

  // Build Chat Modal
  const modalBackdrop = document.createElement('div');
  modalBackdrop.className = 'ar-chat-modal-backdrop';
  modalBackdrop.id = 'ar-chat-modal';
  modalBackdrop.setAttribute('aria-hidden', 'true');
  modalBackdrop.innerHTML = `
    <div class="ar-chat-modal" role="dialog" aria-modal="true" aria-labelledby="ar-chat-modal-title">
      
      <!-- Header -->
      <div class="ar-chat-modal__header">
        <div class="ar-chat-modal__brand">
          <img src="/assets/ar-logo.png" alt="AR" class="ar-chat-modal__crest" width="26" height="32">
          <div class="ar-chat-modal__title-wrap">
            <h3 class="ar-chat-modal__brand-title" id="ar-chat-modal-title">ALLYRICH CONCIERGE</h3>
            <p class="ar-chat-modal__brand-subtitle">
              <span class="ar-chat-trigger__status" style="width:6px; height:6px;"></span>
              Live support via WhatsApp &amp; Instagram
            </p>
          </div>
        </div>
        <button type="button" class="ar-chat-modal__close" id="ar-chat-modal-close" aria-label="Close Chat Window">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <!-- Action Cards -->
      <div class="ar-chat-modal__body">

        <!-- 1. WhatsApp Support -->
        <a href="${WHATSAPP_URL}" target="_blank" rel="noopener noreferrer" class="ar-chat-card ar-chat-card--whatsapp" id="ar-chat-link-whatsapp">
          <div class="ar-chat-card__icon-box">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2M12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.99 3.8 13.47 3.8 11.91C3.81 7.37 7.5 3.67 12.05 3.67M9.04 6.78C8.87 6.78 8.6 6.84 8.36 7.1C8.13 7.36 7.48 7.97 7.48 9.21C7.48 10.45 8.39 11.64 8.52 11.81C8.65 11.98 10.3 14.54 12.83 15.63C13.43 15.89 13.9 16.05 14.27 16.16C14.88 16.36 15.43 16.33 15.87 16.27C16.36 16.2 17.38 15.65 17.59 15.06C17.8 14.47 17.8 13.96 17.74 13.86C17.68 13.76 17.5 13.7 17.23 13.56C16.96 13.43 15.64 12.78 15.4 12.69C15.16 12.6 14.98 12.56 14.81 12.82C14.64 13.08 14.15 13.65 14 13.82C13.85 13.99 13.7 14.01 13.43 13.88C13.16 13.75 12.3 13.47 11.27 12.55C10.47 11.83 9.93 10.95 9.77 10.68C9.61 10.41 9.75 10.27 9.89 10.13C10.01 10.01 10.16 9.81 10.3 9.65C10.44 9.49 10.49 9.36 10.58 9.18C10.67 9 10.62 8.85 10.56 8.72C10.5 8.59 10 7.36 9.78 6.84C9.57 6.34 9.36 6.4 9.2 6.39C9.04 6.39 8.87 6.39 8.7 6.39L9.04 6.78Z"/>
            </svg>
          </div>
          <div class="ar-chat-card__content">
            <div class="ar-chat-card__header">
              <h4 class="ar-chat-card__title">WhatsApp Instant Chat</h4>
              <span class="ar-chat-card__badge ar-chat-card__badge--green">Online</span>
            </div>
            <p class="ar-chat-card__desc">Direct talk with our client team for sizing &amp; orders</p>
          </div>
          <span class="ar-chat-card__arrow">↗</span>
        </a>

        <!-- 2. Instagram Direct -->
        <a href="${INSTAGRAM_URL}" target="_blank" rel="noopener noreferrer" class="ar-chat-card ar-chat-card--instagram" id="ar-chat-link-instagram" onclick="if(window.innerWidth > 900){this.href='${INSTAGRAM_WEB_URL}';}">
          <div class="ar-chat-card__icon-box">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
              <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
              <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
            </svg>
          </div>
          <div class="ar-chat-card__content">
            <div class="ar-chat-card__header">
              <h4 class="ar-chat-card__title">Instagram Direct (@allyrich_)</h4>
              <span class="ar-chat-card__badge ar-chat-card__badge--insta">Active Daily</span>
            </div>
            <p class="ar-chat-card__desc">DM our creative studio for drops &amp; styling support</p>
          </div>
          <span class="ar-chat-card__arrow">↗</span>
        </a>

        <!-- 3. Delhivery Express Tracking -->
        <a href="${TRACK_ORDER_URL}" class="ar-chat-card ar-chat-card--track" id="ar-chat-link-track">
          <div class="ar-chat-card__icon-box">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="1" y="3" width="15" height="13"></rect>
              <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
              <circle cx="5.5" cy="18.5" r="2.5"></circle>
              <circle cx="18.5" cy="18.5" r="2.5"></circle>
            </svg>
          </div>
          <div class="ar-chat-card__content">
            <div class="ar-chat-card__header">
              <h4 class="ar-chat-card__title">Track Delhivery Order</h4>
            </div>
            <p class="ar-chat-card__desc">Real-time live dispatch and transit updates by Order ID</p>
          </div>
          <span class="ar-chat-card__arrow">↗</span>
        </a>

        <!-- 4. Email Support -->
        <a href="mailto:${SUPPORT_EMAIL}" class="ar-chat-card ar-chat-card--email" id="ar-chat-link-email">
          <div class="ar-chat-card__icon-box">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
              <polyline points="22,6 12,13 2,6"></polyline>
            </svg>
          </div>
          <div class="ar-chat-card__content">
            <div class="ar-chat-card__header">
              <h4 class="ar-chat-card__title">${SUPPORT_EMAIL}</h4>
            </div>
            <p class="ar-chat-card__desc">Email our concierge for order &amp; business queries</p>
          </div>
          <span class="ar-chat-card__arrow">↗</span>
        </a>

        <!-- Operating Hours Note -->
        <p class="ar-chat-modal__footer-note">
          Hours: Mon – Sat, 10:00 AM – 7:00 PM IST<br>
          Instant response on WhatsApp during operating hours
        </p>

      </div>
    </div>
  `;

  // Attach to DOM when ready
  function init() {
    if (!document.body) {
      window.addEventListener('DOMContentLoaded', init);
      return;
    }
    // Prevent duplicate injection
    if (!document.getElementById('ar-chat-trigger-btn')) {
      document.body.appendChild(triggerBtn);
    }
    if (!document.getElementById('ar-chat-modal')) {
      document.body.appendChild(modalBackdrop);
    }

    // Modal control handlers
    function openModal() {
      modalBackdrop.classList.add('is-open');
      modalBackdrop.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }

    function closeModal() {
      modalBackdrop.classList.remove('is-open');
      modalBackdrop.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }

    function toggleModal() {
      if (modalBackdrop.classList.contains('is-open')) {
        closeModal();
      } else {
        openModal();
      }
    }

    triggerBtn.addEventListener('click', function (e) {
      e.preventDefault();
      toggleModal();
    });

    const closeBtn = document.getElementById('ar-chat-modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        closeModal();
      });
    }

    // Close when clicking outside modal
    modalBackdrop.addEventListener('click', function (e) {
      if (e.target === modalBackdrop) {
        closeModal();
      }
    });

    // Close on Escape key
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modalBackdrop.classList.contains('is-open')) {
        closeModal();
      }
    });

    // Expose global methods
    window.openChatModal = openModal;
    window.closeChatModal = closeModal;
    window.toggleChatModal = toggleModal;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
