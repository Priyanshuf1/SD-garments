/**
 * Automated Verification for Exact Screenshot Card UI:
 * 1. "Let's talk on Instagram"
 * 2. "Lets talk on WhatsApp"
 * 3. "Track Your Order"
 * 4. "Send us an Email"
 * Checking icons, chevrons, white card styling, and links in both chat-widget.js and pages/contact.html
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let total = 0;

function assert(condition, message) {
  total++;
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  passed++;
  console.log(`✅ PASS: ${message}`);
}

console.log('\n======================================================');
console.log('🧪 VERIFYING CHAT WITH US EXACT 4-CARD SCREENSHOT UI');
console.log('======================================================\n');

const rootDir = __dirname;
const widgetPath = path.join(rootDir, 'assets', 'js', 'chat-widget.js');
const contactPath = path.join(rootDir, 'pages', 'contact.html');

assert(fs.existsSync(widgetPath), 'assets/js/chat-widget.js exists');
assert(fs.existsSync(contactPath), 'pages/contact.html exists');

const widgetContent = fs.readFileSync(widgetPath, 'utf8');
const contactContent = fs.readFileSync(contactPath, 'utf8');

console.log('--- 1. Testing Chat Widget 4 Cards ---');
assert(widgetContent.includes("Let's talk on Instagram"), 'Widget has "Let\'s talk on Instagram"');
assert(widgetContent.includes("Lets talk on WhatsApp"), 'Widget has "Lets talk on WhatsApp"');
assert(widgetContent.includes("Track Your Order"), 'Widget has "Track Your Order"');
assert(widgetContent.includes("Send us an Email"), 'Widget has "Send us an Email"');

console.log('--- 2. Testing Chat Widget Card Styling ---');
assert(widgetContent.includes('background: #ffffff;'), 'Widget cards use pure white background');
assert(widgetContent.includes('border-radius: 16px;'), 'Widget cards use 16px rounded corners');
assert(widgetContent.includes('polyline points="9 18 15 12 9 6"'), 'Widget cards use clean right chevron arrow');
assert(widgetContent.includes('ar-ig-grad-widget'), 'Widget includes official Instagram gradient definition');
assert(widgetContent.includes('#25D366'), 'Widget includes official WhatsApp green color');

console.log('--- 3. Testing Contact Page 4 Cards ---');
assert(contactContent.includes("Let's talk on Instagram"), 'Contact page has "Let\'s talk on Instagram"');
assert(contactContent.includes("Lets talk on WhatsApp"), 'Contact page has "Lets talk on WhatsApp"');
assert(contactContent.includes("Track Your Order"), 'Contact page has "Track Your Order"');
assert(contactContent.includes("Send us an Email"), 'Contact page has "Send us an Email"');

console.log('--- 4. Testing Links and Integrations ---');
assert(widgetContent.includes('919876543210') && widgetContent.includes('https://wa.me/'), 'Widget WhatsApp link is active');
assert(widgetContent.includes('https://ig.me/m/allyrich_'), 'Widget Instagram link is active');
assert(widgetContent.includes('/track'), 'Widget Track Order link points to /track');
assert(widgetContent.includes('mailto:care@allyrich.com'), 'Widget email link points to mailto:care@allyrich.com');

assert(contactContent.includes('https://wa.me/919876543210'), 'Contact page WhatsApp link is active');
assert(contactContent.includes('https://ig.me/m/allyrich_'), 'Contact page Instagram link is active');
assert(contactContent.includes('/track'), 'Contact page Track Order links to /track');
assert(contactContent.includes('mailto:care@allyrich.com'), 'Contact page email links to care@allyrich.com');

console.log('\n======================================================');
console.log(`🎉 ALL ${passed}/${total} EXACT CARD UI TESTS PASSED!`);
console.log('======================================================\n');
