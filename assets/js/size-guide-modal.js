/**
 * ALLYRICH Architectural Streetwear - Global Size Guide Modal
 * Provides interactive size chart dialog with category tabs (Tees/Tanks, Hoodies, Bottoms),
 * unit switcher (Inches / CM), and measurement instructions.
 */

(function () {
  'use strict';

  if (window.__allyrichSizeGuideInitialized) return;
  window.__allyrichSizeGuideInitialized = true;

  const styleEl = document.createElement('style');
  styleEl.id = 'allyrich-size-guide-styles';
  styleEl.textContent = `
    .ar-size-modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.25rem;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.25s;
    }

    .ar-size-modal-backdrop.is-open {
      opacity: 1;
      visibility: visible;
    }

    .ar-size-modal {
      background: #0d0d0d;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 14px;
      width: 100%;
      max-width: 680px;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 25px 70px rgba(0, 0, 0, 0.95), 0 0 1px 1px rgba(255, 255, 255, 0.1);
      color: #ffffff;
      font-family: 'Instrument Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      transform: scale(0.96) translateY(10px);
      transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .ar-size-modal-backdrop.is-open .ar-size-modal {
      transform: scale(1) translateY(0);
    }

    .ar-size-modal__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1.5rem 1.75rem 1.25rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .ar-size-modal__title-group {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .ar-size-modal__logo {
      width: 24px;
      height: 30px;
      object-fit: contain;
    }

    .ar-size-modal__title {
      font-size: 1.15rem;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      margin: 0;
      color: #ffffff;
    }

    .ar-size-modal__subtitle {
      font-size: 0.72rem;
      color: #888888;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin: 2px 0 0;
    }

    .ar-size-modal__close {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #ffffff;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.85rem;
      transition: all 0.2s;
    }

    .ar-size-modal__close:hover {
      background: rgba(255, 255, 255, 0.18);
      transform: scale(1.05);
    }

    .ar-size-modal__body {
      padding: 1.5rem 1.75rem 2rem;
    }

    /* Tabs & Controls */
    .ar-size-controls {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
    }

    .ar-size-tabs {
      display: flex;
      gap: 6px;
      background: rgba(255, 255, 255, 0.05);
      padding: 4px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    .ar-size-tab {
      background: none;
      border: none;
      color: #888888;
      padding: 6px 14px;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      cursor: pointer;
      border-radius: 6px;
      transition: all 0.2s;
    }

    .ar-size-tab.is-active {
      background: #ffffff;
      color: #000000;
    }

    .ar-size-unit-toggle {
      display: flex;
      gap: 4px;
      background: rgba(255, 255, 255, 0.05);
      padding: 3px;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    .ar-size-unit-btn {
      background: none;
      border: none;
      color: #888;
      padding: 4px 10px;
      font-size: 0.7rem;
      font-weight: 700;
      cursor: pointer;
      border-radius: 4px;
      transition: all 0.2s;
    }

    .ar-size-unit-btn.is-active {
      background: rgba(255, 255, 255, 0.2);
      color: #fff;
    }

    /* Size Table */
    .ar-size-table-wrap {
      overflow-x: auto;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      margin-bottom: 1.5rem;
    }

    .ar-size-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.82rem;
      text-align: left;
    }

    .ar-size-table th {
      background: rgba(255, 255, 255, 0.04);
      color: #ffffff;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      padding: 12px 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.12);
    }

    .ar-size-table td {
      padding: 12px 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      color: #cccccc;
    }

    .ar-size-table tr:last-child td {
      border-bottom: none;
    }

    .ar-size-table td:first-child {
      font-weight: 800;
      color: #ffffff;
    }

    .ar-size-table tr:hover td {
      background: rgba(255, 255, 255, 0.02);
    }

    /* Fit Notes */
    .ar-size-note {
      background: rgba(255, 255, 255, 0.03);
      border-left: 2px solid #ffffff;
      padding: 12px 16px;
      border-radius: 0 6px 6px 0;
      font-size: 0.78rem;
      color: #999999;
      line-height: 1.6;
      margin-bottom: 1rem;
    }

    .ar-size-note strong {
      color: #ffffff;
    }

    .ar-size-footer-cta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 1.5rem;
      padding-top: 1.25rem;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 0.8rem;
      color: #777;
    }

    .ar-size-footer-cta a {
      color: #ffffff;
      text-decoration: underline;
      font-weight: 600;
      cursor: pointer;
    }
  `;
  document.head.appendChild(styleEl);

  // Table Data Sets
  const DATA = {
    tees: {
      headers: ['SIZE', 'CHEST', 'LENGTH', 'SHOULDER'],
      inches: [
        ['S', '42"', '29"', '21"'],
        ['M', '44"', '30"', '22"'],
        ['L', '46"', '31"', '23"'],
        ['XL', '48"', '32"', '24"'],
        ['XXL', '50"', '33"', '25"']
      ],
      cm: [
        ['S', '107 cm', '74 cm', '53 cm'],
        ['M', '112 cm', '76 cm', '56 cm'],
        ['L', '117 cm', '79 cm', '58 cm'],
        ['XL', '122 cm', '81 cm', '61 cm'],
        ['XXL', '127 cm', '84 cm', '64 cm']
      ],
      note: '<strong>Architectural Boxy Fit:</strong> Designed with dropped shoulders and a boxy torso drape. Choose your standard size for the intended streetwear silhouette, or size down one size for a tailored standard fit.'
    },
    hoodies: {
      headers: ['SIZE', 'CHEST', 'LENGTH', 'SLEEVE'],
      inches: [
        ['S', '44"', '27.5"', '24"'],
        ['M', '46"', '28.5"', '25"'],
        ['L', '48"', '29.5"', '26"'],
        ['XL', '50"', '30.5"', '27"']
      ],
      cm: [
        ['S', '112 cm', '70 cm', '61 cm'],
        ['M', '117 cm', '72 cm', '63 cm'],
        ['L', '122 cm', '75 cm', '66 cm'],
        ['XL', '127 cm', '77 cm', '69 cm']
      ],
      note: '<strong>Heavyweight Fleece Silhouette:</strong> Features 450+ GSM French terry construction with double-layered hood and relaxed armholes.'
    },
    bottoms: {
      headers: ['SIZE', 'WAIST', 'LENGTH', 'INSEAM', 'THIGH'],
      inches: [
        ['S', '28 - 30"', '41"', '30"', '26"'],
        ['M', '31 - 33"', '42"', '30.5"', '27"'],
        ['L', '34 - 36"', '43"', '31"', '28"'],
        ['XL', '37 - 40"', '44"', '31.5"', '29"']
      ],
      cm: [
        ['S', '71 - 76 cm', '104 cm', '76 cm', '66 cm'],
        ['M', '78 - 84 cm', '107 cm', '77 cm', '69 cm'],
        ['L', '86 - 91 cm', '109 cm', '79 cm', '71 cm'],
        ['XL', '94 - 102 cm', '112 cm', '80 cm', '74 cm']
      ],
      note: '<strong>Baggy Archival Cut:</strong> Elasticated waistband with internal drawstrings. Flowing leg profile designed to pool cleanly over sneakers.'
    }
  };

  let currentCategory = 'tees';
  let currentUnit = 'inches';

  const backdrop = document.createElement('div');
  backdrop.className = 'ar-size-modal-backdrop';
  backdrop.id = 'ar-size-guide-modal';
  backdrop.setAttribute('aria-hidden', 'true');

  backdrop.innerHTML = `
    <div class="ar-size-modal" role="dialog" aria-modal="true" aria-labelledby="ar-size-title">
      <div class="ar-size-modal__header">
        <div class="ar-size-modal__title-group">
          <img src="/assets/ar-logo.png" alt="AR" class="ar-size-modal__logo" width="24" height="30">
          <div>
            <h3 class="ar-size-modal__title" id="ar-size-title">Official Size Guide</h3>
            <p class="ar-size-modal__subtitle">Architectural Streetwear Sizing &bull; ALLYRICH</p>
          </div>
        </div>
        <button type="button" class="ar-size-modal__close" id="ar-size-modal-close" aria-label="Close Size Guide">✕</button>
      </div>

      <div class="ar-size-modal__body">
        <div class="ar-size-controls">
          <div class="ar-size-tabs">
            <button type="button" class="ar-size-tab is-active" data-cat="tees">Tops & Tees</button>
            <button type="button" class="ar-size-tab" data-cat="hoodies">Hoodies</button>
            <button type="button" class="ar-size-tab" data-cat="bottoms">Pants & Bottoms</button>
          </div>

          <div class="ar-size-unit-toggle">
            <button type="button" class="ar-size-unit-btn is-active" data-unit="inches">INCHES</button>
            <button type="button" class="ar-size-unit-btn" data-unit="cm">CM</button>
          </div>
        </div>

        <div class="ar-size-table-wrap">
          <table class="ar-size-table" id="ar-size-table">
            <!-- Dynamically populated -->
          </table>
        </div>

        <div class="ar-size-note" id="ar-size-note"></div>

        <div class="ar-size-footer-cta">
          <span>Still unsure about your size?</span>
          <a onclick="if(window.openChatModal){window.closeSizeGuideModal(); window.openChatModal();} return false;">Chat with Client Concierge →</a>
        </div>
      </div>
    </div>
  `;

  function renderTable() {
    const table = document.getElementById('ar-size-table');
    const noteEl = document.getElementById('ar-size-note');
    if (!table || !noteEl) return;

    const catData = DATA[currentCategory] || DATA.tees;
    const rows = currentUnit === 'inches' ? catData.inches : catData.cm;

    let html = '<thead><tr>';
    catData.headers.forEach(h => {
      html += `<th>${h}</th>`;
    });
    html += '</tr></thead><tbody>';

    rows.forEach(row => {
      html += '<tr>';
      row.forEach(val => {
        html += `<td>${val}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody>';

    table.innerHTML = html;
    noteEl.innerHTML = catData.note;
  }

  function openModal() {
    backdrop.classList.add('is-open');
    backdrop.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    renderTable();
  }

  function closeModal() {
    backdrop.classList.remove('is-open');
    backdrop.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function init() {
    if (!document.body) {
      window.addEventListener('DOMContentLoaded', init);
      return;
    }

    if (!document.getElementById('ar-size-guide-modal')) {
      document.body.appendChild(backdrop);
    }

    // Tab buttons
    backdrop.querySelectorAll('.ar-size-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        backdrop.querySelectorAll('.ar-size-tab').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        currentCategory = btn.getAttribute('data-cat');
        renderTable();
      });
    });

    // Unit switcher
    backdrop.querySelectorAll('.ar-size-unit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        backdrop.querySelectorAll('.ar-size-unit-btn').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        currentUnit = btn.getAttribute('data-unit');
        renderTable();
      });
    });

    // Close button
    const closeBtn = document.getElementById('ar-size-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    // Backdrop click
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeModal();
    });

    // Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && backdrop.classList.contains('is-open')) {
        closeModal();
      }
    });

    // Global click delegation for any Size Guide link or button
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a, button');
      if (!link) return;

      const text = (link.textContent || '').trim().toLowerCase();
      const href = (link.getAttribute('href') || '').toLowerCase();
      const isSizeGuide =
        text === 'size guide' ||
        text === 'size chart' ||
        link.hasAttribute('data-open-size-guide') ||
        href.includes('size-guide') ||
        href.includes('size-chart');

      if (isSizeGuide) {
        // If not holding ctrl/cmd or middle-clicking
        if (!e.ctrlKey && !e.metaKey && e.button === 0) {
          e.preventDefault();
          e.stopPropagation();
          openModal();
        }
      }
    }, true);

    window.openSizeGuideModal = openModal;
    window.closeSizeGuideModal = closeModal;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
