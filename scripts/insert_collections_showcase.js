const fs = require('fs');
const path = require('path');

const colPath = path.join(__dirname, '..', 'collections.html');
let content = fs.readFileSync(colPath, 'utf8');

const isCRLF = content.includes('\r\n');
content = content.replace(/\r\n/g, '\n');

const target = '      renderGrid() {';
const replacement = `      renderCollectionsShowcase() {
        const grid = document.getElementById('product-grid');
        const countText = document.getElementById('page-count-text');
        const colls = this.allCollections || [];
        if (countText) countText.textContent = \`\${colls.length} COLLECTIONS & DROPS\`;
        if (!grid) return;

        grid.innerHTML = \`
          <div style="grid-column: 1 / -1; display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.5rem; padding: 1.5rem 0;">
            \${colls.map(c => {
              const img = c.image?.src || '/images/photo_1.webp';
              return \`
                <div style="background:#0a0a0a; border:1px solid #222; border-radius:6px; overflow:hidden; display:flex; flex-direction:column; transition:transform 0.2s ease, border-color 0.2s ease;">
                  <div style="position:relative; aspect-ratio:16/9; background:#111; overflow:hidden;">
                    <img src="\${img}" alt="\${c.title}" style="width:100%; height:100%; object-fit:cover; display:block;" onerror="this.src='/images/photo_1.webp'">
                    <span style="position:absolute; top:10px; left:10px; background:rgba(0,0,0,0.75); color:#fff; font-size:11px; font-weight:800; letter-spacing:0.06em; padding:3px 8px; border-radius:2px; text-transform:uppercase;">
                      \${c.products_count || 0} PRODUCTS
                    </span>
                  </div>
                  <div style="padding:1.25rem; flex:1; display:flex; flex-direction:column; justify-content:space-between;">
                    <div>
                      <h3 style="font-size:1.05rem; font-weight:800; margin:0 0 0.5rem 0; letter-spacing:0.04em; color:#fff;">\${c.title}</h3>
                      <p style="font-size:0.85rem; color:#888; line-height:1.4; margin:0 0 1rem 0;">\${c.description || 'Exclusive limited streetwear capsule drop.'}</p>
                    </div>
                    <a href="/collections/\${c.handle}" onclick="event.preventDefault(); CollectionEngine.setCategory('\${c.handle}', '/collections/\${c.handle}');" style="display:inline-block; text-align:center; background:#fff; color:#000; padding:10px 18px; font-weight:800; font-size:0.8rem; letter-spacing:0.08em; text-transform:uppercase; text-decoration:none; border-radius:2px; transition:background 0.2s ease;">
                      EXPLORE DROP →
                    </a>
                  </div>
                </div>
              \`;
            }).join('')}
          </div>
        \`;
      },

      renderGrid() {`;

if (content.includes(target) && !content.includes('renderCollectionsShowcase() {')) {
  content = content.replace(target, replacement);
  if (isCRLF) content = content.replace(/\n/g, '\r\n');
  fs.writeFileSync(colPath, content, 'utf8');
  console.log('Successfully inserted renderCollectionsShowcase() into collections.html');
} else {
  console.log('Target not found or already inserted');
}
