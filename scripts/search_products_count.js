const fs = require('fs');
const path = require('path');

function searchDir(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const full = path.join(dir, f);
    if (f === 'node_modules' || f === '.git' || f === 'spline') continue;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      searchDir(full);
    } else if (f.endsWith('.html') || f.endsWith('.js')) {
      const content = fs.readFileSync(full, 'utf8');
      const lines = content.split('\n');
      lines.forEach((l, idx) => {
        if (/PRODUCTS/i.test(l) && !/collection/i.test(l)) {
          if (l.includes('PRODUCTS') && (l.includes('textContent') || l.includes('innerHTML') || l.includes('PRODUCTS<') || l.includes('PRODUCTS"'))) {
            console.log(`${f}:${idx+1}: ${l.trim()}`);
          }
        }
      });
    }
  }
}

searchDir('.');
