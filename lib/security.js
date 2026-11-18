function cleanText(value, maxLength = 255) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLength);
}

/**
 * ALLEYRICH Application Security & Abuse Prevention Engine
 * 
 * Centralized, production-grade security module providing:
 * 1. Safe Client IP Resolution (anti-spoofing)
 * 2. Multi-Tier Sliding Window Rate Limiting
 * 3. 6-Digit OTP Cooldown & Brute-Force Lockout Guard
 * 4. Admin API Authentication Guard
 * 5. Customer PII & IDOR Access Control
 * 6. SSRF Protection & Payload Size Guards
 */

const url = require('url');
const crypto = require('crypto');
const net = require('net');

let totp = null;
try { totp = require('./totp.js'); } catch (_) {}

let redis = null;
try {
  redis = require('./redis.js');
} catch (_) {}


// ── Phase 2 Configuration & Security Constants ──
const CUSTOMER_SESSION_IDLE_MS = 7 * 24 * 60 * 60 * 1000;      // 7 days idle
const CUSTOMER_SESSION_ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days absolute
const ADMIN_SESSION_IDLE_MS = 30 * 60 * 1000;             // 30 minutes idle timeout             // 2 hours idle
const ADMIN_SESSION_ABSOLUTE_MS = 12 * 60 * 60 * 1000;         // 12 hours absolute
const GLOBAL_OTP_LIMIT_PER_MINUTE = Math.max(1, parseInt(process.env.GLOBAL_OTP_LIMIT_PER_MINUTE || '60', 10));

let dbModule = null;
try {
  dbModule = require('./db.js');
} catch (_) {}

/**
 * Hash an OTP code at rest using HMAC-SHA256
 */
function hashOtpCode(code) {
  return crypto.createHmac('sha256', customerSessionSecret).update(String(code).trim()).digest('hex');
}

/**
 * Constant-time comparison for OTP verification
 */
function compareOtpCode(submittedCode, storedHash) {
  if (!submittedCode || !storedHash) return false;
  const inputHash = hashOtpCode(submittedCode);
  const bufInput = Buffer.from(inputHash);
  const bufStored = Buffer.from(String(storedHash));
  if (bufInput.length !== bufStored.length) return false;
  return crypto.timingSafeEqual(bufInput, bufStored);
}

/**
 * Parse Cookie header into a key-value object
 */
function parseCookies(req) {
  const list = {};
  const cookieHeader = req?.headers?.cookie;
  if (!cookieHeader) return list;

  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    const name = parts.shift().trim();
    const value = decodeURIComponent(parts.join('=')).trim();
    if (name) list[name] = value;
  });
  return list;
}

/**
 * Sets a hardened HTTP-only Session Cookie
 */
function setSessionCookie(res, cookieName, token, maxAgeSeconds, isStrict = false, req = null) {
  const isProd = process.env.NODE_ENV === 'production';
  const isHttps = isProd || (req && (req.headers['x-forwarded-proto'] === 'https' || req.socket?.encrypted));
  
  // Use __Host- prefix in production HTTPS for root-path host-locked cookies
  let finalName = cookieName;
  if (isHttps && isProd && !cookieName.startsWith('__Host-')) {
    finalName = `__Host-${cookieName}`;
  }

  const parts = [
    `${finalName}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${Math.floor(maxAgeSeconds)}`,
    'HttpOnly',
    `SameSite=${isStrict ? 'Strict' : 'Lax'}`
  ];
  if (isHttps) {
    parts.push('Secure');
  }

  const existing = res.getHeader('Set-Cookie');
  const cookieStr = parts.join('; ');
  if (!existing) {
    res.setHeader('Set-Cookie', cookieStr);
  } else if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, cookieStr]);
  } else {
    res.setHeader('Set-Cookie', [existing, cookieStr]);
  }
  return finalName;
}

/**
 * Clears a session cookie
 */
