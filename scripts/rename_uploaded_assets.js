const fs = require('fs');
const path = require('path');

const uploadDir = 'assets/uploads';
if (fs.existsSync(uploadDir)) {
  const files = fs.readdirSync(uploadDir);
  files.forEach(f => {
    if (f.startsWith('genrage_')) {
      const newName = f.replace(/^genrage_/, 'alleyrich_');
      fs.copyFileSync(path.join(uploadDir, f), path.join(uploadDir, newName));
      console.log('Copied', f, '->', newName);
    }
  });
}

// Update data/products.json
if (fs.existsSync('data/products.json')) {
  let content = fs.readFileSync('data/products.json', 'utf8');
  content = content.replaceAll('/assets/uploads/genrage_', '/assets/uploads/alleyrich_');
  fs.writeFileSync('data/products.json', content, 'utf8');
  console.log('Updated data/products.json paths');
}
