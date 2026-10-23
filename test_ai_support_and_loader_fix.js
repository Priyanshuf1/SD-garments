const http = require('http');
const assert = require('assert');

function get(path) {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:3000' + path, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

async function verify() {
  console.log('--- Testing Chat Widget Text Updates ---');
  const jsRes = await get('/assets/js/ai-support.js');
  assert.strictEqual(jsRes.status, 200, 'ai-support.js served 200');
  assert(jsRes.body.includes('NEED HELP ?'), 'ai-support.js contains NEED HELP ?');
  assert(jsRes.body.includes('Online &bull; AI Help Assistant'), 'ai-support.js contains Online • AI Help Assistant');
  assert(jsRes.body.includes('<span class="ar-launcher-sub">AI Help Assistant</span>'), 'Launcher sub contains AI Help Assistant');
  assert(jsRes.body.includes('Welcome to **ALLEYRICH**. I am your 24/7 AI Help Assistant.'), 'Welcome message updated');
  assert(!jsRes.body.includes('AR Concierge'), 'ai-support.js has no legacy AR Concierge text');
  assert(!jsRes.body.includes('Streetwear Specialist'), 'ai-support.js has no legacy Streetwear Specialist text');
  console.log('✅ Chat widget text verified: NEED HELP ? & AI Help Assistant present, old text removed.');

  console.log('\n--- Testing Section Navigation & Loader Fix ---');
  const cssRes = await get('/assets/css/allyrich.css');
  assert.strictEqual(cssRes.status, 200, 'allyrich.css served 200');
  assert(cssRes.body.includes('display: none; /* Hidden by default to prevent flashes on section navigation */'), 'CSS defaults loader to display: none');
  assert(cssRes.body.includes('.no-loader .loader'), 'CSS has .no-loader rule');
  assert(cssRes.body.includes('display: none !important;'), 'CSS has !important hide');

  const colRes = await get('/collections/bottoms');
  assert.strictEqual(colRes.status, 200, '/collections/bottoms served 200');
  assert(colRes.body.includes("document.documentElement.classList.add('no-loader')"), 'collections.html has fast head no-loader guard');
  assert(colRes.body.includes('class="loader loader--done" id="ForumLoader" aria-hidden="true" style="display:none !important;"'), 'collections.html ForumLoader is permanently suppressed');

  const topsRes = await get('/collections/tops');
  assert.strictEqual(topsRes.status, 200, '/collections/tops served 200');
  assert(topsRes.body.includes('style="display:none !important;"'), 'Tops section also permanently suppresses loader');

  const prodRes = await get('/product.html');
  assert.strictEqual(prodRes.status, 200, '/product.html served 200');
  assert(prodRes.body.includes("document.documentElement.classList.add('no-loader')"), 'product.html has no-loader class guard');
  assert(prodRes.body.includes('style="display:none !important;"'), 'product.html permanently suppresses loader');

  console.log('✅ Section navigation verified: zero loader flashes or triggers on any section!');
}

verify().then(() => {
  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}).catch(e => {
  console.error('\n❌ Verification failed:', e.message);
  process.exit(1);
});
