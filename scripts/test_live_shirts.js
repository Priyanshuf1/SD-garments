const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const consoleLogs = [];
  const pageErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warn') {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    }
  });

  page.on('pageerror', err => {
    pageErrors.push(err.toString());
  });

  console.log('Navigating to https://alleyrich.com/collections/shirts...');
  try {
    await page.goto('https://alleyrich.com/collections/shirts', { waitUntil: 'networkidle2', timeout: 30000 });
  } catch (e) {
    console.log('Navigation warning:', e.message);
  }

  // Wait a bit for JS hydration
  await new Promise(r => setTimeout(r, 2000));

  const pageState = await page.evaluate(() => {
    const countText = document.getElementById('page-count-text')?.textContent?.trim();
    const grid = document.getElementById('product-grid');
    const cards = grid ? grid.querySelectorAll('.product-card').length : 0;
    const gridHtml = grid ? grid.innerHTML.slice(0, 300) : 'no grid';
    const activeChip = document.querySelector('.category-chip.active')?.textContent?.trim();
    const allCount = window.CollectionEngine ? window.CollectionEngine.allProducts.length : 'no engine';
    const filteredCount = window.CollectionEngine ? window.CollectionEngine.filteredProducts.length : 'no engine';
    const activeCat = window.CollectionEngine ? window.CollectionEngine.activeCategory : 'no engine';
    return { countText, cards, gridHtml, activeChip, allCount, filteredCount, activeCat };
  });

  console.log('Page state on live:', pageState);
  console.log('Page errors:', pageErrors);
  console.log('Console warnings/errors:', consoleLogs);

  await page.screenshot({ path: 'scripts/live_shirts_debug.png' });
  console.log('Saved screenshot to scripts/live_shirts_debug.png');

  await browser.close();
})();
