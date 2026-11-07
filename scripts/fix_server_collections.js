const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, '..', 'server.js');
let content = fs.readFileSync(serverPath, 'utf8');

const isCRLF = content.includes('\r\n');
content = content.replace(/\r\n/g, '\n');

// Remove the mistakenly nested collections block inside /api/products
const nestedBlock = `    // Live Public Collections & Seasonal Drops API
  if (pathname === '/api/collections' || pathname.startsWith('/api/collections/')) {
    if (req.method === 'GET') {
      const collLimit = security.checkRateLimit(\`colls:\${security.getClientIp(req)}\`, 240, 60);
      if (!collLimit.allowed) return sendJson(res, 429, { success: false, message: 'Too many collection requests.' }, { 'Retry-After': String(collLimit.resetAfterSeconds) });
      const cData = readJsonFile('collections.json', { collections: [] });
      const collections = cData.collections || [];
      const query = parsedUrl.searchParams.get('search')?.toLowerCase();
      let filtered = collections;
      if (query) {
        filtered = filtered.filter(c =>
          (c.title && c.title.toLowerCase().includes(query)) ||
          (c.handle && c.handle.toLowerCase().includes(query))
        );
      }
      return sendJson(res, 200, { success: true, count: filtered.length, collections: filtered });
    }
  }\n\n`;

content = content.replace(nestedBlock, '');

// Now add it properly right before Live Public Delhivery Pincode Serviceability API
const target = `    // Live Public Delhivery Pincode Serviceability API`;
const replacement = `  // Live Public Collections & Seasonal Drops API
  if (pathname === '/api/collections' || pathname.startsWith('/api/collections/')) {
    if (req.method === 'GET') {
      const collLimit = security.checkRateLimit(\`colls:\${security.getClientIp(req)}\`, 240, 60);
      if (!collLimit.allowed) return sendJson(res, 429, { success: false, message: 'Too many collection requests.' }, { 'Retry-After': String(collLimit.resetAfterSeconds) });
      const cData = readJsonFile('collections.json', { collections: [] });
      const collections = cData.collections || [];
      const query = parsedUrl.searchParams.get('search')?.toLowerCase();
      let filtered = collections;
      if (query) {
        filtered = filtered.filter(c =>
          (c.title && c.title.toLowerCase().includes(query)) ||
          (c.handle && c.handle.toLowerCase().includes(query))
        );
      }
      return sendJson(res, 200, { success: true, count: filtered.length, collections: filtered });
    }
  }

    // Live Public Delhivery Pincode Serviceability API`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  console.log('Successfully moved /api/collections to proper top-level route handler');
} else {
  console.warn('Target not found');
}

if (isCRLF) content = content.replace(/\n/g, '\r\n');
fs.writeFileSync(serverPath, content, 'utf8');
