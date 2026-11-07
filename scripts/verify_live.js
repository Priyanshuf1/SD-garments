async function verifyLive() {
  console.log('--- VERIFYING LIVE PRODUCTION SERVER (https://alleyrich.com) ---');

  // 1. Collections API
  const colRes = await fetch('https://alleyrich.com/api/collections');
  console.log('1. /api/collections HTTP status:', colRes.status);
  try {
    const colData = await colRes.json();
    console.log('   Collections count:', colData.count, 'Success:', colData.success);
  } catch (e) {
    console.log('   /api/collections not JSON or 404 yet');
  }

  // 2. Phone Screen Asset
  const screenRes = await fetch('https://alleyrich.com/assets/spline-phone-screen.jpg?v=20261106');
  console.log('2. /assets/spline-phone-screen.jpg HTTP status:', screenRes.status, 'Content-Length:', screenRes.headers.get('content-length'));

  // 3. Check Live Admin Panel (/allyrich-hq)
  const adminRes = await fetch('https://alleyrich.com/allyrich-hq');
  console.log('3. /allyrich-hq HTTP status:', adminRes.status);
  const adminText = await adminRes.text();
  console.log('   Contains btn-add-collection:', adminText.includes('id="btn-add-collection"'));
  console.log('   Contains openAddCollectionModal:', adminText.includes('openAddCollectionModal()'));
  console.log('   Contains NEW COLLECTION top action:', adminText.includes('NEW COLLECTION'));
  console.log('   Zero legacy demo images in admin:', !adminText.includes('1_cd34702d-ac3b-4ee4-a9d4-1733e518d430'));
  console.log('   Add product modal has clean empty images:', adminText.includes("document.getElementById('edit-prod-image').value = '';"));

  // 4. Check Live Storefront Index
  const idxRes = await fetch('https://alleyrich.com/?v=' + Date.now());
  console.log('4. index.html HTTP status:', idxRes.status);
  const idxText = await idxRes.text();
  console.log('   Contains COLLECTIONS nav menu:', idxText.includes('data-title="COLLECTIONS"'));
  console.log('   Contains COLLECTIONS & DROPS mobile drawer:', idxText.includes('COLLECTIONS & DROPS</a>'));
  console.log('   Preloads scene.splinecode:', idxText.includes('/assets/spline/scene.splinecode'));

  // 5. Check Live Storefront Collections
  const dropsRes = await fetch('https://alleyrich.com/collections?view=drops');
  console.log('5. /collections?view=drops HTTP status:', dropsRes.status);
  const dropsText = await dropsRes.text();
  console.log('   Contains renderCollectionsShowcase:', dropsText.includes('renderCollectionsShowcase'));
  console.log('   Contains COLLECTIONS & DROPS chips:', dropsText.includes('view=drops'));

  console.log('\n--- LIVE PRODUCTION VERIFICATION COMPLETE ---');
}

verifyLive().catch(console.error);