function clearSessionCookie(res, cookieName) {
  const names = [cookieName, `__Host-${cookieName}`];
  names.forEach(name => {
    const cookieStr = `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
    const existing = res.getHeader('Set-Cookie');
    if (!existing) {
      res.setHeader('Set-Cookie', cookieStr);
    } else if (Array.isArray(existing)) {
      res.setHeader('Set-Cookie', [...existing, cookieStr]);
    } else {
      res.setHeader('Set-Cookie', [existing, cookieStr]);
    }
  });
}

/**
 * CSRF Protection Guard for State-Changing Requests (POST, PUT, DELETE, PATCH)
 */
function verifyCsrf(req) {
  if (process.env.CSRF_PROTECTION_ENABLED === 'false') {
    return { valid: true };
  }

  const method = (req.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return { valid: true };
  }

  // Exempt webhooks from CSRF (they use HMAC signatures)
  const reqUrl = req.url || '';
  if (reqUrl.startsWith('/api/webhooks/') || reqUrl.startsWith('/api/delhivery/webhook')) {
    return { valid: true };
  }

  // 1. Sec-Fetch-Site browser barrier
  const fetchSite = req.headers['sec-fetch-site'];
  if (fetchSite === 'cross-site') {
    return { valid: false, message: 'CSRF Protection: Cross-site state modification rejected.' };
  }

  // 2. Origin / Referer host match
  const origin = req.headers['origin'];
  const referer = req.headers['referer'];
  const candidateUrl = origin || referer;

  if (candidateUrl) {
    try {
      const parsed = new URL(candidateUrl);
      const host = parsed.host.toLowerCase();
      const serverHost = (req.headers['host'] || '').toLowerCase();
      const appDomain = (process.env.APP_DOMAIN || '').toLowerCase();
      const appOrigin = process.env.APP_ORIGIN ? new URL(process.env.APP_ORIGIN).host.toLowerCase() : '';

      const isAllowed = host === serverHost ||
        (appDomain && host.endsWith(appDomain)) ||
        (appOrigin && host === appOrigin) ||
        host.startsWith('localhost') ||
        host.startsWith('127.0.0.1');

      if (!isAllowed) {
        return { valid: false, message: `CSRF Protection: Untrusted Origin '${host}' rejected.` };
      }
    } catch (_) {
      return { valid: false, message: 'CSRF Protection: Malformed Origin header.' };
    }
  }

  return { valid: true };
}

/**
 * Server-Side Cloudflare Turnstile Verification
 */
async function verifyTurnstileToken(token, clientIp = '') {
  if (process.env.TURNSTILE_ENABLED !== 'true') {
    return { success: true };
  }

  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  const failMode = process.env.TURNSTILE_FAIL_MODE || 'open';

  if (!secretKey) {
    return { success: failMode === 'open', message: failMode === 'open' ? 'Bypassed (no key)' : 'Turnstile unconfigured' };
  }

  if (!token) {
    return {
      success: failMode === 'open',
      message: 'Captcha verification token is required.'
    };
  }

  try {
    const postData = new URLSearchParams({
      secret: secretKey,
      response: token,
      remoteip: clientIp || ''
    }).toString();

    const https = require('https');
    const result = await new Promise((resolve, reject) => {
      const turnReq = https.request('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 4000
      }, turnRes => {
        let body = '';
        turnRes.on('data', chunk => body += chunk);
        turnRes.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      });
      turnReq.on('error', reject);
      turnReq.on('timeout', () => { turnReq.destroy(); reject(new Error('Turnstile timeout')); });
      turnReq.write(postData);
      turnReq.end();
    });

    return {
      success: Boolean(result && result.success),
      message: result?.success ? 'Verified' : 'Captcha challenge failed'
    };
  } catch (err) {
    console.warn('Turnstile verification error:', err.message);
    return {
      success: failMode === 'open',
      message: failMode === 'open' ? 'Turnstile error (fail-open)' : 'Captcha service unavailable'
    };
  }
}

// In-memory sliding-window cache for ultra-fast local checks
const rateLimitBuckets = new Map();
const otpAttemptsMap = new Map();
const otpCooldownMap = new Map();

// Signed customer sessions replace the old unsigned `tok_<id>_<timestamp>`
// format, which allowed anyone to impersonate another customer.
const customerSessionSecret = process.env.AUTH_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const CUSTOMER_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Creates a cryptographically random 256-bit Customer Session Token.
 * Stores ONLY the SHA-256 hash server-side in Redis & PostgreSQL.
 */
async function createCustomerSessionAsync(userId, email, req = null) {
  const rawToken = 'ar_usr_' + crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const now = Date.now();
  const idleExpiresAt = new Date(now + CUSTOMER_SESSION_IDLE_MS);
  const absoluteExpiresAt = new Date(now + CUSTOMER_SESSION_ABSOLUTE_MS);
  const ip = req ? getClientIp(req) : null;
  const userAgent = req ? cleanText(req.headers['user-agent'] || '', 200) : null;

  const sessionData = {
    userId: String(userId),
    email: String(email || '').toLowerCase().trim(),
    tokenHash,
    ip,
    userAgent,
    lastActiveAt: now,
    idleExpiresAt: idleExpiresAt.getTime(),
    absoluteExpiresAt: absoluteExpiresAt.getTime()
  };

  // 1. Persist to Redis (TTL = 7 days idle)
  if (redis && typeof redis.cacheSet === 'function') {
    await redis.cacheSet(`session:${tokenHash}`, sessionData, Math.floor(CUSTOMER_SESSION_IDLE_MS / 1000));
  }

  // 2. Persist to PostgreSQL customer_sessions table if configured
  if (dbModule && dbModule.isConfigured && dbModule.sessions) {
    try {
      await dbModule.sessions.create({
        id: `sess_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        userId: String(userId),
        email: String(email || '').toLowerCase().trim(),
        tokenHash,
        ip,
        userAgent,
        idleExpiresAt,
        absoluteExpiresAt
      });
    } catch (_) {}
  }

  // 3. File-backed persistent fallback for multi-worker / cluster mode
  try {
    const sessPath = path.join(__dirname, '..', 'data', 'sessions.json');
    let diskSessions = {};
    if (fs.existsSync(sessPath)) {
      try { diskSessions = JSON.parse(fs.readFileSync(sessPath, 'utf8')); } catch (_) {}
    }
    diskSessions[tokenHash] = sessionData;
    fs.writeFileSync(sessPath, JSON.stringify(diskSessions), 'utf8');
  } catch (_) {}

  return {
    token: rawToken,
    tokenHash,
    expiresAt: idleExpiresAt.getTime(),
    userId: String(userId),
    email: String(email || '').toLowerCase().trim()
  };
}

