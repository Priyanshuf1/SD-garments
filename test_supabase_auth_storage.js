/**
 * Supabase Free Customer Auth & Storage Verification Test Suite
 */

const assert = require('assert');
const http = require('http');
const supabase = require('./lib/supabase.js');

async function run() {
  console.log('🧪 Starting Supabase Auth & Storage Integration Tests...\n');

  // Test 1: Supabase Configuration
  assert(supabase.isConfigured, 'Supabase must be configured with URL and Service Role Key');
  console.log('✅ [PASS] Supabase is configured and keys loaded');

  // Test 2: Profiles table accessible
  const profRes = await fetch(`${supabase.SUPABASE_URL}/rest/v1/profiles?select=count`, {
    headers: {
      apikey: supabase.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${supabase.SUPABASE_SERVICE_KEY}`
    }
  });
  assert(profRes.status === 200, 'public.profiles must return HTTP 200');
  console.log('✅ [PASS] public.profiles table is live and accessible');

  // Test 3: Storage product-images bucket accessible
  const storageRes = await fetch(`${supabase.SUPABASE_URL}/storage/v1/bucket/product-images`, {
    headers: {
      apikey: supabase.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${supabase.SUPABASE_SERVICE_KEY}`
    }
  });
  assert(storageRes.status === 200, 'Supabase product-images bucket must exist and return 200');
  console.log('✅ [PASS] Supabase Storage product-images bucket is active');

  // Test 4: Supabase Free Customer Registration
  const testEmail = `supatest_${Date.now()}@sdgarments.in`;
  const regRes = await supabase.auth.signUp({
    email: testEmail,
    password: 'password123',
    full_name: 'Priyanshu Supabase Member',
    phone: '+91 98765 43210'
  });
  assert(regRes.success, 'supabase.auth.signUp must succeed');
  assert(regRes.user?.id, 'supabase.auth.signUp must return user ID');
  console.log(`✅ [PASS] Supabase Auth registered customer (${regRes.user.id})`);

  // Test 5: Verify profile was created in public.profiles
  const userProfile = await supabase.profiles.get(regRes.user.id);
  assert(userProfile && userProfile.email === testEmail, 'Profile must exist in public.profiles with email');
  console.log(`✅ [PASS] Customer profile verified in public.profiles table`);

  // Test 6: Supabase Password Login
  const loginRes = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: 'password123'
  });
  assert(loginRes.success, 'supabase.auth.signInWithPassword must succeed');
  assert(loginRes.token, 'Must return JWT access token');
  console.log(`✅ [PASS] Supabase Auth Password Login succeeded with JWT`);

  // Test 7: Profile Update in Supabase
  const updated = await supabase.profiles.update(regRes.user.id, {
    name: 'Priyanshu Updated VIP',
    phone: '+91 91111 22222'
  });
  assert(updated, 'Profile update must succeed');
  console.log(`✅ [PASS] Customer profile updated in Supabase PostgreSQL`);

  // Test 8: Wishlist sync in Supabase
  const wishSynced = await supabase.wishlists.sync(regRes.user.id, ['arch-dark-grey-unisex-straight-fit-baggy-pants']);
  assert(wishSynced, 'supabase.wishlists.sync must succeed');
  const userWishlist = await supabase.wishlists.getByUserId(regRes.user.id);
  assert(userWishlist.length >= 1, 'Wishlist must contain synced product');
  console.log(`✅ [PASS] Customer wishlist synced to public.wishlists table (${userWishlist.length} item)`);

  // Cleanup test user
  await fetch(`${supabase.SUPABASE_URL}/auth/v1/admin/users/${regRes.user.id}`, {
    method: 'DELETE',
    headers: {
      apikey: supabase.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${supabase.SUPABASE_SERVICE_KEY}`
    }
  });
  console.log(`✅ [PASS] Cleaned up temporary test user`);

  console.log('\n========================================');
  console.log('ALL SUPABASE AUTH & STORAGE TESTS PASSED!');
  console.log('========================================\n');
}

run().catch(err => {
  console.error('❌ Supabase Test Failed:', err);
  process.exit(1);
});
