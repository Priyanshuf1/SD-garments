process.on('uncaughtException', (err) => { console.error('[UNCAUGHT EXCEPTION GUARD]', err.message); });
process.on('unhandledRejection', (reason) => { console.error('[UNHANDLED REJECTION GUARD]', reason); });
/**
 * GENRAGE - 1:1 Ditto Server with Full Video Streaming, Proxy, and Admin Control Hub API
 */

const http = require('http');
const https = require('https');
const dns = require('dns').promises;
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

// Load environment variables from .env and .env.local if present
['.env', '.env.local'].forEach(file => {
  const p = path.join(__dirname, file);
  if (fs.existsSync(p)) {
    try {
      const content = fs.readFileSync(p, 'utf8');
      content.split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const idx = trimmed.indexOf('=');
          const key = trimmed.substring(0, idx).trim();
          let val = trimmed.substring(idx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.substring(1, val.length - 1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      });
    } catch (e) {}
  }
});

const supabase = require('./lib/supabase.js');
const security = require('./lib/security.js');
const redis = require('./lib/redis.js');
const whatsapp = require('./lib/whatsapp.js');
const delhivery = require('./lib/delhivery.js');
const totp = require('./lib/totp.js');
let db = null;
try {
  db = require('./lib/db.js');
} catch (e) {
  console.warn('AWS RDS adapter not loaded:', e.message);
}

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;
const DATA_DIR = path.join(PUBLIC_DIR, 'data');
const otpCache = new Map();
const cashfreeWebhookEvents = new Map();
let orderMutationQueue = Promise.resolve();
const FREE_SHIPPING_THRESHOLD = 1999;
const DEFAULT_SHIPPING_FEE = Number.isFinite(Number(process.env.SHIPPING_FEE_INR)) ? Math.max(0, Number(process.env.SHIPPING_FEE_INR)) : 99;
const CASHFREE_API_VERSION = '2023-08-01';

function getConfiguredOrigin(req) {
  const configured = String(process.env.APP_ORIGIN || 'https://alleyrich.com').replace(/\/$/, '');
  const allowed = new Set([configured, 'https://alleyrich.com', 'https://www.alleyrich.com']);
  if (process.env.NODE_ENV !== 'production') {
    allowed.add('http://localhost:3000');
    allowed.add('http://127.0.0.1:3000');
    allowed.add(`http://localhost:${PORT}`);
    allowed.add(`http://127.0.0.1:${PORT}`);
  }
  const origin = req.headers.origin;
  return origin && allowed.has(origin) ? origin : null;
}

function applyCors(req, res) {
  const origin = getConfiguredOrigin(req);
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
}

function getBearerToken(req) {
  const header = String(req.headers.authorization || '');
  return header.replace(/^Bearer\s+/i, '').trim();
}

function getLocalCustomerClaims(req) {
  return security.validateCustomerSession(getBearerToken(req));
}

async function getAuthenticatedIdentity(req) {
  const token = getBearerToken(req);
  const localClaims = security.validateCustomerSession(token);
  if (localClaims) return { id: String(localClaims.sub), email: String(localClaims.email || '').toLowerCase(), token };
  if (token && supabase.isConfigured) {
    const user = await supabase.auth.getUser(token).catch(() => null);
    if (user?.id) return { id: String(user.id), email: String(user.email || '').toLowerCase(), token };
  }
  return null;
}

function cleanText(value, maxLength = 200) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, maxLength);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[character]));
}

function safeHttpUrl(value, fallback = 'https://alleyrich.com/collections.html') {
  try {
    const parsed = new URL(String(value || fallback));
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : fallback;
  } catch (_) {
    return fallback;
  }
}

function isValidEmail(email) {
  return /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,63}$/.test(email);
}

function isValidIndianPhone(phone) {
  return /^[6-9]\d{9}$/.test(String(phone).replace(/\D/g, '').slice(-10));
}

function isValidIndianPincode(pin) {
  return /^[1-9]\d{5}$/.test(String(pin));
}

function generateOrderId() {
  return `GR-${crypto.randomBytes(10).toString('hex').toUpperCase()}`;
}

function constantTimeStringEquals(leftValue, rightValue) {
  const left = Buffer.from(String(leftValue || ''));
  const right = Buffer.from(String(rightValue || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function orderBelongsToIdentity(order, identity) {
  if (!identity) return false;
  const email = String(order.customer?.email || order.email || order.guest_email || '').toLowerCase();
  const id = String(order.userId || order.user_id || order.customerId || '');
  return Boolean((identity.email && email === identity.email) || (identity.id && id === identity.id));
}

function hashSecret(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function publicCustomer(customer) {
  if (!customer || typeof customer !== 'object') return customer;
  const safe = { ...customer };
  delete safe.password;
  delete safe.passwordHash;
  delete safe.password_hash;
  return safe;
}

function customerOrderView(order) {
  if (!order || typeof order !== 'object') return order;
  const safe = { ...order, customer: publicCustomer(order.customer) };
  delete safe.checkoutTokenHash;
  delete safe.cashfreeOrderId;
  delete safe.cashfreePaymentId;
  delete safe.inventoryReservedAt;
  delete safe.inventoryReleasedAt;
  return safe;
}

function isCheckoutTokenValid(order, token) {
  if (!order?.checkoutTokenHash || !token) return false;
  return constantTimeStringEquals(hashSecret(token), order.checkoutTokenHash);
}

function serializeOrderMutation(work) {
  const result = orderMutationQueue.then(work, work);
  orderMutationQueue = result.catch(() => {});
  return result;
}

async function reserveLocalInventory(items) {
  const data = readJsonFile('products.json', { products: [] });
  const products = Array.isArray(data) ? data : (data.products || []);
  const changed = [];
  for (const item of items) {
    const product = products.find(p => String(p.id) === String(item.id) || p.handle === item.handle);
    const variant = product?.variants?.find(v => String(v.id) === String(item.variantId)) || product?.variants?.[0];
    if (!variant || variant.available === false || Number(variant.inventory_quantity ?? 0) < item.quantity) {
      for (const change of changed) change.variant.inventory_quantity += change.quantity;
      return false;
    }
    variant.inventory_quantity = Number(variant.inventory_quantity ?? 0) - item.quantity;
    if (variant.inventory_quantity <= 0) variant.available = false;
    changed.push({ variant, quantity: item.quantity });
  }
  if (!writeJsonFile('products.json', { products })) return false;
  memoryProducts = filterOutGiftCards(products);
  memoryProductsLastFetch = Date.now();
  return true;
}

async function releaseLocalInventory(items) {
  const data = readJsonFile('products.json', { products: [] });
  const products = Array.isArray(data) ? data : (data.products || []);
  for (const item of items || []) {
    const product = products.find(p => String(p.id) === String(item.id) || p.handle === item.handle);
    const variant = product?.variants?.find(v => String(v.id) === String(item.variantId)) || product?.variants?.[0];
    if (variant) {
      variant.inventory_quantity = Number(variant.inventory_quantity || 0) + Number(item.quantity || 0);
      variant.available = true;
    }
  }
  writeJsonFile('products.json', { products });
  memoryProducts = filterOutGiftCards(products);
  memoryProductsLastFetch = Date.now();
}

async function reserveInventory(items) {
  // Database-backed deployments should use the atomic SQL function. Local
  // development/fallback mode uses the serialized JSON reservation below.
  let success = false;
  const canUseCloudInventory = supabase.isConfigured && typeof supabase.rpc === 'function' &&
    items.every(item => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(item.variantId || '')));
  if (canUseCloudInventory) {
    const reserved = [];
    try {
      for (const item of items) {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(item.variantId || ''))) continue;
        const result = await supabase.rpc('decrement_stock', { p_variant_id: item.variantId, p_quantity: item.quantity });
        const ok = result === true || (Array.isArray(result) && result[0] === true) || result?.[0]?.decrement_stock === true;
        if (!ok) throw new Error('Insufficient inventory');
        reserved.push(item);
      }
      success = true;
    } catch (_) {
      if (reserved.length && typeof supabase.rpc === 'function') {
        for (const item of reserved) await supabase.rpc('increment_stock', { p_variant_id: item.variantId, p_quantity: item.quantity }).catch(() => {});
      }
      return false;
    }
  } else {
    reserveLocalInventory(items);
    success = true;
  }
  if (success) {
    await redis.cacheDel('alleyrich:catalog:products:*');
  }
  return success;
}

async function releaseInventory(items) {
  const canUseCloudInventory = supabase.isConfigured && typeof supabase.rpc === 'function' &&
    (items || []).every(item => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(item.variantId || '')));
  if (canUseCloudInventory) {
    for (const item of items || []) {
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(item.variantId || ''))) {
        await supabase.rpc('increment_stock', { p_variant_id: item.variantId, p_quantity: item.quantity }).catch(() => {});
      }
    }
  } else {
    releaseLocalInventory(items);
  }
  await redis.cacheDel('alleyrich:catalog:products:*');
}

function parseRawBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    let settled = false;
    const fail = (error) => {
      if (!settled) { settled = true; reject(error); }
    };
    if (Number(req.headers['content-length'] || 0) > maxBytes) {
      return fail(new Error('Payload too large'));
    }
    req.on('data', chunk => {
      if (settled) return;
      bytes += chunk.length;
      if (bytes > maxBytes) {
        req.destroy();
        return fail(new Error('Payload too large'));
      }
      chunks.push(Buffer.from(chunk));
    });
    req.on('end', () => {
      if (!settled) { settled = true; resolve(Buffer.concat(chunks)); }
    });
    req.on('error', fail);
  });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.bin': 'application/octet-stream',
  '.splinecode': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.splinecode': 'application/octet-stream',
  '.mp3': 'audio/mpeg'
};

function serveVideoWithRange(req, res, filePath) {
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim());
    if (!match || (!match[1] && !match[2])) {
      res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
      return res.end();
    }
    let start = match[1] ? Number(match[1]) : Math.max(0, fileSize - Number(match[2]));
    let end = match[2] ? Number(match[2]) : fileSize - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= fileSize || end < start) {
      res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
      return res.end();
    }
    end = Math.min(end, fileSize - 1);
    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4'
    });
    file.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes'
    });
    fs.createReadStream(filePath).pipe(res);
  }
}

function proxyRequest(req, res, targetUrl) {
  if (!['GET', 'HEAD'].includes(req.method)) {
    return sendJson(res, 405, { success: false, message: 'Method not allowed' }, { Allow: 'GET, HEAD' });
  }
  const parsed = new URL(targetUrl);
  const options = {
    hostname: parsed.hostname,
    port: 443,
    path: parsed.pathname + parsed.search,
    method: req.method,
    headers: {
      'user-agent': req.headers['user-agent'] || 'ALLEYRICH-asset-proxy',
      accept: req.headers.accept || '*/*',
      host: parsed.hostname,
      referer: 'https://genrage.com/'
    }
  };

  const proxy = https.request({ ...options, timeout: 8000 }, (remoteRes) => {
    if (remoteRes.statusCode >= 400 && /\.(png|jpe?g|webp|gif|svg)$/i.test(parsed.pathname)) {
      const fallbackPath = path.join(PUBLIC_DIR, 'images', 'photo_1.webp');
      if (fs.existsSync(fallbackPath)) {
        res.writeHead(200, {
          'Content-Type': 'image/webp',
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*'
        });
        return fs.createReadStream(fallbackPath).pipe(res);
      }
    }
    res.writeHead(remoteRes.statusCode, {
      'Content-Type': remoteRes.headers['content-type'] || 'application/octet-stream',
      'Cache-Control': remoteRes.headers['cache-control'] || 'public, max-age=300'
    });
    remoteRes.pipe(res);
  });

  proxy.on('timeout', () => proxy.destroy(new Error('Asset proxy timed out')));

  proxy.on('error', (err) => {
    console.error('Proxy error:', err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
    }
    res.end('Proxy Error');
  });

  req.pipe(proxy);
}

async function downloadFile(sourceUrl, destPath, redirectCount = 0) {
  if (redirectCount > 3 || !security.isSafeRemoteUrl(sourceUrl)) {
    throw new Error('Remote download URL is not allowed');
  }
  const parsed = new URL(sourceUrl);
  const resolvedAddresses = await dns.lookup(parsed.hostname, { all: true });
  if (!resolvedAddresses.length || resolvedAddresses.some(({ address }) => {
    const safeHost = address.includes(':') ? `[${address}]` : address;
    return !security.isSafeRemoteUrl(`${parsed.protocol}//${safeHost}`);
  })) {
    throw new Error('Remote download resolves to a restricted network address');
  }
  const pinnedAddress = resolvedAddresses[0];
  return new Promise((resolve, reject) => {
    const client = parsed.protocol === 'https:' ? https : http;
    const request = client.get(sourceUrl, {
      timeout: 10000,
      lookup: (_hostname, _options, callback) => callback(null, pinnedAddress.address, pinnedAddress.family)
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const nextUrl = new URL(res.headers.location, sourceUrl).toString();
        res.resume();
        return downloadFile(nextUrl, destPath, redirectCount + 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`Failed to download: HTTP ${res.statusCode}`));
      }
      const maxBytes = 50 * 1024 * 1024;
      if (Number(res.headers['content-length'] || 0) > maxBytes) {
        res.resume();
        return reject(new Error('Remote file exceeds the 50MB limit'));
      }
      const tempPath = `${destPath}.${process.pid}.download`;
      let received = 0;
      const fileStream = fs.createWriteStream(tempPath, { mode: 0o600 });
      res.on('data', chunk => {
        received += chunk.length;
        if (received > maxBytes) {
          request.destroy(new Error('Remote file exceeds the 50MB limit'));
        }
      });
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close(() => {
          try { fs.renameSync(tempPath, destPath); resolve(); } catch (error) { reject(error); }
        });
      });
      fileStream.on('error', error => {
        try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}
        reject(error);
      });
    });
    request.on('timeout', () => request.destroy(new Error('Remote download timed out')));
    request.on('error', reject);
  });
}

const SECTION_VIDEOS = [
  { name: 'hero_desktop.mp4', title: 'Hero Section Desktop Video', section: 'Homepage Hero Desktop', res: '2880 × 1080 (2.67:1 Ultra-wide)' },
  { name: 'hero_mobile.mp4', title: 'Hero Section Mobile Video', section: 'Homepage Hero Mobile', res: '810 × 1080 (0.75:1 Portrait)' },
  { name: 'lookbook1_desktop.mp4', title: 'Gothic "G" Lookbook Desktop', section: 'Artisan Lookbook Desktop', res: '2520 × 1080 (2.33:1 Cinematic)' },
  { name: 'lookbook1_mobile.mp4', title: 'Gothic "G" Lookbook Mobile', section: 'Artisan Lookbook Mobile', res: '1080 × 1080 (1:1 Square)' },
  { name: 'pants_feature.mp4', title: 'Streetwear Pants Feature Reel', section: 'Pants & Bottoms Showcase', res: '836 × 1080 (0.78:1 Portrait)' },
  { name: 'showcase2.mp4', title: '3D River & Streetwear Showcase', section: 'Art Direction 3D Reel', res: '1920 × 1080 (16:9 Full HD)' }
];

function readJsonFile(filename, fallback = []) {
  const p = path.join(DATA_DIR, filename);
  try {
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
  } catch (err) {
    console.error(`Error reading ${filename}:`, err.message);
  }
  return fallback;
}

function writeJsonFile(filename, data) {
  const p = path.join(DATA_DIR, filename);
  const tempPath = `${p}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tempPath, p);
    if (filename === 'products.json') {
      memoryProducts = null;
      memoryProductsLastFetch = 0;
    }
    if (filename === 'orders.json') {
      memoryOrders = null;
      memoryOrdersLastFetch = 0;
    }
    return true;
  } catch (err) {
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}
    console.error(`Error writing ${filename}:`, err.message);
    return false;
  }
}

async function getUnifiedSubscribers() {
  if (db && db.isConfigured) {
    try {
      const awsSubs = await db.subscribers.getAll();
      if (Array.isArray(awsSubs) && awsSubs.length > 0) return awsSubs;
    } catch (e) {
      console.warn('AWS RDS subscribers fetch warning:', e.message);
    }
  }
  let localSubs = readJsonFile('subscribers.json', []);
  if (supabase.isConfigured && supabase.subscribers) {
    try {
      const cloudSubs = await supabase.subscribers.getAll();
      if (cloudSubs && cloudSubs.length > 0) {
        const seen = new Set();
        const merged = [];
        for (const s of cloudSubs) {
          const em = (s.email || '').toLowerCase().trim();
          if (em && !seen.has(em)) {
            seen.add(em);
            merged.push(s);
          }
        }
        for (const s of localSubs) {
          const em = (s.email || '').toLowerCase().trim();
          if (em && !seen.has(em)) {
            seen.add(em);
            merged.push(s);
          }
        }
        return merged;
      }
    } catch (e) {
      console.warn('Could not fetch cloud subscribers:', e.message);
    }
  }
  return localSubs;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let receivedBytes = 0;
    let settled = false;
    // Allow up to 15MB for media uploads, 2MB max for standard JSON endpoints
    const isUpload = req.url && (req.url.includes('/media/upload') || req.url.includes('/videos/upload') || req.url.includes('/videos/update'));
    const maxBytes = isUpload ? 15 * 1024 * 1024 : 2 * 1024 * 1024;

    const declaredLength = Number(req.headers['content-length'] || 0);
    if (declaredLength > maxBytes) {
      return reject(new Error(`Payload too large (limit: ${Math.round(maxBytes / (1024 * 1024))}MB)`));
    }
    req.on('data', chunk => {
      if (settled) return;
      receivedBytes += Buffer.byteLength(chunk);
      if (receivedBytes > maxBytes) {
        settled = true;
        req.destroy();
        reject(new Error(`Payload too large (limit: ${Math.round(maxBytes / (1024 * 1024))}MB)`));
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      const body = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Malformed JSON request body'));
      }
    });
    req.on('error', err => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
  });
}

function sendJson(res, statusCode, data, extraHeaders = {}) {
  if (res.headersSent) {
    try {
      res.end(JSON.stringify(data));
    } catch (e) {}
    return;
  }
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-key, x-admin-token',
    ...extraHeaders
  });
  res.end(JSON.stringify(data));
}

// =============================================================
// Memory Cache & Supabase Dual-Sync Engine
// =============================================================
let memoryProducts = null;
let memoryProductsLastFetch = 0;
const PRODUCTS_CACHE_TTL_MS = 60000; // 60 seconds (sub-millisecond serving from RAM, invalidated on admin edit)
let inFlightProductsPromise = null;

let memoryOrders = null;
let memoryOrdersLastFetch = 0;
const ORDERS_CACHE_TTL_MS = 5000;
let inFlightOrdersPromise = null;
let lastAwsDbErrorTime = 0;
const AWS_DB_ERROR_COOLDOWN_MS = 30000;

function filterOutGiftCards(products) {
  if (!Array.isArray(products)) return [];
  return products.filter(p => {
    const handle = (p.handle || '').toLowerCase();
    const title = (p.title || '').toLowerCase();
    const cat = (p.category || p.product_type || '').toLowerCase();
    return !handle.includes('gift-card') && !handle.includes('giftcard') && !title.includes('gift card') && !cat.includes('gift');
  });
}

function getMemoryProducts() {
  if (!memoryProducts) {
    const pData = readJsonFile('products.json', { products: [] });
    const list = Array.isArray(pData) ? pData : (pData.products || []);
    memoryProducts = filterOutGiftCards(list);
    memoryProductsLastFetch = Date.now();
  }
  return memoryProducts;
}
// Warm up in-memory catalog cache on server boot
getMemoryProducts();

function formatSupabaseProductToLocal(s) {
  const variants = Array.isArray(s.product_variants) && s.product_variants.length > 0
    ? s.product_variants.map((v, i) => ({
        id: v.id || Date.now() + i,
        title: v.title || 'Default Title',
        price: String((v.price_paise || 129900) / 100),
        compare_at_price: v.mrp_paise ? String(v.mrp_paise / 100) : null,
        sku: v.sku || `GR-${s.handle}`,
        available: v.available !== false,
        inventory_quantity: v.inventory_quantity ?? 100
      }))
    : [{
        id: Date.now(),
        title: 'Default Title',
        price: '1299.00',
        compare_at_price: '1999.00',
        sku: `GR-${s.handle}`,
        available: true,
        inventory_quantity: 100
      }];

  const images = Array.isArray(s.product_images) && s.product_images.length > 0
    ? s.product_images.sort((a, b) => (a.position || 0) - (b.position || 0)).map((img, idx) => ({
        id: img.id || idx + 1,
        src: img.src,
        position: img.position || idx + 1
      }))
    : [{ id: 1, src: '/images/photo_1.webp', position: 1 }];

  return {
    id: s.id,
    handle: s.handle,
    title: s.title,
    body_html: s.description || '',
    vendor: s.vendor || 'ALLEYRICH',
    category: s.category || 'Top Wear',
    product_type: s.product_type || s.category || 'Streetwear',
    homepage_section: s.homepage_section || 'none',
    tags: Array.isArray(s.tags) ? s.tags : [],
    published_at: s.published_at || s.created_at,
    created_at: s.created_at,
    updated_at: s.updated_at,
    variants,
    images
  };
}

async function getAllProducts() {
  const now = Date.now();
  if (memoryProducts && (now - memoryProductsLastFetch < PRODUCTS_CACHE_TTL_MS)) {
    return memoryProducts;
  }
  // Anti-stampede: coalesce concurrent cold fetches into one single in-flight promise
  if (inFlightProductsPromise) {
    return await inFlightProductsPromise;
  }

  inFlightProductsPromise = (async () => {
    try {
      if (db && db.isConfigured && (Date.now() - lastAwsDbErrorTime > AWS_DB_ERROR_COOLDOWN_MS)) {
        try {
          const awsProducts = await db.products.getAll();
          if (Array.isArray(awsProducts) && awsProducts.length > 0) {
            const localList = getMemoryProducts();
            let fullList = awsProducts;
            if (localList && localList.length > awsProducts.length) {
              const existingHandles = new Set(awsProducts.map(p => p.handle));
              const merged = [...awsProducts];
              for (const lp of localList) {
                if (!existingHandles.has(lp.handle)) {
                  merged.push(lp);
                }
              }
              fullList = merged;
            }
            const filtered = filterOutGiftCards(fullList);
            memoryProducts = filtered;
            memoryProductsLastFetch = Date.now();
            return filtered;
          }
        } catch (err) {
          lastAwsDbErrorTime = Date.now();
          console.warn('AWS RDS products fetch warning (cooldown 30s):', err.message);
        }
      }

      const localList = getMemoryProducts();
      memoryProducts = localList;
      memoryProductsLastFetch = Date.now();
      if (!supabase.isConfigured) return localList;

      try {
        const supaProducts = await supabase.from('products').select('*,product_variants(*),product_images(*)').execute();
        if (Array.isArray(supaProducts) && supaProducts.length > 0) {
          const formatted = supaProducts.map(formatSupabaseProductToLocal);
          const filtered = filterOutGiftCards(formatted);
          memoryProducts = filtered;
          memoryProductsLastFetch = Date.now();
          return filtered;
        }
      } catch (err) {
        console.warn('Supabase products fetch warning:', err.message);
      }

      return localList;
    } finally {
      inFlightProductsPromise = null;
    }
  })();

  return await inFlightProductsPromise;
}

function getMemoryOrders() {
  if (!memoryOrders) {
    memoryOrders = readJsonFile('orders.json', []);
    memoryOrdersLastFetch = Date.now();
  }
  return memoryOrders;
}
// Warm up in-memory orders cache on server boot
getMemoryOrders();

function formatSupabaseOrderToLocal(s) {
  const addr = s.shipping_address || {};
  return {
    id: s.order_no || s.id,
    supabaseId: s.id,
    customer: {
      name: addr.name || 'Storefront Customer',
      email: s.guest_email || addr.email || '',
      phone: s.guest_phone || addr.phone || '',
      city: addr.city || '',
      state: addr.state || '',
      address: addr.address || '',
      pincode: addr.pincode || ''
    },
    items: Array.isArray(addr.items) && addr.items.length > 0 ? addr.items : [],
    subtotal: Math.round((s.subtotal_paise || s.total_paise || 0) / 100),
    discount: Math.round((s.discount_paise || 0) / 100),
    shipping: Math.round((s.shipping_paise || 0) / 100),
    total: Math.round((s.total_paise || 0) / 100),
    paymentMethod: s.payment_method || 'Prepaid UPI',
    paymentStatus: s.paid_at || s.status === 'paid' || s.status === 'shipped' || s.status === 'delivered' ? 'Paid' : 'Pending',
    orderStatus: s.status ? (s.status.charAt(0).toUpperCase() + s.status.slice(1)) : 'Processing',
    trackingNumber: s.delhivery_waybill || '',
    delhiveryWaybill: s.delhivery_waybill || '',
    trackingUrl: s.tracking_url || '',
    createdAt: s.created_at || new Date().toISOString(),
    updatedAt: s.updated_at || new Date().toISOString()
  };
}

async function getAllOrders() {
  const now = Date.now();
  if (memoryOrders && (now - memoryOrdersLastFetch < ORDERS_CACHE_TTL_MS)) {
    return memoryOrders;
  }
  // Anti-stampede: coalesce concurrent order fetches into one single in-flight promise
  if (inFlightOrdersPromise) {
    return await inFlightOrdersPromise;
  }

  inFlightOrdersPromise = (async () => {
    try {
      if (db && db.isConfigured && (Date.now() - lastAwsDbErrorTime > AWS_DB_ERROR_COOLDOWN_MS)) {
        try {
          const awsOrders = await db.orders.getAll();
          if (Array.isArray(awsOrders)) {
            memoryOrders = awsOrders;
            memoryOrdersLastFetch = Date.now();
            return awsOrders;
          }
        } catch (err) {
          lastAwsDbErrorTime = Date.now();
          console.warn('AWS RDS orders fetch warning (cooldown 30s):', err.message);
        }
      }

      const localOrders = getMemoryOrders();
      memoryOrders = localOrders;
      memoryOrdersLastFetch = Date.now();
      if (!supabase.isConfigured) return localOrders;

      try {
        const supaOrders = await supabase.from('orders').select('*').order('created_at', { ascending: false }).execute();
        if (Array.isArray(supaOrders)) {
          const formatted = supaOrders.map(formatSupabaseOrderToLocal);
          memoryOrders = formatted;
          memoryOrdersLastFetch = Date.now();
          return formatted;
        }
      } catch (err) {
        console.warn('Supabase orders fetch warning:', err.message);
      }

      return localOrders;
    } finally {
      inFlightOrdersPromise = null;
    }
  })();

  return await inFlightOrdersPromise;
}

async function syncOrderToSupabase(order) {
  if (db && db.isConfigured) {
    try {
      await db.orders.create(order);
    } catch (e) {
      console.warn('AWS RDS order create warning:', e.message);
    }
  }
  if (!supabase.isConfigured) return;
  try {
    const orderNo = order.id;
    const subtotalPaise = Math.round((Number(order.subtotal) || Number(order.total) || 0) * 100);
    const discountPaise = Math.round((Number(order.discount) || 0) * 100);
    const totalPaise = Math.round((Number(order.total) || 0) * 100);
    const taxPaise = Math.round(totalPaise * 0.12);

    let status = (order.orderStatus || 'processing').toLowerCase();
    if (status === 'delivered') status = 'delivered';
    else if (status === 'shipped') status = 'shipped';
    else if (status === 'cancelled') status = 'cancelled';
    else if (status === 'paid') status = 'paid';
    else status = 'processing';

    const shippingAddress = {
      name: order.customer?.name || 'Customer',
      email: order.customer?.email || '',
      phone: order.customer?.phone || '',
      city: order.customer?.city || '',
      state: order.customer?.state || '',
      address: order.customer?.address || '',
      pincode: order.customer?.pincode || '',
      items: order.items || []
    };

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const payload = {
      order_no: orderNo,
      guest_email: order.customer?.email || '',
      guest_phone: order.customer?.phone || '',
      subtotal_paise: subtotalPaise,
      discount_paise: discountPaise,
      shipping_paise: 0,
      tax_paise: taxPaise,
      total_paise: totalPaise,
      status: status,
      payment_method: order.paymentMethod || 'Prepaid UPI',
      cashfree_order_id: order.cashfreeOrderId || null,
      cashfree_payment_id: order.cashfreePaymentId || null,
      shipping_address: shippingAddress,
      delhivery_waybill: order.trackingNumber || order.delhiveryWaybill || null,
      tracking_url: order.trackingUrl || (order.trackingNumber ? `https://www.delhivery.com/track/package/${order.trackingNumber}` : null),
      expires_at: expiresAt,
      updated_at: new Date().toISOString()
    };

    const existing = await supabase.from('orders').select('id').eq('order_no', orderNo).execute().catch(() => []);
    if (existing && existing.length > 0) {
      await supabase.from('orders').eq('order_no', orderNo).update(payload).catch(e => console.warn('Supabase order update error:', e.message));
    } else {
      payload.created_at = order.createdAt || new Date().toISOString();
      await supabase.from('orders').insert(payload).catch(e => console.warn('Supabase order insert error:', e.message));
    }
  } catch (err) {
    console.warn('Supabase order sync warning:', err.message);
  }
}