// Synchronous wrapper returning rawToken
function createCustomerSession(userId, email) {
  const claims = Buffer.from(JSON.stringify({
    sub: String(userId),
    email: String(email || '').toLowerCase().trim(),
    iat: Date.now(),
    exp: Date.now() + CUSTOMER_SESSION_IDLE_MS
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', customerSessionSecret).update(claims).digest('base64url');
  return `ar_usr.${claims}.${signature}`;
}

/**
 * Validates a Customer Session Token (supports 256-bit hashed token and legacy signed format)
 */
async function validateCustomerSessionAsync(token, req = null) {
  if (typeof token !== 'string' || !token) return null;

  // Backward compatibility: support legacy ar_usr.<claims>.<sig> format so existing users stay logged in
  if (token.startsWith('ar_usr.')) {
    return validateCustomerSession(token);
  }

  // 256-bit hashed session
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  let session = null;

  // 1. Check Redis
  if (redis && typeof redis.cacheGet === 'function') {
    try {
      session = await redis.cacheGet(`session:${tokenHash}`);
    } catch (_) {}
  }

  // 2. Check Database fallback
  if (!session && dbModule && dbModule.isConfigured && dbModule.sessions) {
    try {
      const dbSess = await dbModule.sessions.getByHash(tokenHash);
      if (dbSess) {
        session = {
          userId: dbSess.user_id,
          email: dbSess.email,
          tokenHash: dbSess.token_hash,
          idleExpiresAt: new Date(dbSess.idle_expires_at).getTime(),
          absoluteExpiresAt: new Date(dbSess.absolute_expires_at).getTime()
        };
      }
    } catch (_) {}
  }

  // 3. Check File-backed fallback for multi-worker cluster mode
  if (!session) {
    try {
      const sessPath = path.join(__dirname, '..', 'data', 'sessions.json');
      if (fs.existsSync(sessPath)) {
        const diskSessions = JSON.parse(fs.readFileSync(sessPath, 'utf8'));
        if (diskSessions && diskSessions[tokenHash]) {
          session = diskSessions[tokenHash];
        }
      }
    } catch (_) {}
  }

  if (!session) return null;

  // Ensure email is resolved if missing
  if (!session.email && session.userId) {
    try {
      if (dbModule && dbModule.isConfigured && dbModule.customers) {
        const c = await dbModule.customers.getById(session.userId);
        if (c && c.email) session.email = c.email.toLowerCase().trim();
      }
      if (!session.email) {
        const custPath = path.join(__dirname, '..', 'data', 'customers.json');
        if (fs.existsSync(custPath)) {
          const custs = JSON.parse(fs.readFileSync(custPath, 'utf8'));
          const match = custs.find(c => String(c.id) === String(session.userId));
          if (match && match.email) session.email = match.email.toLowerCase().trim();
        }
      }
    } catch (_) {}
  }

  const now = Date.now();
  // Check idle & absolute expiry
  if (session.idleExpiresAt && now > session.idleExpiresAt) {
    await revokeCustomerSession(token);
    return null;
  }
  if (session.absoluteExpiresAt && now > session.absoluteExpiresAt) {
    await revokeCustomerSession(token);
    return null;
  }

  // Slide idle expiration (touch session)
  const newIdle = now + CUSTOMER_SESSION_IDLE_MS;
  session.idleExpiresAt = newIdle;
  session.lastActiveAt = now;
  if (redis && typeof redis.cacheSet === 'function') {
    redis.cacheSet(`session:${tokenHash}`, session, Math.floor(CUSTOMER_SESSION_IDLE_MS / 1000)).catch(() => {});
  }
  if (dbModule && dbModule.isConfigured && dbModule.sessions) {
    dbModule.sessions.touch(tokenHash, new Date(newIdle)).catch(() => {});
  }

  return {
    sub: session.userId,
    email: session.email,
    userId: session.userId
  };
}

function validateCustomerSession(token) {
  if (typeof token !== 'string') return null;
  // Legacy format
  if (token.startsWith('ar_usr.')) {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [, claimsPart, suppliedSignature] = parts;
    const expectedSignature = crypto.createHmac('sha256', customerSessionSecret).update(claimsPart).digest('base64url');
    const supplied = Buffer.from(suppliedSignature);
    const expected = Buffer.from(expectedSignature);
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;
    try {
      const claims = JSON.parse(Buffer.from(claimsPart, 'base64url').toString('utf8'));
      return claims.sub && Number(claims.exp) > Date.now() ? claims : null;
    } catch (_) {
      return null;
    }
  }

  // Synchronous cache lookup for 256-bit token
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  if (redis && typeof redis.cacheGet === 'function') {
    const item = redis.getFallbackAdminSession ? redis.getFallbackAdminSession(tokenHash) : null;
    if (item && Date.now() < item.idleExpiresAt) {
      return { sub: item.userId, email: item.email };
    }
  }
  return null;
}

async function revokeCustomerSession(token) {
  if (!token) return;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  if (redis && typeof redis.cacheDel === 'function') {
    await redis.cacheDel(`session:${tokenHash}`);
  }
  if (dbModule && dbModule.isConfigured && dbModule.sessions) {
    await dbModule.sessions.deleteByHash(tokenHash).catch(() => {});
  }
  try {
    const sessPath = path.join(__dirname, '..', 'data', 'sessions.json');
    if (fs.existsSync(sessPath)) {
      const diskSessions = JSON.parse(fs.readFileSync(sessPath, 'utf8'));
      if (diskSessions[tokenHash]) {
        delete diskSessions[tokenHash];
        fs.writeFileSync(sessPath, JSON.stringify(diskSessions), 'utf8');
      }
    }
  } catch (_) {}
}

async function revokeAllCustomerSessions(userId) {
  if (!userId) return;
  if (dbModule && dbModule.isConfigured && dbModule.sessions) {
    await dbModule.sessions.deleteAllForUser(userId).catch(() => {});
  }
  try {
    const sessPath = path.join(__dirname, '..', 'data', 'sessions.json');
    if (fs.existsSync(sessPath)) {
      const diskSessions = JSON.parse(fs.readFileSync(sessPath, 'utf8'));
      let modified = false;
      for (const [h, s] of Object.entries(diskSessions)) {
        if (s && String(s.userId) === String(userId)) {
          delete diskSessions[h];
          modified = true;
        }
      }
      if (modified) fs.writeFileSync(sessPath, JSON.stringify(diskSessions), 'utf8');
    }
  } catch (_) {}
}

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(String(password), salt, 64, (err, key) => {
      if (err) return reject(err);
      resolve(`scrypt$${salt}$${key.toString('hex')}`);
    });
  });
}

