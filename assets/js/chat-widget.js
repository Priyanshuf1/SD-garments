/**
 * ALLEYRICH Luxury Client Concierge & Direct Chat Widget
 * Matches exact 1:1 card design from user screenshot:
 * 1. "Let's talk on Instagram" (Official IG gradient icon + chevron)
 * 2. "Lets talk on WhatsApp" (Official WhatsApp green circle + chevron)
 * 3. "Track Your Order" (Delivery icon + chevron, links to /track)
 * 4. "Send us an Email" (Email icon + chevron, links to mailto:care@allyrich.com)
 */

(function () {
  'use strict';

  // Prevent multiple initializations
  if (window.__allyrichChatWidgetInitialized) return;
  window.__allyrichChatWidgetInitialized = true;

  const WHATSAPP_NUMBER = '919876543210';
  const WHATSAPP_MESSAGE = encodeURIComponent('Hi ALLEYRICH Team, I have a query regarding my order / product.');
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
      background: linear-gradient(135deg, rgba(20,20,20,0.98), rgba(10,10,10,0.99));
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
      background: rgba(0, 0, 0, 0.78);
      z-index: 9999999;
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
      max-width: 420px;
      background: #fbfbfb;
      border: 1px solid rgba(0, 0, 0, 0.08);
      border-radius: 20px;
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5);
      overflow: hidden;
      transform: translateY(20px) scale(0.97);
      transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      font-family: 'Instrument Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #111111;
    }

    .ar-chat-modal-backdrop.is-open .ar-chat-modal {
      transform: translateY(0) scale(1);
    }

    /* Modal Header */
    .ar-chat-modal__header {
      padding: 20px 22px 14px;
      background: #ffffff;
      border-bottom: 1px solid #f0f0f0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .ar-chat-modal__brand {
      display: flex;
      align-items: center;
      gap: 12px;
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
      font-size: 1.15rem;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: #111111;
      margin: 0;
      line-height: 1.2;
    }

    .ar-chat-modal__brand-subtitle {
      font-size: 0.8rem;
      color: #6b7280;
      margin: 0;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .ar-chat-modal__close {
      background: #f3f4f6;
      border: none;
      color: #4b5563;
      cursor: pointer;
      padding: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      transition: all 0.2s;
    }

    .ar-chat-modal__close:hover {
      background: #e5e7eb;
      color: #111111;
    }

    /* Modal Body / Action Cards (Matches User Screenshot 1:1) */
    .ar-chat-modal__body {
      padding: 16px 18px 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-height: calc(85vh - 120px);
      overflow-y: auto;
    }

    /* Pure White Rounded Pill Card from Screenshot */
    .ar-chat-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      background: #ffffff;
      border: 1px solid #eef0f2;
      border-radius: 16px;
      text-decoration: none;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      -webkit-tap-highlight-color: transparent;
      cursor: pointer;
      position: relative;
    }

    .ar-chat-card:hover {
      background: #ffffff;
      border-color: #d1d5db;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
      transform: translateY(-2px);
    }

    .ar-chat-card:active {
      transform: translateY(0) scale(0.99);
    }

    .ar-chat-card__left {
      display: flex;
      align-items: center;
      gap: 16px;
      min-width: 0;
    }

    .ar-chat-card__icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 34px;
      height: 34px;
      flex-shrink: 0;
    }

    .ar-chat-card__icon--badge-dark {
      background: #111111;
      color: #ffffff;
      border-radius: 9px;
      width: 34px;
      height: 34px;
    }

    .ar-chat-card__icon--badge-red {
      background: #ea4335;
      color: #ffffff;
      border-radius: 9px;
      width: 34px;
      height: 34px;
    }

    .ar-chat-card__title {
      font-family: 'Instrument Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 1.05rem;
      font-weight: 600;
      color: #111827;
      letter-spacing: -0.01em;
      margin: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .ar-chat-card__arrow {
      display: flex;
      align-items: center;
      justify-content: center;
      color: #222222;
      transition: transform 0.2s ease;
      flex-shrink: 0;
      padding-left: 8px;
    }

    .ar-chat-card:hover .ar-chat-card__arrow {
      transform: translateX(3px);
    }

    /* Modal Footer Note */
    .ar-chat-modal__footer-note {
      font-size: 0.75rem;
      color: #888888;
      text-align: center;
      margin: 6px 0 0;
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
        border-radius: 20px 20px 0 0;
        border-bottom: none;
      }
      .ar-chat-card {
        padding: 15px 18px;
      }
      .ar-chat-card__title {
        font-size: 1rem;
      }
    }

    /* Reduced Motion */
    @media (prefers-reduced-motion: reduce) {
      .ar-chat-trigger,
      .ar-chat-modal,
      .ar-chat-card,
      .ar-chat-card__arrow {
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
          <img src="/assets/ar-logo.png" alt="AR" class="ar-chat-modal__crest" width="28" height="28">
          <div class="ar-chat-modal__title-wrap">
            <h3 class="ar-chat-modal__brand-title" id="ar-chat-modal-title">Chat with Us</h3>
            <p class="ar-chat-modal__brand-subtitle">
              <span class="ar-chat-trigger__status" style="width:7px; height:7px;"></span>
              We usually reply within minutes
            </p>
          </div>
        </div>
        <button type="button" class="ar-chat-modal__close" id="ar-chat-modal-close" aria-label="Close Chat Window">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <!-- Action Cards (1:1 with user screenshot) -->
      <div class="ar-chat-modal__body">

        <!-- 1. Let's talk on Instagram -->
        <a href="${INSTAGRAM_URL}" target="_blank" rel="noopener noreferrer" class="ar-chat-card ar-chat-card--instagram" id="ar-chat-link-instagram" onclick="if(window.innerWidth > 900){this.href='${INSTAGRAM_WEB_URL}';}">
          <div class="ar-chat-card__left">
            <div class="ar-chat-card__icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="ar-ig-grad-widget" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="#FFD600"/>
                    <stop offset="25%" stop-color="#FF7A00"/>
                    <stop offset="50%" stop-color="#FF0069"/>
                    <stop offset="75%" stop-color="#D300C5"/>
                    <stop offset="100%" stop-color="#7638FA"/>
                  </linearGradient>
                </defs>
                <rect x="2" y="2" width="20" height="20" rx="6" stroke="url(#ar-ig-grad-widget)" stroke-width="2.2"/>
                <circle cx="12" cy="12" r="4.6" stroke="url(#ar-ig-grad-widget)" stroke-width="2.2"/>
                <circle cx="17.5" cy="6.5" r="1.3" fill="url(#ar-ig-grad-widget)"/>
              </svg>
            </div>
            <span class="ar-chat-card__title">Let's talk on Instagram</span>
          </div>
          <span class="ar-chat-card__arrow">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#222222" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </span>
        </a>

        <!-- 2. Lets talk on WhatsApp -->
        <a href="${WHATSAPP_URL}" target="_blank" rel="noopener noreferrer" class="ar-chat-card ar-chat-card--whatsapp" id="ar-chat-link-whatsapp">
          <div class="ar-chat-card__left">
            <div class="ar-chat-card__icon">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="16" cy="16" r="15" fill="#25D366"/>
                <path d="M16 6.5C10.75 6.5 6.5 10.75 6.5 16C6.5 17.75 7 19.4 7.85 20.85L6.5 25.5L11.3 24.2C12.7 25 14.3 25.5 16 25.5C21.25 25.5 25.5 21.25 25.5 16C25.5 10.75 21.25 6.5 16 6.5ZM21.3 19.6C21.05 20.3 19.8 20.85 19.2 20.95C18.65 21.05 17.95 21.1 15.6 20.1C12.5 18.8 10.5 15.65 10.35 15.45C10.2 15.25 9.1 13.8 9.1 12.3C9.1 10.8 9.85 10.05 10.15 9.75C10.45 9.45 10.8 9.35 11.05 9.35C11.25 9.35 11.45 9.35 11.65 9.35C11.85 9.35 12.1 9.3 12.35 9.9C12.6 10.5 13.2 11.95 13.25 12.1C13.35 12.25 13.4 12.45 13.3 12.65C13.2 12.85 13.1 12.95 12.95 13.15C12.8 13.35 12.65 13.5 12.45 13.75C12.25 13.95 12.05 14.2 12.3 14.6C12.55 15 13.4 16.4 14.65 17.5C16.25 18.9 17.55 19.35 17.95 19.55C18.35 19.75 18.55 19.7 18.8 19.45C19.05 19.2 19.7 18.4 19.95 18.05C20.2 17.7 20.45 17.75 20.75 17.85C21.05 17.95 22.65 18.75 22.95 18.9C23.25 19.05 23.45 19.15 23.55 19.3C23.65 19.45 23.65 20.05 23.4 20.75L21.3 19.6Z" fill="white"/>
              </svg>
            </div>
            <span class="ar-chat-card__title">Lets talk on WhatsApp</span>
          </div>
          <span class="ar-chat-card__arrow">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#222222" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </span>
        </a>

        <!-- 3. Track Your Order -->
        <a href="${TRACK_ORDER_URL}" class="ar-chat-card ar-chat-card--track" id="ar-chat-link-track">
          <div class="ar-chat-card__left">
            <div class="ar-chat-card__icon ar-chat-card__icon--badge-dark">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="1" y="3" width="15" height="13"></rect>
                <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
                <circle cx="5.5" cy="18.5" r="2.5"></circle>
                <circle cx="18.5" cy="18.5" r="2.5"></circle>
              </svg>
            </div>
            <span class="ar-chat-card__title">Track Your Order</span>
          </div>
          <span class="ar-chat-card__arrow">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#222222" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </span>
        </a>

        <!-- 4. Send us an Email -->
        <a href="mailto:${SUPPORT_EMAIL}" class="ar-chat-card ar-chat-card--email" id="ar-chat-link-email">
          <div class="ar-chat-card__left">
            <div class="ar-chat-card__icon ar-chat-card__icon--badge-red">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <polyline points="22,6 12,13 2,6"></polyline>
              </svg>
            </div>
            <span class="ar-chat-card__title">Send us an Email</span>
          </div>
          <span class="ar-chat-card__arrow">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#222222" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </span>
        </a>

        <!-- Operating Hours Note -->
        <p class="ar-chat-modal__footer-note">
          ALLEYRICH Client Concierge &bull; Mon &ndash; Sat, 10 AM &ndash; 7 PM IST
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
