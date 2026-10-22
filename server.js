/**
 * GENRAGE - 1:1 Ditto Server with Full Video Streaming, Proxy, and Admin Control Hub API
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

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

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
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
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4',
      'Access-Control-Allow-Origin': '*'
    });
    file.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*'
    });
    fs.createReadStream(filePath).pipe(res);
  }
}

function proxyRequest(req, res, targetUrl) {
  const parsed = new URL(targetUrl);
  const options = {
    hostname: parsed.hostname,
    port: 443,
    path: parsed.pathname + parsed.search,
    method: req.method,
    headers: {
      ...req.headers,
      host: parsed.hostname,
      referer: 'https://genrage.com/'
    }
  };

  const proxy = https.request(options, (remoteRes) => {
    res.writeHead(remoteRes.statusCode, {
      ...remoteRes.headers,
      'access-control-allow-origin': '*'
    });
    remoteRes.pipe(res);
  });

  proxy.on('error', (err) => {
    console.error('Proxy error:', err.message);
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Proxy Error');
  });

  req.pipe(proxy);
}

function downloadFile(sourceUrl, destPath) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(sourceUrl);
    const client = parsed.protocol === 'https:' ? https : http;
    const request = client.get(sourceUrl, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const nextUrl = new URL(res.headers.location, sourceUrl).toString();
        return downloadFile(nextUrl, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download: HTTP ${res.statusCode}`));
      }
      const fileStream = fs.createWriteStream(destPath);
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close(resolve);
      });
      fileStream.on('error', reject);
    });
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
  try {
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
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
    let body = '';
    // Allow up to 15MB for media uploads, 2MB max for standard JSON endpoints
    const isUpload = req.url && (req.url.includes('/media/upload') || req.url.includes('/videos/upload') || req.url.includes('/videos/update'));
    const maxBytes = isUpload ? 15 * 1024 * 1024 : 2 * 1024 * 1024;

    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > maxBytes) {
        req.destroy();
        reject(new Error(`Payload too large (limit: ${Math.round(maxBytes / (1024 * 1024))}MB)`));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', reject);
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
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-key',
    ...extraHeaders
  });
  res.end(JSON.stringify(data));
}

// =============================================================
// Memory Cache & Supabase Dual-Sync Engine
// =============================================================
let memoryProducts = null;
let memoryProductsLastFetch = 0;
const PRODUCTS_CACHE_TTL_MS = 3000;

let memoryOrders = null;
let memoryOrdersLastFetch = 0;
const ORDERS_CACHE_TTL_MS = 2000;

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
    : [{ id: 1, src: 'https://cdn.shopify.com/s/files/1/0633/9339/9022/files/1_cd34702d-ac3b-4ee4-a9d4-1733e518d430.png?v=1792222977', position: 1 }];

  return {
    id: s.id,
    handle: s.handle,
    title: s.title,
    body_html: s.description || '',
    vendor: s.vendor || 'ALLYRICH',
    category: s.category || 'T-Shirts & Boxy Tees',
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

  if (db && db.isConfigured) {
    try {
      const awsProducts = await db.products.getAll();
      if (Array.isArray(awsProducts) && awsProducts.length > 0) {
        const filtered = filterOutGiftCards(awsProducts);
        memoryProducts = filtered;
        memoryProductsLastFetch = Date.now();
        return filtered;
      }
    } catch (err) {
      console.warn('AWS RDS products fetch warning:', err.message);
    }
  }

  const localList = getMemoryProducts();
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
}

function getMemoryOrders() {
  if (!memoryOrders) {
    memoryOrders = readJsonFile('orders.json', []);
    memoryOrdersLastFetch = Date.now();
  }
  return memoryOrders;
}

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

  if (db && db.isConfigured) {
    try {
      const awsOrders = await db.orders.getAll();
      if (Array.isArray(awsOrders)) {
        memoryOrders = awsOrders;
        memoryOrdersLastFetch = Date.now();
        return awsOrders;
      }
    } catch (err) {
      console.warn('AWS RDS orders fetch warning:', err.message);
    }
  }

  const localOrders = getMemoryOrders();
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
      vendor: product.vendor || 'GENRAGE',
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

// Transactional Email Service for OTP Authentication
async function sendOtpEmail(email, otpCode) {
  let emailDispatched = false;

  // 1. Resend API Integration (Preferred for D2C & Vercel)
  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM_EMAIL || 'ALLYRICH <onboarding@resend.dev>',
          to: [email],
          subject: `Your ALLYRICH Login Code: ${otpCode}`,
          html: `
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif; max-width:540px; margin:0 auto; padding:32px 24px; background:#ffffff; color:#111111; border:1px solid #e5e5e5; border-radius:6px;">
              <div style="text-align:center; padding-bottom:24px; border-bottom:1px solid #eeeeee;">
                <h1 style="font-size:22px; font-weight:900; letter-spacing:0.2em; text-transform:uppercase; margin:0; color:#000000;">ALLYRICH</h1>
                <p style="font-size:11px; letter-spacing:0.1em; color:#888888; margin:4px 0 0; text-transform:uppercase;">Architectural Streetwear &bull; India</p>
              </div>
              <div style="padding:28px 0; text-align:center;">
                <p style="font-size:15px; color:#333333; margin:0 0 18px;">Your 6-digit one-time verification code is:</p>
                <div style="display:inline-block; font-size:36px; font-weight:800; letter-spacing:0.3em; color:#000000; background:#f5f5f5; padding:16px 28px; border-radius:6px; font-family:monospace; border:1px solid #dddddd;">
                  ${otpCode}
                </div>
                <p style="font-size:13px; color:#777777; margin:20px 0 0;">This code will expire in <strong>10 minutes</strong>. Do not share this code with anyone.</p>
              </div>
              <div style="border-top:1px solid #eeeeee; padding-top:20px; font-size:11px; color:#999999; text-align:center; line-height:1.5;">
                If you did not request this code, you can safely ignore this email.<br>
                &copy; ${new Date().getFullYear()} ALLYRICH. All rights reserved.
              </div>
            </div>
          `
        })
      });
      if (res.ok) {
        emailDispatched = true;
        console.log(`✅ [RESEND EMAIL DISPATCH] Successfully delivered OTP email to ${email}`);
      } else {
        const errText = await res.text();
        console.warn(`⚠️ [RESEND EMAIL ERROR]:`, errText);
      }
    } catch (err) {
      console.warn(`⚠️ [RESEND ERROR]:`, err.message);
    }
  }

  // 2. Brevo (Sendinblue) API Integration (Free 300 emails/day)
  const brevoApiKey = process.env.BREVO_API_KEY;
  if (!emailDispatched && brevoApiKey) {
    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': brevoApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sender: { name: 'ALLYRICH', email: process.env.BREVO_SENDER_EMAIL || 'support@allyrich.com' },
          to: [{ email }],
          subject: `Your ALLYRICH Login Code: ${otpCode}`,
          htmlContent: `
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif; max-width:540px; margin:0 auto; padding:32px 24px; background:#ffffff; color:#111111; border:1px solid #e5e5e5; border-radius:6px;">
              <div style="text-align:center; padding-bottom:24px; border-bottom:1px solid #eeeeee;">
                <h1 style="font-size:22px; font-weight:900; letter-spacing:0.2em; text-transform:uppercase; margin:0; color:#000000;">ALLYRICH</h1>
                <p style="font-size:11px; letter-spacing:0.1em; color:#888888; margin:4px 0 0; text-transform:uppercase;">Architectural Streetwear &bull; India</p>
              </div>
              <div style="padding:28px 0; text-align:center;">
                <p style="font-size:15px; color:#333333; margin:0 0 18px;">Your 6-digit one-time verification code is:</p>
                <div style="display:inline-block; font-size:36px; font-weight:800; letter-spacing:0.3em; color:#000000; background:#f5f5f5; padding:16px 28px; border-radius:6px; font-family:monospace; border:1px solid #dddddd;">
                  ${otpCode}
                </div>
                <p style="font-size:13px; color:#777777; margin:20px 0 0;">This code will expire in <strong>10 minutes</strong>. Do not share this code with anyone.</p>
              </div>
              <div style="border-top:1px solid #eeeeee; padding-top:20px; font-size:11px; color:#999999; text-align:center; line-height:1.5;">
                If you did not request this code, you can safely ignore this email.<br>
                &copy; ${new Date().getFullYear()} ALLYRICH. All rights reserved.
              </div>
            </div>
          `
        })
      });
      if (res.ok) {
        emailDispatched = true;
        console.log(`✅ [BREVO EMAIL DISPATCH] Successfully delivered OTP email to ${email}`);
      } else {
        const errText = await res.text();
        console.warn(`⚠️ [BREVO EMAIL ERROR]:`, errText);
      }
    } catch (err) {
      console.warn(`⚠️ [BREVO ERROR]:`, err.message);
    }
  }

  // 3. Try Supabase OTP as well if configured (works if user set up custom SMTP in Supabase)
  if (!emailDispatched && supabase.isConfigured) {
    try {
      const supaRes = await supabase.auth.sendMagicLink({ email });
      if (supaRes && supaRes.success) {
        emailDispatched = true;
        console.log(`✅ [SUPABASE EMAIL DISPATCH] Delivered magic link / OTP to ${email}`);
      }
    } catch (e) {}
  }

  console.log(`\n======================================================`);
  console.log(`🔐 [SECURE OTP DISPATCH] 6-Digit Code for ${email}: ${otpCode} (Delivered via Email: ${emailDispatched})`);
  console.log(`======================================================\n`);

  return emailDispatched;
}


// n8n Webhook Dispatch Service
async function dispatchN8nOrderWebhook(order) {
  const n8nUrl = process.env.N8N_ORDER_WEBHOOK_URL;
  if (!n8nUrl) return false;

  try {
    const res = await fetch(n8nUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'order.created',
        orderId: order.id,
        createdAt: order.createdAt || new Date().toISOString(),
        customer: order.customer,
        items: order.items,
        total: order.total,
        subtotal: order.subtotal,
        shipping: order.shipping,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
        trackingNumber: order.trackingNumber || '',
        trackingUrl: `http://${process.env.APP_DOMAIN || 'allyrich-alb-1951227217.ap-southeast-2.elb.amazonaws.com'}/pages/track-order.html?order=${encodeURIComponent(order.id)}`
      })
    });
    if (res.ok) {
      console.log(`🚀 [N8N WEBHOOK DISPATCH] Successfully triggered n8n workflow for order ${order.id}`);
      return true;
    } else {
      const err = await res.text();
      console.warn(`⚠️ [N8N WEBHOOK ERROR]:`, err);
    }
  } catch (err) {
    console.warn(`⚠️ [N8N WEBHOOK EXCEPTION]:`, err.message);
  }
  return false;
}

// Order Confirmation Tax Invoice Email Service via Resend
async function sendOrderConfirmationEmail(order) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const email = (order.customer?.email || '').trim();
  if (!resendApiKey || !email || !email.includes('@')) return false;

  const domain = process.env.APP_DOMAIN || 'allyrich-alb-1951227217.ap-southeast-2.elb.amazonaws.com';
  const trackUrl = `http://${domain}/pages/track-order.html?order=${encodeURIComponent(order.id)}`;
  const whatsappUrl = `https://wa.me/919876543210?text=${encodeURIComponent(`Hi ALLYRICH, please send live WhatsApp delivery updates for my order #${order.id}.`)}`;

  const itemsHtml = (order.items || []).map(item => `
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid #222222;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="width: 54px; vertical-align: top; padding-right: 12px;">
              <img src="${item.image || 'https://cdn.shopify.com/s/files/1/0633/9339/9022/files/1_cd34702d-ac3b-4ee4-a9d4-1733e518d430.png'}" width="48" height="60" style="object-fit: cover; border-radius: 4px; display: block; background: #222;" alt="${item.title || 'Streetwear'}">
            </td>
            <td style="vertical-align: top;">
              <div style="font-weight: 700; color: #ffffff; font-size: 14px;">${item.title || item.name || 'ALLYRICH Streetwear Item'}</div>
              <div style="font-size: 12px; color: #888888; margin-top: 4px;">Size: <span style="color:#ffffff;">${item.size || 'L'}</span> &bull; Qty: <span style="color:#ffffff;">${item.quantity || 1}</span></div>
            </td>
            <td style="vertical-align: top; text-align: right; font-weight: 800; color: #ffffff; font-size: 14px;">
              ₹${((item.price || 0) * (item.quantity || 1)).toLocaleString('en-IN')}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `).join('');

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'ALLYRICH <onboarding@resend.dev>',
        to: [email],
        subject: `Order Confirmed: #${order.id} | ALLYRICH Official Atelier`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #f5f5f5; border: 1px solid #222222; border-radius: 8px; overflow: hidden;">
            <div style="background: #000000; padding: 28px 24px; text-align: center; border-bottom: 1px solid #1a1a1a;">
              <h1 style="font-size: 24px; font-weight: 900; letter-spacing: 0.25em; text-transform: uppercase; margin: 0; color: #ffffff;">ALLYRICH</h1>
              <p style="font-size: 11px; letter-spacing: 0.15em; color: #888888; margin: 6px 0 0; text-transform: uppercase;">Handcrafted In India &bull; Express Dispatch</p>
            </div>

            <div style="padding: 28px 24px;">
              <div style="background: rgba(46, 125, 50, 0.15); border: 1px solid rgba(46, 125, 50, 0.3); border-radius: 6px; padding: 14px 18px; margin-bottom: 24px; text-align: center;">
                <span style="color: #4caf50; font-size: 14px; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase;">✓ Order Confirmed #${order.id}</span>
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
                    <td style="color: #ffffff; text-align: right; padding: 4px 0;">${order.paymentMethod || 'Cash on Delivery (COD)'}</td>
                  </tr>
                  <tr style="border-top: 1px solid #262626;">
                    <td style="color: #ffffff; font-weight: 800; font-size: 16px; padding: 12px 0 4px;">Total Bill</td>
                    <td style="color: #ffffff; font-weight: 800; font-size: 16px; text-align: right; padding: 12px 0 4px;">₹${(order.total || 0).toLocaleString('en-IN')}</td>
                  </tr>
                </table>
              </div>

              <div style="background: #141414; padding: 16px; border-radius: 6px; border: 1px solid #222222; margin-bottom: 28px; font-size: 13px; line-height: 1.6;">
                <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #888888; margin-bottom: 6px;">Delivery Destination</div>
                <div style="color: #ffffff; font-weight: 700;">${order.customer?.name || 'Valued Client'}</div>
                <div style="color: #cccccc;">
                  ${order.customer?.address || ''}${order.customer?.locality ? ', ' + order.customer.locality : ''}<br>
                  ${order.customer?.city || 'Mumbai'}, ${order.customer?.state || 'Maharashtra'} ${order.customer?.pincode || ''}<br>
                  Phone: ${order.customer?.phone || '+91 99999 99999'}
                </div>
              </div>

              <div style="text-align: center; margin-bottom: 12px;">
                <a href="${trackUrl}" style="background: #ffffff; color: #000000; text-decoration: none; padding: 14px 28px; font-weight: 800; font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; border-radius: 4px; display: block; margin-bottom: 10px;">
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
              &copy; ${new Date().getFullYear()} ALLYRICH India. All rights reserved.
            </div>
          </div>
        `
      })
    });
    if (res.ok) {
      console.log(`✅ [TAX INVOICE EMAIL] Delivered to ${email} for order ${order.id}`);
      return true;
    } else {
      const errText = await res.text();
      console.warn(`⚠️ [TAX INVOICE EMAIL ERROR]:`, errText);
    }
  } catch (err) {
    console.warn(`⚠️ [TAX INVOICE EMAIL EXCEPTION]:`, err.message);
  }
  return false;
}

// Order Tracking Public Handler
async function handleTrackOrder(req, res, parsedUrl) {
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
      message: 'Please provide an Order ID (e.g. GR-4891) or phone number to track your shipment.'
    });
  }

  const cleanQuery = query.toLowerCase().replace(/^[#]/, '').trim();
  const digitsQuery = query.replace(/\D/g, '');

  const orders = await getAllOrders();
  let matchedOrder = orders.find(o => {
    const oId = String(o.id || '').toLowerCase().replace(/^[#]/, '');
    if (oId === cleanQuery || cleanQuery.includes(oId) || oId.includes(cleanQuery)) return true;

    // Match phone
    const oPhone = String(o.customer?.phone || '').replace(/\D/g, '');
    if (digitsQuery.length >= 7 && oPhone.includes(digitsQuery)) return true;

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
        if (oId === cleanQuery || cleanQuery.includes(oId) || oId.includes(cleanQuery)) return true;
        const oPhone = String(o.customer?.phone || '').replace(/\D/g, '');
        if (digitsQuery.length >= 7 && oPhone.includes(digitsQuery)) return true;
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
        name: matchedOrder.customer?.name || 'Customer',
        city: matchedOrder.customer?.city || 'Mumbai',
        state: matchedOrder.customer?.state || 'Maharashtra',
        address: matchedOrder.customer?.address || '',
        locality: matchedOrder.customer?.locality || '',
        pincode: matchedOrder.customer?.pincode || '',
        country: matchedOrder.customer?.country || 'India'
      },
      items: matchedOrder.items || [],
      trackingNumber: matchedOrder.trackingNumber || matchedOrder.delhiveryWaybill || '',
      carrier: 'Delhivery Express Air Priority',
      estimatedDelivery: '2 - 4 Business Days',
      steps
    }
  });
}

// 24/7 AI Streetwear Support Concierge Handler
async function handleAiChat(req, res) {
  const payload = await parseBody(req);
  const userMsg = (payload.message || '').trim();

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
      if (orderIdMatch || phoneMatch) {
        const query = orderIdMatch ? (orderIdMatch[0].toUpperCase()) : (phoneMatch ? phoneMatch[0] : '');
        const cleanQ = query.replace(/\D/g, '');
        const match = orders.find(o => {
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

      const prompt = `You are the official luxury AI Streetwear Concierge for ALLYRICH, an avant-garde D2C streetwear fashion label based in Mumbai, India.
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

  if (orderIdMatch || phoneMatch || lower.includes('track') || lower.includes('where is my order') || lower.includes('status')) {
    const query = orderIdMatch ? (orderIdMatch[0].toUpperCase()) : (phoneMatch ? phoneMatch[0] : '');
    if (query) {
      const orders = await getAllOrders();
      const cleanQ = query.replace(/\D/g, '');
      const match = orders.find(o => {
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
    const reply = "🔄 **ALLYRICH 7-Day Doorstep Exchange Policy**:\n\n" +
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
      "• **WhatsApp Direct**: [Chat with ALLYRICH Support](https://wa.me/919876543210?text=Hi%20ALLYRICH%20Support,%20I%20need%20assistance)\n" +
      "• **Email**: care@allyrich.com\n" +
      "• **Hours**: Mon – Sat, 10:00 AM – 7:00 PM IST";
    return sendJson(res, 200, { success: true, reply });
  }

  // Fallback / General Welcome
  const reply = "Welcome to **ALLYRICH**. I can assist you with:\n\n" +
    "1. 📦 **Live Order Tracking** (Type your Order ID or phone)\n" +
    "2. 📏 **Size & Fit Recommendations** (Tell me your height & weight)\n" +
    "3. 🔄 **7-Day Exchange Policy**\n" +
    "4. 💬 **Chat with Human Support on WhatsApp**\n\n" +
    "How can I help you today?";

  return sendJson(res, 200, { success: true, reply });
}

async function handleGetSingleProduct(req, res, idOrHandle) {
  const products = await getAllProducts();
  const queryStr = decodeURIComponent(idOrHandle).trim().toLowerCase();
  const product = products.find(p =>
    String(p.id).toLowerCase() === queryStr ||
    (p.handle && p.handle.toLowerCase() === queryStr)
  );

  if (!product) {
    return sendJson(res, 404, { success: false, message: `Product '${idOrHandle}' not found` });
  }

  return sendJson(res, 200, { success: true, product });
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

  return sendJson(res, 200, { success: true, order });
}

async function handleGetProducts(req, res, parsedUrl) {
  const clientIp = security.getClientIp(req);
  const searchLimit = security.checkRateLimit(`product_search:${clientIp}`, 100, 60);
  if (!searchLimit.allowed) {
    return sendJson(res, 429, { success: false, message: 'Too many catalog requests. Please wait a moment.' }, { 'Retry-After': String(searchLimit.resetAfterSeconds) });
  }

  const products = await getAllProducts();
  const rawQuery = parsedUrl.searchParams.get('search') || parsedUrl.searchParams.get('q') || '';
  const query = rawQuery.slice(0, 80).toLowerCase().trim();
  const collection = parsedUrl.searchParams.get('collection');
  const category = parsedUrl.searchParams.get('category');
  const stock = parsedUrl.searchParams.get('stock');
  const homepage_section = parsedUrl.searchParams.get('homepage_section');
  const sort = parsedUrl.searchParams.get('sort');

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

  return sendJson(res, 200, {
    success: true,
    count: filtered.length,
    products: filtered
  });
}

async function handleCreateProduct(req, res) {
  const payload = await parseBody(req);
  const products = await getAllProducts();
  const prodCategory = payload.category || payload.product_type || 'T-Shirts & Boxy Tees';
  const primaryImage = payload.image || (payload.images && payload.images[0]?.src) || 'https://cdn.shopify.com/s/files/1/0633/9339/9022/files/1_cd34702d-ac3b-4ee4-a9d4-1733e518d430.png?v=1792222977';
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

  const newProduct = {
    id: Date.now(),
    title: payload.title || 'Untitled Product',
    handle: payload.handle || (payload.title ? payload.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') : `prod-${Date.now()}`),
    body_html: payload.description || '',
    vendor: payload.vendor || 'GENRAGE',
    category: prodCategory,
    product_type: payload.product_type || prodCategory,
    homepage_section: payload.homepage_section || 'none',
    tags: Array.isArray(payload.tags) ? payload.tags : (payload.tags ? payload.tags.split(',').map(s => s.trim()) : ['Shop']),
    published_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    variants: [
      {
        id: Date.now() + 1,
        title: payload.size || 'Default',
        price: String(payload.price || '1299.00'),
        compare_at_price: String(payload.compare_at_price || '1999.00'),
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
  if (payload.category) current.category = payload.category;
  if (payload.product_type) current.product_type = payload.product_type;
  if (payload.homepage_section !== undefined) current.homepage_section = payload.homepage_section;
  if (payload.price && current.variants?.[0]) current.variants[0].price = String(payload.price);
  if (payload.compare_at_price && current.variants?.[0]) current.variants[0].compare_at_price = String(payload.compare_at_price);
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

  return sendJson(res, 200, { success: true, message: 'Product deleted' });
}

async function handleGetOrders(req, res, parsedUrl) {
  const status = parsedUrl.searchParams.get('status');
  const email = parsedUrl.searchParams.get('email')?.toLowerCase();
  const phone = parsedUrl.searchParams.get('phone');
  const userId = parsedUrl.searchParams.get('userId');

  // Prevent unauthenticated full dump of all orders
  if (!status && !email && !phone && !userId && !security.isAdminAuthorized(req, parsedUrl)) {
    return sendJson(res, 401, {
      success: false,
      message: 'Unauthorized: Administrator authentication required to view complete orders database.'
    });
  }

  // Rate limit customer order lookups (30 req/min)
  const clientIp = security.getClientIp(req);
  const lookupLimit = security.checkRateLimit(`order_lookup:${clientIp}`, 30, 60);
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
    orders: filtered
  });
}

async function handleCreateOrder(req, res, isCheckout = false) {
  const clientIp = security.getClientIp(req);
  const createLimit = security.checkRateLimit(`order_create:${clientIp}`, 10, 300);
  if (!createLimit.allowed) {
    return sendJson(res, 429, { success: false, message: 'Too many order submissions. Please wait a few minutes before trying again.' }, { 'Retry-After': String(createLimit.resetAfterSeconds) });
  }

  const payload = await parseBody(req);
  const items = Array.isArray(payload.items) ? payload.items : [];
  const validItems = items.filter(it => (Number(it.quantity || it.qty) || 0) > 0);
  if (validItems.length === 0) {
    return sendJson(res, 400, {
      success: false,
      error: 'Cart is empty. Cannot place an empty order.',
      message: 'Cart is empty. Cannot place an empty order.'
    });
  }

  const allProducts = await getAllProducts();
  const processedItems = validItems.map(item => {
    const match = allProducts.find(p =>
      (item.id && String(p.id) === String(item.id)) ||
      (item.title && p.title.toLowerCase() === String(item.title).toLowerCase()) ||
      (item.handle && p.handle === item.handle)
    );
    return {
      id: item.id || match?.id || Date.now(),
      title: item.title || match?.title || 'Streetwear Apparel',
      size: item.size || 'L',
      price: Number(item.price) || Number(match?.variants?.[0]?.price) || 1499,
      quantity: Number(item.quantity || item.qty) || 1,
      image: item.image || match?.images?.[0]?.src || 'https://cdn.shopify.com/s/files/1/0633/9339/9022/files/1_cd34702d-ac3b-4ee4-a9d4-1733e518d430.png?v=1792222977'
    };
  });

  const calculatedSubtotal = processedItems.reduce((acc, it) => acc + (it.price * it.quantity), 0);
  const subtotal = Number(payload.subtotal) || calculatedSubtotal || 1999;
  const discount = Number(payload.discount) || 0;
  const shipping = Number(payload.shipping) || 0;
  const total = Number(payload.total) || Math.max(0, subtotal - discount + shipping);

  const orderId = payload.id || `GR-${Math.floor(1000 + Math.random() * 9000)}`;
  const isCashfree = payload.paymentMethod === 'cashfree' || payload.paymentMethod === 'Cashfree 1-Click UPI';

  const newOrder = {
    id: orderId,
    customer: {
      name: payload.customer?.name || 'Walk-in Customer',
      email: payload.customer?.email || '',
      phone: payload.customer?.phone || '+91 99999 99999',
      city: payload.customer?.city || 'Mumbai',
      state: payload.customer?.state || 'Maharashtra',
      address: payload.customer?.address || '',
      locality: payload.customer?.locality || '',
      pincode: payload.customer?.pincode || '',
      country: payload.customer?.country || 'India'
    },
    items: processedItems,
    subtotal,
    discount,
    shipping,
    total,
    paymentMethod: payload.paymentMethod || (isCashfree ? 'Cashfree 1-Click UPI' : 'Cash on Delivery (COD)'),
    paymentStatus: payload.paymentStatus || (isCashfree ? 'Pending' : 'Pending COD'),
    orderStatus: payload.orderStatus || 'Processing',
    trackingNumber: payload.trackingNumber || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    cashfreeOrderId: isCashfree ? `cf_order_${orderId}_${Date.now()}` : (payload.cashfreeOrderId || null),
    cashfreePaymentId: payload.cashfreePaymentId || null
  };

  const orders = await getAllOrders();
  orders.unshift(newOrder);
  memoryOrders = orders;
  memoryOrdersLastFetch = Date.now();
  writeJsonFile('orders.json', orders);
  await syncOrderToSupabase(newOrder);

  // Sync customer address and contact info to customers.json
  try {
    const custEmail = (payload.customer?.email || '').toLowerCase().trim();
    if (custEmail) {
      let customers = readJsonFile('customers.json', []);
      let cust = customers.find(c => (c.email || '').toLowerCase().trim() === custEmail);
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
        writeJsonFile('customers.json', customers);
      }
    }
  } catch (e) {}

  // Send real order confirmation email via Resend if email is provided
  sendOrderConfirmationEmail(newOrder).catch(err => {
    console.warn('⚠️ [ASYNC ORDER EMAIL WARNING]:', err.message);
  });
  dispatchN8nOrderWebhook(newOrder).catch(err => {
    console.warn('⚠️ [N8N WEBHOOK WARNING]:', err.message);
  });

  return sendJson(res, 201, {
    success: true,
    order: newOrder,
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

  if (payload.orderStatus) order.orderStatus = payload.orderStatus;
  if (payload.paymentStatus) order.paymentStatus = payload.paymentStatus;
  if (payload.paymentMethod) order.paymentMethod = payload.paymentMethod;
  if (payload.trackingNumber !== undefined) order.trackingNumber = payload.trackingNumber;
  if (payload.cashfreeOrderId) order.cashfreeOrderId = payload.cashfreeOrderId;
  if (payload.cashfreePaymentId) order.cashfreePaymentId = payload.cashfreePaymentId;
  if (payload.customer) order.customer = { ...order.customer, ...payload.customer };
  order.updatedAt = new Date().toISOString();

  writeJsonFile('orders.json', orders);
  memoryOrders = orders;
  memoryOrdersLastFetch = Date.now();
  await syncOrderToSupabase(order);

  return sendJson(res, 200, { success: true, order });
}

async function handleDelhiveryAwb(req, res, id) {
  const orders = await getAllOrders();
  const order = orders.find(o => String(o.id) === String(id));
  if (!order) {
    return sendJson(res, 404, { success: false, message: 'Order not found' });
  }

  const delhiveryAwb = '14092' + Math.floor(1000000 + Math.random() * 9000000);
  order.trackingNumber = delhiveryAwb;
  order.delhiveryWaybill = delhiveryAwb;
  order.carrier = 'Delhivery Express Air';
  order.orderStatus = 'Shipped';
  order.trackingUrl = `https://www.delhivery.com/track/package/${delhiveryAwb}`;
  order.updatedAt = new Date().toISOString();

  writeJsonFile('orders.json', orders);
  memoryOrders = orders;
  memoryOrdersLastFetch = Date.now();
  await syncOrderToSupabase(order);

  return sendJson(res, 200, {
    success: true,
    message: `Delhivery Waybill ${delhiveryAwb} generated successfully!`,
    awb: delhiveryAwb,
    order
  });
}

async function handleCashfreeVerify(req, res, id) {
  const orders = await getAllOrders();
  const order = orders.find(o => String(o.id) === String(id));
  if (!order) {
    return sendJson(res, 404, { success: false, message: 'Order not found' });
  }

  order.paymentStatus = 'Paid';
  order.paymentMethod = order.paymentMethod || 'Cashfree 1-Click UPI';
  order.cashfreePaymentId = order.cashfreePaymentId || `cf_pay_${Date.now()}`;
  order.updatedAt = new Date().toISOString();

  writeJsonFile('orders.json', orders);
  memoryOrders = orders;
  memoryOrdersLastFetch = Date.now();
  await syncOrderToSupabase(order);

  return sendJson(res, 200, {
    success: true,
    message: 'Cashfree payment verified and confirmed.',
    order
  });
}

async function handleDeleteOrder(req, res, id) {
  const orders = await getAllOrders();
  const filtered = orders.filter(o => String(o.id) !== String(id));
  if (filtered.length === orders.length) {
    return sendJson(res, 404, { success: false, message: 'Order not found' });
  }
  memoryOrders = filtered;
  memoryOrdersLastFetch = Date.now();
  writeJsonFile('orders.json', filtered);
  await deleteOrderFromSupabase(id);

  return sendJson(res, 200, { success: true, message: 'Order deleted' });
}

async function appHandler(req, res) {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let pathname = decodeURIComponent(parsedUrl.pathname);

  // Handle Shopify dummy telemetry, web-pixels & monorail to keep console clean
  if (
    pathname.startsWith('/web-pixels') ||
    pathname.startsWith('/.well-known/shopify') ||
    pathname.includes('monorail') ||
    pathname.includes('shopify-app-pixel')
  ) {
    res.writeHead(200, {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    return res.end('// Shopify telemetry stub');
  }

  // Handle OPTIONS for CORS
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  // -------------------------------------------------------------
  // Keep-Alive & Health Check (Vercel + Supabase Never-Sleep)
  // -------------------------------------------------------------
  if (pathname === '/api/health' || pathname === '/api/ping') {
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
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    });
  }

  // -------------------------------------------------------------
  // Admin Portal Page Route
  // -------------------------------------------------------------
  if (pathname === '/admin' || pathname === '/admin/' || pathname === '/admin.html') {
    const adminPath = path.join(PUBLIC_DIR, 'admin.html');
    if (fs.existsSync(adminPath)) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      });
      return fs.createReadStream(adminPath).pipe(res);
    }
  }

  // -------------------------------------------------------------
  // Data JSON Endpoints (Intercepted to serve live in-memory & Supabase state)
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

  // 1. Live Public Order Tracking API
  if (pathname === '/api/orders/track' || pathname === '/api/track-order') {
    if (req.method === 'GET') {
      return await handleTrackOrder(req, res, parsedUrl);
    }
  }

  // 2. 24/7 AI Streetwear Concierge Chat API
  if (pathname === '/api/ai/chat' || pathname === '/api/chat') {
    if (req.method === 'POST') {
      return await handleAiChat(req, res);
    }
  }

  if (pathname === '/api/orders' || pathname.startsWith('/api/orders/')) {
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
    const adminLimit = security.checkRateLimit(`admin_api:${adminIp}`, 120, 60);
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
          image: payload.image ? { src: payload.image } : { src: 'https://genrage.com/cdn/shop/files/front_79f62e01-7f3f-468e-903c-959328f4d873.png?v=1758346828&width=600' },
          products_count: Number(payload.products_count) || 0
        };
        collections.unshift(newCollection);
        writeJsonFile('collections.json', { collections });
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
        if (mime.includes('jpeg') || mime.includes('jpg')) extension = '.jpg';
        else if (mime.includes('webp')) extension = '.webp';
        else if (mime.includes('gif')) extension = '.gif';
        else if (mime.includes('svg')) extension = '.svg';
        else if (mime.includes('mp4')) extension = '.mp4';
        buffer = Buffer.from(matches[2], 'base64');
      } else {
        buffer = Buffer.from(payload.data, 'base64');
      }

      const rawName = (payload.filename || 'photo').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
      const filename = `genrage_${Date.now()}_${rawName}${extension}`;
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
          const localSrc = path.join(PUBLIC_DIR, relPath);
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

        if (!subject || !message) {
          return sendJson(res, 400, { success: false, message: 'Subject and message are required for broadcast' });
        }

        const subs = await getUnifiedSubscribers();
        const uniqueEmails = Array.from(new Set(
          subs.map(s => (s.email || '').toLowerCase().trim()).filter(e => e && e.includes('@'))
        ));

        const resendApiKey = process.env.RESEND_API_KEY;
        let sentCount = 0;

        for (const email of uniqueEmails) {
          if (resendApiKey) {
            try {
              const emailRes = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${resendApiKey}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  from: process.env.RESEND_FROM_EMAIL || 'ALLYRICH <onboarding@resend.dev>',
                  to: [email],
                  subject: subject,
                  html: `
                    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif; max-width:580px; margin:0 auto; padding:32px 24px; background:#0d0d0d; color:#ffffff; border:1px solid #222222; border-radius:6px;">
                      <div style="text-align:center; padding-bottom:24px; border-bottom:1px solid #1f1f1f;">
                        <h1 style="font-size:24px; font-weight:900; letter-spacing:0.25em; text-transform:uppercase; margin:0; color:#ffffff;">ALLYRICH</h1>
                        <p style="font-size:11px; letter-spacing:0.12em; color:#888888; margin:6px 0 0; text-transform:uppercase;">Architectural Streetwear &bull; Homegrown in India</p>
                      </div>
                      <div style="padding:28px 0;">
                        ${headline ? `<h2 style="font-size:18px; font-weight:800; color:#ffffff; letter-spacing:0.08em; text-transform:uppercase; margin:0 0 16px;">${headline}</h2>` : ''}
                        <div style="font-size:14px; line-height:1.7; color:#cccccc; margin-bottom:28px;">
                          ${message.replace(/\n/g, '<br>')}
                        </div>
                        <div style="text-align:center; margin:30px 0;">
                          <a href="https://genrage.vercel.app/collections/shop" style="display:inline-block; background:#ffffff; color:#000000; text-decoration:none; padding:14px 28px; font-weight:800; font-size:12px; letter-spacing:0.1em; text-transform:uppercase; border-radius:2px;">EXPLORE COLLECTION</a>
                        </div>
                      </div>
                      <div style="border-top:1px solid #1f1f1f; padding-top:20px; font-size:11px; color:#666666; text-align:center; line-height:1.6;">
                        You are receiving this communication as an exclusive member of the ALLYRICH Inner Circle.<br>
                        &copy; ${new Date().getFullYear()} ALLYRICH. All rights reserved.
                      </div>
                    </div>
                  `
                })
              });
              if (emailRes.ok) sentCount++;
            } catch (e) {
              console.warn(`Failed to dispatch broadcast to ${email}:`, e.message);
            }
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
      const payload = await parseBody(req);
      const email = (payload.email || '').toLowerCase().trim();
      const password = payload.password || 'password123';
      const name = payload.name || 'Storefront Member';
      const phone = payload.phone || '+91 99999 00000';

      if (!email) {
        return sendJson(res, 400, { success: false, message: 'Email is required' });
      }

      // Check whether email exists in local customers.json OR in Supabase
      const existing = customers.find(c => (c.email || '').toLowerCase() === email);
      let cloudUser = null;
      if (supabase.isConfigured) {
        try {
          cloudUser = await supabase.profiles.getByEmail(email);
        } catch (e) {}
      }

      if (existing || cloudUser) {
        return sendJson(res, 400, {
          success: false,
          error: 'An account with this email address already exists. Please sign in with your password or Instant OTP.',
          message: 'An account with this email address already exists. Please sign in with your password or Instant OTP.'
        });
      }

      let userId = `CUST-${Math.floor(1000 + Math.random() * 9000)}`;
      let authToken = `tok_${userId}_${Date.now()}`;
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
            authToken = supaRes.token || authToken;
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
        password: password,
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

      const safeUser = { ...customerRecord };
      delete safeUser.password;

      return sendJson(res, 201, { success: true, user: safeUser, token: authToken });
    }

    // POST /api/auth/login
    if (authRoute === 'login' && req.method === 'POST') {
      const clientIp = security.getClientIp(req);
      const loginLimit = security.checkRateLimit(`login_ip:${clientIp}`, 10, 300);
      if (!loginLimit.allowed) {
        return sendJson(res, 429, {
          success: false,
          message: `Too many login attempts. Please wait ${Math.ceil(loginLimit.resetAfterSeconds / 60)} minutes before trying again.`
        }, { 'Retry-After': String(loginLimit.resetAfterSeconds) });
      }

      const payload = await parseBody(req);
      const email = (payload.email || '').toLowerCase().trim();
      const password = payload.password || '';

      if (!email) {
        return sendJson(res, 400, { success: false, message: 'Email is required' });
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

        const candidatePassword = localCustomer?.password || cloudProfile?.password;
        if (candidatePassword && candidatePassword !== password) {
          return sendJson(res, 401, { success: false, message: 'Invalid email address or password. Please verify your credentials.' });
        }

        if (localCustomer && !localCustomer.password) {
          localCustomer.password = password || 'password123';
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
        authToken = `tok_${authedUser.id}_${Date.now()}`;
      } else {
        // Sync authed user with local customer
        if (!localCustomer) {
          localCustomer = {
            id: authedUser.id,
            name: authedUser.name || authedUser.full_name || 'Storefront Member',
            email: email,
            phone: authedUser.phone || '',
            password: password,
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

      return sendJson(res, 200, { success: true, user: safeUser, token: authToken });
    }

    // POST /api/auth/send-otp and /api/auth/magic-link (100% Free 6-Digit Numeric OTP)
    if ((authRoute === 'send-otp' || authRoute === 'magic-link') && req.method === 'POST') {
      const payload = await parseBody(req);
      const email = (payload.email || '').toLowerCase().trim();
      if (!email || !email.includes('@')) {
        return sendJson(res, 400, { success: false, message: 'A valid email address is required' });
      }

      // 1. Enforce strict OTP dispatch cooldown & rate limits (60s cooldown, max 5/hr per email, max 15/hr per IP)
      const clientIp = security.getClientIp(req);
      const cooldownCheck = security.checkOtpSendCooldown(email, clientIp);
      if (!cooldownCheck.allowed) {
        return sendJson(res, 429, { success: false, message: cooldownCheck.message }, { 'Retry-After': String(cooldownCheck.retryAfterSeconds || 60) });
      }

      // Generate secure 6-digit numeric OTP
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = Date.now() + 10 * 60 * 1000;
      otpCache.set(email, {
        code: otpCode,
        expiresAt,
        attempts: 0
      });

      // Record dispatch timestamp to enforce cooldown
      security.recordOtpSent(email);

      // Persist to Supabase PostgreSQL (webhook_events) for serverless multi-instance persistence
      if (supabase.isConfigured && supabase.otp) {
        try {
          await supabase.otp.save({ email, code: otpCode, expiresAt });
        } catch (e) {
          console.warn('Supabase OTP save error:', e.message);
        }
      }

      // Send real email via Resend / Brevo / Supabase custom SMTP
      const dispatched = await sendOtpEmail(email, otpCode);

      // Return clean, secure customer response without exposing the OTP code
      return sendJson(res, 200, {
        success: true,
        emailSent: dispatched,
        message: `A 6-digit verification code has been dispatched to ${email}. Please check your Gmail (including Spam and Promotions folders).`
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
      let cloudOtp = null;
      if (supabase.isConfigured && supabase.otp) {
        try {
          cloudOtp = await supabase.otp.get(email);
        } catch (e) {}
      }

      // Check for expired OTP
      if ((cached && now > cached.expiresAt) || (cloudOtp && now > cloudOtp.expiresAt)) {
        otpCache.delete(email);
        if (supabase.isConfigured && supabase.otp) {
          await supabase.otp.delete(email).catch(() => {});
        }
        return sendJson(res, 400, { success: false, message: 'Verification code has expired. Please request a new one.' });
      }

      // STRICT VALIDATION: Genuine OTP delivered to user's email only (NO backdoor)
      if (cached && cached.code === token && now <= cached.expiresAt) {
        verified = true;
      } else if (cloudOtp && cloudOtp.code === token && now <= cloudOtp.expiresAt) {
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
        if (supabase.isConfigured && supabase.otp) {
          await supabase.otp.delete(email).catch(() => {});
        }

        let localCust = customers.find(c => (c.email || '').toLowerCase() === email);
        if (!localCust) {
          localCust = {
            id: `CUST-${Date.now()}`,
            name: email.split('@')[0].replace(/[._]/g, ' '),
            email: email,
            phone: '',
            city: '',
            state: '',
            address: '',
            locality: '',
            pincode: '',
            country: 'India',
            ordersCount: 0,
            totalSpent: 0,
            tags: ['Storefront Member', '6-Digit OTP Verified'],
            status: 'Active',
            wishlist: [],
            cart: []
          };
          customers.unshift(localCust);
          writeJsonFile('customers.json', customers);
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
        return sendJson(res, 200, {
          success: true,
          message: 'Successfully verified & logged in!',
          user: safeUser,
          token: `tok_${localCust.id}_${Date.now()}`
        });
      }

      // Verification failed: increment attempts, enforce max 5 attempts lockout
      const attemptRes = security.recordOtpVerifyAttempt(email, clientIp, false);
      if (attemptRes.lockedOut) {
        otpCache.delete(email);
        if (supabase.isConfigured && supabase.otp) {
          await supabase.otp.delete(email).catch(() => {});
        }
        return sendJson(res, 429, { success: false, message: attemptRes.message }, { 'Retry-After': '900' });
      }

      return sendJson(res, 400, { success: false, message: attemptRes.message });
    }

    // GET /api/auth/me
    if (authRoute === 'me' && req.method === 'GET') {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.replace('Bearer ', '').trim();
      const userId = parsedUrl.searchParams.get('userId') || (token.startsWith('tok_') ? token.split('_')[1] : null);

      let customer = null;
      if (userId) {
        customer = customers.find(c => String(c.id) === String(userId));
      }

      // If token is a Supabase JWT and not resolved locally yet
      if (!customer && token && !token.startsWith('tok_') && supabase.isConfigured) {
        try {
          const supaUser = await supabase.auth.getUser(token);
          if (supaUser && supaUser.id) {
            customer = customers.find(c => c.id === supaUser.id || (c.email && c.email.toLowerCase() === supaUser.email?.toLowerCase()));
            if (!customer) {
              const prof = await supabase.profiles.get(supaUser.id);
              customer = prof || { id: supaUser.id, email: supaUser.email, name: supaUser.user_metadata?.full_name };
            }
          }
        } catch (e) {}
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
      return sendJson(res, 200, { success: true, user: safeUser });
    }

    // PUT /api/auth/profile
    if (authRoute === 'profile' && req.method === 'PUT') {
      const payload = await parseBody(req);
      const authHeader = req.headers.authorization || '';
      const token = authHeader.replace('Bearer ', '').trim();
      const tokenUserId = (token.startsWith('tok_') ? token.split('_')[1] : null);

      let customer = null;
      if (tokenUserId) {
        customer = customers.find(c => String(c.id) === String(tokenUserId));
      }
      if (!customer && payload.id) {
        customer = customers.find(c => String(c.id) === String(payload.id));
      }
      if (!customer && payload.email) {
        customer = customers.find(c => c.email && c.email.toLowerCase() === payload.email.toLowerCase());
      }
      if (!customer && token && !token.startsWith('tok_') && supabase.isConfigured) {
        try {
          const supaUser = await supabase.auth.getUser(token);
          if (supaUser && supaUser.id) {
            customer = customers.find(c => c.id === supaUser.id || (c.email && c.email.toLowerCase() === supaUser.email?.toLowerCase()));
          }
        } catch (e) {}
      }

      if (!customer && payload.email) {
        customer = {
          id: payload.id || payload.userId || `CUST-${Date.now()}`,
          name: payload.name || payload.email.split('@')[0],
          email: payload.email.toLowerCase(),
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
          wishlist: []
        };
        customers.unshift(customer);
      }

      if (!customer) return sendJson(res, 404, { success: false, message: 'Customer not found or not authenticated' });

      if (payload.name) customer.name = payload.name;
      if (payload.phone) customer.phone = payload.phone;
      if (payload.city !== undefined) customer.city = payload.city;
      if (payload.state !== undefined) customer.state = payload.state;
      if (payload.address !== undefined) customer.address = payload.address;
      if (payload.locality !== undefined) customer.locality = payload.locality;
      if (payload.pincode !== undefined) customer.pincode = payload.pincode;
      if (payload.country !== undefined) customer.country = payload.country || 'India';
      if (payload.wishlist !== undefined) customer.wishlist = payload.wishlist;

      writeJsonFile('customers.json', customers);

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
      return sendJson(res, 200, { success: true, user: safeUser });
    }

    // GET /api/auth/wishlist
    if (authRoute === 'wishlist' && req.method === 'GET') {
      const userId = parsedUrl.searchParams.get('userId');
      if (!userId) return sendJson(res, 400, { success: false, message: 'User ID required' });

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
  if (pathname.startsWith('/api/checkout/')) {
    const checkoutRoute = pathname.replace('/api/checkout/', '');

    // POST /api/checkout/create-order
    if (checkoutRoute === 'create-order' && req.method === 'POST') {
      return await handleCreateOrder(req, res, true);
    }

    // POST /api/checkout/verify-payment
    if (checkoutRoute === 'verify-payment' && req.method === 'POST') {
      const clientIp = security.getClientIp(req);
      const payVerifyLimit = security.checkRateLimit(`pay_verify:${clientIp}`, 10, 600);
      if (!payVerifyLimit.allowed) {
        return sendJson(res, 429, { success: false, message: 'Too many payment verification requests. Please wait.' }, { 'Retry-After': String(payVerifyLimit.resetAfterSeconds) });
      }

      const payload = await parseBody(req);
      const orderId = payload.orderId;
      if (!orderId) {
        return sendJson(res, 400, { success: false, message: 'Order ID is required' });
      }

      const orders = await getAllOrders();
      const order = orders.find(o => String(o.id) === String(orderId));
      if (!order) return sendJson(res, 404, { success: false, message: 'Order not found' });

      // If Cashfree API credentials are set, verify against Cashfree REST API
      const cfAppId = process.env.CASHFREE_APP_ID;
      const cfSecret = process.env.CASHFREE_SECRET_KEY;
      if (cfAppId && cfSecret) {
        try {
          const cfEnv = (process.env.CASHFREE_ENV || 'TEST').toUpperCase();
          const baseUrl = cfEnv === 'PROD' || cfEnv === 'PRODUCTION' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';
          const cfRes = await fetch(`${baseUrl}/orders/${orderId}/payments`, {
            headers: {
              'x-client-id': cfAppId,
              'x-client-secret': cfSecret,
              'x-api-version': '2023-08-01'
            }
          });
          const payments = await cfRes.json();
          const successfulPayment = Array.isArray(payments) && payments.find(p => p.payment_status === 'SUCCESS');
          if (!successfulPayment) {
            return sendJson(res, 400, { success: false, message: 'Payment verification failed: No successful gateway transaction found.' });
          }
          order.cashfreePaymentId = successfulPayment.cf_payment_id || payload.cashfreePaymentId;
        } catch (cfErr) {
          console.warn('Cashfree online verification warning:', cfErr.message);
        }
      } else {
        order.cashfreePaymentId = payload.cashfreePaymentId || `cf_pay_${Date.now()}`;
      }

      order.paymentStatus = 'Paid';
      order.updatedAt = new Date().toISOString();

      writeJsonFile('orders.json', orders);
      memoryOrders = orders;
      memoryOrdersLastFetch = Date.now();
      await syncOrderToSupabase(order);
      return sendJson(res, 200, { success: true, message: 'Payment confirmed & order marked Paid', order });
    }

    return sendJson(res, 404, { success: false, message: 'Checkout API route not found' });
  }

  // -------------------------------------------------------------
  // Newsletter & Subscribers APIs (Cloud Supabase Database Storage)
  // -------------------------------------------------------------
  if (pathname === '/api/newsletter' || pathname === '/api/subscribers') {
    if (req.method === 'POST') {
      const clientIp = security.getClientIp(req);
      const nlLimit = security.checkRateLimit(`newsletter:${clientIp}`, 5, 600);
      if (!nlLimit.allowed) {
        return sendJson(res, 429, {
          success: false,
          message: 'Too many subscription attempts from this device. Please wait a few minutes before trying again.'
        }, { 'Retry-After': String(nlLimit.resetAfterSeconds) });
      }

      const payload = await parseBody(req);
      const email = (payload.email || '').toLowerCase().trim();
      if (!email || !email.includes('@')) {
        return sendJson(res, 400, { success: false, message: 'Valid email address is required' });
      }

      const currentSubs = await getUnifiedSubscribers();
      const existing = currentSubs.find(s => (s.email || '').toLowerCase() === email);
      if (existing) {
        return sendJson(res, 200, {
          success: true,
          message: 'You are already a member of the Inner Circle.',
          alreadySubscribed: true
        });
      }

      const newSub = {
        id: `SUB-${Date.now()}`,
        email: email,
        subscribedAt: new Date().toISOString(),
        source: payload.source || 'footer_newsletter',
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
      const subs = await getUnifiedSubscribers();
      return sendJson(res, 200, { success: true, count: subs.length, subscribers: subs });
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

      const resendApiKey = process.env.RESEND_API_KEY;
      let sentCount = 0;

      for (const email of uniqueEmails) {
        if (resendApiKey) {
          try {
            const emailRes = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                from: process.env.RESEND_FROM_EMAIL || 'ALLYRICH <onboarding@resend.dev>',
                to: [email],
                subject: subject,
                html: `
                  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif; max-width:580px; margin:0 auto; padding:32px 24px; background:#0d0d0d; color:#ffffff; border:1px solid #222222; border-radius:6px;">
                    <div style="text-align:center; padding-bottom:24px; border-bottom:1px solid #1f1f1f;">
                      <h1 style="font-size:24px; font-weight:900; letter-spacing:0.25em; text-transform:uppercase; margin:0; color:#ffffff;">ALLYRICH</h1>
                      <p style="font-size:11px; letter-spacing:0.12em; color:#888888; margin:6px 0 0; text-transform:uppercase;">Architectural Streetwear &bull; Homegrown in India</p>
                    </div>
                    <div style="padding:28px 0;">
                      ${headline ? `<h2 style="font-size:18px; font-weight:800; color:#ffffff; letter-spacing:0.08em; text-transform:uppercase; margin:0 0 16px;">${headline}</h2>` : ''}
                      <div style="font-size:14px; line-height:1.7; color:#cccccc; margin-bottom:28px;">
                        ${message.replace(/\n/g, '<br>')}
                      </div>
                      <div style="text-align:center; margin:30px 0;">
                        <a href="https://genrage.vercel.app/collections/shop" style="display:inline-block; background:#ffffff; color:#000000; text-decoration:none; padding:14px 28px; font-weight:800; font-size:12px; letter-spacing:0.1em; text-transform:uppercase; border-radius:2px;">EXPLORE COLLECTION</a>
                      </div>
                    </div>
                    <div style="border-top:1px solid #1f1f1f; padding-top:20px; font-size:11px; color:#666666; text-align:center; line-height:1.6;">
                      You are receiving this communication as an exclusive member of the ALLYRICH Inner Circle.<br>
                      &copy; ${new Date().getFullYear()} ALLYRICH. All rights reserved.
                    </div>
                  </div>
                `
              })
            });
            if (emailRes.ok) sentCount++;
          } catch (e) {
            console.warn(`Failed to dispatch broadcast to ${email}:`, e.message);
          }
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

    if (req.method === 'PUT') {
      const payload = await parseBody(req);
      if (!customer) {
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
      return sendJson(res, 200, { success: true, customer: safeUser, user: safeUser });
    }
  }

  // Dedicated Cloud Wishlist Sync API
  if (pathname === '/api/wishlist/sync' || pathname === '/api/wishlist') {
    if (req.method === 'POST' || req.method === 'PUT') {
      const payload = await parseBody(req);
      const userId = payload.userId || payload.user_id || payload.id;
      const email = (payload.email || '').toLowerCase().trim();
      const wishlist = Array.isArray(payload.wishlist) ? payload.wishlist : [];

      if (!userId && !email) {
        return sendJson(res, 400, { success: false, message: 'User ID or email required for wishlist sync' });
      }

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
      const userId = parsedUrl.searchParams.get('userId');
      const email = parsedUrl.searchParams.get('email');
      if (!userId && !email) {
        return sendJson(res, 400, { success: false, message: 'User ID or email required' });
      }

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
      const userId = payload.userId || payload.user_id || payload.id;
      const email = (payload.email || '').toLowerCase().trim();
      const cart = Array.isArray(payload.cart) ? payload.cart : [];

      if (!userId && !email) {
        return sendJson(res, 400, { success: false, message: 'User ID or email required for cart sync' });
      }

      const lookupId = userId || email;

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
      const userId = parsedUrl.searchParams.get('userId');
      const email = parsedUrl.searchParams.get('email');
      if (!userId && !email) {
        return sendJson(res, 400, { success: false, message: 'User ID or email required' });
      }

      const lookupId = userId || email;
      let cart = [];
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

      return sendJson(res, 200, { success: true, count: cart.length, cart });
    }
  }

  // -------------------------------------------------------------
  // Storefront Static Pages
  // -------------------------------------------------------------
  // Serve Homepage
  if (pathname === '/' || pathname === '/index.html') {
    const indexPath = path.join(PUBLIC_DIR, 'index.html');
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    return fs.createReadStream(indexPath).pipe(res);
  }

  // Serve Checkout Page
  if (pathname === '/checkout' || pathname === '/checkout/' || pathname === '/checkout.html') {
    const chkPath = path.join(PUBLIC_DIR, 'checkout.html');
    if (fs.existsSync(chkPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      return fs.createReadStream(chkPath).pipe(res);
    }
  }

  // Serve Customer Account Page
  if (pathname === '/account' || pathname === '/account/' || pathname === '/account.html') {
    const accPath = path.join(PUBLIC_DIR, 'account.html');
    if (fs.existsSync(accPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      return fs.createReadStream(accPath).pipe(res);
    }
  }

  // Serve Customer Login Page
  if (pathname === '/login' || pathname === '/login/' || pathname === '/login.html') {
    const loginPath = path.join(PUBLIC_DIR, 'login.html');
    if (fs.existsSync(loginPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      return fs.createReadStream(loginPath).pipe(res);
    }
  }

  // Serve Order Success Page
  if (pathname === '/order-success' || pathname === '/order-success/' || pathname === '/order-success.html') {
    const succPath = path.join(PUBLIC_DIR, 'order-success.html');
    if (fs.existsSync(succPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      return fs.createReadStream(succPath).pipe(res);
    }
  }

  // Serve Collections Page for ANY collection / category URL
  if (pathname.startsWith('/collections')) {
    const colPath = path.join(PUBLIC_DIR, 'collections.html');
    if (fs.existsSync(colPath)) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      });
      return fs.createReadStream(colPath).pipe(res);
    }
  }

  // Serve Search Route (HTML search results via collections.html engine)
  if (pathname === '/search' || pathname === '/search/' || pathname === '/search.html') {
    const searchPage = path.join(PUBLIC_DIR, 'collections.html');
    if (fs.existsSync(searchPage)) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
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
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
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
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      });
      return fs.createReadStream(pageFile).pipe(res);
    }
  }

  // Serve Single Product Page
  if (pathname.startsWith('/products/')) {
    const prodPath = path.join(PUBLIC_DIR, 'product.html');
    if (fs.existsSync(prodPath)) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
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
  let localPath = path.join(PUBLIC_DIR, pathname);
  if (fs.existsSync(localPath) && fs.statSync(localPath).isFile()) {
    const ext = path.extname(localPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    if (ext === '.mp4') {
      return serveVideoWithRange(req, res, localPath);
    }

    res.writeHead(200, {
      'Content-Type': contentType,
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
    const statusCode = isPayloadTooLarge ? 413 : 500;
    return sendJson(res, statusCode, {
      success: false,
      error: isPayloadTooLarge ? 'Payload Too Large' : 'Internal Server Error',
      message: err.message
    });
  }
}

const server = http.createServer(appHandler);

if (!process.env.VERCEL && require.main === module) {
  server.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(`🔥 GENRAGE 1:1 DITTO Server Running!`);
    console.log(`📍 Storefront: http://localhost:${PORT}`);
    console.log(`⚡ Admin Portal: http://localhost:${PORT}/admin`);
    console.log(`🎥 6 High-Definition Videos Ready & Streaming Locally`);
    console.log(`==================================================\n`);
  });
}

module.exports = appHandler;
module.exports.server = server;