function verifyPassword(password, storedHash) {
  return new Promise((resolve) => {
    const parts = String(storedHash || '').split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return resolve(false);
    crypto.scrypt(String(password), parts[1], 64, (err, key) => {
      if (err) return resolve(false);
      const expected = Buffer.from(parts[2], 'hex');
      resolve(expected.length === key.length && crypto.timingSafeEqual(expected, key));
    });
  });
}

/**
 * Safely extracts client IP address, prioritizing trusted provider headers (Vercel)
 * and preventing client-side X-Forwarded-For spoofing.
 */
function getClientIp(req) {
  if (!req) return '127.0.0.1';

  // 1. Cloudflare True Visitor IP (Authoritative when traffic routes through Cloudflare CDN)
  const cfIp = req.headers['cf-connecting-ip'];
  if (cfIp) {
    const cleanCf = String(cfIp).trim();
    if (cleanCf) return cleanCf;
  }

  const socketIp = (req.socket?.remoteAddress || req.connection?.remoteAddress || '127.0.0.1').replace(/^::ffff:/, '');
  // Forwarding headers are only authoritative when this process is explicitly
  // configured to sit behind a trusted reverse proxy. Direct clients can set
  // these headers themselves.
  const trustProxy = process.env.TRUST_PROXY === 'true' || process.env.VERCEL === '1';
  if (!trustProxy) return socketIp;

  // 1. Vercel trusted edge headers
  const vercelIp = req.headers['x-vercel-forwarded-for'] || req.headers['x-real-ip'];
  if (vercelIp) {
    const clean = String(vercelIp).split(',')[0].trim();
    if (clean) return clean;
  }

  // 2. Standard X-Forwarded-For (take the first client IP)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const parts = String(forwarded).split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length > 0) {
      return parts[0];
    }
  }

  // 3. Socket remote address fallback
  return socketIp;
}

/**
 * Generic Sliding-Window In-Memory Rate Limiter with TTL cleanup.
 * @param {string} key Identifier (e.g. `ip:1.2.3.4` or `email:foo@bar.com`)
 * @param {number} maxRequests Maximum requests allowed within window
 * @param {number} windowSeconds Time window in seconds
 * @returns {{ allowed: boolean, remaining: number, resetAfterSeconds: number }}
 */
async function checkRateLimitAsync(key, maxRequests, windowSeconds) {
  if (redis && typeof redis.checkRateLimit === 'function') {
    return await redis.checkRateLimit(key, maxRequests, windowSeconds);
  }
  return checkRateLimit(key, maxRequests, windowSeconds);
}