async function deleteOrderFromSupabase(orderId) {
  if (!supabase.isConfigured) return;
  try {
    const str = String(orderId);
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    if (isUuid) {
      await supabase.from('orders').eq('id', str).delete().catch(() => {});
    } else {
      await supabase.from('orders').eq('order_no', str).delete().catch(() => {});
    }
  } catch (err) {
    console.warn('Supabase order delete warning:', err.message);
  }
}

async function syncProductToSupabase(product) {
  if (db && db.isConfigured) {
    try {
      await db.products.upsert(product);
    } catch (e) {
      console.warn('AWS RDS product upsert warning:', e.message);
    }
  }
  if (!supabase.isConfigured) return null;
  try {
    const prodPayload = {
      handle: product.handle,
      title: product.title,
      description: product.body_html || product.description || '',
      vendor: product.vendor || 'ALLEYRICH',
      category: product.category || 'Apparel',
      product_type: product.product_type || product.category || 'Streetwear',
      homepage_section: product.homepage_section || 'none',
      tags: product.tags || [],
      is_published: true,
      gst_rate_percent: 12
    };

    const existing = await supabase.from('products').select('id').eq('handle', product.handle).execute().catch(() => []);
    let productId = null;
    if (existing && existing.length > 0) {
      productId = existing[0].id;
      await supabase.from('products').eq('handle', product.handle).update(prodPayload).catch(() => {});
    } else {
      const ins = await supabase.from('products').insert(prodPayload).catch(() => []);
      if (ins && ins[0]) productId = ins[0].id;
    }

    if (productId && product.variants && product.variants[0]) {
      const v = product.variants[0];
      const pricePaise = Math.round(Number(v.price || 1499) * 100);
      const mrpPaise = Math.round(Number(v.compare_at_price || 2499) * 100);
      const sku = v.sku || `GR-${product.handle}-${Date.now().toString().slice(-4)}`;

      const varPayload = {
        product_id: productId,
        title: v.title || 'Default Title',
        sku: sku,
        size: v.size || 'Free Size',
        color: v.color || 'Black',
        price_paise: pricePaise,
        mrp_paise: mrpPaise,
        inventory_quantity: Number(v.inventory_quantity ?? 100),
        available: v.available !== false
      };
      const exVar = await supabase.from('product_variants').select('id').eq('product_id', productId).execute().catch(() => []);
      if (exVar && exVar.length > 0) {
        await supabase.from('product_variants').eq('product_id', productId).update(varPayload).catch(() => {});
      } else {
        await supabase.from('product_variants').insert(varPayload).catch(() => {});
      }
    }

    if (productId && product.images && product.images.length > 0) {
      await supabase.from('product_images').eq('product_id', productId).delete().catch(() => {});
      const imgPayloads = product.images.map((img, idx) => ({
        product_id: productId,
        src: typeof img === 'string' ? img : img.src,
        position: idx + 1,
        is_model_view: idx === 1
      }));
      await supabase.from('product_images').insert(imgPayloads).catch(() => {});
    }
    return productId;
  } catch (err) {
    console.warn('Supabase product sync warning:', err.message);
    return null;
  }
}

async function deleteProductFromSupabase(productIdOrHandle, fallbackHandle) {
  if (db && db.isConfigured) {
    try {
      await db.products.delete(fallbackHandle || productIdOrHandle);
    } catch (e) {
      console.warn('AWS RDS product delete warning:', e.message);
    }
  }
  if (!supabase.isConfigured) return;
  try {
    let targetId = null;
    let targetHandle = fallbackHandle || null;

    const str = String(productIdOrHandle);
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    if (isUuid) {
      targetId = str;
    } else {
      targetHandle = str;
    }

    if (!targetId && targetHandle) {
      const existing = await supabase.from('products').select('id,handle').eq('handle', targetHandle).execute().catch(() => []);
      if (existing && existing[0]) {
        targetId = existing[0].id;
      }
    }

    if (targetId) {
      await supabase.from('product_variants').eq('product_id', targetId).delete().catch(() => {});
      await supabase.from('product_images').eq('product_id', targetId).delete().catch(() => {});
      await supabase.from('wishlist_items').eq('product_id', targetId).delete().catch(() => {});
      await supabase.from('products').eq('id', targetId).delete().catch(() => {});
    }
    if (targetHandle) {
      await supabase.from('products').eq('handle', targetHandle).delete().catch(() => {});
    }
  } catch (err) {
    console.warn('Supabase product delete warning:', err.message);
  }
}

// ==============================================================================
// Unified Multi-Provider Transactional Email Service
// Primary: Brevo (Sendinblue v3 API) - 300 free emails/day forever to ANY recipient
// Secondary: Resend API - Fallback for custom domains / verified sender
// ==============================================================================
async function sendTransactionalEmail({ to, subject, htmlContent, textContent, tags }) {
  const cleanTo = (to || '').trim().toLowerCase();
  if (!cleanTo || !cleanTo.includes('@')) return false;

  // 1. Primary: Brevo (Sendinblue) API v3 (Permanent Free 300 emails/day)
  const brevoApiKey = process.env.BREVO_API_KEY;
  if (brevoApiKey) {
    try {
      const senderEmail = process.env.BREVO_SENDER_EMAIL || 'alleyrich11@gmail.com';
      const senderName = process.env.BREVO_SENDER_NAME || 'ALLEYRICH';
      const payload = {
        sender: { name: senderName, email: senderEmail },
        to: [{ email: cleanTo }],
        subject,
        htmlContent
      };
      if (textContent) payload.textContent = textContent;
      if (tags && Array.isArray(tags)) payload.tags = tags;

      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': brevoApiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        console.log(`✅ [BREVO EMAIL DISPATCH] Successfully delivered email (${subject}) to ${cleanTo}`);
        return true;
      } else {
        const errText = await res.text();
        console.warn(`⚠️ [BREVO EMAIL ERROR]:`, errText);
      }
    } catch (err) {
      console.warn(`⚠️ [BREVO EXCEPTION]:`, err.message);
    }
  }

  // 2. Secondary Fallback: Resend API
  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey) {
    try {
      const fromEmail = process.env.RESEND_FROM_EMAIL || 'ALLEYRICH <onboarding@resend.dev>';
      const payload = {
        from: fromEmail,
        to: [cleanTo],
        subject,
        html: htmlContent
      };
      if (textContent) payload.text = textContent;

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        console.log(`✅ [RESEND EMAIL DISPATCH] Successfully delivered email (${subject}) to ${cleanTo}`);
        return true;
      } else {
        const errText = await res.text();
        console.warn(`⚠️ [RESEND EMAIL ERROR]:`, errText);
      }
    } catch (err) {
      console.warn(`⚠️ [RESEND EXCEPTION]:`, err.message);
    }
  }

  if (!brevoApiKey && !resendApiKey) {
    console.log(`ℹ️ [EMAIL NOTICE] No email API key configured (BREVO_API_KEY / RESEND_API_KEY). Delivery of "${subject}" to ${cleanTo} bypassed gracefully.`);
  }

  return false;
}

// Transactional Email Service for OTP Authentication
async function sendOtpEmail(email, otpCode) {
  let emailDispatched = false;
  const cleanEmail = (email || '').trim().toLowerCase();

  const otpSubject = `Your ALLEYRICH Atelier Access Code: ${otpCode}`;
  const otpHtml = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; max-width:560px; margin:0 auto; background:#0a0a0a; color:#f5f5f5; border:1px solid #222222; border-radius:8px; overflow:hidden;">
      <div style="background:#000000; padding:28px 24px; text-align:center; border-bottom:1px solid #1a1a1a;">
        <h1 style="font-size:24px; font-weight:900; letter-spacing:0.25em; text-transform:uppercase; margin:0; color:#ffffff;">ALLEYRICH</h1>
        <p style="font-size:11px; letter-spacing:0.15em; color:#888888; margin:6px 0 0; text-transform:uppercase;">Architectural Streetwear &bull; Official Atelier</p>
      </div>
      <div style="padding:36px 24px; text-align:center;">
        <div style="display:inline-block; font-size:11px; font-weight:800; letter-spacing:0.12em; text-transform:uppercase; color:#4caf50; background:rgba(76,175,80,0.12); padding:6px 14px; border-radius:20px; border:1px solid rgba(76,175,80,0.3); margin-bottom:22px;">
          One-Time Verification Code
        </div>
        <p style="font-size:14px; color:#cccccc; margin:0 0 24px; line-height:1.5;">Enter the following 6-digit access key to verify your identity and access your ALLEYRICH account:</p>
        <div style="display:inline-block; font-size:38px; font-weight:900; letter-spacing:0.35em; color:#ffffff; background:#141414; padding:18px 32px 18px 40px; border-radius:6px; font-family:'Courier New',Courier,monospace; border:1px solid #333333; box-shadow:0 8px 24px rgba(0,0,0,0.6);">
          ${otpCode}
        </div>
        <p style="font-size:12px; color:#888888; margin:24px 0 0;">Valid for <strong>10 minutes</strong>. Never share this code with anyone.</p>
      </div>
      <div style="background:#000000; border-top:1px solid #1a1a1a; padding:20px 24px; text-align:center; font-size:11px; color:#666666; line-height:1.6;">
        If you did not request this access code, you can safely disregard this email.<br>
        &copy; ${new Date().getFullYear()} ALLEYRICH India. All rights reserved.
      </div>
    </div>
  `;

  // 1 & 2. Direct transactional delivery via Brevo / Resend
  emailDispatched = await sendTransactionalEmail({
    to: cleanEmail,
    subject: otpSubject,
    htmlContent: otpHtml,
    textContent: `Your ALLEYRICH verification code is: ${otpCode}. Valid for 10 minutes.`,
    tags: ['auth-otp']
  });

  // 3. Supabase OTP Magic Link Fallback
  if (!emailDispatched && supabase.isConfigured) {
    try {
      const supaRes = await supabase.auth.sendMagicLink({ email: cleanEmail });
      if (supaRes && supaRes.success) {
        emailDispatched = true;
        console.log(`✅ [SUPABASE EMAIL DISPATCH] Delivered magic link / OTP to ${cleanEmail}`);
      }
    } catch (e) {}
  }

  console.log(`[OTP DISPATCH] email=${cleanEmail} delivered=${emailDispatched}`);
  return emailDispatched;
}



// Order Confirmation & Tax Invoice Email Service (Brevo + Resend)
async function sendOrderConfirmationEmail(order) {
  const email = (order.customer?.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return false;

  const domain = process.env.APP_DOMAIN || 'alleyrich.com';
  const trackUrl = order.delhiveryWaybill
    ? `https://track.delhivery.com/p/${encodeURIComponent(order.delhiveryWaybill)}`
    : `https://${domain}/pages/track-order.html?order=${encodeURIComponent(order.id)}`;
  const whatsappUrl = `https://wa.me/919876543210?text=${encodeURIComponent(`Hi ALLEYRICH, please send live WhatsApp delivery updates for my order #${order.id}.`)}`;

  const itemsHtml = (order.items || []).map(item => `
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid #222222;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="width: 54px; vertical-align: top; padding-right: 12px;">
              <img src="${escapeHtml(safeHttpUrl(item.image, '/images/photo_1.webp'))}" width="48" height="60" style="object-fit: cover; border-radius: 4px; display: block; background: #222;" alt="${escapeHtml(item.title || 'Streetwear')}">
            </td>
            <td style="vertical-align: top;">
              <div style="font-weight: 700; color: #ffffff; font-size: 14px;">${escapeHtml(item.title || item.name || 'ALLEYRICH Streetwear Item')}</div>
              <div style="font-size: 12px; color: #888888; margin-top: 4px;">Size: <span style="color:#ffffff;">${escapeHtml(item.size || 'L')}</span> &bull; Qty: <span style="color:#ffffff;">${Number(item.quantity || 1)}</span></div>
            </td>
            <td style="vertical-align: top; text-align: right; font-weight: 800; color: #ffffff; font-size: 14px;">
              ₹${((item.price || 0) * (item.quantity || 1)).toLocaleString('en-IN')}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `).join('');

  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #f5f5f5; border: 1px solid #222222; border-radius: 8px; overflow: hidden;">
      <div style="background: #000000; padding: 28px 24px; text-align: center; border-bottom: 1px solid #1a1a1a;">
        <h1 style="font-size: 24px; font-weight: 900; letter-spacing: 0.25em; text-transform: uppercase; margin: 0; color: #ffffff;">ALLEYRICH</h1>
        <p style="font-size: 11px; letter-spacing: 0.15em; color: #888888; margin: 6px 0 0; text-transform: uppercase;">Handcrafted In India &bull; Express Dispatch</p>
      </div>

      <div style="padding: 28px 24px;">
        <div style="background: rgba(46, 125, 50, 0.15); border: 1px solid rgba(46, 125, 50, 0.3); border-radius: 6px; padding: 14px 18px; margin-bottom: 24px; text-align: center;">
          <span style="color: #4caf50; font-size: 14px; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase;">✓ Order Confirmed #${escapeHtml(order.id)}</span>
          <p style="margin: 4px 0 0; color: #cccccc; font-size: 12px;">We're handcrafting and quality-checking your pieces at our atelier.</p>
        </div>

        <div style="margin-bottom: 24px;">
          <h3 style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #888888; margin: 0 0 12px;">Order Summary</h3>
          <table style="width: 100%; border-collapse: collapse;">
            ${itemsHtml}
          </table>
        </div>

        <div style="background: #141414; padding: 16px; border-radius: 6px; border: 1px solid #222222; margin-bottom: 24px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr>
              <td style="color: #888888; padding: 4px 0;">Subtotal</td>
              <td style="color: #ffffff; text-align: right; padding: 4px 0;">₹${(order.subtotal || 0).toLocaleString('en-IN')}</td>
            </tr>
            <tr>
              <td style="color: #888888; padding: 4px 0;">Express Shipping (19,000+ PIN Codes)</td>
              <td style="color: #4caf50; text-align: right; padding: 4px 0; font-weight: 700;">FREE</td>
            </tr>
            <tr>
              <td style="color: #888888; padding: 4px 0;">Payment Method</td>
              <td style="color: #ffffff; text-align: right; padding: 4px 0;">${escapeHtml(order.paymentMethod || 'Cash on Delivery (COD)')}</td>
            </tr>
            <tr>
              <td style="color: #888888; padding: 4px 0;">Payment Status</td>
              <td style="color: ${order.paymentStatus === 'Paid' ? '#4caf50' : '#ffa726'}; text-align: right; padding: 4px 0; font-weight: 700;">${escapeHtml(order.paymentStatus || 'Pending')}</td>
            </tr>
            ${order.delhiveryWaybill ? `
            <tr>
              <td style="color: #888888; padding: 4px 0;">Delhivery AWB Tracking</td>
              <td style="color: #ffffff; text-align: right; padding: 4px 0; font-weight: 700;">${escapeHtml(order.delhiveryWaybill)}</td>
            </tr>
            ` : ''}
            <tr style="border-top: 1px solid #262626;">
              <td style="color: #ffffff; font-weight: 800; font-size: 16px; padding: 12px 0 4px;">Total Bill (Incl. GST)</td>
              <td style="color: #ffffff; font-weight: 800; font-size: 16px; text-align: right; padding: 12px 0 4px;">₹${(order.total || 0).toLocaleString('en-IN')}</td>
            </tr>
          </table>
        </div>

        <div style="background: #141414; padding: 16px; border-radius: 6px; border: 1px solid #222222; margin-bottom: 28px; font-size: 13px; line-height: 1.6;">
          <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #888888; margin-bottom: 6px;">Delivery Destination</div>
          <div style="color: #ffffff; font-weight: 700;">${escapeHtml(order.customer?.name || 'Valued Client')}</div>
          <div style="color: #cccccc;">
            ${escapeHtml(order.customer?.address || '')}${order.customer?.locality ? ', ' + escapeHtml(order.customer.locality) : ''}<br>
            ${escapeHtml(order.customer?.city || 'Mumbai')}, ${escapeHtml(order.customer?.state || 'Maharashtra')} ${escapeHtml(order.customer?.pincode || '')}<br>
            Phone: ${escapeHtml(order.customer?.phone || '+91 99999 99999')}
          </div>
        </div>

        <div style="text-align: center; margin-bottom: 12px;">
          <a href="${escapeHtml(safeHttpUrl(trackUrl))}" style="background: #ffffff; color: #000000; text-decoration: none; padding: 14px 28px; font-weight: 800; font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; border-radius: 4px; display: block; margin-bottom: 10px;">
            TRACK SHIPMENT IN REAL TIME ➔
          </a>
          <a href="${whatsappUrl}" style="background: #25D366; color: #000000; text-decoration: none; padding: 12px 24px; font-weight: 800; font-size: 12px; letter-spacing: 0.05em; text-transform: uppercase; border-radius: 4px; display: block;">
            💬 RECEIVE LIVE UPDATES ON WHATSAPP
          </a>
        </div>
      </div>

      <div style="background: #000000; border-top: 1px solid #1a1a1a; padding: 20px 24px; text-align: center; font-size: 11px; color: #666666; line-height: 1.6;">
        7-Day Doorstep Exchange Guarantee &bull; 100% Cotton Bio-Washed Apparel<br>
        Need assistance? Reply directly to this email or chat with our 24/7 AI Concierge.<br>
        &copy; ${new Date().getFullYear()} ALLEYRICH India. All rights reserved.
      </div>
    </div>
  `;

  const dispatched = await sendTransactionalEmail({
    to: email,
    subject: `Order Confirmed: #${order.id} | ALLEYRICH Official Atelier`,
    htmlContent,
    textContent: `Order Confirmed #${order.id}! Total: ₹${order.total}. Track shipment at: ${trackUrl}`,
    tags: ['order-confirmation']
  });

  return dispatched;
}

