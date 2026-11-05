const fs = require('fs');

const files = ['collections.html', 'index.html', 'product.html', 'account.html', 'checkout.html'];
files.forEach(f => {
  if (fs.existsSync(f)) {
    let content = fs.readFileSync(f, 'utf8');
    content = content.replaceAll(
      'href="/assets/css/custom.css"',
      'href="/assets/css/custom.css?v=20261106"'
    );
    content = content.replaceAll(
      'src="/assets/js/auth.js"',
      'src="/assets/js/auth.js?v=20261106"'
    );
    content = content.replaceAll(
      'src="/assets/js/wishlist.js"',
      'src="/assets/js/wishlist.js?v=20261106"'
    );
    fs.writeFileSync(f, content, 'utf8');
    console.log('Added cache buster to', f);
  }
});