function checkRateLimit(key, maxRequests, windowSeconds) {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  let bucket = rateLimitBuckets.get(key);
  if (!bucket) {
    bucket = [];
    rateLimitBuckets.set(key, bucket);
  }

  // Prune timestamps older than window
  const validTimestamps = bucket.filter(ts => (now - ts) < windowMs);
  rateLimitBuckets.set(key, validTimestamps);

  if (validTimestamps.length >= maxRequests) {
    const oldest = validTimestamps[0];
    const resetAfterSeconds = Math.ceil(((oldest + windowMs) - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      resetAfterSeconds: Math.max(1, resetAfterSeconds)
    };
  }

  validTimestamps.push(now);
  return {
    allowed: true,
    remaining: maxRequests - validTimestamps.length,
    resetAfterSeconds: windowSeconds
  };
}

/**
 * Periodically purge stale buckets to prevent memory leaks
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of rateLimitBuckets.entries()) {
    const fresh = timestamps.filter(ts => (now - ts) < 3600 * 1000);
    if (fresh.length === 0) {
      rateLimitBuckets.delete(key);
    } else {
      rateLimitBuckets.set(key, fresh);
    }
  }
}, 5 * 60 * 1000).unref();

// -------------------------------------------------------------
// OTP Specific Abuse Prevention
// -------------------------------------------------------------

/**
 * Checks whether an OTP dispatch to the given email/IP is permitted.
 * Enforces:
 * - 60s cooldown per email
 * - Max 5 dispatches per hour per email
 * - Max 15 dispatches per hour per IP
 */
async function checkOtpSendCooldownAsync(email, ip) {
  const cleanEmail = (email || '').toLowerCase().trim();

  // Fail-closed check if configured
  if (process.env.REDIS_AUTH_FAIL_CLOSED === 'true' && redis && !redis.isRedisAvailable()) {
    return {
      allowed: false,
      failClosed: true,
      message: 'Authentication service temporarily unavailable. Distributed state store offline.',
      retryAfterSeconds: 60
    };
  }

  // 1. Global OTP-sends-per-minute ceiling
  const globalLimit = await checkRateLimitAsync('global_otp_send_ceiling', GLOBAL_OTP_LIMIT_PER_MINUTE, 60);
  if (!globalLimit.allowed) {
    return {
      allowed: false,
      message: 'High verification traffic across system. Please wait a minute and try again.',
      retryAfterSeconds: globalLimit.resetAfterSeconds
    };
  }

  // 2. Atomic 60-second cooldown per email
  if (redis && typeof redis.checkOtpCooldown === 'function') {
    const cooldown = await redis.checkOtpCooldown(cleanEmail, 60);
    if (!cooldown.allowed) {
      return {
        allowed: false,
        message: `Please wait ${cooldown.remainingSeconds} seconds before requesting another verification code.`,
        retryAfterSeconds: cooldown.remainingSeconds
      };
    }
  }

  // 3. Strict per-identity hourly cap (max 5/hour per email)
  const emailHourly = await checkRateLimitAsync(`otp_send_email:${cleanEmail}`, 5, 3600);
  if (!emailHourly.allowed) {
    return {
      allowed: false,
      message: `Too many verification requests for this email address. Please try again in ${Math.ceil(emailHourly.resetAfterSeconds / 60)} minutes.`,
      retryAfterSeconds: emailHourly.resetAfterSeconds
    };
  }

  // 4. Generous per-IP cap (max 60/hour per IP for mobile CGNAT)
  const ipHourly = await checkRateLimitAsync(`otp_send_ip:${ip}`, 60, 3600);
  if (!ipHourly.allowed) {
    return {
      allowed: false,
      message: `Too many requests from this network. Please try again in ${Math.ceil(ipHourly.resetAfterSeconds / 60)} minutes.`,
      retryAfterSeconds: ipHourly.resetAfterSeconds
    };
  }

  return { allowed: true };
}

function checkOtpSendCooldown(email, ip) {
  const cleanEmail = (email || '').toLowerCase().trim();
  const now = Date.now();

  // 1. 60-second cooldown per email
  const lastSent = otpCooldownMap.get(cleanEmail) || 0;
  const elapsedSeconds = Math.floor((now - lastSent) / 1000);
  if (elapsedSeconds < 60) {
    return {
      allowed: false,
      message: `Please wait ${60 - elapsedSeconds} seconds before requesting another verification code.`,
      retryAfterSeconds: 60 - elapsedSeconds
    };
  }

  // 2. Hourly email cap (max 5/hour)
  const emailHourly = checkRateLimit(`otp_send_email:${cleanEmail}`, 5, 3600);
  if (!emailHourly.allowed) {
    return {
      allowed: false,
      message: `Too many verification requests for this email address. Please try again in ${Math.ceil(emailHourly.resetAfterSeconds / 60)} minutes.`,
      retryAfterSeconds: emailHourly.resetAfterSeconds
    };
  }

  // 3. Hourly IP cap (max 15/hour)
  const ipHourly = checkRateLimit(`otp_send_ip:${ip}`, 15, 3600);
  if (!ipHourly.allowed) {
    return {
      allowed: false,
      message: `Too many requests from this network. Please try again in ${Math.ceil(ipHourly.resetAfterSeconds / 60)} minutes.`,
      retryAfterSeconds: ipHourly.resetAfterSeconds
    };
  }

  return { allowed: true };
}

/**
 * Records that an OTP was dispatched successfully
 */
function recordOtpSent(email) {
  const cleanEmail = (email || '').toLowerCase().trim();
  otpCooldownMap.set(cleanEmail, Date.now());
  if (redis && typeof redis.cacheSet === 'function') {
    redis.cacheSet(`ratelimit:otp_cooldown:${cleanEmail}`, Date.now(), 60).catch(() => {});
  }
  // Reset any previous verification failure count for fresh code
  otpAttemptsMap.delete(cleanEmail);
}

/**
 * Evaluates an OTP verification attempt.
 * Enforces:
 * - Max 10 attempts per minute per IP
 * - Max 5 incorrect attempts per OTP before permanently destroying the code
 */
function recordOtpVerifyAttempt(email, ip, isSuccess) {
  const cleanEmail = (email || '').toLowerCase().trim();

  // 1. IP brute-force limiter (10 attempts / min)
  const ipLimit = checkRateLimit(`otp_verify_ip:${ip}`, 10, 60);
  if (!ipLimit.allowed) {
    return {
      allowed: false,
      lockedOut: true,
      message: `Too many verification attempts from this IP. Please wait ${ipLimit.resetAfterSeconds} seconds.`,
      retryAfterSeconds: ipLimit.resetAfterSeconds
    };
  }

  if (isSuccess) {
    // Reset state on success
    otpAttemptsMap.delete(cleanEmail);
    otpCooldownMap.delete(cleanEmail);
    return { allowed: true, lockedOut: false };
  }

  // Record failure
  const currentAttempts = (otpAttemptsMap.get(cleanEmail) || 0) + 1;
  otpAttemptsMap.set(cleanEmail, currentAttempts);

  if (currentAttempts >= 5) {
    // Code permanently locked out / invalidated
    otpAttemptsMap.delete(cleanEmail);
    return {
      allowed: false,
      lockedOut: true,
      message: 'Too many failed verification attempts (5/5). For your security, this verification code has been deactivated. Please request a new code.',
      attemptsLeft: 0
    };
  }

  return {
    allowed: true,
    lockedOut: false,
    message: `Invalid 6-digit verification code. (${5 - currentAttempts} attempts remaining)`,
    attemptsLeft: 5 - currentAttempts
  };
}

// -------------------------------------------------------------
// Admin Authentication Guard
// -------------------------------------------------------------

/**
 * Verifies if the incoming request is authorized to execute administrative commands.
 */
// -------------------------------------------------------------
// Admin 2FA Sessions
// -------------------------------------------------------------
const activeAdminSessions = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [token, session] of activeAdminSessions.entries()) {
    if (now >= session.expiresAt) activeAdminSessions.delete(token);
  }
}, 15 * 60 * 1000).unref();

