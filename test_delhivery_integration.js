/**
 * Automated Verification: Delhivery Express B2C Logistics Integration
 */

const assert = require('assert');
const delhivery = require('./lib/delhivery.js');

async function runTests() {
  console.log('🚚 Starting Delhivery Logistics Integration Test...');

  // 1. Config Check
  const cfg = delhivery.getConfig();
  console.log('\n[1] Verifying Delhivery Production Configuration:');
  assert.strictEqual(cfg.isConfigured, true, 'Delhivery must be configured');
  assert.strictEqual(cfg.warehouse, 'SD Garments', 'Warehouse name must match SD Garments');
  assert.strictEqual(cfg.warehousePin, '209721', 'Warehouse pin must be 209721');
  assert.strictEqual(cfg.token, '5b89b0734b0d4daa1655ea178e432c33f1964d80', 'Token must match provided token');
  console.log('  ✅ [PASS] Production configuration verified successfully');

  // 2. Chhibramau Warehouse Pincode Serviceability
  console.log('\n[2] Testing Live Delhivery API Pincode Serviceability (209721 - Chhibramau Hub):');
  const whRes = await delhivery.checkPincodeServiceability('209721');
  assert.strictEqual(whRes.serviceable, true, 'Pincode 209721 must be serviceable');
  assert.strictEqual(whRes.pickup, true, 'Pickup must be serviceable in Chhibramau');
  assert.strictEqual(whRes.cod, true, 'COD must be serviceable');
  assert.strictEqual(whRes.pre_paid, true, 'Prepaid must be serviceable');
  console.log(`  ✅ [PASS] Chhibramau (${whRes.city}, ${whRes.state}) is fully serviceable for Courier Pickup & Delivery!`);

  // 3. Metro Destination Pincode Serviceability (Delhi 110001)
  console.log('\n[3] Testing Live Delhivery API Destination Pincode (110001 - Delhi):');
  const destRes = await delhivery.checkPincodeServiceability('110001');
  assert.strictEqual(destRes.serviceable, true, 'Pincode 110001 must be serviceable');
  assert.strictEqual(destRes.cod, true, 'COD must be active for Delhi');
  console.log(`  ✅ [PASS] Delhi (${destRes.city}, ${destRes.state}) is fully serviceable!`);

  // 4. Packing Slip URL builder
  console.log('\n[4] Testing Packing Slip URL Generation:');
  const testAwb = '1409212345678';
  const labelUrl = delhivery.getPackingSlipUrl(testAwb);
  assert.ok(labelUrl.includes(testAwb), 'Label URL must contain waybill');
  assert.ok(labelUrl.includes('pdf=true'), 'Label URL must request PDF');
  console.log(`  ✅ [PASS] Packing slip URL verified: ${labelUrl}`);

  console.log('\n=============================================');
  console.log('🎉 ALL DELHIVERY INTEGRATION TESTS PASSED!');
  console.log('=============================================\n');
}

runTests().catch(err => {
  console.error('❌ Test Failed:', err);
  process.exit(1);
});
