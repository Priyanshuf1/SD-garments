/**
 * ALLEYRICH - 24/7 AI Streetwear Support Concierge Client
 * Handles floating launcher, instant UI interaction, and /api/ai/chat calls.
 */

(function () {
  'use strict';

  // Prevent multiple initializations
  if (window.__AR_AI_CONCIERGE_INITIALIZED__) return;
  window.__AR_AI_CONCIERGE_INITIALIZED__ = true;

  const BrandConfig = {
    name: 'ALLEYRICH',
    whatsAppNumber: '919876543210',
    welcomeMessage: 'Welcome to **ALLEYRICH**. I am your 24/7 AI Help Assistant. Ask me about sizing, tracking your order, or garment specifications.'
  };

  let isChatOpen = false;
  let chatHistory = [];

  function initConcierge() {
    // 1. Ensure CSS is loaded
    if (!document.getElementById('ar-ai-support-css')) {
      const link = document.createElement('link');
      link.id = 'ar-ai-support-css';
      link.rel = 'stylesheet';
      link.href = '/assets/css/ai-support.css';
      document.head.appendChild(link);
    }

    // 2. Build Launcher Button
    const launcher = document.createElement('div');
    launcher.id = 'ar-ai-launcher';
    launcher.setAttribute('role', 'button');
    launcher.setAttribute('aria-label', 'Open AI Help Assistant');
    launcher.innerHTML = `
      <div class="ar-launcher-avatar">
        <img src="/assets/ar-logo.png" alt="AR">
        <div class="ar-online-dot"></div>
      </div>
      <div class="ar-launcher-text">
        <span class="ar-launcher-title">NEED HELP ?</span>
        <span class="ar-launcher-sub">AI Help Assistant</span>
      </div>
    `;

    // 3. Build Chat Modal
    const modal = document.createElement('div');
    modal.id = 'ar-ai-modal';
    modal.innerHTML = `
      <div class="ar-chat-header">
        <div class="ar-chat-brand">
          <img src="/assets/ar-logo.png" width="26" height="26" alt="AR" style="object-fit:contain;">
          <div>
            <div class="ar-chat-brand-name">NEED HELP ?</div>
            <div class="ar-chat-status">
              <span class="ar-chat-status-dot"></span> Online &bull; AI Help Assistant
            </div>
          </div>
        </div>
        <button class="ar-chat-close-btn" id="ar-close-chat" aria-label="Close Chat">&times;</button>
      </div>

      <div class="ar-chips-container">
        <button type="button" class="ar-chip" data-msg="Track my order">📦 Track Order</button>
        <button type="button" class="ar-chip" data-msg="What size should I buy?">📐 Size Guide</button>
        <button type="button" class="ar-chip" data-msg="What is your return and exchange policy?">🔄 7-Day Exchange</button>
        <button type="button" class="ar-chip" data-msg="I want to speak with human support">💬 Human Support</button>
      </div>

      <div class="ar-chat-messages" id="ar-chat-messages">
        <!-- Messages injected here -->
      </div>

      <div class="ar-chat-input-bar" id="ar-chat-form">
        <input
          type="text"
          id="ar-chat-input"
          placeholder="Ask about sizing, orders, fabric..."
          autocomplete="off"
          autocapitalize="sentences"
          autocorrect="on"
          spellcheck="true"
          enterkeyhint="send"
          inputmode="text"
          role="textbox"
          aria-label="Ask about sizing, orders, fabric"
        >
        <button class="ar-chat-send-btn" id="ar-send-btn" type="button" aria-label="Send Message">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>
    `;

    document.body.appendChild(launcher);
    document.body.appendChild(modal);

    // Initial Welcome Message
    appendMessage('bot', BrandConfig.welcomeMessage);

    // Event Listeners
    launcher.addEventListener('click', toggleChat);
    document.getElementById('ar-close-chat').addEventListener('click', toggleChat);

    const input = document.getElementById('ar-chat-input');
    const sendBtn = document.getElementById('ar-send-btn');
    const form = document.getElementById('ar-chat-form');
    const inputBar = modal.querySelector('.ar-chat-input-bar');

    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        handleSend();
      });
    }

    sendBtn.addEventListener('click', (e) => {
      e.preventDefault();
      handleSend();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSend();
      }
    });

    // Mobile tap & touch listeners: ensure virtual keyboard triggers immediately on tap
    if (inputBar && input) {
      inputBar.addEventListener('click', (e) => {
        if (!e.target.closest('#ar-send-btn')) {
          input.focus();
        }
      });
      inputBar.addEventListener('touchend', (e) => {
        if (!e.target.closest('#ar-send-btn')) {
          input.focus();
        }
      }, { passive: true });

      input.addEventListener('focus', () => {
        if (window.innerWidth <= 768) {
          setTimeout(() => {
            updateMobileViewport();
            scrollToBottom();
          }, 100);
        }
      });
    }

    // Suggestion Chips Click
    modal.addEventListener('click', (e) => {
      const chip = e.target.closest('.ar-chip');
      if (chip) {
        const msg = chip.getAttribute('data-msg');
        if (msg) {
          handleSend(msg);
        }
      }
    });
  }

  // VisualViewport keyboard handler for mobile view
  function updateMobileViewport() {
    if (!isChatOpen) return;
    if (window.innerWidth > 768) return; // Only mobile view
    const modal = document.getElementById('ar-ai-modal');
    if (!modal) return;

    if (window.visualViewport) {
      const vv = window.visualViewport;
      // Anchor modal height and top directly to the visual viewport above mobile software keyboard
      modal.style.setProperty('height', vv.height + 'px', 'important');
      modal.style.setProperty('top', vv.offsetTop + 'px', 'important');
      modal.style.setProperty('bottom', 'auto', 'important');
      modal.style.setProperty('max-height', vv.height + 'px', 'important');
      scrollToBottom();
    }
  }

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateMobileViewport);
    window.visualViewport.addEventListener('scroll', updateMobileViewport);
  }

  function toggleChat() {
    isChatOpen = !isChatOpen;
    const modal = document.getElementById('ar-ai-modal');
    const input = document.getElementById('ar-chat-input');
    if (modal) {
      modal.style.display = isChatOpen ? 'flex' : 'none';
      if (isChatOpen) {
        document.body.classList.add('ar-ai-chat-open');
        updateMobileViewport();
        scrollToBottom();

        // Immediate focus on open for mobile keyboard activation
        if (input) {
          input.focus();
          requestAnimationFrame(() => {
            input.focus();
          });
          setTimeout(() => {
            input.focus();
            scrollToBottom();
          }, 80);
        }
      } else {
        document.body.classList.remove('ar-ai-chat-open');
        modal.style.removeProperty('height');
        modal.style.removeProperty('top');
        modal.style.removeProperty('bottom');
        modal.style.removeProperty('max-height');
        if (input) input.blur();
      }
    }
  }

  function appendMessage(sender, text) {
    const stream = document.getElementById('ar-chat-messages');
    if (!stream) return;

    const msgEl = document.createElement('div');
    msgEl.className = 'ar-message ' + sender;

    // Basic markdown parsing: **bold**, [link](url), line breaks
    let formatted = escapeHtml(text)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\n/g, '<br>');

    msgEl.innerHTML = formatted;
    stream.appendChild(msgEl);
    scrollToBottom();
  }

  function appendTypingIndicator() {
    const stream = document.getElementById('ar-chat-messages');
    const indicator = document.createElement('div');
    indicator.className = 'ar-message bot ar-typing-indicator';
    indicator.id = 'ar-typing-active';
    indicator.innerHTML = `
      <div class="ar-typing-dots">
        <div class="ar-typing-dot"></div>
        <div class="ar-typing-dot"></div>
        <div class="ar-typing-dot"></div>
      </div>
    `;
    stream.appendChild(indicator);
    scrollToBottom();
  }

  function removeTypingIndicator() {
    const el = document.getElementById('ar-typing-active');
    if (el) el.remove();
  }

  function scrollToBottom() {
    const stream = document.getElementById('ar-chat-messages');
    if (stream) stream.scrollTop = stream.scrollHeight;
  }

  function escapeHtml(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function handleSend(manualText = null) {
    const input = document.getElementById('ar-chat-input');
    const text = (manualText || input.value || '').trim();
    if (!text) return;

    if (!manualText) input.value = '';

    appendMessage('user', text);
    chatHistory.push({ role: 'user', content: text });

    appendTypingIndicator();

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: chatHistory.slice(-6)
        })
      });

      removeTypingIndicator();

      if (!res.ok) {
        throw new Error('Server error');
      }

      const data = await res.json();
      const reply = data.reply || "I'm having trouble retrieving that. Would you like to chat with our human support team on WhatsApp?";
      appendMessage('bot', reply);
      chatHistory.push({ role: 'assistant', content: reply });

    } catch (err) {
      removeTypingIndicator();
      appendMessage('bot', `I'm having trouble connecting to atelier servers right now. You can reach our human care team directly on [WhatsApp](https://wa.me/${BrandConfig.whatsAppNumber}?text=Hi%20ALLEYRICH%20Support,%20I%20need%20assistance).`);
    }
  }

  // Initialize once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initConcierge);
  } else {
    initConcierge();
  }

  window.ARConcierge = {
    open: () => { if (!isChatOpen) toggleChat(); },
    close: () => { if (isChatOpen) toggleChat(); },
    ask: (q) => { if (!isChatOpen) toggleChat(); handleSend(q); }
  };
})();