function createAdminSession(username) {
  const token = 'ar_adm_' + crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const session = {
    username,
    createdAt: now,
    lastActiveAt: now,
    idleExpiresAt: now + ADMIN_SESSION_IDLE_MS,
    expiresAt: now + ADMIN_SESSION_ABSOLUTE_MS
  };
  activeAdminSessions.set(token, session);
  if (redis && typeof redis.setAdminSession === 'function') {
    redis.setAdminSession(token, session, Math.floor(ADMIN_SESSION_ABSOLUTE_MS / 1000)).catch(() => {});
  }
  return { token, expiresAt: session.expiresAt };
}

function validateAdminSession(token) {
  if (!token) return false;
  let sess = activeAdminSessions.get(token);
  if (!sess && redis && typeof redis.getFallbackAdminSession === 'function') {
    sess = redis.getFallbackAdminSession(token);
  }
  if (!sess) return false;
  const now = Date.now();
  if (now > sess.expiresAt || (sess.idleExpiresAt && now > sess.idleExpiresAt)) {
    activeAdminSessions.delete(token);
    if (redis && typeof redis.delAdminSession === 'function') {
      redis.delAdminSession(token).catch(() => {});
    }
    return false;
  }
  // Slide idle timeout
  sess.lastActiveAt = now;
  sess.idleExpiresAt = now + ADMIN_SESSION_IDLE_MS;
  return sess;
}

function revokeAdminSession(token) {
  if (token) {
    activeAdminSessions.delete(token);
    if (redis && typeof redis.delAdminSession === 'function') {
      redis.delAdminSession(token).catch(() => {});
    }
  }
}

function isAdminAuthorized(req, parsedUrl) {
  // 1. IP Allowlist Enforcement
  const clientIp = getClientIp(req);
  if (!isAdminIpAllowed(clientIp)) {
    return false;
  }

  // 2. Cloudflare Access Verification
  const cfCheck = verifyCfAccess(req);
  if (!cfCheck.valid) {
    return false;
  }

  const adminKey = process.env.ADMIN_SECRET_KEY;
  if (!adminKey || adminKey.length < 32) return false;
  const constantTimeEqual = (leftValue, rightValue) => {
    const left = Buffer.from(String(leftValue));
    const right = Buffer.from(String(rightValue));
    return left.length === right.length && crypto.timingSafeEqual(left, right);
  };

  // 3. Check active session or static key via header
  const tokenHeader = req.headers['x-admin-token'] || req.headers['x-admin-key'];
  if (tokenHeader) {
    if (validateAdminSession(tokenHeader)) return true;
    if (constantTimeEqual(tokenHeader, adminKey)) return true;
  }

  // 4. Check Authorization header for Bearer token
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (validateAdminSession(token)) return true;
    if (constantTimeEqual(token, adminKey)) return true;
  }

  // 5. Check Admin Cookie
  const cookies = parseCookies(req);
  const cookieToken = cookies['alleyrich_admin_session'] || cookies['__Host-alleyrich_admin_session'];
  if (cookieToken && validateAdminSession(cookieToken)) {
    return true;
  }

  return false;
}

