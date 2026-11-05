const fs = require('fs');
let code = fs.readFileSync('admin.html', 'utf8');

// Replace CSV export file names
code = code.replace(
  'a.download = `genrage_orders_${Date.now()}.csv`;',
  'a.download = `alleyrich_orders_${Date.now()}.csv`;'
);

code = code.replace(
  'a.download = `genrage_customers_${Date.now()}.csv`;',
  'a.download = `alleyrich_customers_${Date.now()}.csv`;'
);

// Replace any fallback genrage image URLs
code = code.replaceAll(
  'https://genrage.com/cdn/shop/files/front_79f62e01-7f3f-468e-903c-959328f4d873.png?v=1758346828&width=800',
  '/images/photo_1.webp'
);
code = code.replaceAll(
  'https://genrage.com/cdn/shop/files/front_79f62e01-7f3f-468e-903c-959328f4d873.png?v=1758346828&width=600',
  '/images/photo_1.webp'
);

// Replace genrage_basics section value with alleyrich_basics while keeping compatibility
code = code.replaceAll('value="genrage_basics"', 'value="alleyrich_basics"');
code = code.replaceAll("hSection === 'genrage_basics'", "(hSection === 'alleyrich_basics' || hSection === 'genrage_basics')");
code = code.replaceAll("val === 'genrage_basics'", "(val === 'alleyrich_basics' || val === 'genrage_basics')");
code = code.replaceAll("'genrage_basics': '⭐ ALLEYRICH BASICS Carousel'", "'alleyrich_basics': '⭐ ALLEYRICH BASICS Carousel',\n          'genrage_basics': '⭐ ALLEYRICH BASICS Carousel'");

fs.writeFileSync('admin.html', code, 'utf8');
console.log('admin.html patched successfully');
