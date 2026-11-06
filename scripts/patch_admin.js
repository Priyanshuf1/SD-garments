const fs = require('fs');
const path = require('path');

const adminPath = path.join(__dirname, '..', 'admin.html');
let content = fs.readFileSync(adminPath, 'utf8');

// Normalize line endings to avoid CRLF mismatch
const isCRLF = content.includes('\r\n');
content = content.replace(/\r\n/g, '\n');

// 1. Add NEW COLLECTION in top header bar
const oldHeaderAction = `<button class="btn btn-primary btn-sm header-action-btn" id="btn-add-product-quick" title="Add New Product">`;
const newHeaderAction = `<button class="btn btn-secondary btn-sm header-action-btn" onclick="Admin.openAddCollectionModal()" title="Add New Collection / Drop">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          <span class="btn-text">NEW COLLECTION</span>
        </button>
        <button class="btn btn-primary btn-sm header-action-btn" id="btn-add-product-quick" title="Add New Product">`;

if (content.includes(oldHeaderAction)) {
  content = content.replace(oldHeaderAction, newHeaderAction);
  console.log('1. Added NEW COLLECTION in top header bar');
} else {
  console.warn('1. Target oldHeaderAction not found');
}

// 2. Add New Collection in Dashboard Quick Shortcuts
const oldShortcuts = `<button class="btn btn-primary btn-sm" onclick="Admin.openAddProductModal()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            <span>New Product</span>
          </button>`;
const newShortcuts = `<button class="btn btn-primary btn-sm" onclick="Admin.openAddProductModal()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            <span>New Product</span>
          </button>
          <button class="btn btn-secondary btn-sm" onclick="Admin.openAddCollectionModal()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            <span>New Collection</span>
          </button>`;

if (content.includes(oldShortcuts)) {
  content = content.replace(oldShortcuts, newShortcuts);
  console.log('2. Added New Collection in Dashboard quick shortcuts');
} else {
  console.warn('2. Target oldShortcuts not found');
}

// 3. In Collections Section Header, place + Add Collection FIRST before search input
const oldCollActions = `<div class="panel-actions">
              <input type="text" id="coll-search-input" placeholder="Search collection title..." style="width: 220px; height: 34px;">
              <button class="btn btn-primary btn-sm" id="btn-add-collection">
                + New Drop
              </button>
            </div>`;
const newCollActions = `<div class="panel-actions">
              <button class="btn btn-primary btn-sm" id="btn-add-collection" onclick="Admin.openAddCollectionModal()" style="display:inline-flex;align-items:center;gap:6px;font-weight:700;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                <span>+ Add Collection</span>
              </button>
              <input type="text" id="coll-search-input" placeholder="Search collection title..." style="width: 200px; height: 34px;">
            </div>`;

if (content.includes(oldCollActions)) {
  content = content.replace(oldCollActions, newCollActions);
  console.log('3. Replaced collActions with prominent + Add Collection button FIRST');
} else {
  console.warn('3. Target oldCollActions not found');
}

// 4. In openAddProductModal(): DO NOT pre-fill demo images, set inputs to empty string ''
const oldOpenAddProd = `openAddProductModal() {
    document.getElementById('product-modal-title').textContent = 'Add New Product';
    document.getElementById('edit-prod-id').value = '';
    document.getElementById('edit-prod-title').value = '';
    document.getElementById('edit-prod-price').value = '1000';
    document.getElementById('edit-prod-compare').value = '2000';
    document.getElementById('edit-prod-category').value = 'Top Wear';
    document.getElementById('edit-prod-stock').value = '100';
    document.getElementById('edit-prod-homepage-section').value = 'none';
    this.updateFeaturedBadge('none');
    
    // Default primary flatlay + default model hover
    const defaultPrimary = 'https://cdn.shopify.com/s/files/1/0633/9339/9022/files/1_cd34702d-ac3b-4ee4-a9d4-1733e518d430.png?v=1792222977';
    const defaultHover = '/images/photo_1.webp';

    document.getElementById('edit-prod-image').value = defaultPrimary;
    document.getElementById('edit-prod-hover-image').value = defaultHover;
    document.getElementById('edit-prod-tags').value = 'Shop, New Arrivals, Unisex';
    
    this.switchPhotoTab('primary', 'link');
    this.switchPhotoTab('hover', 'link');
    this.previewProductImage(defaultPrimary);
    this.previewProductHoverImage(defaultHover);
    openModal('product-modal');
  }`;