// -------------------------------------------------------------
// SSRF & Safe URL Validation
// -------------------------------------------------------------

/**
 * Validates a remote URL to prevent Server-Side Request Forgery (SSRF)
 * against cloud metadata (169.254.169.254) and internal private subnets.
 */
function isSafeRemoteUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    const host = parsed.hostname.toLowerCase().replace(/[\[\]]/g, '');
    if (parsed.username || parsed.password || parsed.hash) return false;

    if (net.isIPv4(host)) {
      const octets = host.split('.').map(Number);
      const [a, b] = octets;
      if (a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
          (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
          (a === 192 && b === 168) || (a === 192 && b === 0) ||
          (a === 198 && (b === 18 || b === 19)) ||
          (a === 198 && b === 51) || (a === 203 && b === 0) || a >= 224) return false;
    }

    // Block localhost and loopback
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') {
      return false;
    }

    // Block AWS / Cloud Instance Metadata Services
    if (host === '169.254.169.254' || host.startsWith('169.254.')) {
      return false;
    }

    // Block RFC 1918 Private IPv4 Addresses
    if (
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('100.64.') ||
      host.startsWith('192.0.0.') ||
      host.startsWith('198.18.') ||
      host.startsWith('198.51.100.') ||
      host.startsWith('203.0.113.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
    ) {
      return false;
    }

    if (host.includes(':') && (host === '::' || host === '::1' || host.startsWith('fc') || host.startsWith('fd') || /^fe[89ab]/.test(host) || host.startsWith('::ffff:'))) {
      if (host.startsWith('::ffff:')) return isSafeRemoteUrl(`http://${host.substring(7)}`);
      return false;
    }

    return true;
  } catch (e) {
    return false;
  }
}

// -------------------------------------------------------------
// Customer PII & IDOR Authorization Guard
// -------------------------------------------------------------

/**
 * Checks whether the caller is authorized to view or edit customer details.
 * Legitimate access requires:
 * 1. Admin authorization, OR
 * 2. Authenticated user token matching the target customer ID / email.
 */
function isCustomerAuthorized(req, customer, targetId, targetEmail) {
  // Admin is always authorized
  if (isAdminAuthorized(req)) return true;

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) return false;

  const claims = validateCustomerSession(token);
  if (!claims) return false;
  return Boolean(
    (customer && customer.id && String(claims.sub) === String(customer.id)) ||
    (targetId && String(claims.sub) === String(targetId)) ||
    (targetEmail && String(claims.email || '').toLowerCase() === String(targetEmail).toLowerCase())
  );
}


// ── Phase 3: PII Masking & Audit Logging ──
const memoryAuditLog = [];
const MAX_MEMORY_AUDIT_LOGS = 200;

function maskPii(value) {
  if (value === null || value === undefined) return value;
  const str = String(value).trim();
  if (!str) return str;

  // Mask email: j***e@domain.com
  if (str.includes('@')) {
    const parts = str.split('@');
    const local = parts[0];
    const domain = parts[1] || '';
    if (!domain) return '***';
    if (local.length <= 2) {
      return `${local[0] || '*'}***@${domain}`;
    }
    return `${local[0]}***${local[local.length - 1]}@${domain}`;
  }

  // Mask phone numbers
  const digitsOnly = str.replace(/\D/g, '');
  if (digitsOnly.length >= 7) {
    const last4 = digitsOnly.slice(-4);
    const hasPlus = str.startsWith('+');
    return `${hasPlus ? '+' : ''}******${last4}`;
  }

  return str;
}

function maskPiiObject(obj) {
  if (!obj || typeof obj !== 'object') {
    return typeof obj === 'string' ? maskPii(obj) : obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => maskPiiObject(item));
  }
  const masked = {};
  const sensitiveKeys = new Set([
    'email', 'phone', 'customer_email', 'customer_phone', 'address', 'locality',
    'pincode', 'password', 'token', 'totp', 'secret', 'card', 'cvv'
  ]);

  for (const [key, val] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.has(lowerKey)) {
      if (typeof val === 'string') {
        masked[key] = maskPii(val);
      } else if (typeof val === 'object' && val !== null) {
        masked[key] = maskPiiObject(val);
      } else {
        masked[key] = '***';
      }
    } else if (typeof val === 'object' && val !== null) {
      masked[key] = maskPiiObject(val);
    } else {
      masked[key] = val;
    }
  }
  return masked;
}