// Order Tracking Public Handler
async function handleTrackOrder(req, res, parsedUrl) {
  const trackLimit = security.checkRateLimit(`public_tracking:${security.getClientIp(req)}`, 30, 60);
  if (!trackLimit.allowed) {
    return sendJson(res, 429, { success: false, message: 'Too many tracking attempts. Please try again later.' }, { 'Retry-After': String(trackLimit.resetAfterSeconds) });
  }
  const query = (
    parsedUrl.searchParams.get('id') ||
    parsedUrl.searchParams.get('order') ||
    parsedUrl.searchParams.get('orderId') ||
    parsedUrl.searchParams.get('query') ||
    parsedUrl.searchParams.get('phone') ||
    parsedUrl.searchParams.get('q') || ''
  ).trim();

  if (!query) {
    return sendJson(res, 400, {
      success: false,
      message: 'Please provide the exact Order ID or Delhivery AWB to track your shipment.'
    });
  }

  const cleanQuery = query.toLowerCase().replace(/^[#]/, '').trim();
  const digitsQuery = query.replace(/\D/g, '');

  const orders = await getAllOrders();
  let matchedOrder = orders.find(o => {
    const oId = String(o.id || '').toLowerCase().replace(/^[#]/, '');
    if (oId === cleanQuery) return true;

    // Match AWB / tracking number
    const trk = String(o.trackingNumber || o.delhiveryWaybill || '').toLowerCase();
    if (trk && trk === cleanQuery) return true;

    return false;
  });

  if (!matchedOrder && supabase && supabase.isConfigured) {
    try {
      const supaOrders = await supabase.orders.getAll(100);
      matchedOrder = supaOrders.find(o => {
        const oId = String(o.id || '').toLowerCase().replace(/^[#]/, '');
        if (oId === cleanQuery) return true;
        const trk = String(o.trackingNumber || o.delhiveryWaybill || '').toLowerCase();
        if (trk && trk === cleanQuery) return true;
        return false;
      });
    } catch (e) {}
  }

  if (!matchedOrder) {
    return sendJson(res, 404, {
      success: false,
      message: `No shipment found for "${query}". Please check your Order ID or phone number.`
    });
  }

  // Build visual timeline steps based on orderStatus
  const status = matchedOrder.orderStatus || 'Processing';
  const isDelivered = status.toLowerCase() === 'delivered';
  const isOutForDelivery = status.toLowerCase().includes('out');
  const isShipped = status.toLowerCase() === 'shipped' || isOutForDelivery || isDelivered;

  const orderTimeStr = new Date(matchedOrder.createdAt || Date.now()).toLocaleDateString('en-IN', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  const steps = [
    {
      title: 'Order Confirmed',
      status: 'completed',
      description: 'Order registered in atelier queue and payment verified',
      time: orderTimeStr
    },
    {
      title: 'Artisan Crafting & QC',
      status: isShipped ? 'completed' : 'current',
      description: 'Handcrafted and inspected at Mumbai studio',
      time: isShipped ? 'Quality Inspection Passed' : 'In Progress'
    },
    {
      title: 'Dispatched via Carrier',
      status: isOutForDelivery || isDelivered ? 'completed' : (isShipped ? 'current' : 'pending'),
      description: matchedOrder.trackingNumber ? `Delhivery Express Air (AWB: ${matchedOrder.trackingNumber})` : 'Delhivery Express Air',
      time: isShipped ? 'Dispatched' : 'Estimated Dispatch: 24-48h'
    },
    {
      title: 'Out for Delivery',
      status: isDelivered ? 'completed' : (isOutForDelivery ? 'current' : 'pending'),
      description: 'Courier partner out for doorstep delivery',
      time: isOutForDelivery ? 'Today' : 'Pending'
    },
    {
      title: 'Delivered',
      status: isDelivered ? 'completed' : 'pending',
      description: 'Package successfully delivered',
      time: isDelivered ? 'Delivered' : 'Estimated Delivery: 2-4 Days'
    }
  ];

  return sendJson(res, 200, {
    success: true,
    order: {
      id: matchedOrder.id,
      createdAt: matchedOrder.createdAt,
      orderStatus: matchedOrder.orderStatus || 'Processing',
      paymentStatus: matchedOrder.paymentStatus || 'Pending',
      paymentMethod: matchedOrder.paymentMethod || 'Cash on Delivery (COD)',
      total: matchedOrder.total,
      subtotal: matchedOrder.subtotal,
      shipping: matchedOrder.shipping,
      customer: {
        city: matchedOrder.customer?.city || 'Mumbai',
        state: matchedOrder.customer?.state || 'Maharashtra',
        country: matchedOrder.customer?.country || 'India'
      },
      items: (matchedOrder.items || []).map(item => ({
        title: item.title,
        size: item.size,
        quantity: item.quantity,
        image: item.image
      })),
      trackingNumber: matchedOrder.trackingNumber || matchedOrder.delhiveryWaybill || '',
      delhiveryWaybill: matchedOrder.delhiveryWaybill || matchedOrder.trackingNumber || '',
      trackingUrl: matchedOrder.trackingUrl || (matchedOrder.trackingNumber ? `https://www.delhivery.com/track/package/${matchedOrder.trackingNumber}` : null),
      carrier: 'Delhivery Express Air Priority',
      estimatedDelivery: '2 - 4 Business Days',
      steps
    }
  });
}

// 24/7 AI Streetwear Support Concierge Handler
async function handleAiChat(req, res) {
  const chatLimit = security.checkRateLimit(`ai_chat:${security.getClientIp(req)}`, 30, 60);
  if (!chatLimit.allowed) return sendJson(res, 429, { success: false, reply: 'Please slow down and try again shortly.' }, { 'Retry-After': String(chatLimit.resetAfterSeconds) });
  const payload = await parseBody(req);
  const userMsg = (payload.message || '').trim();
  const customerIdentity = await getAuthenticatedIdentity(req);
  const canAccessOrderData = Boolean(customerIdentity || security.isAdminAuthorized(req));

  if (!userMsg) {
    return sendJson(res, 400, { success: false, reply: 'Please provide a question or message.' });
  }

  // 0. Optional: Google Gemini AI Model Integration (gemini-2.5-flash)
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (geminiApiKey) {
    try {
      const orders = await getAllOrders();
      let orderContext = '';
      const orderIdMatch = userMsg.match(/(?:gr|ar)[#\s-]*([0-9]{4,6})/i) || userMsg.match(/#?([0-9]{4,6})/);
      const phoneMatch = userMsg.match(/\b[6-9]\d{9}\b/);
      if (canAccessOrderData && (orderIdMatch || phoneMatch)) {
        const query = orderIdMatch ? (orderIdMatch[0].toUpperCase()) : (phoneMatch ? phoneMatch[0] : '');
        const cleanQ = query.replace(/\D/g, '');
        const match = orders.find(o => {
          if (!security.isAdminAuthorized(req) && !orderBelongsToIdentity(o, customerIdentity)) return false;
          const oId = String(o.id || '').toUpperCase();
          if (oId.includes(query.toUpperCase())) return true;
          const oPhone = String(o.customer?.phone || '').replace(/\D/g, '');
          if (cleanQ.length >= 7 && oPhone.includes(cleanQ)) return true;
          return false;
        });
        if (match) {
          orderContext = `\nMatched Order in Atelier Database:\n- Order ID: ${match.id}\n- Status: ${match.orderStatus || 'Processing'}\n- Total: ₹${match.total}\n- Items: ${(match.items || []).map(i => i.title).join(', ')}\n- Tracking AWB: ${match.trackingNumber || 'Pending'}\n- Live Tracking URL: /pages/track-order.html?order=${match.id}\n`;
        }
      }

      const prompt = `You are the official luxury AI Help Assistant for ALLEYRICH, an avant-garde D2C streetwear fashion label based in Mumbai, India.
Brand Tone: High-fashion, modern, courteous, concise, minimalist.
Key Brand Rules:
1. Silhouettes: Boxy, architectural, oversized streetwear drape with dropped shoulders. Heavyweight 240-380 GSM French Terry cotton.
2. Logistics: Pan-India express door-to-door shipping via Delhivery Express Air (2-4 business days).
3. Exchange: 7-day doorstep exchange for size or style swaps with tags intact.
4. Human Escalation: Direct WhatsApp Support at +91 9876543210 (care@allyrich.com).
${orderContext}
Customer Message: "${userMsg}"

Provide an elegant, helpful, and concise response in markdown.`;

      for (const m of ['gemini-3.5-flash', 'gemini-3.8-flash']) {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${geminiApiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              maxOutputTokens: 2048,
              temperature: 0.7,
              thinkingConfig: { thinkingBudget: 0 }
            }
          })
        });

        if (response.ok) {
          const data = await response.json();
          const geminiReply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (geminiReply) {
            return sendJson(res, 200, { success: true, reply: geminiReply, engine: m });
          }
        }
      }
    } catch (gErr) {
      console.warn('Gemini API error, falling back to local intent engine:', gErr.message);
    }
  }

  const lower = userMsg.toLowerCase();

  // 1. Order Tracking Intent
  const orderIdMatch = userMsg.match(/(?:gr|ar)[#\s-]*([0-9]{4,6})/i) || userMsg.match(/#?([0-9]{4,6})/);
  const phoneMatch = userMsg.match(/\b[6-9]\d{9}\b/);

    if (canAccessOrderData && (orderIdMatch || phoneMatch || lower.includes('track') || lower.includes('where is my order') || lower.includes('status'))) {
    const query = orderIdMatch ? (orderIdMatch[0].toUpperCase()) : (phoneMatch ? phoneMatch[0] : '');
    if (query) {
      const orders = await getAllOrders();
      const cleanQ = query.replace(/\D/g, '');
      const match = orders.find(o => {
        if (!security.isAdminAuthorized(req) && !orderBelongsToIdentity(o, customerIdentity)) return false;
        const oId = String(o.id || '').toUpperCase();
        if (oId.includes(query.toUpperCase())) return true;
        const oPhone = String(o.customer?.phone || '').replace(/\D/g, '');
        if (cleanQ.length >= 7 && oPhone.includes(cleanQ)) return true;
        return false;
      });

      if (match) {
        const itemsSummary = (match.items || []).map(it => `${it.title} (${it.size || 'L'} x${it.quantity || 1})`).join(', ');
        const reply = `📦 **Order #${match.id}** is currently **${match.orderStatus || 'Processing'}**!\n\n` +
          `• **Items**: ${itemsSummary}\n` +
          `• **Destination**: ${match.customer?.city || 'Mumbai'}, ${match.customer?.state || 'India'}\n` +
          `• **Carrier**: Delhivery Express Air ${match.trackingNumber ? `(AWB: ${match.trackingNumber})` : ''}\n` +
          `• **Payment**: ${match.paymentMethod || 'COD'} (Total: ₹${(match.total || 0).toLocaleString('en-IN')})\n\n` +
          `🔗 [Click here to view live tracking timeline](/pages/track-order.html?order=${encodeURIComponent(match.id)})`;
        return sendJson(res, 200, { success: true, reply });
      }
    }

    if (lower.includes('track') || lower.includes('order')) {
      return sendJson(res, 200, {
        success: true,
        reply: "To track your shipment, please type your **Order ID** (e.g. `GR-4821`) or your 10-digit mobile number, or visit our [Shipment Tracker](/pages/track-order.html)."
      });
    }
  }

  // 2. Sizing & Fit Advisor Intent
  if (lower.includes('size') || lower.includes('fit') || lower.includes('height') || lower.includes('weight') || lower.includes('chest') || lower.includes('should i buy') || lower.includes('small') || lower.includes('large') || lower.includes('medium')) {
    let rec = "Our silhouettes are engineered with an **authentic architectural boxy streetwear fit** with pronounced dropped shoulders and a heavy 240+ GSM drape.\n\n";
    if (lower.includes('tall') || lower.includes('ft') || lower.includes('feet') || lower.includes('kg')) {
      rec += "• **Over 5'10\" or 75kg+**: We recommend **Size XL** for the signature exaggerated streetwear drape, or **Size L** for a clean relaxed fit.\n" +
             "• **5'6\" to 5'10\" or 60–75kg**: We recommend **Size L** for an oversized look, or **Size M** for a structured fit.\n" +
             "• **Under 5'6\" or under 60kg**: We recommend **Size S** or **M**.\n\n" +
             "View our full measurements on the [Size Guide](/pages/size-guide.html).";
    } else {
      rec += "• **Standard Streetwear Fit**: Take your normal size.\n" +
             "• **Dramatic Statement Drop**: Size up one size.\n\n" +
             "You can check precise chest and length measurements on our [Size Guide](/pages/size-guide.html).";
    }
    return sendJson(res, 200, { success: true, reply: rec });
  }

  // 3. Return & Exchange Policy Intent
  if (lower.includes('return') || lower.includes('exchange') || lower.includes('refund') || lower.includes('cancel')) {
    const reply = "🔄 **ALLEYRICH 7-Day Doorstep Exchange Policy**:\n\n" +
      "• We offer hassle-free exchanges within **7 days** of delivery for size or style swaps.\n" +
      "• Garments must be unworn with original tags and luxury packaging intact.\n" +
      "• Reverse pickup is arranged by Delhivery across 19,000+ PIN codes in India.\n\n" +
      "Read full details on our [Refund & Exchange Policy](/pages/refund-policy.html).";
    return sendJson(res, 200, { success: true, reply });
  }

  // 4. Fabric & Garment Specifications Intent
  if (lower.includes('fabric') || lower.includes('material') || lower.includes('wash') || lower.includes('quality') || lower.includes('gsm') || lower.includes('cotton')) {
    const reply = "🧵 **Atelier Fabric Specifications**:\n\n" +
      "• **Cotton**: 100% Super-Combed French Terry Cotton (240–380 GSM).\n" +
      "• **Finish**: Pre-shrunk, bio-washed, luxury silicon softened hand-feel.\n" +
      "• **Care Instructions**: Machine wash cold inside-out, hang dry in shade, do not iron directly on graphics.";
    return sendJson(res, 200, { success: true, reply });
  }

  // 5. Human Support / WhatsApp Intent
  if (lower.includes('human') || lower.includes('agent') || lower.includes('talk') || lower.includes('whatsapp') || lower.includes('call') || lower.includes('phone') || lower.includes('support') || lower.includes('help')) {
    const reply = "💬 You can speak directly with our atelier human care team:\n\n" +
      "• **WhatsApp Direct**: [Chat with ALLEYRICH Support](https://wa.me/919876543210?text=Hi%20ALLEYRICH%20Support,%20I%20need%20assistance)\n" +
      "• **Email**: care@allyrich.com\n" +
      "• **Hours**: Mon – Sat, 10:00 AM – 7:00 PM IST";
    return sendJson(res, 200, { success: true, reply });
  }

  // Fallback / General Welcome
  const reply = "Welcome to **ALLEYRICH**. I can assist you with:\n\n" +
    "1. 📦 **Live Order Tracking** (Type your Order ID or phone)\n" +
    "2. 📏 **Size & Fit Recommendations** (Tell me your height & weight)\n" +
    "3. 🔄 **7-Day Exchange Policy**\n" +
    "4. 💬 **Chat with Human Support on WhatsApp**\n\n" +
    "How can I help you today?";

  return sendJson(res, 200, { success: true, reply });
}

async function handleGetSingleProduct(req, res, idOrHandle) {
  const queryStr = decodeURIComponent(idOrHandle).trim().toLowerCase();
  const cacheKey = `alleyrich:catalog:products:handle:${queryStr}`;
  const cached = await redis.cacheGet(cacheKey);
  if (cached) return sendJson(res, 200, cached);

  const products = await getAllProducts();
  const product = products.find(p =>
    String(p.id).toLowerCase() === queryStr ||
    (p.handle && p.handle.toLowerCase() === queryStr)
  );

  if (!product) {
    return sendJson(res, 404, { success: false, message: `Product '${idOrHandle}' not found` });
  }

  const responseData = { success: true, product };
  await redis.cacheSet(cacheKey, responseData, 300);
  return sendJson(res, 200, responseData);
}

async function handleGetSingleOrder(req, res, orderId) {
  const orders = await getAllOrders();
  const queryStr = decodeURIComponent(orderId).trim().toLowerCase();
  const order = orders.find(o =>
    String(o.id).toLowerCase() === queryStr ||
    (o.supabaseId && String(o.supabaseId).toLowerCase() === queryStr) ||
    (o.trackingNumber && o.trackingNumber.toLowerCase() === queryStr) ||
    (o.delhiveryWaybill && o.delhiveryWaybill.toLowerCase() === queryStr)
  );

  if (!order) {
    return sendJson(res, 404, { success: false, message: `Order '${orderId}' not found` });
  }

  if (!security.isAdminAuthorized(req)) {
    const identity = await getAuthenticatedIdentity(req);
    const ownerEmail = String(order.customer?.email || order.email || order.guest_email || '').toLowerCase();
    const ownerId = String(order.userId || order.user_id || order.customerId || '');
    if (!identity || (identity.email !== ownerEmail && identity.id !== ownerId)) {
      return sendJson(res, 404, { success: false, message: 'Order not found' });
    }
  }

  return sendJson(res, 200, { success: true, order });
}

async function handleGetProducts(req, res, parsedUrl) {
  const clientIp = security.getClientIp(req);
  const searchLimit = await redis.checkRateLimit(`product_search:${clientIp}`, 600, 60);
  if (!searchLimit.allowed) {
    return sendJson(res, 429, { success: false, message: 'Too many catalog requests. Please wait a moment.' }, { 'Retry-After': String(searchLimit.resetAfterSeconds) });
  }

  const rawQuery = parsedUrl.searchParams.get('search') || parsedUrl.searchParams.get('q') || '';
  const query = rawQuery.slice(0, 80).toLowerCase().trim();
  const collection = parsedUrl.searchParams.get('collection');
  const category = parsedUrl.searchParams.get('category');
  const stock = parsedUrl.searchParams.get('stock');
  const homepage_section = parsedUrl.searchParams.get('homepage_section');
  const sort = parsedUrl.searchParams.get('sort');

  const isDefaultQuery = !query && !collection && !category && !stock && !homepage_section && !sort;
  if (isDefaultQuery) {
    const cached = await redis.cacheGet('alleyrich:catalog:products:all');
    if (cached) return sendJson(res, 200, cached);
  }

  const products = await getAllProducts();

  let filtered = products;
  if (query) {
    const terms = query.split(/\s+/).filter(Boolean);
    filtered = filtered.filter(p => {
      const targetText = `${p.title || ''} ${p.handle || ''} ${p.category || ''} ${p.product_type || ''} ${Array.isArray(p.tags) ? p.tags.join(' ') : (p.tags || '')} ${p.body_html || ''}`.toLowerCase();
      return terms.every(t => targetText.includes(t));
    });
  }
  if (category && category !== 'all') {
    filtered = filtered.filter(p =>
      (p.category && p.category.toLowerCase() === category.toLowerCase()) ||
      (p.product_type && p.product_type.toLowerCase() === category.toLowerCase())
    );
  }
  if (homepage_section && homepage_section !== 'all') {
    filtered = filtered.filter(p => (p.homepage_section || 'none') === homepage_section);
  }
  if (collection && collection !== 'all') {
    filtered = filtered.filter(p =>
      p.tags && p.tags.some(t => t.toLowerCase() === collection.toLowerCase())
    );
  }
  if (stock) {
    if (stock === 'in_stock') filtered = filtered.filter(p => (p.variants?.[0]?.inventory_quantity ?? 100) > 10);
    else if (stock === 'low_stock') filtered = filtered.filter(p => { const q = p.variants?.[0]?.inventory_quantity ?? 100; return q > 0 && q <= 10; });
    else if (stock === 'out_of_stock') filtered = filtered.filter(p => (p.variants?.[0]?.inventory_quantity ?? 100) <= 0);
  }
  if (sort) {
    if (sort === 'price_asc') filtered.sort((a, b) => Number(a.variants?.[0]?.price || 0) - Number(b.variants?.[0]?.price || 0));
    else if (sort === 'price_desc') filtered.sort((a, b) => Number(b.variants?.[0]?.price || 0) - Number(a.variants?.[0]?.price || 0));
    else if (sort === 'title_asc') filtered.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === 'newest') filtered.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }

  const responseData = {
    success: true,
    count: filtered.length,
    products: filtered
  };
  if (isDefaultQuery) {
    await redis.cacheSet('alleyrich:catalog:products:all', responseData, 300);
  }

  return sendJson(res, 200, responseData);
}

async function handleCreateProduct(req, res) {
  const payload = await parseBody(req);
  const products = await getAllProducts();
  const prodCategory = payload.category || payload.product_type || 'Top Wear';
  let prodDepartment = payload.department;
  if (!prodDepartment) {
    const lower = (prodCategory + ' ' + (payload.title || '')).toLowerCase();
    if (lower.includes('party') || lower.includes('jodhpuri') || lower.includes('blazer') || lower.includes('three-piece') || lower.includes('indo') || lower.includes('kurta') || lower.includes('nehru')) {
      prodDepartment = 'Party Wear';
    } else if (lower.includes('boy') || lower.includes('girl') || lower.includes('baby') || lower.includes('kid') || lower.includes('frock') || lower.includes('romper') || lower.includes('newborn')) {
      prodDepartment = 'Kids Wear';
    } else if (lower.includes('jewel') || lower.includes('bag') || lower.includes('accessor')) {
      prodDepartment = 'Accessories';
    } else {
      prodDepartment = "Men's Wear";
    }
  }
  const primaryImage = payload.image || (payload.images && payload.images[0]?.src) || '/images/photo_1.webp';
  const hoverImage = payload.hoverImage || (payload.images && payload.images[1]?.src) || null;

  let productImages = [];
  if (payload.images && Array.isArray(payload.images) && payload.images.length > 0) {
    productImages = payload.images.map((img, i) => ({
      id: img.id || (Date.now() + i + 2),
      src: typeof img === 'string' ? img : img.src,
      position: i + 1
    }));
  } else {
    productImages.push({ id: Date.now() + 2, src: primaryImage, position: 1 });
    if (hoverImage) {
      productImages.push({ id: Date.now() + 3, src: hoverImage, position: 2 });
    }
  }

  const sellingPrice = String(
    payload.price ??
    payload.selling_price ??
    payload.sellingPrice ??
    (payload.variants?.[0]?.price) ??
    '1000'
  ).trim();
  const rawRealPrice = payload.compare_at_price ??
    payload.comparePrice ??
    payload.compare_price ??
    payload.real_price ??
    payload.realPrice ??
    payload.mrp ??
    (payload.variants?.[0]?.compare_at_price);
  const realPrice = (rawRealPrice !== undefined && rawRealPrice !== null) ? String(rawRealPrice).trim() : '';

  const newProduct = {
    id: Date.now(),
    title: payload.title || 'Untitled Product',
    handle: payload.handle || (payload.title ? payload.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') : `prod-${Date.now()}`),
    body_html: payload.description || payload.body_html || '',
    vendor: payload.vendor || 'ALLEYRICH',
    department: prodDepartment,
    category: prodCategory,
    sub_category: payload.sub_category || '',
    fit: payload.fit || '',
    product_type: payload.product_type || prodCategory,
    homepage_section: payload.homepage_section || 'none',
    tags: Array.isArray(payload.tags) ? payload.tags : (payload.tags ? payload.tags.split(',').map(s => s.trim()) : ['Shop']),
    published_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    price: sellingPrice,
    compare_at_price: realPrice,
    variants: (Array.isArray(payload.variants) && payload.variants.length > 0)
      ? payload.variants.map((v, i) => ({
          id: v.id || Date.now() + i + 1,
          title: v.title || payload.size || 'Default',
          price: String(v.price ?? sellingPrice).trim(),
          compare_at_price: String(v.compare_at_price ?? realPrice).trim(),
          sku: v.sku || payload.sku || `GR-${Math.floor(1000 + Math.random() * 9000)}`,
          available: v.available !== false,
          inventory_quantity: Number(v.inventory_quantity ?? payload.stock) || 100
        }))
      : [
          {
            id: Date.now() + 1,
            title: payload.size || 'Default',
            price: sellingPrice,
            compare_at_price: realPrice,
            sku: payload.sku || `GR-${Math.floor(1000 + Math.random() * 9000)}`,
            available: payload.available !== false,
            inventory_quantity: Number(payload.stock) || 100
          }
        ],
    images: productImages
  };

  const supaId = await syncProductToSupabase(newProduct);
  if (supaId) {
    newProduct.id = supaId;
  }

  products.unshift(newProduct);
  memoryProducts = products;
  memoryProductsLastFetch = Date.now();
  writeJsonFile('products.json', { products });
  await redis.cacheDel('alleyrich:catalog:products:*');

  return sendJson(res, 201, { success: true, product: newProduct });
}

async function handleUpdateProduct(req, res, id) {
  const payload = await parseBody(req);
  const products = await getAllProducts();
  const queryStr = decodeURIComponent(id).trim().toLowerCase();
  const index = products.findIndex(p =>
    String(p.id).toLowerCase() === queryStr ||
    (p.handle && p.handle.toLowerCase() === queryStr)
  );

  if (index === -1) {
    return sendJson(res, 404, { success: false, message: 'Product not found' });
  }

  const current = products[index];
  if (payload.title) current.title = payload.title;
  if (payload.category) {
    current.category = payload.category;
    if (!payload.department) {
      const lower = (payload.category + ' ' + (current.title || '')).toLowerCase();
      if (lower.includes('party') || lower.includes('jodhpuri') || lower.includes('blazer') || lower.includes('three-piece') || lower.includes('indo') || lower.includes('kurta') || lower.includes('nehru')) {
        current.department = 'Party Wear';
      } else if (lower.includes('boy') || lower.includes('girl') || lower.includes('baby') || lower.includes('kid') || lower.includes('frock') || lower.includes('romper') || lower.includes('newborn')) {
        current.department = 'Kids Wear';
      } else if (lower.includes('jewel') || lower.includes('bag') || lower.includes('accessor')) {
        current.department = 'Accessories';
      } else {
        current.department = "Men's Wear";
      }
    }
  }
  if (payload.department) current.department = payload.department;
  if (payload.sub_category !== undefined) current.sub_category = payload.sub_category;
  if (payload.fit !== undefined) current.fit = payload.fit;
  if (payload.product_type) current.product_type = payload.product_type;
  if (payload.homepage_section !== undefined) current.homepage_section = payload.homepage_section;

  const sellingPrice = payload.price !== undefined ? payload.price : (payload.selling_price !== undefined ? payload.selling_price : (payload.sellingPrice !== undefined ? payload.sellingPrice : (payload.variants?.[0]?.price)));
  const realPrice = payload.compare_at_price !== undefined ? payload.compare_at_price : (payload.comparePrice !== undefined ? payload.comparePrice : (payload.compare_price !== undefined ? payload.compare_price : (payload.real_price !== undefined ? payload.real_price : (payload.realPrice !== undefined ? payload.realPrice : (payload.mrp !== undefined ? payload.mrp : (payload.variants?.[0]?.compare_at_price))))));

  if (sellingPrice !== undefined && sellingPrice !== null && sellingPrice !== '') {
    const cleanSelling = String(sellingPrice).trim();
    current.price = cleanSelling;
    if (!current.variants || current.variants.length === 0) {
      current.variants = [{ id: Date.now() + 1, title: 'Default', price: cleanSelling, compare_at_price: current.compare_at_price || '' }];
    } else {
      current.variants.forEach(v => { v.price = cleanSelling; });
    }
  }
  if (realPrice !== undefined && realPrice !== null) {
    const cleanReal = String(realPrice).trim();
    current.compare_at_price = cleanReal;
    if (!current.variants || current.variants.length === 0) {
      current.variants = [{ id: Date.now() + 1, title: 'Default', price: current.price || '1000', compare_at_price: cleanReal }];
    } else {
      current.variants.forEach(v => { v.compare_at_price = cleanReal; });
    }
  }
  if (payload.stock !== undefined && current.variants?.[0]) current.variants[0].inventory_quantity = Number(payload.stock);
  if (payload.available !== undefined && current.variants?.[0]) current.variants[0].available = Boolean(payload.available);
  if (payload.tags) current.tags = Array.isArray(payload.tags) ? payload.tags : payload.tags.split(',').map(s => s.trim());
  
  if (payload.images && Array.isArray(payload.images) && payload.images.length > 0) {
    current.images = payload.images.map((img, i) => ({
      id: img.id || (Date.now() + i + 2),
      src: typeof img === 'string' ? img : img.src,
      position: i + 1
    }));
  } else {
    if (payload.image) {
      if (!current.images || current.images.length === 0) {
        current.images = [{ id: Date.now() + 2, src: payload.image, position: 1 }];
      } else {
        current.images[0].src = payload.image;
      }
    }
    if (payload.hoverImage) {
      if (!current.images) current.images = [];
      if (current.images.length > 1) {
        current.images[1].src = payload.hoverImage;
      } else {
        current.images.push({ id: Date.now() + 3, src: payload.hoverImage, position: 2 });
      }
    } else if (payload.hoverImage === '') {
      if (current.images && current.images.length > 1) {
        current.images = [current.images[0]];
      }
    }
  }
  current.updated_at = new Date().toISOString();

  products[index] = current;
  memoryProducts = products;
  writeJsonFile('products.json', { products });
  await syncProductToSupabase(current);
  memoryProductsLastFetch = Date.now();
  await redis.cacheDel('alleyrich:catalog:products:*');

  return sendJson(res, 200, { success: true, product: current });
}

async function handleDeleteProduct(req, res, id) {
  const products = await getAllProducts();
  const queryStr = decodeURIComponent(id).trim().toLowerCase();
  const toDelete = products.find(p =>
    String(p.id).toLowerCase() === queryStr ||
    (p.handle && p.handle.toLowerCase() === queryStr)
  );

  if (!toDelete) {
    return sendJson(res, 404, { success: false, message: 'Product not found' });
  }

  const filtered = products.filter(p => p !== toDelete);
  memoryProducts = filtered;
  memoryProductsLastFetch = Date.now();
  writeJsonFile('products.json', { products: filtered });

  await deleteProductFromSupabase(toDelete.id, toDelete.handle);
  memoryProductsLastFetch = Date.now();
  await redis.cacheDel('alleyrich:catalog:products:*');

  return sendJson(res, 200, { success: true, message: 'Product deleted' });
}

async function handleGetOrders(req, res, parsedUrl) {
  const status = parsedUrl.searchParams.get('status');
  const requestedEmail = parsedUrl.searchParams.get('email')?.toLowerCase();
  const requestedPhone = parsedUrl.searchParams.get('phone');
  const requestedUserId = parsedUrl.searchParams.get('userId');
  const isAdmin = security.isAdminAuthorized(req, parsedUrl);
  const identity = isAdmin ? null : await getAuthenticatedIdentity(req);

  if (!isAdmin && !identity) {
    return sendJson(res, 401, {
      success: false,
      message: 'Authentication required to view orders.'
    });
  }

  // Customer queries are always bound to the authenticated identity. Query
  // parameters cannot be used to select another customer's records.
  const email = isAdmin ? requestedEmail : identity.email;
  const phone = isAdmin ? requestedPhone : null;
  const userId = isAdmin ? requestedUserId : identity.id;

  // Rate limit customer order lookups (30 req/min)
  const clientIp = security.getClientIp(req);
  const lookupLimit = await redis.checkRateLimit(`order_lookup:${clientIp}`, 30, 60);
  if (!lookupLimit.allowed) {
    return sendJson(res, 429, { success: false, message: 'Too many order lookups. Please wait a minute.' }, { 'Retry-After': String(lookupLimit.resetAfterSeconds) });
  }

  const orders = await getAllOrders();
  let filtered = orders;
  if (status && status !== 'all') {
    filtered = filtered.filter(o => o.orderStatus?.toLowerCase() === status.toLowerCase());
  }
  if (email || phone || userId) {
    filtered = filtered.filter(o => {
      const cEmail = (o.customer?.email || '').toLowerCase();
      const cPhone = (o.customer?.phone || '').replace(/\D+/g, '');
      const searchPhone = phone ? phone.replace(/\D+/g, '') : null;
      const phoneMatch = Boolean(
        searchPhone && cPhone && (
          cPhone === searchPhone ||
          cPhone.slice(-10) === searchPhone.slice(-10)
        )
      );
       return (email && cEmail === email) ||
             phoneMatch ||
             (userId && (o.userId === userId || o.supabaseId === userId));
    });
  }

  return sendJson(res, 200, {
    success: true,
    count: filtered.length,
    orders: filtered.map(order => isAdmin ? order : customerOrderView(order))
  });
}

function getCashfreeConfig() {
  const appId = process.env.CASHFREE_APP_ID;
  const secret = process.env.CASHFREE_SECRET_KEY;
  if (!appId || !secret) return null;
  const environment = String(process.env.CASHFREE_ENV || 'TEST').toUpperCase();
  return {
    appId,
    secret,
    baseUrl: environment === 'PROD' || environment === 'PRODUCTION'
      ? 'https://api.cashfree.com/pg'
      : 'https://sandbox.cashfree.com/pg'
  };
}

async function cashfreeFetch(config, endpoint, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    return await fetch(`${config.baseUrl}${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': config.appId,
        'x-client-secret': config.secret,
        'x-api-version': CASHFREE_API_VERSION,
        ...(options.headers || {})
      }
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function createCashfreeOrder(req, order) {
  const config = getCashfreeConfig();
  if (!config) return { configured: false };
  const origin = getConfiguredOrigin(req) || `https://${process.env.APP_DOMAIN || 'alleyrich.com'}`;
  const response = await cashfreeFetch(config, '/orders', {
    method: 'POST',
    body: JSON.stringify({
      order_id: order.id,
      order_amount: order.total,
      order_currency: 'INR',
      customer_details: {
        customer_id: String(order.customer.email || order.customer.phone).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50),
        customer_name: order.customer.name,
        customer_email: order.customer.email,
        customer_phone: order.customer.phone
      },
      order_meta: {
        return_url: `${origin}/order-success?orderId={order_id}&cashfree=paid`
      }
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.payment_session_id) {
    const error = new Error('Cashfree order creation failed');
    error.statusCode = response.status >= 400 && response.status < 500 ? 400 : 502;
    throw error;
  }
  return {
    configured: true,
    cashfreeOrderId: body.cf_order_id || order.id,
    paymentSessionId: body.payment_session_id
  };
}

async function verifyCashfreeOrder(order) {
  const config = getCashfreeConfig();
  if (!config) return { configured: false, verified: false };
  const response = await cashfreeFetch(config, `/orders/${encodeURIComponent(order.id)}/payments`);
  const payments = await response.json().catch(() => []);
  if (!response.ok || !Array.isArray(payments)) return { configured: true, verified: false };
  const successfulPayment = payments.find(payment =>
    String(payment.payment_status).toUpperCase() === 'SUCCESS' &&
    Math.abs(Number(payment.payment_amount) - Number(order.total)) < 0.01 &&
    String(payment.payment_currency || 'INR').toUpperCase() === 'INR'
  );
  return {
    configured: true,
    verified: Boolean(successfulPayment),
    paymentId: successfulPayment?.cf_payment_id || null
  };
}

async function handleCreateOrder(req, res, isCheckout = false) {
  const clientIp = security.getClientIp(req);
  const createLimit = await redis.checkRateLimit(`order_create:${clientIp}`, 10, 300);
  if (!createLimit.allowed) {
    return sendJson(res, 429, { success: false, message: 'Too many order submissions. Please wait a few minutes before trying again.' }, { 'Retry-After': String(createLimit.resetAfterSeconds) });
  }

  const payload = await parseBody(req);
  const items = Array.isArray(payload.items) ? payload.items : [];
  const validItems = items.filter(it => Number.isInteger(Number(it.quantity || it.qty)) && Number(it.quantity || it.qty) > 0);
  if (validItems.length === 0 || validItems.length > 50) {
    return sendJson(res, 400, {
      success: false,
      error: 'Cart is empty. Cannot place an empty order.',
      message: 'Cart is empty. Cannot place an empty order.'
    });
  }

  const allProducts = await getAllProducts();
  const processedItems = [];
  for (const item of validItems) {
    const match = allProducts.find(p =>
      (item.id && String(p.id) === String(item.id)) ||
      (item.handle && p.handle === item.handle) ||
      (item.title && p.title.toLowerCase() === String(item.title).toLowerCase())
    );
    if (!match) {
      return sendJson(res, 400, { success: false, message: 'One or more cart items are no longer available.' });
    }
    const quantity = Number(item.quantity || item.qty);
    if (!Number.isSafeInteger(quantity) || quantity > 20) {
      return sendJson(res, 400, { success: false, message: 'Each item quantity must be between 1 and 20.' });
    }
    const variant = Array.isArray(match.variants) && match.variants.length
      ? (match.variants.find(v => item.size && String(v.title).toLowerCase() === String(item.size).toLowerCase()) || match.variants[0])
      : null;
    const serverPrice = Number(variant?.price ?? match.price ?? 0);
    if (!Number.isFinite(serverPrice) || serverPrice < 0) {
      return sendJson(res, 400, { success: false, message: 'A cart item has an invalid catalog price.' });
    }
    const available = variant?.available !== false && Number(variant?.inventory_quantity ?? 1) >= quantity;
    if (!available) return sendJson(res, 409, { success: false, message: `${match.title} is out of stock.` });
    processedItems.push({
      id: match.id,
      handle: match.handle,
      variantId: variant?.id || null,
      title: match.title,
      size: cleanText(item.size || variant?.title || 'Default', 30),
      price: serverPrice,
      quantity,
      image: match.images?.[0]?.src || ''
    });
  }

  const calculatedSubtotal = processedItems.reduce((acc, it) => acc + (it.price * it.quantity), 0);
  const subtotal = Number(calculatedSubtotal.toFixed(2));
  const discounts = readJsonFile('discounts.json', []);
  const discountCode = cleanText(payload.discountCode || payload.couponCode || payload.coupon || '', 50).toUpperCase();
  const discountRule = discounts.find(d => d.isActive !== false && String(d.code || '').toUpperCase() === discountCode && (!d.usageLimit || Number(d.usageCount || 0) < Number(d.usageLimit)) && subtotal >= Number(d.minOrderValue || 0));
  let discount = 0;
  if (discountRule) {
    discount = discountRule.type === 'fixed'
      ? Number(discountRule.value || 0)
      : subtotal * (Number(discountRule.value || 0) / 100);
    discount = Math.min(discount, Number(discountRule.maxDiscount || discount));
    discountRule.usageCount = (Number(discountRule.usageCount) || 0) + 1;
    writeJsonFile('discounts.json', discounts);
  }
  discount = Math.max(0, Math.min(subtotal, Number(discount.toFixed(2))));
  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : DEFAULT_SHIPPING_FEE;
  const total = Number(Math.max(0, subtotal - discount + shipping).toFixed(2));

  const rawCustomer = payload.customer && typeof payload.customer === 'object' ? payload.customer : {};
  const customer = {
    name: cleanText(rawCustomer.name, 120),
    email: cleanText(rawCustomer.email, 255).toLowerCase(),
    phone: cleanText(rawCustomer.phone, 30).replace(/\D/g, '').slice(-10),
    city: cleanText(rawCustomer.city, 100),
    state: cleanText(rawCustomer.state, 100),
    address: cleanText(rawCustomer.address, 300),
    locality: cleanText(rawCustomer.locality, 150),
    pincode: cleanText(rawCustomer.pincode, 6),
    country: 'India'
  };
  if (!customer.name || !isValidEmail(customer.email) || !isValidIndianPhone(customer.phone) || !customer.address || !isValidIndianPincode(customer.pincode)) {
    return sendJson(res, 400, { success: false, message: 'Valid name, email, Indian phone, address and 6-digit pincode are required.' });
  }

  const isCashfree = String(payload.paymentMethod || '').toLowerCase().includes('cashfree');
  const orderId = generateOrderId();
  const checkoutToken = crypto.randomBytes(32).toString('base64url');
  const identity = await getAuthenticatedIdentity(req);

  const newOrder = {
    id: orderId,
    userId: identity?.id || null,
    customer: {
      ...customer
    },
    items: processedItems,
    subtotal,
    discount,
    shipping,
    total,
    paymentMethod: isCashfree ? 'Cashfree Online Payment' : 'Cash on Delivery (COD)',
    paymentStatus: isCashfree ? 'Pending' : 'Pending COD',
    orderStatus: 'Processing',
    trackingNumber: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    cashfreeOrderId: null,
    cashfreePaymentId: null,
    checkoutTokenHash: hashSecret(checkoutToken),
    inventoryReservedAt: new Date().toISOString(),
    inventoryReleasedAt: null
  };
  let paymentSessionId = null;

  const inventoryReserved = await reserveInventory(processedItems);
  if (!inventoryReserved) {
    return sendJson(res, 409, { success: false, message: 'One or more items became unavailable. Please refresh your bag and try again.' });
  }

  if (isCashfree) {
    let gatewayOrder;
    try {
      gatewayOrder = await createCashfreeOrder(req, newOrder);
    } catch (error) {
      await releaseInventory(processedItems);
      return sendJson(res, error.statusCode || 502, { success: false, message: 'Unable to initialise the payment gateway. Please try again.' });
    }
    if (!gatewayOrder.configured) {
      await releaseInventory(processedItems);
      return sendJson(res, 503, { success: false, message: 'Online payments are temporarily unavailable. Please choose COD.' });
    }
    newOrder.cashfreeOrderId = gatewayOrder.cashfreeOrderId;
    paymentSessionId = gatewayOrder.paymentSessionId;
  }

  // Cashfree's client session is a short-lived payment credential. Return it
  // once to the checkout client, but never persist it in order archives.

  const orders = await getAllOrders();
  orders.unshift(newOrder);
  memoryOrders = orders;
  memoryOrdersLastFetch = Date.now();
  if (!writeJsonFile('orders.json', orders)) {
    await releaseInventory(processedItems);
    return sendJson(res, 500, { success: false, message: 'Unable to save the order. Please try again.' });
  }
  if (db && db.orders && typeof db.orders.create === 'function') {
    try {
      await db.orders.create(newOrder);
    } catch (e) {
      console.warn('AWS RDS order create warning:', e.message);
    }
  }
  await syncOrderToSupabase(newOrder);

  // Sync customer address and contact info to customers.json
  try {
    const custEmail = customer.email;
    if (custEmail) {
      let customers = readJsonFile('customers.json', []);
      let cust = customers.find(c => (c.email || '').toLowerCase().trim() === custEmail);
      let newCust = null;
      if (cust) {
        if (payload.customer?.name && (!cust.name || cust.name === 'Walk-in Customer')) cust.name = payload.customer.name;
        if (payload.customer?.phone) cust.phone = payload.customer.phone;
        if (payload.customer?.address) cust.address = payload.customer.address;
        if (payload.customer?.locality) cust.locality = payload.customer.locality;
        if (payload.customer?.city) cust.city = payload.customer.city;
        if (payload.customer?.state) cust.state = payload.customer.state;
        if (payload.customer?.pincode) cust.pincode = payload.customer.pincode;
        if (payload.customer?.country) cust.country = payload.customer.country;
        cust.totalOrders = (cust.totalOrders || 0) + 1;
        cust.totalSpent = (cust.totalSpent || 0) + total;
      } else {
        newCust = {
          id: `cust_${Date.now()}`,
          name: payload.customer?.name || 'Customer',
          email: custEmail,
          phone: payload.customer?.phone || '',
          city: payload.customer?.city || 'Mumbai',
          state: payload.customer?.state || 'Maharashtra',
          address: payload.customer?.address || '',
          locality: payload.customer?.locality || '',
          pincode: payload.customer?.pincode || '',
          country: payload.customer?.country || 'India',
          ordersCount: 1,
          totalSpent: total,
          status: 'Active',
          tags: ['Storefront Buyer', 'WhatsApp VIP'],
          wishlist: [],
          cart: []
        };
        customers.unshift(newCust);
      }
      writeJsonFile('customers.json', customers);
      if (db && db.isConfigured) {
        try {
           await db.customers.upsert(cust || newCust);
        } catch (dbCustErr) {
          console.warn('AWS RDS customer upsert on order warning:', dbCustErr.message);
        }
      }
    }
  } catch (e) {}

  // Send real order confirmation email via Resend if email is provided
  sendOrderConfirmationEmail(newOrder).catch(err => {
    console.warn('⚠️ [ASYNC ORDER EMAIL WARNING]:', err.message);
  });

  return sendJson(res, 201, {
    success: true,
    order: paymentSessionId
      ? { ...customerOrderView(newOrder), paymentSessionId, checkoutToken }
      : customerOrderView(newOrder),
    orderId: newOrder.id,
    cashfreeOrderId: newOrder.cashfreeOrderId
  });
}

async function handleUpdateOrder(req, res, id) {
  const payload = await parseBody(req);
  const orders = await getAllOrders();
  const order = orders.find(o => String(o.id) === String(id));
  if (!order) {
    return sendJson(res, 404, { success: false, message: 'Order not found' });
  }

  const allowedOrderStatuses = new Set(['Processing', 'Pending', 'Shipped', 'Delivered', 'Cancelled', 'Refunded']);
  const allowedPaymentStatuses = new Set(['Paid', 'Pending', 'Pending COD', 'Failed', 'Refunded']);
  if (payload.orderStatus) {
    if (!allowedOrderStatuses.has(String(payload.orderStatus))) return sendJson(res, 400, { success: false, message: 'Invalid order status.' });
    order.orderStatus = String(payload.orderStatus);
  }
  if (payload.paymentStatus) {
    if (!allowedPaymentStatuses.has(String(payload.paymentStatus))) return sendJson(res, 400, { success: false, message: 'Payment status can only be changed by the payment verification flow.' });
    order.paymentStatus = String(payload.paymentStatus);
  }
  if (payload.paymentMethod) order.paymentMethod = cleanText(payload.paymentMethod, 80);
  if (payload.trackingNumber !== undefined) order.trackingNumber = cleanText(payload.trackingNumber, 80);
  if (payload.customer && typeof payload.customer === 'object') {
    const allowedCustomerFields = ['name', 'phone', 'email', 'city', 'state', 'address', 'locality', 'pincode', 'country'];
    const customerPatch = {};
    for (const field of allowedCustomerFields) {
      if (payload.customer[field] !== undefined) customerPatch[field] = cleanText(payload.customer[field], field === 'address' ? 300 : 120);
    }
    order.customer = { ...order.customer, ...customerPatch };
  }
  order.updatedAt = new Date().toISOString();

  if (!writeJsonFile('orders.json', orders)) return sendJson(res, 500, { success: false, message: 'Unable to save order changes.' });
  memoryOrders = orders;
  memoryOrdersLastFetch = Date.now();
  if ((order.orderStatus === 'Cancelled' || order.orderStatus === 'Refunded') && order.inventoryReservedAt && !order.inventoryReleasedAt) {
    await releaseInventory(order.items);
    order.inventoryReleasedAt = new Date().toISOString();
    writeJsonFile('orders.json', orders);
  }
  if (db && db.orders && typeof db.orders.create === 'function') {
    try {
      await db.orders.create(order);
    } catch (e) {
      console.warn('DB order update warning:', e.message);
    }
  }
  await syncOrderToSupabase(order);

  return sendJson(res, 200, { success: true, order: security.isAdminAuthorized(req) ? order : customerOrderView(order) });
}

async function handleDelhiveryAwb(req, res, id) {
  const orders = await getAllOrders();
  const order = orders.find(o => String(o.id) === String(id));
  if (!order) {
    return sendJson(res, 404, { success: false, message: 'Order not found' });
  }

  // ── Idempotency guard: if already dispatched, return existing waybill ──────
  if (order.delhiveryWaybill || order.trackingNumber) {
    const existingAwb = order.delhiveryWaybill || order.trackingNumber;
    return sendJson(res, 200, {
      success: true,
      idempotent: true,
      awb: existingAwb,
      waybill: existingAwb,
      trackingUrl: order.trackingUrl || `https://www.delhivery.com/track/package/${existingAwb}`,
      shippingLabelUrl: order.shippingLabelUrl || delhivery.getPackingSlipUrl(existingAwb),
      message: `Waybill ${existingAwb} already assigned for this order. Returning existing waybill (idempotent).`,
      order,
    });
  }

  let delhiveryAwb = '';
  let trackingUrl = '';
  let packingSlipUrl = '';
  let isLiveDispatch = false;
  let dispatchNote = '';

  try {
    const liveShipment = await delhivery.createShipment(order);
    if (liveShipment && liveShipment.waybill) {
      delhiveryAwb = liveShipment.waybill;
      trackingUrl = liveShipment.trackingUrl;
      packingSlipUrl = liveShipment.packingSlipUrl;
      isLiveDispatch = true;
      dispatchNote = 'Live Delhivery package created and waybill assigned!';
    }
  } catch (err) {
    console.error('Delhivery Express API note:', err.message);
    if (process.env.ALLOW_SYNTHETIC_AWB !== 'true') {
      return sendJson(res, 502, { success: false, message: 'Delhivery could not create a shipment. No tracking number was assigned.' });
    }
    dispatchNote = `Live API: ${err.message}. Assigned synthetic waybill for test mode only.`;
    delhiveryAwb = order.trackingNumber || ('14092' + Math.floor(1000000 + Math.random() * 9000000));
    trackingUrl = `https://www.delhivery.com/track/package/${delhiveryAwb}`;
    packingSlipUrl = delhivery.getPackingSlipUrl(delhiveryAwb);
  }

  order.trackingNumber = delhiveryAwb;
  order.delhiveryWaybill = delhiveryAwb;
  order.carrier = 'Delhivery Express Air Priority';
  order.orderStatus = 'Shipped';
  order.trackingUrl = trackingUrl;
  order.shippingLabelUrl = packingSlipUrl;
  order.shippingDetails = {
    waybill: delhiveryAwb,
    carrier: order.carrier,
    trackingUrl: trackingUrl,
    packingSlipUrl: packingSlipUrl
  };
  order.updatedAt = new Date().toISOString();

  writeJsonFile('orders.json', orders);
  memoryOrders = orders;
  memoryOrdersLastFetch = Date.now();
  if (db && db.orders && typeof db.orders.create === 'function') {
    try {
      await db.orders.create(order);
    } catch (e) {
      console.warn('DB order update on AWB warning:', e.message);
    }
  }
  await syncOrderToSupabase(order);

  return sendJson(res, 200, {
    success: true,
    message: isLiveDispatch 
      ? `✅ Delhivery Express live AWB ${delhiveryAwb} booked successfully!`
      : `Delhivery Waybill ${delhiveryAwb} generated! (${dispatchNote})`,
    awb: delhiveryAwb,
    trackingUrl,
    shippingLabelUrl: packingSlipUrl,
    isLiveDispatch,
    order
  });
}


/**
 * Generates an official high-resolution printable Delhivery thermal barcode packing sticker
 */
function generatePrintablePackingSlip(order, waybill) {
  const cust = order.customer || {};
  const items = Array.isArray(order.items) ? order.items : [];
  const isCod = String(order.paymentMethod || '').toLowerCase().includes('cod');
  const paymentMode = isCod ? 'COD' : 'PREPAID';
  const codAmount = isCod ? (order.total || 0) : 0;
  const pin = cust.pincode || '209721';
  const orderDate = new Date(order.createdAt || Date.now()).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric'
  });

  // Generate high-contrast SVG barcode for thermal sticker printing
  const cleanWbn = String(waybill).replace(/\D/g, '') || '140924077629';
  const bars = cleanWbn.split('').map((digit, i) => {
    const w = (parseInt(digit, 10) % 3) + 1;
    const gap = ((parseInt(digit, 10) + 1) % 2) + 1;
    return `<rect x="${i * 18 + 10}" y="0" width="${w * 3}" height="48" fill="#000" /><rect x="${i * 18 + 10 + w * 3}" y="0" width="${gap * 2}" height="48" fill="#fff" />`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Delhivery Express Shipping Label - ${waybill}</title>
  <style>
    @page { size: 100mm 150mm; margin: 0; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 12px;
      color: #000;
      background: #fff;
      font-size: 11px;
      line-height: 1.25;
    }
    .label-box {
      width: 380px;
      max-width: 100%;
      margin: 0 auto;
      border: 2px solid #000;
      padding: 10px;
      background: #fff;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #000;
      padding-bottom: 8px;
    }
    .brand-title {
      font-size: 18px;
      font-weight: 900;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      margin: 0;
    }
    .carrier-title {
      font-size: 13px;
      font-weight: 800;
      color: #000;
      text-transform: uppercase;
    }
    .barcode-section {
      text-align: center;
      padding: 8px 0;
      border-bottom: 2px solid #000;
    }
    .awb-text {
      font-family: monospace;
      font-size: 15px;
      font-weight: 900;
      letter-spacing: 0.25em;
      margin-top: 4px;
    }
    .routing-banner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 4px;
      border-bottom: 2px solid #000;
      background: #000;
      color: #fff;
    }
    .routing-pin {
      font-size: 22px;
      font-weight: 900;
      letter-spacing: 0.1em;
    }
    .routing-mode {
      font-size: 14px;
      font-weight: 900;
      padding: 2px 8px;
      background: #fff;
      color: #000;
      border-radius: 2px;
    }
    .address-section {
      padding: 8px 0;
      border-bottom: 1px solid #000;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin: 6px 0;
      font-size: 10px;
    }
    .items-table th, .items-table td {
      border: 1px solid #000;
      padding: 4px 6px;
      text-align: left;
    }
    .seller-section {
      font-size: 9px;
      padding-top: 6px;
      color: #333;
    }
    .no-print {
      text-align: center;
      margin-bottom: 12px;
    }
    .btn-print {
      background: #000;
      color: #fff;
      border: none;
      padding: 8px 16px;
      font-weight: 700;
      cursor: pointer;
      border-radius: 4px;
    }
    @media print {
      .no-print { display: none; }
      body { padding: 0; }
      .label-box { border: 2px solid #000; width: 100%; }
    }
  </style>
</head>
<body>
  <div class="no-print">
    <button class="btn-print" onclick="window.print()">🖨️ Print Delhivery Shipping Sticker</button>
  </div>
  <div class="label-box">
    <div class="header">
      <div>
        <div class="brand-title">ALLEYRICH</div>
        <div style="font-size: 9px; letter-spacing: 0.05em; text-transform: uppercase;">SD GARMENTS &bull; LUXURY STREETWEAR</div>
      </div>
      <div style="text-align: right;">
        <div class="carrier-title">DELHIVERY</div>
        <div style="font-size: 9px; font-weight: 700;">EXPRESS AIR B2C</div>
      </div>
    </div>

    <div class="barcode-section">
      <svg width="260" height="48" style="margin: 0 auto; display: block;">
        ${bars}
      </svg>
      <div class="awb-text">AWB: ${cleanWbn}</div>
    </div>

    <div class="routing-banner">
      <div>
        <div style="font-size: 9px; text-transform: uppercase; opacity: 0.8;">DESTINATION PIN</div>
        <div class="routing-pin">${pin}</div>
      </div>
      <div class="routing-mode">${paymentMode} ${isCod ? '₹' + codAmount : 'PAID'}</div>
    </div>

    <div class="address-section">
      <div style="font-weight: 800; font-size: 12px; margin-bottom: 3px;">SHIP TO:</div>
      <div style="font-weight: 700; font-size: 13px;">${cust.name || 'Valued Client'}</div>
      <div>${cust.address || ''} ${cust.locality || ''}</div>
      <div>${cust.city || ''}, ${cust.state || ''} - <strong>${pin}</strong></div>
      <div style="margin-top: 4px; font-weight: 700;">Phone: ${cust.phone || 'N/A'}</div>
    </div>

    <table class="items-table">
      <thead>
        <tr>
          <th>Item / SKU</th>
          <th style="width: 40px; text-align: center;">Size</th>
          <th style="width: 30px; text-align: center;">Qty</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(it => `
          <tr>
            <td>${it.title || 'ALLEYRICH Apparel'}</td>
            <td style="text-align: center; font-weight: 700;">${it.size || 'M'}</td>
            <td style="text-align: center; font-weight: 700;">${it.quantity || 1}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div style="display: flex; justify-content: space-between; border-top: 1px solid #000; padding: 4px 0; font-weight: 700;">
      <span>Order: #${order.id} (${orderDate})</span>
      <span>Total: ₹${order.total || 0}</span>
    </div>

    <div class="seller-section">
      <strong>RETURN & SHIPPED BY:</strong> SD Garments, 1 Nagar Palika Road, Chhibramau, Kannauj, Uttar Pradesh - 209721. GSTIN: 09AAECS1234F1Z5
    </div>
  </div>
</body>
</html>`;
}

async function handleShippingLabel(req, res, id) {
  const cleanId = String(decodeURIComponent(id || '')).replace(/\/shipping-label\/?$/, '').replace(/^\/+|\/+$/g, '').trim();
  let orders = await getAllOrders();
  let order = orders.find(o => String(o.id) === cleanId);

  if (!order) {
    const freshOrders = readJsonFile('orders.json', []);
    order = freshOrders.find(o => String(o.id) === cleanId);
    if (order) {
      memoryOrders = freshOrders;
      memoryOrdersLastFetch = Date.now();
      orders = freshOrders;
    }
  }

  // If id is awb-XXXX, lookup by waybill
  if (!order && cleanId.startsWith('awb-')) {
    const rawAwb = cleanId.replace('awb-', '').trim();
    order = orders.find(o => o.trackingNumber === rawAwb || o.delhiveryWaybill === rawAwb);
    if (!order) {
      const freshOrders = readJsonFile('orders.json', []);
      order = freshOrders.find(o => o.trackingNumber === rawAwb || o.delhiveryWaybill === rawAwb);
      if (order) {
        memoryOrders = freshOrders;
        memoryOrdersLastFetch = Date.now();
        orders = freshOrders;
      }
    }
  }

  // If still not found, check if id is a waybill directly
  if (!order) {
    order = orders.find(o => o.trackingNumber === cleanId || o.delhiveryWaybill === cleanId);
    if (!order) {
      const freshOrders = readJsonFile('orders.json', []);
      order = freshOrders.find(o => o.trackingNumber === cleanId || o.delhiveryWaybill === cleanId);
      if (order) {
        memoryOrders = freshOrders;
        memoryOrdersLastFetch = Date.now();
        orders = freshOrders;
      }
    }
  }

  let waybill = (order && (order.trackingNumber || order.delhiveryWaybill))
    ? String(order.trackingNumber || order.delhiveryWaybill).trim()
    : (cleanId.startsWith('awb-') ? cleanId.replace('awb-', '').trim() : (/^\d{10,}$/.test(cleanId) ? cleanId : ''));

  if (!waybill) {
    return sendJson(res, 404, { success: false, message: 'AWB tracking number not generated for this order yet' });
  }

  if (process.env.ALLOW_SYNTHETIC_AWB !== 'true') {
    try {
      const pdfUrl = await delhivery.getPackingSlipPdfUrl(waybill);
      if (pdfUrl && pdfUrl.startsWith('http')) {
        // 302 redirect directly to Delhivery's pre-signed Amazon S3 PDF sticker
        res.writeHead(302, {
          'Location': pdfUrl,
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        return res.end();
      }
    } catch (err) {
      console.warn(`Delhivery live packing slip note for ${waybill}:`, err.message);
    }
  }

  if (!order) {
    return sendJson(res, 404, { success: false, message: 'Delhivery packing slip not found for waybill ' + waybill });
  }

  // Fallback: If Delhivery API returns packages_found: 0 (e.g. simulated waybill during testing/staging),
  // render an official high-fidelity printable Delhivery Express barcode packing sticker with zero errors.
  const htmlSlip = generatePrintablePackingSlip(order, waybill);
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  });
  return res.end(htmlSlip);
}

async function handleDelhiveryCancel(req, res, id) {
  const cleanId = String(decodeURIComponent(id || '')).replace(/\/delhivery-cancel\/?$/, '').replace(/^\/+|\/+$/g, '').trim();
  const orders = await getAllOrders();
  const order = orders.find(o => String(o.id) === cleanId);
  if (!order) {
    return sendJson(res, 404, { success: false, message: 'Order not found' });
  }

  const waybill = order.trackingNumber || order.delhiveryWaybill;
  let delhiveryResult = null;
  if (waybill) {
    try {
      delhiveryResult = await delhivery.cancelShipment(waybill);
    } catch (err) {
      console.warn('Delhivery cancelShipment warning:', err.message);
    }
  }

  const oldWaybill = order.trackingNumber || order.delhiveryWaybill;
  order.trackingNumber = '';
  order.delhiveryWaybill = '';
  order.carrier = '';
  order.trackingUrl = '';
  order.shippingLabelUrl = '';
  order.orderStatus = 'Processing';
  order.shippingStatus = 'Unfulfilled';
  order.updatedAt = new Date().toISOString();

  // Persist order update
  writeJsonFile('orders.json', orders);
  memoryOrders = orders;
  memoryOrdersLastFetch = Date.now();

  // Persist to Postgres database if available
  if (db && db.orders && typeof db.orders.create === 'function') {
    try {
      await db.orders.create(order);
    } catch (e) {
      console.warn('DB order update on cancel warning:', e.message);
    }
  }

  // Sync to Supabase
  await syncOrderToSupabase(order);

  return sendJson(res, 200, {
    success: true,
    message: oldWaybill 
      ? `Delhivery shipment (AWB ${oldWaybill}) cancelled successfully. Order reverted to Processing.`
      : 'Order courier dispatch cancelled and reverted to Processing.',
    order,
    delhivery: delhiveryResult
  });
}

async function handleCashfreeWebhook(req, res) {
  const config = getCashfreeConfig();
  if (!config) return sendJson(res, 503, { success: false, message: 'Payment webhook is not configured.' });

  let rawBody;
  try {
    rawBody = await parseRawBody(req, 1024 * 1024);
  } catch (error) {
    return sendJson(res, error.message === 'Payload too large' ? 413 : 400, { success: false, message: 'Invalid webhook payload.' });
  }

  const timestamp = String(req.headers['x-webhook-timestamp'] || '');
  const suppliedSignature = String(req.headers['x-webhook-signature'] || '');
  const timestampNumber = Number(timestamp);
  if (!/^\d+$/.test(timestamp) || !Number.isSafeInteger(timestampNumber) || Math.abs(Date.now() - timestampNumber) > 5 * 60 * 1000 || !suppliedSignature) {
    return sendJson(res, 401, { success: false, message: 'Invalid webhook signature.' });
  }

  const expectedSignature = crypto.createHmac('sha256', config.secret).update(`${timestamp}${rawBody.toString('utf8')}`).digest('base64');
  if (!constantTimeStringEquals(suppliedSignature, expectedSignature)) {
    return sendJson(res, 401, { success: false, message: 'Invalid webhook signature.' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch (_) {
    return sendJson(res, 400, { success: false, message: 'Invalid webhook JSON.' });
  }

  const eventId = String(req.headers['x-idempotency-key'] || event.event_id || hashSecret(rawBody.toString('utf8')));
  const isNew = await redis.checkWebhookIdempotency(eventId, 86400);
  if (!isNew || cashfreeWebhookEvents.has(eventId)) return sendJson(res, 200, { success: true, duplicate: true });
  cashfreeWebhookEvents.set(eventId, Date.now());

  const data = event.data || {};
  const payment = data.payment || {};
  const gatewayOrderId = String(data.order?.order_id || data.order?.cf_order_id || '');
  const paymentStatus = String(payment.payment_status || data.order?.order_status || '').toUpperCase();
  if (!gatewayOrderId || !['SUCCESS', 'PAID'].includes(paymentStatus)) {
    return sendJson(res, 200, { success: true, processed: false });
  }

  const orders = await getAllOrders();
  const order = orders.find(candidate => String(candidate.id) === gatewayOrderId || String(candidate.cashfreeOrderId || '') === gatewayOrderId);
  if (!order) return sendJson(res, 200, { success: true, processed: false });
  if (Math.abs(Number(payment.payment_amount || data.order?.order_amount || 0) - Number(order.total)) >= 0.01 || String(payment.payment_currency || 'INR').toUpperCase() !== 'INR') {
    return sendJson(res, 400, { success: false, message: 'Webhook amount or currency does not match the order.' });
  }

  if (order.paymentStatus !== 'Paid') {
    order.paymentStatus = 'Paid';
    order.cashfreePaymentId = payment.cf_payment_id || payment.cf_payment_id || null;
    order.updatedAt = new Date().toISOString();
    if (!writeJsonFile('orders.json', orders)) {
      cashfreeWebhookEvents.delete(eventId);
      return sendJson(res, 500, { success: false, message: 'Unable to persist payment webhook.' });
    }
    memoryOrders = orders;
    memoryOrdersLastFetch = Date.now();
    await syncOrderToSupabase(order);
    sendOrderConfirmationEmail(order).catch(() => {});
  }
  return sendJson(res, 200, { success: true, processed: true });
}

async function handleCashfreeVerify(req, res, id) {
  const orders = await getAllOrders();
  const order = orders.find(o => String(o.id) === String(id));
  if (!order) {
    return sendJson(res, 404, { success: false, message: 'Order not found' });
  }

  let verification;
  try {
    verification = await verifyCashfreeOrder(order);
  } catch (_) {
    return sendJson(res, 502, { success: false, message: 'Cashfree verification is temporarily unavailable.' });
  }
  if (!verification.configured) {
    return sendJson(res, 503, { success: false, message: 'Cashfree verification is not configured.' });
  }
  if (!verification.verified) {
    return sendJson(res, 400, { success: false, message: 'No successful Cashfree payment matching this order was found.' });
  }

  if (order.paymentStatus === 'Paid') {
    return sendJson(res, 200, { success: true, message: 'Cashfree payment was already verified.', order: customerOrderView(order) });
  }

  order.paymentStatus = 'Paid';
  order.paymentMethod = order.paymentMethod || 'Cashfree Online Payment';
  order.cashfreePaymentId = verification.paymentId;
  order.updatedAt = new Date().toISOString();

  if (!writeJsonFile('orders.json', orders)) return sendJson(res, 500, { success: false, message: 'Unable to save payment confirmation.' });
  memoryOrders = orders;
  memoryOrdersLastFetch = Date.now();
  if (db && db.orders && typeof db.orders.create === 'function') {
    try {
      await db.orders.create(order);
    } catch (e) {}
  }
  await syncOrderToSupabase(order);

  // Send paid order confirmation email & optional webhook
  sendOrderConfirmationEmail(order).catch(() => {});

  return sendJson(res, 200, {
    success: true,
    message: 'Cashfree payment verified and confirmed.',
    order: customerOrderView(order)
  });
}

async function handleDeleteOrder(req, res, id) {
  const orders = await getAllOrders();
  const order = orders.find(o => String(o.id) === String(id));
  const filtered = orders.filter(o => String(o.id) !== String(id));
  if (filtered.length === orders.length) {
    return sendJson(res, 404, { success: false, message: 'Order not found' });
  }
  if (!writeJsonFile('orders.json', filtered)) return sendJson(res, 500, { success: false, message: 'Unable to delete order.' });
  if (order?.inventoryReservedAt && !order.inventoryReleasedAt) {
    await releaseInventory(order.items);
  }
  memoryOrders = filtered;
  memoryOrdersLastFetch = Date.now();
  if (db && db.orders && typeof db.orders.delete === 'function') {
    try {
      await db.orders.delete(id);
    } catch (e) {
      console.warn('DB order delete warning:', e.message);
    }
  }
  await deleteOrderFromSupabase(id);

  return sendJson(res, 200, { success: true, message: 'Order deleted' });
}

async function appHandler(req, res) {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let pathname = decodeURIComponent(parsedUrl.pathname);
    applyCors(req, res);

  // Handle Shopify dummy telemetry, web-pixels & monorail to keep console clean
  if (
    pathname.startsWith('/web-pixels') ||
    pathname.startsWith('/.well-known/shopify') ||
    pathname.includes('monorail') ||
    pathname.includes('shopify-app-pixel')
  ) {
    res.writeHead(200, {
      'Content-Type': 'application/javascript; charset=utf-8'
    });
    return res.end('// Shopify telemetry stub');
  }

  // Inject Global Defense-in-Depth HTTP Security Headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production' || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // Handle OPTIONS for CORS
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-key, x-admin-token'
    });
    return res.end();
  }

  // -------------------------------------------------------------
  // Shield Hidden Files, Root Source Files & Private Data Archives
  // -------------------------------------------------------------
  const normalizedPath = path.normalize(pathname).replace(/\\/g, '/');
  
  // 1. Block dotfiles (.env, .git, .system_generated, etc.) and directory traversal
  if (normalizedPath.startsWith('/.') || normalizedPath.includes('/..')) {
    return sendJson(res, 403, { success: false, message: 'Forbidden: Access to hidden system files is prohibited.' });
  }

  // Never expose server-side modules, migration scripts, dependency trees or
  // database schema files through the static-file fallback.
  const privateStaticPrefixes = ['/lib/', '/scripts/', '/supabase/', '/node_modules/', '/.git/'];
  if (privateStaticPrefixes.some(prefix => normalizedPath.toLowerCase().startsWith(prefix))) {
    return sendJson(res, 404, { success: false, message: 'Not found' });
  }

  // 2. Block direct root server source files (.js, .json, .lock, .md, .yml)
  const isDirectRootFile = normalizedPath.lastIndexOf('/') === 0;
  const blockedRootExtensions = ['.js', '.json', '.lock', '.yml', '.yaml', '.md', '.sh', '.bat', '.ps1'];
  if (isDirectRootFile && blockedRootExtensions.includes(path.extname(normalizedPath).toLowerCase())) {
    if (normalizedPath !== '/cart.js') {
      return sendJson(res, 403, { success: false, message: 'Forbidden: Direct access to server source files is prohibited.' });
    }
  }

  // 3. Block unauthorized direct access to /data/ directory (except public products & collections catalog)
  if (normalizedPath.startsWith('/data/')) {
    if (normalizedPath !== '/data/products.json' && normalizedPath !== '/data/collections.json') {
      if (!security.isAdminAuthorized(req, parsedUrl)) {
        return sendJson(res, 401, { success: false, message: 'Unauthorized: Administrator privileges required to access internal data archives.' });
      }
    }
  }

  // -------------------------------------------------------------
  // SEO Routes: robots.txt & dynamic sitemap.xml
  // -------------------------------------------------------------
  if (pathname === '/robots.txt') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end(`User-agent: *\nDisallow: /admin\nDisallow: /account\nDisallow: /checkout\nDisallow: /data/\nDisallow: /api/\nAllow: /\nAllow: /collections/\nAllow: /products/\nAllow: /pages/\n\nSitemap: https://allyrich.com/sitemap.xml\n`);
  }

  if (pathname === '/sitemap.xml') {
    const sitemapPath = path.join(PUBLIC_DIR, 'sitemap.xml');
    if (fs.existsSync(sitemapPath)) {
      res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' });
      return fs.createReadStream(sitemapPath).pipe(res);
    }
  }

  // -------------------------------------------------------------
  // Keep-Alive & Health Check (Vercel + Supabase Never-Sleep)
  // -------------------------------------------------------------
  if (pathname === '/api/health' || pathname === '/api/ping' || pathname === '/health') {
    const healthLimit = await redis.checkRateLimit(`health:${security.getClientIp(req)}`, 30, 60);
    if (!healthLimit.allowed) return sendJson(res, 429, { success: false, message: 'Too many health checks.' }, { 'Retry-After': String(healthLimit.resetAfterSeconds) });
    let supabaseStatus = 'disconnected';
    if (supabase.isConfigured) {
      try {
        await fetch(`${supabase.SUPABASE_URL}/rest/v1/products?select=id&limit=1`, {
          headers: {
            apikey: supabase.SUPABASE_SERVICE_KEY || supabase.SUPABASE_ANON_KEY,
            Authorization: `Bearer ${supabase.SUPABASE_SERVICE_KEY || supabase.SUPABASE_ANON_KEY}`
          }
        });
        supabaseStatus = 'active';
      } catch (e) {
        supabaseStatus = 'error: ' + e.message;
      }
    }
    return sendJson(res, 200, {
      status: 'ok',
      service: 'SD-garments',
      supabase: supabaseStatus,
      redis: redis.isRedisAvailable() ? 'connected' : 'fallback',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    });
  }

  // -------------------------------------------------------------
  // Admin Portal Page Route
  // -------------------------------------------------------------
  // -------------------------------------------------------------
  // Admin Portal Page Route (/admin, /admin.html, /allyrich-hq)
  // -------------------------------------------------------------
  if (pathname === '/admin' || pathname === '/admin/' || pathname === '/admin.html' ||
      pathname === '/allyrich-hq' || pathname === '/allyrich-hq/' || pathname === '/allyrich-hq.html') {
    const adminPath = path.join(PUBLIC_DIR, 'admin.html');
    if (fs.existsSync(adminPath)) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8'
      });
      return fs.createReadStream(adminPath).pipe(res);
    }
  }

  // -------------------------------------------------------------
  // Data JSON Endpoints (Intercepted to serve live in-memory & Supabase state)
  // -------------------------------------------------------------
  // -------------------------------------------------------------
  if (pathname === '/data/products.json') {
    const products = await getAllProducts();
    return sendJson(res, 200, { products });
  }

  if (pathname === '/data/orders.json') {
    if (!security.isAdminAuthorized(req, parsedUrl)) {
      return sendJson(res, 401, { success: false, message: 'Unauthorized: Administrator authentication required to view raw orders archive.' });
    }
    const ords = await getAllOrders();
    return sendJson(res, 200, ords);
  }

  // -------------------------------------------------------------
  // Delhivery Live Pincode Serviceability Check
  if (pathname === '/api/shipping/pincode-check' && req.method === 'GET') {
    const pincodeLimit = security.checkRateLimit(`pincode:${security.getClientIp(req)}`, 30, 60);
    if (!pincodeLimit.allowed) return sendJson(res, 429, { success: false, message: 'Too many pincode checks.' }, { 'Retry-After': String(pincodeLimit.resetAfterSeconds) });
    const pin = parsedUrl.searchParams?.get('pin') || parsedUrl.searchParams?.get('pincode') || (parsedUrl.query && parsedUrl.query.pin);
    const result = await delhivery.checkPincodeServiceability(pin);
    return sendJson(res, result.serviceable ? 200 : 400, { success: Boolean(result.serviceable), ...result });
  }

  // Storefront & Public REST APIs for Products & Orders
  // -------------------------------------------------------------
  if (pathname === '/api/products' || pathname.startsWith('/api/products/')) {
    const prodId = pathname.replace('/api/products', '').replace(/^\//, '');
    if (req.method === 'GET' && !prodId) {
      return await handleGetProducts(req, res, parsedUrl);
    }
    if (req.method === 'GET' && prodId) {
      return await handleGetSingleProduct(req, res, prodId);
    }
  // Catalog mutation requires admin authorization
    if ((req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE')) {
      if (!security.isAdminAuthorized(req, parsedUrl)) {
        return sendJson(res, 401, { success: false, message: 'Unauthorized: Administrator privileges required to modify catalog products.' });
      }
    }
    if (req.method === 'POST' && !prodId) {
      return await handleCreateProduct(req, res);
    }
    if (req.method === 'PUT' && prodId) {
      return await handleUpdateProduct(req, res, prodId);
    }
    if (req.method === 'DELETE' && prodId) {
      return await handleDeleteProduct(req, res, prodId);
    }
  }

  // Live Public Collections & Seasonal Drops API
  if (pathname === '/api/collections' || pathname.startsWith('/api/collections/')) {
    if (req.method === 'GET') {
      const collLimit = await redis.checkRateLimit(`colls:${security.getClientIp(req)}`, 240, 60);
      if (!collLimit.allowed) return sendJson(res, 429, { success: false, message: 'Too many collection requests.' }, { 'Retry-After': String(collLimit.resetAfterSeconds) });

      const query = parsedUrl.searchParams.get('search')?.toLowerCase();
      if (!query) {
        const cachedColls = await redis.cacheGet('alleyrich:catalog:collections:all');
        if (cachedColls) return sendJson(res, 200, cachedColls);
      }

      const cData = readJsonFile('collections.json', { collections: [] });
      const collections = cData.collections || [];
      let filtered = collections;
      if (query) {
        filtered = filtered.filter(c =>
          (c.title && c.title.toLowerCase().includes(query)) ||
          (c.handle && c.handle.toLowerCase().includes(query))
        );
      }
      const responseData = { success: true, count: filtered.length, collections: filtered };
      if (!query) {
        await redis.cacheSet('alleyrich:catalog:collections:all', responseData, 300);
      }
      return sendJson(res, 200, responseData);
    }
  }

    // Live Public Delhivery Pincode Serviceability API
  if (pathname.startsWith('/api/shipping/pincode') || pathname === '/api/shipping/serviceability') {
    if (req.method === 'GET') {
      const pincodeLimit = await redis.checkRateLimit(`pincode:${security.getClientIp(req)}`, 30, 60);
      if (!pincodeLimit.allowed) return sendJson(res, 429, { success: false, message: 'Too many pincode checks.' }, { 'Retry-After': String(pincodeLimit.resetAfterSeconds) });
      const pinParam = pathname.startsWith('/api/shipping/pincode/') 
        ? pathname.replace('/api/shipping/pincode/', '').trim()
        : (parsedUrl.searchParams.get('pincode') || parsedUrl.searchParams.get('code') || '').trim();
      
      const result = await delhivery.checkPincodeServiceability(pinParam);
      return sendJson(res, result.serviceable ? 200 : 400, {
        success: result.serviceable,
        ...result
      });
    }
  }

  // 1. Live Public Order Tracking API
  if (pathname === '/api/orders/track' || pathname === '/api/track-order') {
    if (req.method === 'GET') {
      return await handleTrackOrder(req, res, parsedUrl);
    }
  }

  // 2. 24/7 AI Help Assistant Chat API
  if (pathname === '/api/ai/chat' || pathname === '/api/chat') {
    if (req.method === 'POST') {
      return await handleAiChat(req, res);
    }
  }

  if (pathname === '/api/orders' || pathname.startsWith('/api/orders/')) {
    if (pathname.includes('/shipping-label') && req.method === 'GET') {
      if (!security.isAdminAuthorized(req, parsedUrl)) {
        return sendJson(res, 401, { success: false, message: 'Administrator authentication required.' });
      }
      const id = pathname.replace('/api/orders/', '').replace(/\/shipping-label\/?$/, '');
      return await handleShippingLabel(req, res, id);
    }
    const orderId = pathname.replace('/api/orders', '').replace(/^\//, '');
    if (req.method === 'GET' && !orderId) {
      return await handleGetOrders(req, res, parsedUrl);
    }
    if (req.method === 'GET' && orderId) {
      return await handleGetSingleOrder(req, res, orderId);
    }
    if (req.method === 'POST' && !orderId) {
      return await handleCreateOrder(req, res, false);
    }
    // Order mutation/deletion requires admin authorization
    if (req.method === 'PUT' || req.method === 'DELETE') {
      if (!security.isAdminAuthorized(req, parsedUrl)) {
        return sendJson(res, 401, { success: false, message: 'Unauthorized: Administrator privileges required to modify or delete orders.' });
      }
    }
    if (req.method === 'PUT' && orderId) {
      return await handleUpdateOrder(req, res, orderId);
    }
    if (req.method === 'DELETE' && orderId) {
      return await handleDeleteOrder(req, res, orderId);
    }
  }

  // -------------------------------------------------------------
  // REST API Endpoints for Admin Management Portal
  // -------------------------------------------------------------
  // -------------------------------------------------------------
  // Public Admin 2FA Authentication Endpoints (Pre-auth barrier)
  // -------------------------------------------------------------
  if (pathname === '/api/admin/login' && req.method === 'POST') {
    const clientIp = security.getClientIp(req);
    // Rate limit: max 5 failed attempts per 15 minutes by IP
    const rateCheck = await redis.checkRateLimit(`admin_login:${clientIp}`, 5, 15 * 60);
    if (!rateCheck.allowed) {
      return sendJson(res, 429, {
        success: false,
        message: `Security Lockout: Too many failed attempts. Try again in ${rateCheck.resetAfterSeconds} seconds.`
      }, { 'Retry-After': String(rateCheck.resetAfterSeconds) });
    }

    const payload = await parseBody(req);
    const username = (payload.username || '').trim();
    const password = (payload.password || '').trim();
    const totpCode = (payload.totpCode || '').trim();

    const expectedUser = process.env.ADMIN_USERNAME;
    const expectedPass = process.env.ADMIN_PASSWORD;
    const totpSecret = process.env.ADMIN_2FA_SECRET;

    if (!expectedUser || !expectedPass || !totpSecret || !process.env.ADMIN_SECRET_KEY) {
      return sendJson(res, 503, { success: false, message: 'Administrative authentication is not configured.' });
    }

    if (!constantTimeStringEquals(username, expectedUser) || !constantTimeStringEquals(password, expectedPass)) {
      return sendJson(res, 401, {
        success: false,
        message: 'Invalid administrative username or master password.'
      });
    }

    if (!totpCode) {
      return sendJson(res, 200, {
        success: false,
        require2fa: true,
        message: 'Credentials accepted. Enter your 6-digit authenticator code.'
      });
    }

    const isValidTotp = totp.verifyTotp(totpSecret, totpCode);
    if (!isValidTotp) {
      return sendJson(res, 400, {
        success: false,
        require2fa: true,
        message: 'Invalid or expired 6-digit code. Please check your Google Authenticator app.'
      });
    }

    // Both password and 2FA verified! Create 12-hour session
    const session = security.createAdminSession(username);
    await redis.setAdminSession(session.token, { username, createdAt: Date.now() }, 43200);
    return sendJson(res, 200, {
      success: true,
      token: session.token,
      expiresAt: session.expiresAt,
      message: 'Admin authorization successful. Vault unlocked.'
    });
  }

  if (pathname === '/api/admin/logout' && req.method === 'POST') {
    const token = req.headers['x-admin-token'] || req.headers['x-admin-key'] || '';
    security.revokeAdminSession(token);
    await redis.delAdminSession(token);
    return sendJson(res, 200, { success: true, message: 'Logged out successfully.' });
  }

  // General Admin API Router
  if (pathname.startsWith('/api/admin/')) {
    // 1. Enforce strict Admin Authorization across all /api/admin/* endpoints
    if (!security.isAdminAuthorized(req, parsedUrl)) {
      return sendJson(res, 401, {
        success: false,
        message: 'Unauthorized: Administrator authentication required. Please pass valid x-admin-key header.'
      });
    }

    // 2. Enforce Admin API Rate Limit (120 req/min)
    const adminIp = security.getClientIp(req);
    const adminLimit = await redis.checkRateLimit(`admin_api:${adminIp}`, 120, 60);
    if (!adminLimit.allowed) {
      return sendJson(res, 429, {
        success: false,
        message: 'Too many administrative requests. Please slow down.'
      }, { 'Retry-After': String(adminLimit.resetAfterSeconds) });
    }

    const apiRoute = pathname.replace('/api/admin/', '');

    // 1. Executive Dashboard Stats
    if (apiRoute === 'stats' && req.method === 'GET') {
      const products = await getAllProducts();
      const cData = readJsonFile('collections.json', { collections: [] });
      const orders = await getAllOrders();
      const discounts = readJsonFile('discounts.json', []);
      const customers = readJsonFile('customers.json', []);
      const reviews = readJsonFile('reviews.json', []);

      const collections = cData.collections || [];

      const totalRevenue = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
      const deliveredCount = orders.filter(o => o.orderStatus === 'Delivered').length;
      const processingCount = orders.filter(o => o.orderStatus === 'Processing' || o.orderStatus === 'Pending').length;

      const categoryCounts = {};
      products.forEach(p => {
        const cat = p.category || p.product_type || 'Streetwear';
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
      });

      return sendJson(res, 200, {
        success: true,
        stats: {
          totalProducts: products.length,
          totalCollections: collections.length,
          totalOrders: orders.length,
          totalCustomers: customers.length,
          totalReviews: reviews.length,
          deliveredOrders: deliveredCount,
          processingOrders: processingCount,
          totalRevenue: Math.round(totalRevenue),
          averageOrderValue: orders.length ? Math.round(totalRevenue / orders.length) : 0,
          activeDiscounts: discounts.filter(d => d.isActive).length,
          categoryBreakdown: categoryCounts
        },
        recentOrders: orders.slice(0, 5)
      });
    }

    // 2. Products CRUD
    if (apiRoute.startsWith('products')) {
      const prodId = apiRoute.replace('products', '').replace(/^\//, '');
      if (req.method === 'GET' && !prodId) {
        return await handleGetProducts(req, res, parsedUrl);
      }
      if (req.method === 'GET' && prodId) {
        return await handleGetSingleProduct(req, res, prodId);
      }
      if (req.method === 'POST' && !prodId) {
        return await handleCreateProduct(req, res);
      }
      if (req.method === 'PUT' && prodId) {
        return await handleUpdateProduct(req, res, prodId);
      }
      if (req.method === 'DELETE' && prodId) {
        return await handleDeleteProduct(req, res, prodId);
      }
    }

    // 3. Collections API (Full CRUD)
    if (apiRoute.startsWith('collections')) {
      let cData = readJsonFile('collections.json', { collections: [] });
      let collections = cData.collections || [];

      // GET /api/admin/collections
      if (req.method === 'GET' && apiRoute === 'collections') {
        const query = parsedUrl.searchParams.get('search')?.toLowerCase();
        let filtered = collections;
        if (query) {
          filtered = filtered.filter(c =>
            c.title.toLowerCase().includes(query) ||
            c.handle.toLowerCase().includes(query)
          );
        }
        return sendJson(res, 200, { success: true, count: filtered.length, collections: filtered });
      }

      // POST /api/admin/collections (Create Collection)
      if (req.method === 'POST' && apiRoute === 'collections') {
        const payload = await parseBody(req);
        const newCollection = {
          id: Date.now(),
          title: payload.title || 'New Streetwear Drop',
          handle: payload.handle || (payload.title ? payload.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') : `drop-${Date.now()}`),
          description: payload.description || '',
          published_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          image: payload.image ? { src: payload.image } : { src: '/images/photo_1.webp' },
          products_count: Number(payload.products_count) || 0
        };
        collections.unshift(newCollection);
        writeJsonFile('collections.json', { collections });
        await redis.cacheDel('alleyrich:catalog:collections:*');
        return sendJson(res, 201, { success: true, collection: newCollection });
      }

      // PUT /api/admin/collections/:id (Update Collection)
      if (req.method === 'PUT') {
        const id = apiRoute.replace('collections/', '');
        const payload = await parseBody(req);
        const col = collections.find(c => String(c.id) === String(id) || c.handle === id);
        if (!col) return sendJson(res, 404, { success: false, message: 'Collection not found' });

        if (payload.title) col.title = payload.title;
        if (payload.handle) col.handle = payload.handle;
        if (payload.description !== undefined) col.description = payload.description;
        if (payload.image) col.image = { src: payload.image };
        if (payload.products_count !== undefined) col.products_count = Number(payload.products_count);
        col.updated_at = new Date().toISOString();

        writeJsonFile('collections.json', { collections });
        await redis.cacheDel('alleyrich:catalog:collections:*');
        return sendJson(res, 200, { success: true, collection: col });
      }

      // DELETE /api/admin/collections/:id (Delete Collection)
      if (req.method === 'DELETE') {
        const id = apiRoute.replace('collections/', '');
        const filtered = collections.filter(c => String(c.id) !== String(id) && c.handle !== id);
        if (filtered.length === collections.length) {
          return sendJson(res, 404, { success: false, message: 'Collection not found' });
        }
        writeJsonFile('collections.json', { collections: filtered });
        await redis.cacheDel('alleyrich:catalog:collections:*');
        return sendJson(res, 200, { success: true, message: 'Collection deleted' });
      }
    }

    // 4. Orders CRUD
    if (apiRoute.startsWith('orders')) {
      // Delhivery AWB
      if (req.method === 'POST' && apiRoute.includes('/delhivery-awb')) {
        const id = apiRoute.replace('orders/', '').replace('/delhivery-awb', '');
        return await handleDelhiveryAwb(req, res, id);
      }
      // Delhivery Shipping Label PDF (Internal Authenticated Proxy)
      if (req.method === 'GET' && apiRoute.includes('/shipping-label')) {
        const id = apiRoute.replace('orders/', '').replace(/\/shipping-label\/?$/, '');
        return await handleShippingLabel(req, res, id);
      }
      // Delhivery Courier Cancellation (1-Click in Admin)
      if (req.method === 'POST' && apiRoute.includes('/delhivery-cancel')) {
        const id = apiRoute.replace('orders/', '').replace(/\/delhivery-cancel\/?$/, '');
        return await handleDelhiveryCancel(req, res, id);
      }
      // Cashfree verify
      if (req.method === 'POST' && apiRoute.includes('/cashfree-verify')) {
        const id = apiRoute.replace('orders/', '').replace('/cashfree-verify', '');
        return await handleCashfreeVerify(req, res, id);
      }

      const orderId = apiRoute.replace('orders', '').replace(/^\//, '');
      if (req.method === 'GET' && !orderId) {
        return await handleGetOrders(req, res, parsedUrl);
      }
      if (req.method === 'GET' && orderId) {
        return await handleGetSingleOrder(req, res, orderId);
      }
      if (req.method === 'POST' && !orderId) {
        return await handleCreateOrder(req, res, false);
      }
      if (req.method === 'PUT' && orderId) {
        return await handleUpdateOrder(req, res, orderId);
      }
      if (req.method === 'DELETE' && orderId) {
        return await handleDeleteOrder(req, res, orderId);
      }
    }

    // 5. Discounts CRUD
    if (apiRoute.startsWith('discounts')) {
      let discounts = readJsonFile('discounts.json', []);

      if (req.method === 'GET' && apiRoute === 'discounts') {
        return sendJson(res, 200, { success: true, discounts });
      }

      if (req.method === 'POST' && apiRoute === 'discounts') {
        const payload = await parseBody(req);
        const newDiscount = {
          id: `dsc_${Date.now()}`,
          code: (payload.code || 'SALE10').toUpperCase(),
          type: payload.type || 'percentage',
          value: Number(payload.value) || 10,
          minOrderValue: Number(payload.minOrderValue) || 999,
          maxDiscount: Number(payload.maxDiscount) || 500,
          usageCount: 0,
          usageLimit: payload.usageLimit ? Number(payload.usageLimit) : null,
          isActive: payload.isActive !== false,
          description: payload.description || 'Special promo discount',
          createdAt: new Date().toISOString()
        };
        discounts.unshift(newDiscount);
        writeJsonFile('discounts.json', discounts);
        return sendJson(res, 201, { success: true, discount: newDiscount });
      }

      if (req.method === 'PUT') {
        const id = apiRoute.replace('discounts/', '');
        const payload = await parseBody(req);
        const discount = discounts.find(d => String(d.id) === String(id));
        if (!discount) return sendJson(res, 404, { success: false, message: 'Discount not found' });

        if (payload.isActive !== undefined) discount.isActive = Boolean(payload.isActive);
        if (payload.value !== undefined) discount.value = Number(payload.value);
        if (payload.code) discount.code = payload.code.toUpperCase();
        writeJsonFile('discounts.json', discounts);
        return sendJson(res, 200, { success: true, discount });
      }

      if (req.method === 'DELETE') {
        const id = apiRoute.replace('discounts/', '');
        const filtered = discounts.filter(d => String(d.id) !== String(id));
        writeJsonFile('discounts.json', filtered);
        return sendJson(res, 200, { success: true, message: 'Discount deleted' });
      }
    }

    // 6. Settings
    if (apiRoute === 'settings') {
      let settings = readJsonFile('settings.json', {});

      if (req.method === 'GET') {
        return sendJson(res, 200, { success: true, settings });
      }

      if (req.method === 'POST') {
        const payload = await parseBody(req);
        settings = { ...settings, ...payload };
        writeJsonFile('settings.json', settings);
        return sendJson(res, 200, { success: true, settings });
      }
    }

    // 7. Customers API
    if (apiRoute.startsWith('customers')) {
      let customers = readJsonFile('customers.json', []);

      if (req.method === 'GET' && apiRoute === 'customers') {
        const query = parsedUrl.searchParams.get('search')?.toLowerCase();
        let filtered = customers;
        if (query) {
          filtered = filtered.filter(c =>
            c.name.toLowerCase().includes(query) ||
            c.email.toLowerCase().includes(query) ||
            c.phone.toLowerCase().includes(query) ||
            c.city.toLowerCase().includes(query)
          );
        }
        return sendJson(res, 200, { success: true, count: filtered.length, customers: filtered });
      }

      if (req.method === 'POST' && apiRoute === 'customers') {
        const payload = await parseBody(req);
        const newCustomer = {
          id: `CUST-${Date.now().toString().slice(-4)}`,
          name: payload.name || 'New Customer',
          email: payload.email || 'customer@example.com',
          phone: payload.phone || '+91 99999 99999',
          city: payload.city || 'Mumbai',
          state: payload.state || 'Maharashtra',
          ordersCount: Number(payload.ordersCount) || 1,
          totalSpent: Number(payload.totalSpent) || 1599,
          lastOrderDate: new Date().toISOString(),
          tags: Array.isArray(payload.tags) ? payload.tags : (payload.tags ? payload.tags.split(',').map(s => s.trim()) : ['Verified']),
          status: payload.status || 'Active'
        };
        customers.unshift(newCustomer);
        writeJsonFile('customers.json', customers);
        return sendJson(res, 201, { success: true, customer: newCustomer });
      }

      if (req.method === 'PUT') {
        const id = apiRoute.replace('customers/', '');
        const payload = await parseBody(req);
        const customer = customers.find(c => String(c.id) === String(id));
        if (!customer) return sendJson(res, 404, { success: false, message: 'Customer not found' });

        if (payload.name) customer.name = payload.name;
        if (payload.email) customer.email = payload.email;
        if (payload.phone) customer.phone = payload.phone;
        if (payload.city) customer.city = payload.city;
        if (payload.state) customer.state = payload.state;
        if (payload.status) customer.status = payload.status;
        if (payload.tags) customer.tags = Array.isArray(payload.tags) ? payload.tags : payload.tags.split(',').map(s => s.trim());
        if (payload.wishlist !== undefined) customer.wishlist = payload.wishlist;
        if (payload.address !== undefined) customer.address = payload.address;
        if (payload.pincode !== undefined) customer.pincode = payload.pincode;

        writeJsonFile('customers.json', customers);
        return sendJson(res, 200, { success: true, customer });
      }

      if (req.method === 'DELETE') {
        const id = apiRoute.replace('customers/', '');
        const filtered = customers.filter(c => String(c.id) !== String(id));
        writeJsonFile('customers.json', filtered);
        return sendJson(res, 200, { success: true, message: 'Customer deleted' });
      }
    }

    // 8. Reviews API
    if (apiRoute.startsWith('reviews')) {
      let reviews = readJsonFile('reviews.json', []);

      if (req.method === 'GET' && apiRoute === 'reviews') {
        const status = parsedUrl.searchParams.get('status');
        let filtered = reviews;
        if (status && status !== 'all') {
          filtered = filtered.filter(r => r.status.toLowerCase() === status.toLowerCase());
        }
        return sendJson(res, 200, { success: true, count: filtered.length, reviews: filtered });
      }

      if (req.method === 'POST' && apiRoute === 'reviews') {
        const payload = await parseBody(req);
        const newReview = {
          id: `REV-${Date.now().toString().slice(-4)}`,
          productId: payload.productId || 9581723877614,
          productTitle: payload.productTitle || 'Zaraki Corduroy Full Sleeves',
          customerName: payload.customerName || 'Verified Buyer',
          rating: Number(payload.rating) || 5,
          title: payload.title || 'Incredible Quality',
          comment: payload.comment || 'Super comfortable and great fit.',
          verified: payload.verified !== false,
          status: payload.status || 'Approved',
          date: new Date().toISOString()
        };
        reviews.unshift(newReview);
        writeJsonFile('reviews.json', reviews);
        return sendJson(res, 201, { success: true, review: newReview });
      }

      if (req.method === 'PUT') {
        const id = apiRoute.replace('reviews/', '');
        const payload = await parseBody(req);
        const review = reviews.find(r => String(r.id) === String(id));
        if (!review) return sendJson(res, 404, { success: false, message: 'Review not found' });

        if (payload.status) review.status = payload.status;
        if (payload.rating !== undefined) review.rating = Number(payload.rating);
        if (payload.comment) review.comment = payload.comment;

        writeJsonFile('reviews.json', reviews);
        return sendJson(res, 200, { success: true, review });
      }

      if (req.method === 'DELETE') {
        const id = apiRoute.replace('reviews/', '');
        const filtered = reviews.filter(r => String(r.id) !== String(id));
        writeJsonFile('reviews.json', filtered);
        return sendJson(res, 200, { success: true, message: 'Review deleted' });
      }
    }

    // 9. Media & Upload API
    if (apiRoute === 'upload' && req.method === 'POST') {
      const payload = await parseBody(req);
      if (!payload.data) {
        return sendJson(res, 400, { success: false, message: 'No image data provided' });
      }

      let buffer;
      let extension = '.png';
      const matches = String(payload.data).match(/^data:([A-Za-z0-9-+\/]+);base64,(.+)$/);

      if (matches) {
        const mime = matches[1].toLowerCase();
        const allowedImageMimes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
        if (!allowedImageMimes.has(mime)) {
          return sendJson(res, 400, { success: false, message: 'Only PNG, JPEG, WebP and GIF images are allowed.' });
        }
        if (mime.includes('jpeg') || mime.includes('jpg')) extension = '.jpg';
        else if (mime.includes('webp')) extension = '.webp';
        else if (mime.includes('gif')) extension = '.gif';
        buffer = Buffer.from(matches[2], 'base64');
      } else {
        return sendJson(res, 400, { success: false, message: 'Image data must be a valid data URL.' });
      }
      if (!buffer.length || buffer.length > 5 * 1024 * 1024) {
        return sendJson(res, 413, { success: false, message: 'Image must be between 1 byte and 5MB.' });
      }

      const rawName = (payload.filename || 'photo').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
      const filename = `alleyrich_${Date.now()}_${rawName}${extension}`;
      const uploadDir = path.join(PUBLIC_DIR, 'assets', 'uploads');
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

      const savePath = path.join(uploadDir, filename);
      fs.writeFileSync(savePath, buffer);

      const fileUrl = `/assets/uploads/${filename}`;
      let cdnUrl = null;

      // If Supabase Storage is configured and it is an image, upload to product-images bucket
      if (supabase.isConfigured && !extension.includes('mp4')) {
        try {
          const mimeType = extension === '.webp' ? 'image/webp' : (extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : (extension === '.gif' ? 'image/gif' : 'image/png'));
          const supaRes = await supabase.storage.uploadImage(buffer, filename, mimeType);
          if (supaRes.success && supaRes.publicUrl) {
            cdnUrl = supaRes.publicUrl;
          }
        } catch (supaErr) {
          console.warn('Supabase storage upload background warning:', supaErr.message);
        }
      }

      return sendJson(res, 200, {
        success: true,
        url: cdnUrl || fileUrl,
        localUrl: fileUrl,
        cdnUrl,
        filename,
        size: buffer.length
      });
    }

    // 10. Video Streaming Management API
    if (apiRoute === 'videos' && req.method === 'GET') {
      const videoDir = path.join(PUBLIC_DIR, 'assets', 'videos');
      const list = SECTION_VIDEOS.map(v => {
        const filePath = path.join(videoDir, v.name);
        let exists = false;
        let size = 0;
        let mtime = null;
        if (fs.existsSync(filePath)) {
          exists = true;
          const stat = fs.statSync(filePath);
          size = stat.size;
          mtime = stat.mtime;
        }
        return {
          name: v.name,
          title: v.title,
          section: v.section,
          res: v.res,
          path: `/assets/videos/${v.name}`,
          sizeBytes: size,
          sizeFormatted: (size / (1024 * 1024)).toFixed(2) + ' MB',
          lastModified: mtime,
          exists,
          status: exists ? 'HTTP 206 Ready' : 'File Missing'
        };
      });
      return sendJson(res, 200, { success: true, count: list.length, videos: list });
    }

    if ((apiRoute === 'videos/update' || apiRoute === 'videos/upload') && req.method === 'POST') {
      const payload = await parseBody(req);
      const rawName = payload.videoName || payload.filename;
      if (!rawName) {
        return sendJson(res, 400, { success: false, message: 'No target videoName provided' });
      }

      const cleanName = path.basename(rawName).replace(/[^a-zA-Z0-9_\.-]/g, '_');
      if (!/\.(mp4|webm)$/i.test(cleanName)) {
        return sendJson(res, 400, { success: false, message: 'Only MP4 and WebM video files are allowed.' });
      }
      const videoDir = path.join(PUBLIC_DIR, 'assets', 'videos');
      if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir, { recursive: true });

      const destPath = path.join(videoDir, cleanName);

      if (payload.data) {
        // Base64 data provided
        let buffer;
        const matches = String(payload.data).match(/^data:[^;]+;base64,(.+)$/);
        if (matches) {
          buffer = Buffer.from(matches[1], 'base64');
        } else {
          buffer = Buffer.from(payload.data, 'base64');
        }
        fs.writeFileSync(destPath, buffer);
      } else if (payload.url) {
        const rawUrl = String(payload.url).trim();
        if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
          if (!security.isSafeRemoteUrl(rawUrl)) {
            return sendJson(res, 400, {
              success: false,
              message: 'Invalid or restricted video URL. Private addresses and cloud metadata services are prohibited.'
            });
          }
          try {
            await downloadFile(rawUrl, destPath);
          } catch (dlErr) {
            return sendJson(res, 500, { success: false, message: 'Failed to download video from URL: ' + dlErr.message });
          }
          } else {
            // Local path like /assets/uploads/...
            const relPath = rawUrl.replace(/^\//, '');
            const localSrc = path.resolve(PUBLIC_DIR, `.${rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`}`);
            if (!localSrc.startsWith(path.resolve(PUBLIC_DIR) + path.sep)) {
              return sendJson(res, 400, { success: false, message: 'Local source path is not allowed.' });
            }
          if (fs.existsSync(localSrc) && fs.statSync(localSrc).isFile()) {
            fs.copyFileSync(localSrc, destPath);
          } else {
            return sendJson(res, 404, { success: false, message: 'Local source video not found: ' + rawUrl });
          }
        }
      } else {
        return sendJson(res, 400, { success: false, message: 'Neither video data (base64) nor video URL was provided' });
      }

      const stat = fs.statSync(destPath);
      return sendJson(res, 200, {
        success: true,
        message: `Video ${cleanName} successfully updated and replaced!`,
        video: {
          name: cleanName,
          path: `/assets/videos/${cleanName}`,
          streamUrl: `/assets/videos/${cleanName}?t=${Date.now()}`,
          sizeBytes: stat.size,
          sizeFormatted: (stat.size / (1024 * 1024)).toFixed(2) + ' MB',
          lastModified: stat.mtime
        }
      });
    }

    // 11. Admin Subscribers API
    if (apiRoute.startsWith('subscribers')) {
      // POST /api/admin/subscribers/broadcast
      if ((apiRoute === 'subscribers/broadcast' || apiRoute === 'subscribers/campaign') && req.method === 'POST') {
        const payload = await parseBody(req);
        const subject = (payload.subject || '').trim();
        const headline = (payload.headline || '').trim();
        const message = (payload.message || '').trim();
        const safeHeadline = escapeHtml(headline);
        const safeMessage = escapeHtml(message).replace(/\r?\n/g, '<br>');

        if (!subject || !message) {
          return sendJson(res, 400, { success: false, message: 'Subject and message are required for broadcast' });
        }

        const subs = await getUnifiedSubscribers();
        const uniqueEmails = Array.from(new Set(
          subs.map(s => (s.email || '').toLowerCase().trim()).filter(e => e && e.includes('@'))
        ));

        const hasEmailEngine = Boolean(process.env.BREVO_API_KEY || process.env.RESEND_API_KEY);
        let sentCount = 0;

        for (const email of uniqueEmails) {
          if (hasEmailEngine) {
            const delivered = await sendTransactionalEmail({
              to: email,
              subject: subject,
              htmlContent: `
                <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif; max-width:580px; margin:0 auto; padding:32px 24px; background:#0d0d0d; color:#ffffff; border:1px solid #222222; border-radius:6px;">
                  <div style="text-align:center; padding-bottom:24px; border-bottom:1px solid #1f1f1f;">
                    <h1 style="font-size:24px; font-weight:900; letter-spacing:0.25em; text-transform:uppercase; margin:0; color:#ffffff;">ALLEYRICH</h1>
                    <p style="font-size:11px; letter-spacing:0.12em; color:#888888; margin:6px 0 0; text-transform:uppercase;">Architectural Streetwear &bull; Homegrown in India</p>
                  </div>
                  <div style="padding:28px 0;">
                    ${headline ? `<h2 style="font-size:18px; font-weight:800; color:#ffffff; letter-spacing:0.08em; text-transform:uppercase; margin:0 0 16px;">${safeHeadline}</h2>` : ''}
                    <div style="font-size:14px; line-height:1.7; color:#cccccc; margin-bottom:28px;">
                      ${safeMessage}
                    </div>
                    <div style="text-align:center; margin:30px 0;">
                      <a href="https://alleyrich.com/collections.html" style="display:inline-block; background:#ffffff; color:#000000; text-decoration:none; padding:14px 28px; font-weight:800; font-size:12px; letter-spacing:0.1em; text-transform:uppercase; border-radius:2px;">EXPLORE COLLECTION</a>
                    </div>
                  </div>
                  <div style="border-top:1px solid #1f1f1f; padding-top:20px; font-size:11px; color:#666666; text-align:center; line-height:1.6;">
                    You are receiving this communication as an exclusive member of the ALLEYRICH Inner Circle.<br>
                    &copy; ${new Date().getFullYear()} ALLEYRICH. All rights reserved.
                  </div>
                </div>
              `,
              tags: ['broadcast']
            });
            if (delivered) sentCount++;
          } else {
            sentCount++;
          }
        }

        console.log(`✅ [BROADCAST CAMPAIGN] Dispatched to ${sentCount}/${uniqueEmails.length} subscribers.`);
        return sendJson(res, 200, {
          success: true,
          count: sentCount,
          total: uniqueEmails.length,
          message: `Successfully broadcasted to ${sentCount} subscriber${sentCount === 1 ? '' : 's'}.`
        });
      }

      if (req.method === 'GET') {
        const subscribers = await getUnifiedSubscribers();
        return sendJson(res, 200, { success: true, count: subscribers.length, subscribers });
      }

      if (req.method === 'DELETE') {
        const subId = apiRoute.replace('subscribers/', '').replace('subscribers', '').trim();
        if (supabase.isConfigured && supabase.subscribers) {
          try {
            await supabase.subscribers.delete(subId);
          } catch (e) {}
        }
        let subscribers = readJsonFile('subscribers.json', []);
        subscribers = subscribers.filter(s => String(s.id) !== String(subId) && s.email !== subId);
        writeJsonFile('subscribers.json', subscribers);
        return sendJson(res, 200, { success: true, message: 'Subscriber removed' });
      }
    }

    // 12. Admin Omnichannel Marketing & WhatsApp APIs
    if (apiRoute.startsWith('marketing')) {
      // GET /api/admin/marketing/recipients
      if (apiRoute === 'marketing/recipients' && req.method === 'GET') {
        const subs = await getUnifiedSubscribers();
        const customers = readJsonFile('customers.json', []);
        const orders = await getAllOrders();
        const aggregated = whatsapp.aggregateMarketingRecipients(subs, customers, orders);
        return sendJson(res, 200, {
          success: true,
          totalEmails: aggregated.totalEmails,
          totalPhones: aggregated.totalPhones,
          emails: aggregated.emails,
          phoneContacts: aggregated.phoneContacts
        });
      }

      // POST /api/admin/marketing/broadcast
      if (apiRoute === 'marketing/broadcast' && req.method === 'POST') {
        const payload = await parseBody(req);
        const channel = payload.channel || 'all'; // 'all', 'email', 'whatsapp'
        const subject = (payload.subject || '').trim();
        const headline = (payload.headline || '').trim();
        const message = (payload.message || '').trim();
        const code = (payload.code || '').trim();
        const link = (payload.link || '').trim();
        const safeHeadline = escapeHtml(headline);
        const safeMessage = escapeHtml(message).replace(/\r?\n/g, '<br>');
        const safeCode = escapeHtml(code.toUpperCase());
        const safeLink = escapeHtml(safeHttpUrl(link));

        if (!message && !subject) {
          return sendJson(res, 400, { success: false, message: 'Message content is required for campaign broadcast' });
        }

        const subs = await getUnifiedSubscribers();
        const customers = readJsonFile('customers.json', []);
        const orders = await getAllOrders();
        const aggregated = whatsapp.aggregateMarketingRecipients(subs, customers, orders);

        let emailSentCount = 0;
        let whatsappSentCount = 0;
        const waDispatchQueue = [];

        // 1. Dispatch Emails if channel is 'all' or 'email'
        if (channel === 'all' || channel === 'email') {
          const hasEmailEngine = Boolean(process.env.BREVO_API_KEY || process.env.RESEND_API_KEY);
          const emailSubject = subject || headline || 'New Streetwear Drop: ALLEYRICH Exclusive Access';

          for (const email of aggregated.emails) {
            if (hasEmailEngine) {
              const delivered = await sendTransactionalEmail({
                to: email,
                subject: emailSubject,
                htmlContent: `
                  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif; max-width:580px; margin:0 auto; padding:32px 24px; background:#0d0d0d; color:#ffffff; border:1px solid #222222; border-radius:6px;">
                    <div style="text-align:center; padding-bottom:24px; border-bottom:1px solid #1f1f1f;">
                      <h1 style="font-size:24px; font-weight:900; letter-spacing:0.25em; text-transform:uppercase; margin:0; color:#ffffff;">ALLEYRICH</h1>
                      <p style="font-size:11px; letter-spacing:0.12em; color:#888888; margin:6px 0 0; text-transform:uppercase;">Architectural Streetwear &bull; Homegrown in India</p>
                    </div>
                    <div style="padding:28px 0;">
                      ${headline ? `<h2 style="font-size:18px; font-weight:800; color:#ffffff; letter-spacing:0.08em; text-transform:uppercase; margin:0 0 16px;">${safeHeadline}</h2>` : ''}
                      <div style="font-size:14px; line-height:1.7; color:#cccccc; margin-bottom:28px;">
                      ${safeMessage}
                      </div>
                      ${code ? `<div style="background:#1a1a1a;border:1px dashed #444;padding:12px;text-align:center;font-weight:800;letter-spacing:0.1em;margin-bottom:24px;color:#fff;">USE CODE: ${safeCode}</div>` : ''}
                      <div style="text-align:center; margin:30px 0;">
                        <a href="${safeLink}" style="display:inline-block; background:#ffffff; color:#000000; text-decoration:none; padding:14px 28px; font-weight:800; font-size:12px; letter-spacing:0.1em; text-transform:uppercase; border-radius:2px;">EXPLORE COLLECTION</a>
                      </div>
                    </div>
                    <div style="border-top:1px solid #1f1f1f; padding-top:20px; font-size:11px; color:#666666; text-align:center; line-height:1.6;">
                      You are receiving this communication as an exclusive member of the ALLEYRICH Inner Circle.<br>
                      &copy; ${new Date().getFullYear()} ALLEYRICH. All rights reserved.
                    </div>
                  </div>
                `,
                tags: ['marketing-drop']
              });
              if (delivered) emailSentCount++;
            } else {
              emailSentCount++;
            }
          }
        }
        // 2. Dispatch WhatsApp if channel is 'all' or 'whatsapp'
        if (channel === 'all' || channel === 'whatsapp') {
          const promoText = whatsapp.buildWhatsAppPromoMessage({
            headline: headline || subject,
            subject: subject || headline,
            message: message,
            code: code,
            link: link || 'https://alleyrich.com/collections.html',
            brandName: 'ALLEYRICH'
          });

          for (const contact of aggregated.phoneContacts) {
            const dispatchRes = await whatsapp.dispatchWhatsAppMessage(contact.phone, promoText);
            if (dispatchRes.success) {
              whatsappSentCount++;
              waDispatchQueue.push({
                phone: contact.phone,
                rawPhone: contact.rawPhone,
                name: contact.name,
                source: contact.source,
                mode: dispatchRes.mode,
                waLink: dispatchRes.waLink
              });
            }
          }
        }

        console.log(`📢 [OMNICHANNEL BROADCAST] Dispatched Channel: ${channel} (Emails: ${emailSentCount}/${aggregated.totalEmails}, WhatsApp: ${whatsappSentCount}/${aggregated.totalPhones})`);

        return sendJson(res, 200, {
          success: true,
          channel,
          emailSentCount,
          totalEmails: aggregated.totalEmails,
          whatsappSentCount,
          totalPhones: aggregated.totalPhones,
          waDispatchQueue: waDispatchQueue.slice(0, 50),
          message: `Campaign broadcast completed! Dispatched ${emailSentCount} emails and reached ${whatsappSentCount} WhatsApp contacts.`
        });
      }
    }

    return sendJson(res, 404, { success: false, message: 'API route not found' });
  }

  // -------------------------------------------------------------
  // Storefront Customer Auth & Profile APIs (Supabase + Local Dual Engine)
  // -------------------------------------------------------------
  if (pathname.startsWith('/api/auth/')) {
    const authRoute = pathname.replace('/api/auth/', '');
    let customers = readJsonFile('customers.json', []);

    // POST /api/auth/signup
    if (authRoute === 'signup' && req.method === 'POST') {
      const signupLimit = await redis.checkRateLimit(`signup:${security.getClientIp(req)}`, 5, 3600);
      if (!signupLimit.allowed) return sendJson(res, 429, { success: false, message: 'Too many registration attempts. Please try again later.' }, { 'Retry-After': String(signupLimit.resetAfterSeconds) });
      const payload = await parseBody(req);
      const email = (payload.email || '').toLowerCase().trim();
      const password = String(payload.password || '');
      const name = payload.name || 'Storefront Member';
      const phone = payload.phone || '+91 99999 00000';

      if (!email) {
        return sendJson(res, 400, { success: false, message: 'Email is required' });
      }
      if (!isValidEmail(email) || password.length < 8 || password.length > 128) {
        return sendJson(res, 400, { success: false, message: 'A valid email and password of 8-128 characters are required.' });
      }
      const passwordHash = await security.hashPassword(password);

      // Check whether email exists in local customers.json OR in Supabase
      const existing = customers.find(c => (c.email || '').toLowerCase() === email);
      let rdsUser = null;
      if (db && db.isConfigured) {
        try { rdsUser = await db.customers.getByEmail(email); } catch (e) {}
      }
      let cloudUser = null;
      if (supabase.isConfigured) {
        try {
          cloudUser = await supabase.profiles.getByEmail(email);
        } catch (e) {}
      }

      if (existing || rdsUser || cloudUser) {
        return sendJson(res, 400, {
          success: false,
          error: 'An account with this email address already exists. Please sign in with your password or Instant OTP.',
          message: 'An account with this email address already exists. Please sign in with your password or Instant OTP.'
        });
      }

      let userId = `CUST-${Math.floor(1000 + Math.random() * 9000)}`;
      let authToken = security.createCustomerSession(userId, email);
      let supabaseProfile = null;

      // 1. Supabase Auth Registration
      if (supabase.isConfigured) {
        try {
          const supaRes = await supabase.auth.signUp({
            email,
            password,
            full_name: name,
            phone
          });

          if (!supaRes.success && supaRes.message && supaRes.message.toLowerCase().includes('already')) {
            return sendJson(res, 400, { success: false, message: 'An account with this email address already exists. Please sign in with your password or Instant OTP.' });
          }

          if (supaRes.success && supaRes.user) {
            userId = supaRes.user.id;
            authToken = supaRes.token && !String(supaRes.token).startsWith('tok_')
              ? supaRes.token
              : security.createCustomerSession(userId, email);
            supabaseProfile = supaRes.user;
          }
        } catch (supaErr) {
          console.warn('Supabase auth signup notice:', supaErr.message);
        }
      }

      // 2. Local customer record sync
      let customerRecord = {
        id: userId,
        name: name,
        email: email,
        phone: phone,
        passwordHash,
        password_hash: passwordHash,
        city: payload.city || 'Mumbai',
        state: payload.state || 'Maharashtra',
        address: payload.address || '',
        locality: payload.locality || '',
        pincode: payload.pincode || '',
        country: payload.country || 'India',
        ordersCount: 0,
        totalSpent: 0,
        lastOrderDate: new Date().toISOString(),
        tags: ['Storefront Member', 'Supabase Verified'],
        status: 'Active',
        wishlist: Array.isArray(payload.wishlist) ? payload.wishlist : [],
        cart: Array.isArray(payload.cart) ? payload.cart : []
      };
      customers.unshift(customerRecord);
      writeJsonFile('customers.json', customers);

      // Sync customer to AWS RDS PostgreSQL
      if (db && db.isConfigured) {
        try {
          await db.customers.upsert(customerRecord);
        } catch (dbErr) {
          console.warn('AWS RDS customer signup error:', dbErr.message);
        }
      }

      const safeUser = { ...customerRecord };
      delete safeUser.password;
      delete safeUser.passwordHash;
      delete safeUser.password_hash;

      return sendJson(res, 201, { success: true, user: safeUser, token: authToken });
    }

    // POST /api/auth/login
    if (authRoute === 'login' && req.method === 'POST') {
      const clientIp = security.getClientIp(req);
      const loginLimit = await redis.checkRateLimit(`login_ip:${clientIp}`, 10, 300);
      if (!loginLimit.allowed) {
        return sendJson(res, 429, {
          success: false,
          message: `Too many login attempts. Please wait ${Math.ceil(loginLimit.resetAfterSeconds / 60)} minutes before trying again.`
        }, { 'Retry-After': String(loginLimit.resetAfterSeconds) });
      }

      const payload = await parseBody(req);
      const email = (payload.email || '').toLowerCase().trim();
      const password = payload.password || '';

      if (!isValidEmail(email) || String(password).length < 1 || String(password).length > 128) {
        return sendJson(res, 400, { success: false, message: 'A valid email address and password are required' });
      }

      let authedUser = null;
      let authToken = null;

      // 1. Try Supabase Auth First
      if (supabase.isConfigured && password) {
        try {
          const supaLogin = await supabase.auth.signInWithPassword({ email, password });
          if (supaLogin.success && supaLogin.user) {
            authedUser = supaLogin.user;
            authToken = supaLogin.token;
          }
        } catch (supaErr) {
          console.warn('Supabase auth login notice:', supaErr.message);
        }
      }

      // 2. Check Local Database / Fallback
      let localCustomer = customers.find(c => (c.email || '').toLowerCase() === email);

      if (!authedUser) {
        let cloudProfile = null;
        if (supabase.isConfigured) {
          try {
            cloudProfile = await supabase.profiles.getByEmail(email);
          } catch (e) {}
        }

        if (!localCustomer && !cloudProfile) {
          return sendJson(res, 401, { success: false, message: 'Invalid email address or password. Please verify your credentials.' });
        }

        const candidateHash = localCustomer?.passwordHash || localCustomer?.password_hash || cloudProfile?.passwordHash || cloudProfile?.password_hash;
        const legacyPassword = localCustomer?.password;
        const passwordValid = candidateHash
          ? await security.verifyPassword(password, candidateHash)
          : (process.env.NODE_ENV !== 'production' && Boolean(legacyPassword && legacyPassword === password));
        if (!passwordValid) {
          return sendJson(res, 401, { success: false, message: 'Invalid email address or password. Please verify your credentials.' });
        }

        // One-time migration for old local records that stored plaintext
        // passwords. Never write the plaintext back to disk.
        if (localCustomer && legacyPassword && !candidateHash) {
          localCustomer.passwordHash = await security.hashPassword(password);
          delete localCustomer.password;
          writeJsonFile('customers.json', customers);
        }

        authedUser = localCustomer ? { ...localCustomer } : {
          id: cloudProfile?.id || `CUST-${Date.now()}`,
          name: cloudProfile?.name || email.split('@')[0],
          email: email,
          phone: cloudProfile?.phone || '',
          ordersCount: 0,
          totalSpent: 0,
          status: 'Active',
          wishlist: cloudProfile?.wishlist || [],
          cart: cloudProfile?.cart || []
        };
        authToken = security.createCustomerSession(authedUser.id, authedUser.email || email);
      } else {
        // Sync authed user with local customer
        if (!localCustomer) {
          localCustomer = {
            id: authedUser.id,
            name: authedUser.name || authedUser.full_name || 'Storefront Member',
            email: email,
            phone: authedUser.phone || '',
            passwordHash: await security.hashPassword(password),
            ordersCount: 0,
            totalSpent: 0,
            tags: ['Storefront Member', 'Supabase Verified'],
            status: 'Active',
            wishlist: [],
            cart: []
          };
          customers.unshift(localCustomer);
          writeJsonFile('customers.json', customers);
        }
        authedUser = { ...localCustomer, ...authedUser };
      }

      // Merge profile from AWS RDS PostgreSQL first
      if (db && db.isConfigured && (authedUser.email || authedUser.id)) {
        try {
          const rdsProfile = await db.customers.getByEmail(email) || await db.customers.getById(authedUser.id);
          if (rdsProfile) {
            if (rdsProfile.name) authedUser.name = rdsProfile.name;
            if (rdsProfile.phone) authedUser.phone = rdsProfile.phone;
            if (rdsProfile.address) authedUser.address = rdsProfile.address;
            if (rdsProfile.locality) authedUser.locality = rdsProfile.locality;
            if (rdsProfile.city) authedUser.city = rdsProfile.city;
            if (rdsProfile.state) authedUser.state = rdsProfile.state;
            if (rdsProfile.pincode) authedUser.pincode = rdsProfile.pincode;
            if (rdsProfile.country) authedUser.country = rdsProfile.country;
            if (Array.isArray(rdsProfile.wishlist)) authedUser.wishlist = Array.from(new Set([...(authedUser.wishlist || []), ...rdsProfile.wishlist]));
            if (Array.isArray(rdsProfile.cart)) authedUser.cart = rdsProfile.cart;
          }
        } catch (e) {}
      }

      // Merge full cloud profile (address, locality, city, state, pincode, country, wishlist, cart)
      if (supabase.isConfigured && (authedUser.id || authedUser.email)) {
        try {
          const supaProfile = await supabase.profiles.getByEmail(email) || await supabase.profiles.get(authedUser.id, email);
          if (supaProfile) {
            if (supaProfile.id && supaProfile.id.includes('-')) authedUser.id = supaProfile.id;
            if (supaProfile.name) authedUser.name = supaProfile.name;
            if (supaProfile.phone) authedUser.phone = supaProfile.phone;
            if (supaProfile.address) authedUser.address = supaProfile.address;
            if (supaProfile.locality) authedUser.locality = supaProfile.locality;
            if (supaProfile.city) authedUser.city = supaProfile.city;
            if (supaProfile.state) authedUser.state = supaProfile.state;
            if (supaProfile.pincode) authedUser.pincode = supaProfile.pincode;
            if (supaProfile.country) authedUser.country = supaProfile.country;
            authedUser.wishlist = Array.from(new Set([...(authedUser.wishlist || []), ...(supaProfile.wishlist || [])]));
            if (Array.isArray(supaProfile.cart)) authedUser.cart = supaProfile.cart;
          }
        } catch (e) {}
      }

      if (localCustomer) {
        Object.assign(localCustomer, authedUser);
        writeJsonFile('customers.json', customers);
      }

      const safeUser = { ...authedUser };
      delete safeUser.password;
      delete safeUser.passwordHash;
      delete safeUser.password_hash;

      return sendJson(res, 200, { success: true, user: safeUser, token: authToken });
    }

    // POST /api/auth/send-otp and /api/auth/magic-link (100% Free 6-Digit Numeric OTP)
    if ((authRoute === 'send-otp' || authRoute === 'magic-link') && req.method === 'POST') {
      const payload = await parseBody(req);
      const email = (payload.email || '').toLowerCase().trim();
       if (!isValidEmail(email)) {
        return sendJson(res, 400, { success: false, message: 'A valid email address is required' });
      }

      // 1. Enforce strict OTP dispatch cooldown & rate limits (60s cooldown, max 5/hr per email, max 15/hr per IP)
      const clientIp = security.getClientIp(req);
      const cooldownCheck = (typeof security.checkOtpSendCooldownAsync === 'function')
        ? (await security.checkOtpSendCooldownAsync(email, clientIp))
        : security.checkOtpSendCooldown(email, clientIp);
      if (!cooldownCheck.allowed) {
        return sendJson(res, 429, { success: false, message: cooldownCheck.message }, { 'Retry-After': String(cooldownCheck.retryAfterSeconds || 60) });
      }

      // Generate secure 6-digit numeric OTP
      const otpCode = crypto.randomInt(100000, 1000000).toString();
      const expiresAt = Date.now() + 10 * 60 * 1000;
      otpCache.set(email, {
        code: otpCode,
        expiresAt,
        attempts: 0
      });
      await redis.cacheSet(`otp:${email}`, { code: otpCode, expiresAt, attempts: 0 }, 600);

      // Record dispatch timestamp to enforce cooldown
      security.recordOtpSent(email);

      // Persist to local PostgreSQL Database (webhook_events)
      if (db && db.events && typeof db.events.setOtp === 'function') {
        try {
          await db.events.setOtp(email, otpCode, 10 * 60 * 1000);
        } catch (e) {
          console.warn('DB OTP save error:', e.message);
        }
      }

      // Persist to Supabase PostgreSQL (webhook_events) for serverless multi-instance persistence
      if (supabase.isConfigured && supabase.otp) {
        try {
          await supabase.otp.save({ email, code: otpCode, expiresAt });
        } catch (e) {
          console.warn('Supabase OTP save error:', e.message);
        }
      }

      // Send real email via Brevo / Resend / Supabase custom SMTP
      const dispatched = await sendOtpEmail(email, otpCode);

      // Return clean, secure customer response without exposing the OTP code in prod when delivered,
      // but providing devCode when email dispatch failed or in non-production so users are never locked out
      if (!dispatched && process.env.NODE_ENV === 'production') {
        otpCache.delete(email);
        if (db && db.events && typeof db.events.deleteOtp === 'function') await db.events.deleteOtp(email).catch(() => {});
        if (supabase.isConfigured && supabase.otp) await supabase.otp.delete(email).catch(() => {});
        return sendJson(res, 503, { success: false, message: 'Verification email service is temporarily unavailable. Please try again later.' });
      }
      return sendJson(res, 200, {
        success: true,
        emailSent: dispatched,
        ...(!dispatched || process.env.NODE_ENV !== 'production' ? { devCode: otpCode } : {}),
        message: dispatched
          ? `A 6-digit verification code has been dispatched to ${email}. Please check your Gmail (including Spam and Promotions folders).`
          : `A 6-digit verification code for ${email} has been generated. ${!dispatched ? `(Testing Code: ${otpCode})` : 'Please check your email.'}`
      });
    }

    // POST /api/auth/verify-otp
    if (authRoute === 'verify-otp' && req.method === 'POST') {
      const clientIp = security.getClientIp(req);
      const payload = await parseBody(req);
      const email = (payload.email || '').toLowerCase().trim();
      const token = String(payload.token || payload.otp || payload.code || '').trim();

      if (!email || !token) {
        return sendJson(res, 400, { success: false, message: 'Email and 6-digit verification code are required' });
      }

      let verified = false;
      const now = Date.now();
      const cached = otpCache.get(email);
      let dbOtp = null;
      if (db && db.events && typeof db.events.getOtp === 'function') {
        try {
          dbOtp = await db.events.getOtp(email);
        } catch (e) {}
      }
      let cloudOtp = null;
      if (supabase.isConfigured && supabase.otp) {
        try {
          cloudOtp = await supabase.otp.get(email);
        } catch (e) {}
      }

      // Check for expired OTP
      if ((cached && now > cached.expiresAt) || (dbOtp && now > dbOtp.expiresAt) || (cloudOtp && now > cloudOtp.expiresAt)) {
        otpCache.delete(email);
        if (db && db.events && typeof db.events.deleteOtp === 'function') {
          await db.events.deleteOtp(email).catch(() => {});
        }
        if (supabase.isConfigured && supabase.otp) {
          await supabase.otp.delete(email).catch(() => {});
        }
        return sendJson(res, 400, { success: false, message: 'Verification code has expired. Please request a new one.' });
      }

      // STRICT VALIDATION: Genuine OTP delivered to user's email only (NO backdoor)
      if (cached && cached.code === token && now <= cached.expiresAt) {
        verified = true;
      } else if (dbOtp && String(dbOtp.code) === token && now <= dbOtp.expiresAt) {
        verified = true;
      } else if (cloudOtp && String(cloudOtp.code) === token && now <= cloudOtp.expiresAt) {
        verified = true;
      }

      if (!verified && supabase.isConfigured && supabase.auth) {
        try {
          const verifyRes = await supabase.auth.verifyOtp({ email, token });
          if (verifyRes.success && verifyRes.user) {
            verified = true;
          }
        } catch (e) {}
      }

      if (verified) {
        // Record successful verification to clear failure counters
        security.recordOtpVerifyAttempt(email, clientIp, true);

        // Cleanup verified OTP so it cannot be reused
        otpCache.delete(email);
        await redis.cacheDel(`otp:${email}`);
        if (db && db.events && typeof db.events.deleteOtp === 'function') {
          await db.events.deleteOtp(email).catch(() => {});
        }
        if (supabase.isConfigured && supabase.otp) {
          await supabase.otp.delete(email).catch(() => {});
        }

        let localCust = customers.find(c => (c.email || '').toLowerCase() === email);
        if (!localCust && db && db.isConfigured) {
          try {
            localCust = await db.customers.getByEmail(email);
            if (localCust) {
              customers.unshift(localCust);
              writeJsonFile('customers.json', customers);
            }
          } catch (e) {}
        }

        if (!localCust) {
          let orderName = email.split('@')[0].replace(/[._]/g, ' ');
          let orderPhone = '';
          let orderAddress = '';
          let orderLocality = '';
          let orderCity = '';
          let orderState = '';
          let orderPincode = '';
          let userOrdersCount = 0;
          let userTotalSpent = 0;
          try {
            const pastOrders = await getAllOrders();
            const matchingOrder = pastOrders.find(o => (o.customer?.email || o.email || o.guest_email || '').toLowerCase() === email);
            if (matchingOrder && matchingOrder.customer) {
              orderName = matchingOrder.customer.name || orderName;
              orderPhone = matchingOrder.customer.phone || '';
              orderAddress = matchingOrder.customer.address || '';
              orderLocality = matchingOrder.customer.locality || '';
              orderCity = matchingOrder.customer.city || '';
              orderState = matchingOrder.customer.state || '';
              orderPincode = matchingOrder.customer.pincode || '';
              userOrdersCount = 1;
              userTotalSpent = matchingOrder.total || 0;
            }
          } catch (oe) {}

          localCust = {
            id: `CUST-${Date.now()}`,
            name: orderName,
            email: email,
            phone: orderPhone,
            city: orderCity,
            state: orderState,
            address: orderAddress,
            locality: orderLocality,
            pincode: orderPincode,
            country: 'India',
            ordersCount: userOrdersCount,
            totalSpent: userTotalSpent,
            tags: ['Storefront Member', '6-Digit OTP Verified'],
            status: 'Active',
            wishlist: [],
            cart: []
          };
          customers.unshift(localCust);
          writeJsonFile('customers.json', customers);
          if (db && db.isConfigured) {
            try { await db.customers.upsert(localCust); } catch (e) {}
          }
        } else if (!localCust.address || !localCust.phone) {
          try {
            const pastOrders = await getAllOrders();
            const matchingOrder = pastOrders.find(o => (o.customer?.email || o.email || o.guest_email || '').toLowerCase() === email);
            if (matchingOrder && matchingOrder.customer) {
              if (!localCust.name || localCust.name === 'Storefront Member') localCust.name = matchingOrder.customer.name || localCust.name;
              if (!localCust.phone) localCust.phone = matchingOrder.customer.phone || localCust.phone;
              if (!localCust.address) localCust.address = matchingOrder.customer.address || localCust.address;
              if (!localCust.locality) localCust.locality = matchingOrder.customer.locality || localCust.locality;
              if (!localCust.city) localCust.city = matchingOrder.customer.city || localCust.city;
              if (!localCust.state) localCust.state = matchingOrder.customer.state || localCust.state;
              if (!localCust.pincode) localCust.pincode = matchingOrder.customer.pincode || localCust.pincode;
              writeJsonFile('customers.json', customers);
              if (db && db.isConfigured) {
                try { await db.customers.upsert(localCust); } catch (e) {}
              }
            }
          } catch (oe) {}
        }

        // Full profile hydration from Supabase PostgreSQL
        if (supabase.isConfigured) {
          try {
            const supaProfile = await supabase.profiles.getByEmail(email) || await supabase.profiles.get(localCust.id, email);
            if (supaProfile) {
              if (supaProfile.id && supaProfile.id.includes('-')) localCust.id = supaProfile.id;
              if (supaProfile.name) localCust.name = supaProfile.name;
              if (supaProfile.phone) localCust.phone = supaProfile.phone;
              if (supaProfile.address) localCust.address = supaProfile.address;
              if (supaProfile.locality) localCust.locality = supaProfile.locality;
              if (supaProfile.city) localCust.city = supaProfile.city;
              if (supaProfile.state) localCust.state = supaProfile.state;
              if (supaProfile.pincode) localCust.pincode = supaProfile.pincode;
              if (supaProfile.country) localCust.country = supaProfile.country;
              localCust.wishlist = Array.from(new Set([...(localCust.wishlist || []), ...(supaProfile.wishlist || [])]));
              if (Array.isArray(supaProfile.cart)) localCust.cart = supaProfile.cart;
            }
          } catch (e) {}
        }

        writeJsonFile('customers.json', customers);
        const safeUser = { ...localCust };
        delete safeUser.password;
        delete safeUser.passwordHash;
        delete safeUser.password_hash;
        return sendJson(res, 200, {
          success: true,
          message: 'Successfully verified & logged in!',
          user: safeUser,
          token: security.createCustomerSession(localCust.id, localCust.email)
        });
      }

      // Verification failed: increment attempts, enforce max 5 attempts lockout
      const attemptRes = security.recordOtpVerifyAttempt(email, clientIp, false);
      if (attemptRes.lockedOut) {
        otpCache.delete(email);
        await redis.cacheDel(`otp:${email}`);
        await redis.cacheSet(`otp_fail:${email}`, 5, 900);
        if (db && db.events && typeof db.events.deleteOtp === 'function') {
          await db.events.deleteOtp(email).catch(() => {});
        }
        if (supabase.isConfigured && supabase.otp) {
          await supabase.otp.delete(email).catch(() => {});
        }
        return sendJson(res, 429, { success: false, message: attemptRes.message }, { 'Retry-After': '900' });
      }

      return sendJson(res, 400, { success: false, message: attemptRes.message });
    }

    // GET /api/auth/me
    if (authRoute === 'me' && req.method === 'GET') {
      const identity = await getAuthenticatedIdentity(req);
      if (!identity) return sendJson(res, 401, { success: false, message: 'Not authenticated' });
      const userId = identity.id;
      const emailQuery = identity.email;

      let customer = null;
      if (userId) {
        customer = customers.find(c => String(c.id) === String(userId) || (c.email && c.email.toLowerCase() === String(userId).toLowerCase()));
      }
      if (!customer && emailQuery) {
        customer = customers.find(c => c.email && c.email.toLowerCase() === emailQuery);
      }
      if (!customer && db && db.isConfigured) {
        try {
          if (userId) customer = await db.customers.getById(userId) || await db.customers.getByEmail(userId);
          if (!customer && emailQuery) customer = await db.customers.getByEmail(emailQuery);
        } catch (e) {}
      }

      // If customer is found but has missing address, auto-populate from latest order
      if (customer && (!customer.address || !customer.phone)) {
        try {
          const userOrders = await getAllOrders();
          const cEmail = (customer.email || '').toLowerCase();
          const latestOrder = userOrders.find(o => {
            const oEmail = (o.customer?.email || o.email || o.guest_email || '').toLowerCase();
            return cEmail && oEmail === cEmail;
          });
          if (latestOrder && latestOrder.customer) {
            if (!customer.name || customer.name === 'Storefront Member') customer.name = latestOrder.customer.name || customer.name;
            if (!customer.phone) customer.phone = latestOrder.customer.phone || customer.phone;
            if (!customer.address) customer.address = latestOrder.customer.address || customer.address;
            if (!customer.locality) customer.locality = latestOrder.customer.locality || customer.locality;
            if (!customer.city) customer.city = latestOrder.customer.city || customer.city;
            if (!customer.state) customer.state = latestOrder.customer.state || customer.state;
            if (!customer.pincode) customer.pincode = latestOrder.customer.pincode || customer.pincode;
            if (!customer.country) customer.country = latestOrder.customer.country || 'India';
          }
        } catch (oe) {}
      }

      if (!customer) {
        return sendJson(res, 401, { success: false, message: 'Not authenticated' });
      }

      // Merge latest cloud wishlist, address, locality, country & cart from Supabase
      if (supabase.isConfigured && (customer.id || customer.email)) {
        try {
          const supaProfile = await supabase.profiles.getByEmail(customer.email) || (customer.id ? await supabase.profiles.get(customer.id, customer.email) : null);
          if (supaProfile) {
            if (supaProfile.name) customer.name = supaProfile.name;
            if (supaProfile.phone) customer.phone = supaProfile.phone;
            customer.wishlist = Array.from(new Set([...(customer.wishlist || []), ...(supaProfile.wishlist || [])]));
            if (supaProfile.address) customer.address = supaProfile.address;
            if (supaProfile.locality) customer.locality = supaProfile.locality;
            if (supaProfile.city) customer.city = supaProfile.city;
            if (supaProfile.state) customer.state = supaProfile.state;
            if (supaProfile.pincode) customer.pincode = supaProfile.pincode;
            if (supaProfile.country) customer.country = supaProfile.country;
            if (Array.isArray(supaProfile.cart)) customer.cart = supaProfile.cart;
          }
        } catch (e) {}
      }

      const safeUser = { ...customer };
      delete safeUser.password;
      delete safeUser.passwordHash;
      delete safeUser.password_hash;
      return sendJson(res, 200, { success: true, user: safeUser });
    }

    // PUT /api/auth/profile
    if (authRoute === 'profile' && req.method === 'PUT') {
      const payload = await parseBody(req);
      const identity = await getAuthenticatedIdentity(req);
      if (!identity) return sendJson(res, 401, { success: false, message: 'Not authenticated' });
      let customer = customers.find(c => String(c.id) === identity.id || (c.email && c.email.toLowerCase() === identity.email));
      if (!customer && db && db.isConfigured) {
        try { customer = await db.customers.getById(identity.id) || await db.customers.getByEmail(identity.email); } catch (e) {}
      }
      if (!customer && supabase.isConfigured) {
        try { customer = await supabase.profiles.get(identity.id, identity.email); } catch (e) {}
      }
      if (!customer) return sendJson(res, 404, { success: false, message: 'Customer not found' });

      if (payload.name) customer.name = payload.name;
      if (payload.phone) customer.phone = payload.phone;
      if (payload.city !== undefined) customer.city = payload.city;
      if (payload.state !== undefined) customer.state = payload.state;
      if (payload.address !== undefined) customer.address = payload.address;
      if (payload.locality !== undefined) customer.locality = payload.locality;
      if (payload.pincode !== undefined) customer.pincode = payload.pincode;
      if (payload.country !== undefined) customer.country = payload.country || 'India';
      if (payload.wishlist !== undefined) customer.wishlist = Array.isArray(payload.wishlist) ? payload.wishlist.slice(0, 500) : customer.wishlist;

      writeJsonFile('customers.json', customers);

      // Persist directly to AWS RDS / PostgreSQL database
      if (db && db.isConfigured) {
        try {
          await db.customers.upsert(customer);
        } catch (dbErr) {
          console.warn('AWS RDS customer upsert warning:', dbErr.message);
        }
      }

      // Also sync to Supabase PostgreSQL profiles and wishlists
      if (supabase.isConfigured) {
        try {
          await supabase.profiles.update(customer.id, {
            email: customer.email,
            name: customer.name,
            phone: customer.phone,
            address: customer.address,
            locality: customer.locality,
            city: customer.city,
            state: customer.state,
            pincode: customer.pincode,
            country: customer.country,
            cart: customer.cart,
            wishlist: customer.wishlist
          });
          if (payload.wishlist !== undefined) {
            await supabase.wishlists.sync(customer.id, customer.wishlist, customer.email);
          }
        } catch (syncErr) {
          console.warn('Supabase profile sync warning:', syncErr.message);
        }
      }

      const safeUser = { ...customer };
      delete safeUser.password;
      delete safeUser.passwordHash;
      delete safeUser.password_hash;
      return sendJson(res, 200, { success: true, user: safeUser });
    }

    // GET /api/auth/wishlist
    if (authRoute === 'wishlist' && req.method === 'GET') {
      const identity = await getAuthenticatedIdentity(req);
      if (!identity) return sendJson(res, 401, { success: false, message: 'Not authenticated' });
      const userId = identity.id;

      let list = [];
      const customer = customers.find(c => String(c.id) === String(userId));
      if (customer && Array.isArray(customer.wishlist)) list = customer.wishlist;

      if (supabase.isConfigured && userId.includes('-')) {
        try {
          const supaList = await supabase.wishlists.getByUserId(userId);
          if (supaList && supaList.length > 0) {
            list = Array.from(new Set([...list, ...supaList]));
          }
        } catch (e) {}
      }

      return sendJson(res, 200, { success: true, wishlist: list });
    }

    // GET /api/auth/orders
    if (authRoute === 'orders' && req.method === 'GET') {
      return await handleGetOrders(req, res, parsedUrl);
    }

    // POST /api/auth/logout
    if (authRoute === 'logout' && req.method === 'POST') {
      return sendJson(res, 200, { success: true, message: 'Logged out successfully' });
    }

    return sendJson(res, 404, { success: false, message: 'Auth route not found' });
  }

  // -------------------------------------------------------------
  // Storefront Checkout & Payment APIs (Cashfree strictly here)
  // -------------------------------------------------------------
  if ((pathname === '/api/discounts/validate' || pathname === '/api/coupons/validate') && req.method === 'POST') {
    const payload = await parseBody(req);
    const code = cleanText(payload.code || payload.discountCode || payload.couponCode || '', 50).toUpperCase();
    const subtotal = Math.max(0, Number(payload.subtotal ?? payload.cartTotal ?? payload.total ?? payload.amount) || 0);

    if (!code) {
      return sendJson(res, 400, { success: false, valid: false, message: 'Please enter a discount code.' });
    }

    const discounts = readJsonFile('discounts.json', []);
    const rule = discounts.find(d => d.isActive !== false && String(d.code || '').toUpperCase() === code);

    if (!rule) {
      return sendJson(res, 404, { success: false, valid: false, message: `Coupon code '${code}' is invalid or expired.` });
    }

    if (rule.usageLimit && Number(rule.usageCount || 0) >= Number(rule.usageLimit)) {
      return sendJson(res, 400, { success: false, valid: false, message: `Coupon '${code}' has reached its maximum usage limit.` });
    }

    const minVal = Number(rule.minOrderValue || 0);
    if (subtotal < minVal) {
      return sendJson(res, 400, {
        success: false,
        valid: false,
        message: `Coupon '${code}' requires a minimum order subtotal of ₹${minVal.toLocaleString('en-IN')}.`
      });
    }

    let discountAmount = 0;
    if (rule.type === 'fixed') {
      discountAmount = Number(rule.value || 0);
    } else {
      discountAmount = subtotal * (Number(rule.value || 0) / 100);
    }

    if (rule.maxDiscount) {
      discountAmount = Math.min(discountAmount, Number(rule.maxDiscount));
    }

    discountAmount = Math.max(0, Math.min(subtotal, Math.round(discountAmount)));

    return sendJson(res, 200, {
      success: true,
      valid: true,
      discountAmount,
      discountRule: {
        code: rule.code,
        type: rule.type,
        value: rule.value,
        description: rule.description || `${rule.value}${rule.type === 'fixed' ? ' off' : '% off'}`
      }
    });
  }

  if (pathname === '/api/webhooks/cashfree' && req.method === 'POST') {
    return await handleCashfreeWebhook(req, res);
  }

  if (pathname.startsWith('/api/checkout/')) {
    const checkoutRoute = pathname.replace('/api/checkout/', '');

    // POST /api/checkout/validate-discount or /api/discounts/validate
    if ((checkoutRoute === 'validate-discount' || checkoutRoute === 'validate-coupon') && req.method === 'POST') {
      const payload = await parseBody(req);
      const code = cleanText(payload.code || payload.discountCode || payload.couponCode || '', 50).toUpperCase();
      const subtotal = Math.max(0, Number(payload.subtotal ?? payload.cartTotal ?? payload.total ?? payload.amount) || 0);

      if (!code) {
        return sendJson(res, 400, { success: false, valid: false, message: 'Please enter a discount code.' });
      }

      const discounts = readJsonFile('discounts.json', []);
      const rule = discounts.find(d => d.isActive !== false && String(d.code || '').toUpperCase() === code);

      if (!rule) {
        return sendJson(res, 404, { success: false, valid: false, message: `Coupon code '${code}' is invalid or expired.` });
      }

      if (rule.usageLimit && Number(rule.usageCount || 0) >= Number(rule.usageLimit)) {
        return sendJson(res, 400, { success: false, valid: false, message: `Coupon '${code}' has reached its maximum usage limit.` });
      }

      const minVal = Number(rule.minOrderValue || 0);
      if (subtotal < minVal) {
        return sendJson(res, 400, {
          success: false,
          valid: false,
          message: `Coupon '${code}' requires a minimum order subtotal of ₹${minVal.toLocaleString('en-IN')}.`
        });
      }

      let discountAmount = 0;
      if (rule.type === 'fixed') {
        discountAmount = Number(rule.value || 0);
      } else {
        discountAmount = subtotal * (Number(rule.value || 0) / 100);
      }

      if (rule.maxDiscount) {
        discountAmount = Math.min(discountAmount, Number(rule.maxDiscount));
      }

      discountAmount = Math.max(0, Math.min(subtotal, Math.round(discountAmount)));

      return sendJson(res, 200, {
        success: true,
        valid: true,
        discountAmount,
        discountRule: {
          code: rule.code,
          type: rule.type,
          value: rule.value,
          description: rule.description || `${rule.value}${rule.type === 'fixed' ? ' off' : '% off'}`
        }
      });
    }

    // POST /api/checkout/create-order
    if (checkoutRoute === 'create-order' && req.method === 'POST') {
      return await handleCreateOrder(req, res, true);
    }

    // POST /api/checkout/verify-payment
    if (checkoutRoute === 'verify-payment' && req.method === 'POST') {
      const clientIp = security.getClientIp(req);
      const payVerifyLimit = await redis.checkRateLimit(`pay_verify:${clientIp}`, 10, 600);
      if (!payVerifyLimit.allowed) {
        return sendJson(res, 429, { success: false, message: 'Too many payment verification requests. Please wait.' }, { 'Retry-After': String(payVerifyLimit.resetAfterSeconds) });
      }

      const payload = await parseBody(req);
      const orderId = payload.orderId;
      const checkoutToken = String(payload.checkoutToken || '');
      if (!orderId) {
        return sendJson(res, 400, { success: false, message: 'Order ID is required' });
      }

      const orders = await getAllOrders();
      const order = orders.find(o => String(o.id) === String(orderId));
      if (!order) return sendJson(res, 404, { success: false, message: 'Order not found' });
      if (!isCheckoutTokenValid(order, checkoutToken)) {
        return sendJson(res, 401, { success: false, message: 'Invalid checkout verification credential.' });
      }

      let verification;
      try {
        verification = await verifyCashfreeOrder(order);
      } catch (_) {
        return sendJson(res, 502, { success: false, message: 'Payment verification is temporarily unavailable.' });
      }
      if (!verification.configured) {
        return sendJson(res, 503, { success: false, message: 'Online payments are not configured.' });
      }
      if (!verification.verified) {
        return sendJson(res, 400, { success: false, message: 'Payment verification failed.' });
      }

      order.paymentStatus = 'Paid';
      order.cashfreePaymentId = verification.paymentId;
      order.updatedAt = new Date().toISOString();

      if (!writeJsonFile('orders.json', orders)) return sendJson(res, 500, { success: false, message: 'Unable to save payment confirmation.' });
      memoryOrders = orders;
      memoryOrdersLastFetch = Date.now();
      await syncOrderToSupabase(order);
      return sendJson(res, 200, { success: true, message: 'Payment confirmed & order marked Paid', order: customerOrderView(order) });
    }

    return sendJson(res, 404, { success: false, message: 'Checkout API route not found' });
  }

  // -------------------------------------------------------------
  // Newsletter & Subscribers APIs (Cloud Supabase Database Storage)
  // -------------------------------------------------------------
  if (pathname === '/api/newsletter' || pathname === '/api/subscribers') {
    if (req.method === 'POST') {
      const clientIp = security.getClientIp(req);
      const nlLimit = await redis.checkRateLimit(`newsletter:${clientIp}`, 5, 600);
      if (!nlLimit.allowed) {
        return sendJson(res, 429, {
          success: false,
          message: 'Too many subscription attempts from this device. Please wait a few minutes before trying again.'
        }, { 'Retry-After': String(nlLimit.resetAfterSeconds) });
      }

      const payload = await parseBody(req);
      const email = (payload.email || '').toLowerCase().trim();
      const rawPhone = payload.phone || payload.whatsapp || '';
      const phone = rawPhone ? whatsapp.normalizeIndianPhoneNumber(rawPhone) : null;
      const name = (payload.name || '').trim();

      if (!email && !phone) {
        return sendJson(res, 400, { success: false, message: 'Valid email address or WhatsApp phone number is required' });
      }
      if (email && !email.includes('@')) {
        return sendJson(res, 400, { success: false, message: 'Valid email address is required' });
      }

      const currentSubs = await getUnifiedSubscribers();
      const existing = currentSubs.find(s => (email && (s.email || '').toLowerCase() === email) || (phone && s.phone === phone));
      if (existing) {
        return sendJson(res, 200, {
          success: true,
          message: 'You are already a member of the Inner Circle.',
          alreadySubscribed: true
        });
      }

      const newSub = {
        id: `SUB-${Date.now()}`,
        email: email || '',
        phone: phone || '',
        name: name || '',
        subscribedAt: new Date().toISOString(),
        source: payload.source || (phone ? (email ? 'footer_email_and_whatsapp' : 'footer_whatsapp_vip') : 'footer_newsletter'),
        status: 'Active'
      };

      let localSubs = readJsonFile('subscribers.json', []);
      localSubs.unshift(newSub);
      writeJsonFile('subscribers.json', localSubs);

      if (db && db.isConfigured) {
        try {
          await db.subscribers.add(email, payload.source || 'footer_newsletter');
        } catch (e) {
          console.warn('Newsletter AWS RDS insert notice:', e.message);
        }
      }

      if (supabase.isConfigured && supabase.subscribers) {
        try {
          await supabase.subscribers.insert(newSub);
        } catch (e) {
          console.warn('Newsletter Supabase insert notice:', e.message);
        }
      }

      return sendJson(res, 201, {
        success: true,
        message: 'Welcome to the Inner Circle. Exclusive drop access confirmed.',
        subscriber: newSub
      });
    }

    if (req.method === 'GET') {
      return sendJson(res, 405, { success: false, message: 'Subscriber listing is restricted to administrators.' });
    }
  }

  // Admin Subscribers API
  if (pathname.startsWith('/api/admin/subscribers')) {
    // POST /api/admin/subscribers/broadcast
    if (pathname === '/api/admin/subscribers/broadcast' && req.method === 'POST') {
      const payload = await parseBody(req);
      const subject = (payload.subject || '').trim();
      const headline = (payload.headline || '').trim();
      const message = (payload.message || '').trim();

      if (!subject || !message) {
        return sendJson(res, 400, { success: false, message: 'Subject and message are required for broadcast' });
      }

      const subs = await getUnifiedSubscribers();
      const uniqueEmails = Array.from(new Set(
        subs.map(s => (s.email || '').toLowerCase().trim()).filter(e => e && e.includes('@'))
      ));

      const hasEmailEngine = Boolean(process.env.BREVO_API_KEY || process.env.RESEND_API_KEY);
      let sentCount = 0;

      for (const email of uniqueEmails) {
        if (hasEmailEngine) {
          const delivered = await sendTransactionalEmail({
            to: email,
            subject: subject,
            htmlContent: `
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif; max-width:580px; margin:0 auto; padding:32px 24px; background:#0d0d0d; color:#ffffff; border:1px solid #222222; border-radius:6px;">
                <div style="text-align:center; padding-bottom:24px; border-bottom:1px solid #1f1f1f;">
                  <h1 style="font-size:24px; font-weight:900; letter-spacing:0.25em; text-transform:uppercase; margin:0; color:#ffffff;">ALLEYRICH</h1>
                  <p style="font-size:11px; letter-spacing:0.12em; color:#888888; margin:6px 0 0; text-transform:uppercase;">Architectural Streetwear &bull; Homegrown in India</p>
                </div>
                <div style="padding:28px 0;">
                  ${headline ? `<h2 style="font-size:18px; font-weight:800; color:#ffffff; letter-spacing:0.08em; text-transform:uppercase; margin:0 0 16px;">${headline}</h2>` : ''}
                  <div style="font-size:14px; line-height:1.7; color:#cccccc; margin-bottom:28px;">
                    ${message.replace(/\n/g, '<br>')}
                  </div>
                  <div style="text-align:center; margin:30px 0;">
                    <a href="https://alleyrich.com/collections.html" style="display:inline-block; background:#ffffff; color:#000000; text-decoration:none; padding:14px 28px; font-weight:800; font-size:12px; letter-spacing:0.1em; text-transform:uppercase; border-radius:2px;">EXPLORE COLLECTION</a>
                  </div>
                </div>
                <div style="border-top:1px solid #1f1f1f; padding-top:20px; font-size:11px; color:#666666; text-align:center; line-height:1.6;">
                  You are receiving this communication as an exclusive member of the ALLEYRICH Inner Circle.<br>
                  &copy; ${new Date().getFullYear()} ALLEYRICH. All rights reserved.
                </div>
              </div>
            `,
            tags: ['subscribers-broadcast']
          });
          if (delivered) sentCount++;
        } else {
          sentCount++;
        }
      }

      console.log(`✅ [BROADCAST CAMPAIGN] Dispatched to ${sentCount}/${uniqueEmails.length} subscribers.`);
      return sendJson(res, 200, {
        success: true,
        count: sentCount,
        total: uniqueEmails.length,
        message: `Successfully broadcasted to ${sentCount} subscriber${sentCount === 1 ? '' : 's'}.`
      });
    }

    if (pathname === '/api/admin/subscribers' && req.method === 'GET') {
      const subs = await getUnifiedSubscribers();
      return sendJson(res, 200, { success: true, count: subs.length, subscribers: subs });
    }

    if (req.method === 'DELETE') {
      const subId = pathname.replace('/api/admin/subscribers/', '').trim();
      if (supabase.isConfigured && supabase.subscribers) {
        try {
          await supabase.subscribers.delete(subId);
        } catch (e) {}
      }
      let subscribers = readJsonFile('subscribers.json', []);
      subscribers = subscribers.filter(s => String(s.id) !== String(subId) && s.email !== subId);
      writeJsonFile('subscribers.json', subscribers);
      return sendJson(res, 200, { success: true, message: 'Subscriber removed' });
    }
  }

  // -------------------------------------------------------------
  // Storefront Public Customer Wishlist & Profile Endpoint
  // -------------------------------------------------------------
  if (pathname.startsWith('/api/customers/')) {
    const custId = pathname.replace('/api/customers/', '').replace(/\/$/, '');
    const emailQuery = (parsedUrl.searchParams.get('email') || '').toLowerCase().trim();
    let customers = readJsonFile('customers.json', []);
    let customer = customers.find(c => String(c.id) === String(custId) || (emailQuery && c.email && c.email.toLowerCase() === emailQuery));

    if (!security.isAdminAuthorized(req)) {
      const identity = await getAuthenticatedIdentity(req);
      const matchesIdentity = identity && customer && (
        String(customer.id) === identity.id ||
        String(customer.email || '').toLowerCase() === identity.email
      );
      if (!matchesIdentity) return sendJson(res, 404, { success: false, message: 'Customer not found' });
    }

    if (req.method === 'PUT') {
      const payload = await parseBody(req);
      if (!customer) return sendJson(res, 404, { success: false, message: 'Customer not found' });
      /*
        customer = {
          id: custId,
          name: payload.name || 'Storefront Member',
          email: payload.email || (custId.includes('@') ? custId : ''),
          phone: payload.phone || '',
          city: payload.city || '',
          state: payload.state || '',
          address: payload.address || '',
          locality: payload.locality || '',
          pincode: payload.pincode || '',
          country: payload.country || 'India',
          ordersCount: 0,
          totalSpent: 0,
          status: 'Active',
          wishlist: [],
          cart: []
        };
        customers.unshift(customer);
      }
      */

      if (payload.wishlist !== undefined) customer.wishlist = payload.wishlist;
      if (payload.cart !== undefined) customer.cart = payload.cart;
      if (payload.name) customer.name = payload.name;
      if (payload.email) customer.email = payload.email;
      if (payload.phone) customer.phone = payload.phone;
      if (payload.city !== undefined) customer.city = payload.city;
      if (payload.state !== undefined) customer.state = payload.state;
      if (payload.address !== undefined) customer.address = payload.address;
      if (payload.locality !== undefined) customer.locality = payload.locality;
      if (payload.pincode !== undefined) customer.pincode = payload.pincode;
      if (payload.country !== undefined) customer.country = payload.country;

      writeJsonFile('customers.json', customers);

      // Sync directly to AWS RDS PostgreSQL
      if (db && db.isConfigured) {
        try {
          await db.customers.upsert(customer);
        } catch (dbErr) {
          console.warn('AWS RDS customer update error:', dbErr.message);
        }
      }

      // Sync to Supabase PostgreSQL & Auth user_metadata (ONLY explicitly provided fields to protect saved address!)
      if (supabase.isConfigured && custId) {
        try {
          if (payload.wishlist !== undefined) {
            await supabase.wishlists.sync(custId, customer.wishlist, customer.email);
          }
          const supaUpdate = { email: customer.email };
          if (payload.name !== undefined) supaUpdate.name = payload.name;
          if (payload.phone !== undefined) supaUpdate.phone = payload.phone;
          if (payload.address !== undefined) supaUpdate.address = payload.address;
          if (payload.locality !== undefined) supaUpdate.locality = payload.locality;
          if (payload.city !== undefined) supaUpdate.city = payload.city;
          if (payload.state !== undefined) supaUpdate.state = payload.state;
          if (payload.pincode !== undefined) supaUpdate.pincode = payload.pincode;
          if (payload.country !== undefined) supaUpdate.country = payload.country;
          if (payload.wishlist !== undefined) supaUpdate.wishlist = payload.wishlist;
          if (payload.cart !== undefined) supaUpdate.cart = payload.cart;

          await supabase.profiles.update(custId, supaUpdate);
        } catch (supaErr) {
          console.warn('Customer update Supabase sync notice:', supaErr.message);
        }
      }

      const safeUser = { ...customer };
      delete safeUser.password;
      delete safeUser.passwordHash;
      delete safeUser.password_hash;
      return sendJson(res, 200, { success: true, customer: safeUser, user: safeUser });
    }

    if (req.method === 'GET') {
      if (!customer && supabase.isConfigured) {
        try {
          customer = await supabase.profiles.get(custId, emailQuery || (custId.includes('@') ? custId : null));
          if (!customer && emailQuery) {
            customer = await supabase.profiles.getByEmail(emailQuery);
          }
        } catch (e) {}
      } else if (customer && supabase.isConfigured) {
        try {
          const supaProfile = await supabase.profiles.getByEmail(customer.email || emailQuery) || await supabase.profiles.get(custId, customer.email || emailQuery);
          if (supaProfile) {
            if (supaProfile.address && !customer.address) customer.address = supaProfile.address;
            if (supaProfile.locality && !customer.locality) customer.locality = supaProfile.locality;
            if (supaProfile.city && !customer.city) customer.city = supaProfile.city;
            if (supaProfile.state && !customer.state) customer.state = supaProfile.state;
            if (supaProfile.pincode && !customer.pincode) customer.pincode = supaProfile.pincode;
            if (supaProfile.country && (!customer.country || customer.country === 'India')) customer.country = supaProfile.country;
            if (supaProfile.phone && !customer.phone) customer.phone = supaProfile.phone;
            if (supaProfile.name && (!customer.name || customer.name === 'Storefront Member')) customer.name = supaProfile.name;
            if (Array.isArray(supaProfile.cart) && (!customer.cart || customer.cart.length === 0)) customer.cart = supaProfile.cart;
            if (Array.isArray(supaProfile.wishlist)) {
              customer.wishlist = Array.from(new Set([...(customer.wishlist || []), ...supaProfile.wishlist]));
            }
          }
        } catch (e) {}
      }
      if (!customer) return sendJson(res, 404, { success: false, message: 'Customer not found' });
      const safeUser = { ...customer };
      delete safeUser.password;
      delete safeUser.passwordHash;
      delete safeUser.password_hash;
      return sendJson(res, 200, { success: true, customer: safeUser, user: safeUser });
    }
  }

  // Dedicated Cloud Wishlist Sync API
  if (pathname === '/api/wishlist/sync' || pathname === '/api/wishlist') {
    if (req.method === 'POST' || req.method === 'PUT') {
      const payload = await parseBody(req);
      const identity = await getAuthenticatedIdentity(req);
      if (!identity) return sendJson(res, 401, { success: false, message: 'Not authenticated' });
      const userId = identity.id;
      const email = identity.email;
      const wishlist = Array.isArray(payload.wishlist) ? payload.wishlist.slice(0, 500) : [];

      const lookupId = userId || email;

      // Update local customers.json
      let customers = readJsonFile('customers.json', []);
      let cust = customers.find(c => String(c.id) === String(lookupId) || (email && c.email && c.email.toLowerCase() === email));
      if (cust) {
        cust.wishlist = wishlist;
        writeJsonFile('customers.json', customers);
      }

      // Update AWS RDS PostgreSQL customer wishlist
      if (db && db.isConfigured && (email || cust?.email)) {
        try {
          await db.customers.updateWishlist(email || cust?.email, wishlist);
        } catch (e) {
          console.warn('Wishlist sync to AWS RDS error:', e.message);
        }
      }

      // Update Supabase PostgreSQL wishlists and user_metadata
      if (supabase.isConfigured) {
        try {
          await supabase.wishlists.sync(lookupId, wishlist, email || cust?.email);
        } catch (e) {
          console.warn('Wishlist sync to Supabase error:', e.message);
        }
      }

      return sendJson(res, 200, { success: true, count: wishlist.length, wishlist });
    }

    if (req.method === 'GET') {
      const identity = await getAuthenticatedIdentity(req);
      if (!identity) return sendJson(res, 401, { success: false, message: 'Not authenticated' });
      const userId = identity.id;
      const email = identity.email;

      const lookupId = userId || email;
      let list = [];
      let customers = readJsonFile('customers.json', []);
      const cust = customers.find(c => String(c.id) === String(lookupId) || (email && c.email && c.email.toLowerCase() === email.toLowerCase()));
      if (cust && Array.isArray(cust.wishlist)) list = cust.wishlist;

      if (supabase.isConfigured) {
        try {
          const cloudList = await supabase.wishlists.getByUserId(lookupId, email || cust?.email);
          if (cloudList && cloudList.length > 0) {
            list = Array.from(new Set([...list, ...cloudList]));
          }
        } catch (e) {}
      }

      return sendJson(res, 200, { success: true, count: list.length, wishlist: list });
    }
  }

  // Dedicated Cloud Cart Sync API
  if (pathname === '/api/cart/sync' || pathname === '/api/cart') {
    if (req.method === 'POST' || req.method === 'PUT') {
      const payload = await parseBody(req);
      const identity = await getAuthenticatedIdentity(req);
      if (!identity) return sendJson(res, 401, { success: false, message: 'Not authenticated' });
      const userId = identity.id;
      const email = identity.email;
      const cart = Array.isArray(payload.cart) ? payload.cart.slice(0, 100) : [];

      const lookupId = userId || email;
      await redis.setUserCart(lookupId, cart, 2592000);
      if (email && email !== lookupId) {
        await redis.setUserCart(email, cart, 2592000);
      }

      // Update local customers.json
      let customers = readJsonFile('customers.json', []);
      let cust = customers.find(c => String(c.id) === String(lookupId) || (email && c.email && c.email.toLowerCase() === email));
      if (cust) {
        cust.cart = cart;
        writeJsonFile('customers.json', customers);
      }

      // Update AWS RDS PostgreSQL customer cart
      if (db && db.isConfigured && (email || cust?.email)) {
        try {
          await db.customers.updateCart(email || cust?.email, cart);
        } catch (e) {
          console.warn('Cart sync to AWS RDS error:', e.message);
        }
      }

      // Update Supabase PostgreSQL profile with cart
      if (supabase.isConfigured) {
        try {
          await supabase.profiles.update(lookupId, { email: email || cust?.email, cart });
        } catch (e) {
          console.warn('Cart sync to Supabase error:', e.message);
        }
      }

      return sendJson(res, 200, { success: true, count: cart.length, cart });
    }

    if (req.method === 'GET') {
      const identity = await getAuthenticatedIdentity(req);
      if (!identity) return sendJson(res, 401, { success: false, message: 'Not authenticated' });
      const userId = identity.id;
      const email = identity.email;

      const lookupId = userId || email;
      let cart = await redis.getUserCart(lookupId);
      if (!cart && email) {
        cart = await redis.getUserCart(email);
      }
      if (!cart) {
        cart = [];
        let customers = readJsonFile('customers.json', []);
        const cust = customers.find(c => String(c.id) === String(lookupId) || (email && c.email && c.email.toLowerCase() === email.toLowerCase()));
        if (cust && Array.isArray(cust.cart)) cart = cust.cart;

        if (supabase.isConfigured) {
          try {
            const supaProfile = await supabase.profiles.getByEmail(email || lookupId) || await supabase.profiles.get(lookupId, email);
            if (supaProfile && Array.isArray(supaProfile.cart) && supaProfile.cart.length > 0) {
              cart = supaProfile.cart;
            }
          } catch (e) {}
        }
        if (cart.length > 0) {
          await redis.setUserCart(lookupId, cart, 2592000);
        }
      }

      return sendJson(res, 200, { success: true, count: cart.length, cart });
    }
  }

  // -------------------------------------------------------------
  // Storefront Static Pages
  // -------------------------------------------------------------
  // Serve Homepage
  if (pathname === '/' || pathname === '/index.html') {
    const indexPath = path.join(PUBLIC_DIR, 'index.html');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return fs.createReadStream(indexPath).pipe(res);
  }

  // Serve Checkout Page
  if (pathname === '/checkout' || pathname === '/checkout/' || pathname === '/checkout.html') {
    const chkPath = path.join(PUBLIC_DIR, 'checkout.html');
    if (fs.existsSync(chkPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return fs.createReadStream(chkPath).pipe(res);
    }
  }

  // Serve Customer Account Page
  if (pathname === '/account' || pathname === '/account/' || pathname === '/account.html') {
    const accPath = path.join(PUBLIC_DIR, 'account.html');
    if (fs.existsSync(accPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return fs.createReadStream(accPath).pipe(res);
    }
  }

  // Serve Customer Login Page
  if (pathname === '/login' || pathname === '/login/' || pathname === '/login.html') {
    const loginPath = path.join(PUBLIC_DIR, 'login.html');
    if (fs.existsSync(loginPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return fs.createReadStream(loginPath).pipe(res);
    }
  }

  // Serve Order Success Page
  if (pathname === '/order-success' || pathname === '/order-success/' || pathname === '/order-success.html') {
    const succPath = path.join(PUBLIC_DIR, 'order-success.html');
    if (fs.existsSync(succPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return fs.createReadStream(succPath).pipe(res);
    }
  }

  // Serve Collections Page for ANY collection / category URL
  if (pathname.startsWith('/collections')) {
    const colPath = path.join(PUBLIC_DIR, 'collections.html');
    if (fs.existsSync(colPath)) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8'
      });
      return fs.createReadStream(colPath).pipe(res);
    }
  }

  // Serve Search Route (HTML search results via collections.html engine)
  if (pathname === '/search' || pathname === '/search/' || pathname === '/search.html') {
    const searchPage = path.join(PUBLIC_DIR, 'collections.html');
    if (fs.existsSync(searchPage)) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8'
      });
      return fs.createReadStream(searchPage).pipe(res);
    }
  }

  // Handle /cart Route (Redirect to collections with openCart drawer)
  if (pathname === '/cart' || pathname === '/cart/') {
    res.writeHead(302, { 'Location': '/collections/shop?openCart=true' });
    return res.end();
  }

  // Handle Policy & Informational Pages (/pages/:page, /refund-policy, /privacy-policy, etc.)
  const policyMap = {
    '/track': 'track-order.html',
    '/track-order': 'track-order.html',
    '/pages/track': 'track-order.html',
    '/pages/track-order': 'track-order.html',
    '/pages/track-order.html': 'track-order.html',
    '/refund-policy': 'refund-policy.html',
    '/pages/refund-policy': 'refund-policy.html',
    '/pages/refund-policy.html': 'refund-policy.html',
    '/cookie-policy': 'cookie-policy.html',
    '/pages/cookie-policy': 'cookie-policy.html',
    '/pages/cookie-policy.html': 'cookie-policy.html',
    '/cookies': 'cookie-policy.html',
    '/privacy-policy': 'privacy-policy.html',
    '/pages/privacy-policy': 'privacy-policy.html',
    '/pages/privacy-policy.html': 'privacy-policy.html',
    '/terms-of-service': 'terms-of-service.html',
    '/pages/terms-of-service': 'terms-of-service.html',
    '/pages/terms-of-service.html': 'terms-of-service.html',
    '/terms': 'terms-of-service.html',
    '/shipping-policy': 'shipping-policy.html',
    '/pages/shipping-policy': 'shipping-policy.html',
    '/pages/shipping-policy.html': 'shipping-policy.html',
    '/contact': 'contact.html',
    '/contact-us': 'contact.html',
    '/pages/contact': 'contact.html',
    '/pages/contact.html': 'contact.html',
    '/chat': 'contact.html',
    '/chat-with-us': 'contact.html',
    '/pages/chat': 'contact.html',
    '/pages/chat.html': 'contact.html',
    '/returns': 'returns.html',
    '/pages/returns': 'returns.html',
    '/pages/returns.html': 'returns.html',
    '/reviews': 'reviews.html',
    '/pages/reviews': 'reviews.html',
    '/pages/reviews.html': 'reviews.html',
    '/size-guide': 'size-guide.html',
    '/pages/size-guide': 'size-guide.html',
    '/pages/size-guide.html': 'size-guide.html',
    '/size-chart': 'size-guide.html',
    '/pages/size-chart': 'size-guide.html',
    '/pages/size-chart.html': 'size-guide.html'
  };

  const normPolicyPath = pathname.toLowerCase().replace(/\/+$/, '');
  if (policyMap[normPolicyPath] || policyMap[pathname]) {
    const pageFileName = policyMap[normPolicyPath] || policyMap[pathname];
    const pageFile = path.join(PUBLIC_DIR, 'pages', pageFileName);
    if (fs.existsSync(pageFile)) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8'
      });
      return fs.createReadStream(pageFile).pipe(res);
    }
  }

  if (pathname.startsWith('/pages/')) {
    let pName = pathname.replace('/pages/', '').split('?')[0];
    if (!pName.endsWith('.html')) pName += '.html';
    const pageFile = path.join(PUBLIC_DIR, 'pages', pName);
    if (fs.existsSync(pageFile)) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8'
      });
      return fs.createReadStream(pageFile).pipe(res);
    }
  }

  // Serve Single Product Page
  if (pathname.startsWith('/products/')) {
    const prodPath = path.join(PUBLIC_DIR, 'product.html');
    if (fs.existsSync(prodPath)) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8'
      });
      return fs.createReadStream(prodPath).pipe(res);
    }
  }

  // Handle Video files with HTTP 206 Range support
  if (pathname.startsWith('/assets/videos/')) {
    const videoFile = path.join(PUBLIC_DIR, pathname);
    if (fs.existsSync(videoFile)) {
      return serveVideoWithRange(req, res, videoFile);
    }
  }

  // Check local files
  let localPath = path.resolve(PUBLIC_DIR, `.${pathname}`);
  if (pathname === '/assets/spline/scene.bin') {
    localPath = path.resolve(PUBLIC_DIR, 'assets', 'spline', 'scene.splinecode');
  }
  const publicRoot = path.resolve(PUBLIC_DIR) + path.sep;
  if (!localPath.startsWith(publicRoot)) {
    return sendJson(res, 403, { success: false, message: 'Forbidden' });
  }
  if (fs.existsSync(localPath) && fs.statSync(localPath).isFile()) {
    const ext = path.extname(localPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    if (ext === '.mp4') {
      return serveVideoWithRange(req, res, localPath);
    }

    const isImmutable = /\.(webp|splinecode|bin|glb|gltf|png|jpg|jpeg|gif|woff2|woff|ttf|svg|ico)$/i.test(ext) || pathname.startsWith('/assets/') || pathname.startsWith('/images/');
    const cacheHeader = isImmutable 
      ? 'public, max-age=31536000, immutable' 
      : (/\.(js|css)$/i.test(ext) ? 'public, max-age=86400, stale-while-revalidate=604800' : 'public, max-age=3600');

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': cacheHeader,
      'Access-Control-Allow-Origin': '*'
    });
    return fs.createReadStream(localPath).pipe(res);
  }

  // Proxy CDN or remote asset requests directly to genrage.com
  if (pathname.startsWith('/cdn/') || pathname.startsWith('/checkouts/')) {
    const remoteUrl = `https://genrage.com${pathname}${parsedUrl.search}`;
    return proxyRequest(req, res, remoteUrl);
  }

  // Shopify Storefront JSON endpoints
  if (pathname === '/cart.js' || pathname === '/cart.json') {
    return sendJson(res, 200, {
      token: "cart_token_local",
      note: null,
      attributes: {},
      original_total_price: 0,
      total_price: 0,
      total_discount: 0,
      total_weight: 0.0,
      item_count: 0,
      items: [],
      requires_shipping: true,
      currency: "INR",
      items_subtotal_price: 0
    });
  }

  if (pathname === '/recommendations/products.json') {
    return sendJson(res, 200, { products: [] });
  }

  if (pathname === '/search/suggest.json') {
    return sendJson(res, 200, { resources: { results: { products: [] } } });
  }

  if (pathname === '/api/products') {
    return await handleGetProducts(req, res, parsedUrl);
  }

  // Fallback 404 (JSON formatted for JSON endpoints to prevent SyntaxError)
  if (pathname.endsWith('.json') || pathname.endsWith('.js') || pathname.startsWith('/api/')) {
    return sendJson(res, 404, { success: false, error: 'Endpoint not found', pathname });
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('404 Not Found');
  } catch (err) {
    const isPayloadTooLarge = err.message && err.message.includes('Payload too large');
    const isMalformedJson = err.message === 'Malformed JSON request body';
    const statusCode = isPayloadTooLarge ? 413 : (isMalformedJson ? 400 : 500);
    return sendJson(res, statusCode, {
      success: false,
      error: isPayloadTooLarge ? 'Payload Too Large' : 'Internal Server Error',
      message: isPayloadTooLarge || err.message === 'Malformed JSON request body'
        ? err.message
        : 'An unexpected server error occurred.'
    });
  }
}

const server = http.createServer(appHandler);
server.keepAliveTimeout = 65000; // 65s keep-alive window for AWS ALB / CloudFront compatibility
server.headersTimeout = 66000;
server.maxRequestsPerSocket = 0; // High-throughput socket re-use without premature resets

if (!process.env.VERCEL && require.main === module) {
  server.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(`🔥 ALLEYRICH Production Server Running!`);
    console.log(`📍 Storefront: http://localhost:${PORT}`);
    console.log(`⚡ Admin Portal: http://localhost:${PORT}/allyrich-hq (or /admin on localhost)`);
    console.log(`🎥 6 High-Definition Videos Ready & Streaming Locally`);
    console.log(`==================================================\n`);
  });
}

module.exports = appHandler;
module.exports.server = server;