const newOpenAddProd = `openAddProductModal() {
    document.getElementById('product-modal-title').textContent = 'Add New Product';
    document.getElementById('edit-prod-id').value = '';
    document.getElementById('edit-prod-title').value = '';
    document.getElementById('edit-prod-price').value = '1000';
    document.getElementById('edit-prod-compare').value = '2000';
    document.getElementById('edit-prod-category').value = 'Top Wear';
    document.getElementById('edit-prod-stock').value = '100';
    document.getElementById('edit-prod-homepage-section').value = 'none';
    this.updateFeaturedBadge('none');
    
    // Clean empty state - ZERO prefilled demo images
    document.getElementById('edit-prod-image').value = '';
    document.getElementById('edit-prod-hover-image').value = '';
    document.getElementById('edit-prod-tags').value = 'Shop, New Arrivals, Unisex';
    
    this.switchPhotoTab('primary', 'link');
    this.switchPhotoTab('hover', 'link');
    this.previewProductImage('');
    this.previewProductHoverImage('');
    this.editingProductImages = [];
    this.renderProductGalleryList();
    openModal('product-modal');
  },

  openAddCollectionModal() {
    document.getElementById('coll-title').value = '';
    document.getElementById('coll-handle').value = '';
    document.getElementById('coll-image').value = '';
    document.getElementById('coll-desc').value = '';
    this.switchCollPhotoTab('link');
    this.clearCollectionPhoto();
    openModal('collection-modal');
  }`;

if (content.includes(oldOpenAddProd)) {
  content = content.replace(oldOpenAddProd, newOpenAddProd);
  console.log('4. Cleaned openAddProductModal and added openAddCollectionModal');
} else {
  console.warn('4. Target oldOpenAddProd not found');
}

// 5. In renderCollections(), make card titles and handles clickable to the storefront URL
const oldRenderColl = `<span class="collection-card-title">\${c.title}</span>
            <span class="collection-card-handle">/collections/\${c.handle}</span>`;
const newRenderColl = `<a href="/collections/\${c.handle}" target="_blank" class="collection-card-title" style="color:var(--text-main);text-decoration:none;display:block;" title="View on storefront">\${c.title} ↗</a>
            <a href="/collections/\${c.handle}" target="_blank" class="collection-card-handle" style="color:var(--text-muted);text-decoration:none;" title="View on storefront">/collections/\${c.handle}</a>`;

if (content.includes(oldRenderColl)) {
  content = content.replace(oldRenderColl, newRenderColl);
  console.log('5. Made collection cards clickable to storefront');
}

// 6. Replace any remaining shopify demo image occurrences with local fallback /images/photo_1.webp
const demoRegex = /https:\/\/cdn\.shopify\.com\/s\/files\/1\/0633\/9339\/9022\/files\/1_cd34702d-ac3b-4ee4-a9d4-1733e518d430\.png\?v=1792222977/g;
const demoMatches = (content.match(demoRegex) || []).length;
content = content.replace(demoRegex, '/images/photo_1.webp');
console.log('6. Replaced ' + demoMatches + ' legacy demo image fallback occurrences with /images/photo_1.webp');

// Restore original line endings if needed
if (isCRLF) {
  content = content.replace(/\n/g, '\r\n');
}

fs.writeFileSync(adminPath, content, 'utf8');
console.log('admin.html successfully patched!');