async function logAuditAsync({ adminUsername, ipAddress, action, targetType = null, targetId = null, details = {} }) {
  const cleanUsername = cleanText(adminUsername || 'admin', 100);
  const cleanIp = cleanText(ipAddress || '127.0.0.1', 45);
  const cleanAction = cleanText(action, 100);
  const cleanTargetType = targetType ? cleanText(targetType, 50) : null;
  const maskedTargetId = targetId ? maskPii(targetId) : null;
  const maskedDetails = maskPiiObject(details);

  const entry = {
    id: `audit_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    admin_username: cleanUsername,
    ip_address: cleanIp,
    action: cleanAction,
    target_type: cleanTargetType,
    target_id: maskedTargetId,
    details: maskedDetails,
    created_at: new Date().toISOString()
  };

  memoryAuditLog.unshift(entry);
  if (memoryAuditLog.length > MAX_MEMORY_AUDIT_LOGS) memoryAuditLog.pop();

  if (dbModule && dbModule.isConfigured && dbModule.auditLog) {
    try {
      await dbModule.auditLog.create({
        adminUsername: cleanUsername,
        ipAddress: cleanIp,
        action: cleanAction,
        targetType: cleanTargetType,
        targetId: maskedTargetId,
        details: maskedDetails
      });
    } catch (e) {
      console.warn('[AUDIT LOG DB WARNING]:', e.message);
    }
  }

  return entry;
}

function getMemoryAuditLogs({ limit = 50, offset = 0, action = null } = {}) {
  let list = memoryAuditLog;
  if (action) list = list.filter(item => item.action === action);
  return list.slice(offset, offset + limit);
}

// ── Phase 3: Admin IP Allowlist ──
function isAdminIpAllowed(clientIp) {
  const allowlistEnv = process.env.ADMIN_IP_ALLOWLIST;
  if (!allowlistEnv || !allowlistEnv.trim()) return true;

  const allowedIps = allowlistEnv.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (allowedIps.length === 0) return true;

  const ip = String(clientIp || '').trim().toLowerCase();
  for (const allowed of allowedIps) {
    if (allowed === ip) return true;
    if (allowed === '127.0.0.1' && (ip === '::1' || ip === '::ffff:127.0.0.1')) return true;
    if (allowed === '::1' && (ip === '127.0.0.1' || ip === '::ffff:127.0.0.1')) return true;
  }
  return false;
}

// ── Phase 3: Cloudflare Access JWT Assertion Verification ──
function verifyCfAccess(req) {
  if (process.env.CF_ACCESS_ENABLED !== 'true') {
    return { valid: true };
  }

  const jwt = req.headers['cf-access-jwt-assertion'];
  if (!jwt || typeof jwt !== 'string') {
    return { valid: false, message: 'Cloudflare Access JWT assertion missing' };
  }

  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) {
      return { valid: false, message: 'Malformed Cloudflare Access JWT' };
    }
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < nowSec) {
      return { valid: false, message: 'Cloudflare Access assertion expired' };
    }
    const expectedAud = process.env.CF_ACCESS_AUD;
    if (expectedAud && payload.aud && payload.aud !== expectedAud) {
      return { valid: false, message: 'Cloudflare Access audience mismatch' };
    }
    return { valid: true, payload };
  } catch (_) {
    return { valid: false, message: 'Invalid Cloudflare Access token payload' };
  }
}

// ── Phase 3: Sensitive Administrative Action TOTP Re-Auth ──
async function verifyAdminTotpReauth(req, body = {}, action = 'admin_reauth', consume = true) {
  const totpCode = String(req.headers['x-admin-totp'] || body.totpCode || '').trim();
  if (!totpCode) {
    return {
      authorized: false,
      reauthRequired: true,
      message: 'Sensitive action requires TOTP re-authentication. Provide 6-digit code via x-admin-totp header or totpCode field.'
    };
  }

  const totpSecret = process.env.ADMIN_2FA_SECRET;
  if (!totpSecret) {
    return { authorized: false, reauthRequired: true, message: 'Administrative 2FA is not configured.' };
  }

  if (!totp || typeof totp.verifyTotp !== 'function') {
    return { authorized: false, reauthRequired: true, message: 'TOTP verification engine unavailable.' };
  }

  const isValid = totp.verifyTotp(totpSecret, totpCode);
  if (!isValid) {
    return { authorized: false, reauthRequired: true, message: 'Invalid or expired 6-digit authenticator code.' };
  }

  if (consume && redis && typeof redis.recordUsedTotp === 'function') {
    const codeHash = crypto.createHash('sha256').update(totpCode).digest('hex');
    const isNew = await redis.recordUsedTotp(`reauth:${action}`, codeHash, 90);
    if (!isNew) {
      return { authorized: false, reauthRequired: true, message: 'This authenticator code has already been used. Please wait for the next token.' };
    }
  }

  return { authorized: true };
}

module.exports = {
  cleanText,
  hashOtpCode,
  compareOtpCode,
  parseCookies,
  setSessionCookie,
  clearSessionCookie,
  verifyCsrf,
  verifyTurnstileToken,
  createCustomerSessionAsync,
  validateCustomerSessionAsync,
  revokeCustomerSession,
  revokeAllCustomerSessions,
  getClientIp,
  checkRateLimit,
  checkRateLimitAsync,
  checkOtpSendCooldown,
  checkOtpSendCooldownAsync,
  recordOtpSent,
  recordOtpVerifyAttempt,
  isAdminAuthorized,
  maskPii,
  maskPiiObject,
  logAuditAsync,
  getMemoryAuditLogs,
  isAdminIpAllowed,
  verifyCfAccess,
  verifyAdminTotpReauth,
  isSafeRemoteUrl,
  isCustomerAuthorized,
  createAdminSession,
  validateAdminSession,
  revokeAdminSession,
  createCustomerSession,
  validateCustomerSession,
  hashPassword,
  verifyPassword
};
