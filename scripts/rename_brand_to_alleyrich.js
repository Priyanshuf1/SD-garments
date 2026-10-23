const fs = require('fs');
const path = require('path');

const targetFiles = [
  'account.html',
  'admin.html',
  'checkout.html',
  'collections.html',
  'index.html',
  'login.html',
  'order-success.html',
  'product.html',
  'track.html',
  'data/settings.json',
  'pages/contact.html',
  'pages/privacy-policy.html',
  'pages/refund-policy.html',
  'pages/returns.html',
  'pages/reviews.html',
  'pages/shipping-policy.html',
  'pages/size-guide.html',
  'pages/terms-of-service.html',
  'pages/track-order.html',
  'assets/js/ai-support.js',
  'assets/js/app.js',
  'assets/js/auth.js',
  'assets/js/chat-widget.js',
  'assets/js/quick-buy.js',
  'assets/js/size-guide-modal.js',
  'assets/css/ai-support.css',
  'server.js',
  'lib/db.js',
  'lib/security.js',
  'lib/whatsapp.js',
  'Dockerfile',
  'docker-compose.yml',
  'PROJECT_OVERVIEW.md',
  'deploy_aws_infrastructure.sh',
  'test_ai_support_and_loader_fix.js',
  'test_marketing_broadcast.js',
  'test_chat_with_us_and_contact_form_removal.js',
  'test_user_requirements_final.js',
  'test_user_requirements_v10.js',
  'test_new_storefront_features.js'
];

let totalReplaced = 0;

for (const rel of targetFiles) {
  const full = path.join(__dirname, '..', rel);
  if (!fs.existsSync(full)) {
    console.log(`Skipping missing file: ${rel}`);
    continue;
  }

  let content = fs.readFileSync(full, 'utf8');
  let count = 0;

  // Replace uppercase ALLYRICH -> ALLEYRICH
  content = content.replace(/ALLYRICH/g, (match) => {
    count++;
    return 'ALLEYRICH';
  });

  // Replace mixed-case AllyRich -> AlleyRich (excluding window.replayAllyRichLoader)
  content = content.replace(/AllyRich(?!Loader)/g, (match) => {
    count++;
    return 'AlleyRich';
  });

  if (count > 0) {
    fs.writeFileSync(full, content, 'utf8');
    totalReplaced += count;
    console.log(`Updated ${rel}: ${count} replacements`);
  }
}

console.log(`\nFinished! Total replacements across all files: ${totalReplaced}`);
