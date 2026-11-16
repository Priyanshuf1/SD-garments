/**
 * ALLEYRICH — Distributed Redis Architecture, Caching & Resilience State Layer
 * File: lib/redis.js
 * 
 * Production-grade Redis client supporting:
 * - Sub-millisecond catalog caching & wildcard SCAN invalidation
 * - Single-roundtrip atomic Lua sliding-window distributed rate limiting
 * - Customer active cart persistence (30d TTL) & Admin session store (12h TTL)
 * - Cashfree webhook idempotency tracking (24h TTL)
 * - Transparent `alleyrich:*` namespace isolation
 * - Resilient dual-layer in-memory fallback with zero server crashes if Redis disconnects
 */

let Redis;
try {
  Redis = require('ioredis');
} catch (e) {
  Redis = null;
}

const KEY_PREFIX = 'alleyrich:';
let client = null;
let isAvailable = false;
let lastLogTime = 0;
const LOG_THROTTLE_MS = 10000;

// Dual-layer in-memory fallback stores
const fallbackCache = new Map();
const fallbackRateLimitBuckets = new Map();
const fallbackAdminSessions = new Map();
const fallbackUserCarts = new Map();
const fallbackWebhookEvents = new Map();

// Periodic cleanup of expired fallback items (unref to avoid hanging process exit)
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of fallbackCache.entries()) {
    if (v.expiresAt && now >= v.expiresAt) fallbackCache.delete(k);
  }
  for (const [token, sess] of fallbackAdminSessions.entries()) {
    if (sess.expiresAt && now >= sess.expiresAt) fallbackAdminSessions.delete(token);
  }
  for (const [eventId, ts] of fallbackWebhookEvents.entries()) {
    if (now - ts > 86400 * 1000) fallbackWebhookEvents.delete(eventId);
  }
  for (const [k, bucket] of fallbackRateLimitBuckets.entries()) {
    if (Array.isArray(bucket) && bucket.length > 0) {
      const newest = bucket[bucket.length - 1];
      if (now - newest > 3600 * 1000) fallbackRateLimitBuckets.delete(k);
    }
  }
}, 60 * 1000);
if (cleanupTimer.unref) {
  cleanupTimer.unref();
}

/**
 * Format key under alleyrich:* namespace without double prefixing
 */
function toPrefixedKey(key) {
  if (!key) return KEY_PREFIX;
  const s = String(key);
  return s.startsWith(KEY_PREFIX) ? s : `${KEY_PREFIX}${s}`;
}

function logNotice(msg) {
  const now = Date.now();
  if (now - lastLogTime > LOG_THROTTLE_MS) {
    console.log(`[Redis] ${msg}`);
    lastLogTime = now;
  }
}

/**
 * Initialize or re-initialize Redis client singleton
 */
function initRedis(forceReconnect = false) {
  if (client && !forceReconnect) return client;

  if (client && forceReconnect) {
    try {
      client.disconnect();
    } catch (_) {}
    client = null;
    isAvailable = false;
  }

  if (!Redis) {
    logNotice('ioredis module not installed. Operating in in-memory fallback mode.');
    return null;
  }

  const redisUrl = process.env.REDIS_URL;
  const redisHost = process.env.REDIS_HOST;
  const redisPort = process.env.REDIS_PORT;
  const redisPassword = process.env.REDIS_PASSWORD || undefined;
  const redisTls = process.env.REDIS_TLS === 'true' ? {} : undefined;

  // If no Redis connection parameters are specified, run purely in in-memory fallback mode
  if (!redisUrl && !redisHost && !redisPort) {
    client = null;
    isAvailable = false;
    return null;
  }

  const options = {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
    commandTimeout: 1000,
    autoResubscribe: false,
    autoResendUnfulfilledCommands: false,
    retryStrategy(times) {
      // Exponential backoff capped at 5 seconds
      return Math.min(times * 150, 5000);
    }
  };

  try {
    if (redisUrl) {
      client = new Redis(redisUrl, options);
    } else {
      client = new Redis({
        host: redisHost || '127.0.0.1',
        port: Number(redisPort) || 6379,
        password: redisPassword,
        tls: redisTls,
        ...options
      });
    }

    // Attach immediate error handler to prevent unhandled EventEmitter exceptions
    client.on('error', (err) => {
      isAvailable = false;
      logNotice(`Connection error (${err.message || 'offline'}). Operating in fallback mode.`);
    });

    client.on('connect', () => {
      logNotice('Connection established.');
    });

    client.on('ready', () => {
      isAvailable = true;
      logNotice('Client ready for commands.');
    });

    client.on('close', () => {
      isAvailable = false;
    });

    client.on('reconnecting', () => {
      isAvailable = false;
    });

    client.on('end', () => {
      isAvailable = false;
    });

    // Initiate non-blocking connection
    client.connect().catch((err) => {
      isAvailable = false;
    });

  } catch (err) {
    client = null;
    isAvailable = false;
    logNotice(`Initialization failure (${err.message}). Using in-memory fallback.`);
  }

  return client;
}

// Initial client boot
initRedis();

/**
 * Returns true only if client is connected and ready
 */
function isRedisAvailable() {
  return Boolean(client && isAvailable && client.status === 'ready');
}

/**
 * Returns live Redis client or null
 */
function getRedisClient() {
  return isRedisAvailable() ? client : null;
}

// -------------------------------------------------------------
// Catalog Caching Helpers
// -------------------------------------------------------------

/**
 * Retrieve cached JSON value by key
 */
async function cacheGet(key) {
  const k = toPrefixedKey(key);

  // 1. Check ultra-fast in-memory L1 cache tier
  const item = fallbackCache.get(k);
  if (item) {
    if (!item.expiresAt || Date.now() < item.expiresAt) {
      return item.value;
    }
    fallbackCache.delete(k);
  }

  // 2. Query distributed Redis L2 tier if available
  if (isRedisAvailable()) {
    try {
      const data = await client.get(k);
      if (data !== null && data !== undefined) {
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
        fallbackCache.set(k, {
          value: parsed,
          expiresAt: Date.now() + 300 * 1000
        });
        return parsed;
      }
      return null;
    } catch (err) {
      isAvailable = false;
    }
  }

  return null;
}

/**
 * Persist JSON value with expiration (TTL in seconds)
 */
async function cacheSet(key, value, ttlSeconds = 300) {
  const k = toPrefixedKey(key);
  const serialized = (typeof value === 'object' && value !== null) ? JSON.stringify(value) : String(value);
  let redisSet = false;

  if (isRedisAvailable()) {
    try {
      if (ttlSeconds && Number(ttlSeconds) > 0) {
        await client.set(k, serialized, 'EX', Math.floor(Number(ttlSeconds)));
      } else {
        await client.set(k, serialized);
      }
      redisSet = true;
    } catch (err) {
      isAvailable = false;
    }
  }

  // Dual-write to local in-memory fallback
  fallbackCache.set(k, {
    value,
    expiresAt: ttlSeconds ? Date.now() + Number(ttlSeconds) * 1000 : null
  });

  return redisSet;
}

/**
 * Invalidate key or wildcard pattern (*).
 * Uses non-blocking SCAN iteration for wildcards.
 */
async function cacheDel(patternOrKey) {
  const target = toPrefixedKey(patternOrKey);
  let count = 0;

  // 1. Invalidate from local in-memory store
  if (target.includes('*')) {
    const escaped = target.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    const regex = new RegExp(`^${escaped}$`);
    for (const k of fallbackCache.keys()) {
      if (regex.test(k)) fallbackCache.delete(k);
    }
  } else {
    fallbackCache.delete(target);
  }

  // 2. Invalidate from Redis
  if (isRedisAvailable()) {
    try {
      if (target.includes('*')) {
        let cursor = '0';
        do {
          const res = await client.scan(cursor, 'MATCH', target, 'COUNT', 100);
          cursor = res[0];
          const keys = res[1];
          if (keys && keys.length > 0) {
            count += await client.del(...keys);
          }
        } while (cursor !== '0');
      } else {
        count = await client.del(target);
      }
    } catch (err) {
      isAvailable = false;
    }
  }

  return count;
}

// -------------------------------------------------------------
// Distributed Sliding-Window Rate Limiting (Atomic Lua)
// -------------------------------------------------------------

const RATE_LIMIT_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local maxRequests = tonumber(ARGV[3])
local member = ARGV[4]
local clearBefore = now - windowMs

redis.call('ZREMRANGEBYSCORE', key, '-inf', clearBefore)
local currentCount = redis.call('ZCARD', key)

if currentCount < maxRequests then
  redis.call('ZADD', key, now, member)
  redis.call('EXPIRE', key, math.ceil(windowMs / 1000) + 2)
  local remaining = maxRequests - (currentCount + 1)
  return { 1, remaining, math.ceil(windowMs / 1000) }
else
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local resetAfterMs = windowMs
  if oldest and #oldest >= 2 then
    local oldestTs = tonumber(oldest[2])
    resetAfterMs = (oldestTs + windowMs) - now
    if resetAfterMs < 0 then resetAfterMs = 1000 end
  end
  local resetSec = math.ceil(resetAfterMs / 1000)
  if resetSec < 1 then resetSec = 1 end
  return { 0, 0, resetSec }
end
`;

/**
 * Atomic sliding-window rate limit check.
 * @returns {Promise<{ allowed: boolean, remaining: number, resetAfterSeconds: number }>}
 */
async function checkRateLimit(key, maxRequests, windowSeconds) {
  const fullKey = toPrefixedKey(key.startsWith('ratelimit:') ? key : `ratelimit:${key}`);
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const member = `${now}-${Math.floor(Math.random() * 1000000)}`;

  if (isRedisAvailable()) {
    try {
      const res = await client.eval(RATE_LIMIT_LUA, 1, fullKey, now, windowMs, maxRequests, member);
      if (Array.isArray(res) && res.length >= 3) {
        return {
          allowed: Number(res[0]) === 1,
          remaining: Number(res[1]),
          resetAfterSeconds: Number(res[2])
        };
      }
    } catch (err) {
      isAvailable = false;
    }
  }

  // Resilient in-memory sliding-window fallback
  let bucket = fallbackRateLimitBuckets.get(fullKey);
  if (!bucket) {
    bucket = [];
    fallbackRateLimitBuckets.set(fullKey, bucket);
  }
  const validTimestamps = bucket.filter(ts => (now - ts) < windowMs);
  fallbackRateLimitBuckets.set(fullKey, validTimestamps);

  if (validTimestamps.length >= maxRequests) {
    const oldest = validTimestamps[0];
    const resetAfterSeconds = Math.max(1, Math.ceil(((oldest + windowMs) - now) / 1000));
    return {
      allowed: false,
      remaining: 0,
      resetAfterSeconds
    };
  }

  validTimestamps.push(now);
  return {
    allowed: true,
    remaining: maxRequests - validTimestamps.length,
    resetAfterSeconds: windowSeconds
  };
}

// -------------------------------------------------------------
// Admin Session State
// -------------------------------------------------------------

async function getAdminSession(token) {
  if (!token) return null;
  const key = `session:admin:${token}`;
  const session = await cacheGet(key);
  if (session) return session;

  const fallback = fallbackAdminSessions.get(token);
  if (fallback && Date.now() < fallback.expiresAt) return fallback;
  return null;
}

async function setAdminSession(token, data, ttlSeconds = 43200) {
  if (!token) return false;
  const key = `session:admin:${token}`;
  await cacheSet(key, data, ttlSeconds);
  fallbackAdminSessions.set(token, {
    ...data,
    expiresAt: Date.now() + (ttlSeconds * 1000)
  });
  return true;
}

async function delAdminSession(token) {
  if (!token) return false;
  const key = `session:admin:${token}`;
  await cacheDel(key);
  fallbackAdminSessions.delete(token);
  return true;
}

// -------------------------------------------------------------
// Customer Active Cart State
// -------------------------------------------------------------

async function getUserCart(userIdOrEmail) {
  if (!userIdOrEmail) return null;
  const cleanId = String(userIdOrEmail).toLowerCase().trim();
  const key = `cart:user:${cleanId}`;
  const cart = await cacheGet(key);
  if (Array.isArray(cart)) return cart;

  const fallback = fallbackUserCarts.get(cleanId);
  return Array.isArray(fallback) ? fallback : null;
}

async function setUserCart(userIdOrEmail, cart, ttlSeconds = 2592000) {
  if (!userIdOrEmail) return false;
  const cleanId = String(userIdOrEmail).toLowerCase().trim();
  const key = `cart:user:${cleanId}`;
  const validCart = Array.isArray(cart) ? cart : [];
  await cacheSet(key, validCart, ttlSeconds);
  fallbackUserCarts.set(cleanId, validCart);
  return true;
}

// -------------------------------------------------------------
// Cashfree Webhook Idempotency
// -------------------------------------------------------------

async function checkWebhookIdempotency(eventId, ttlSeconds = 86400) {
  if (!eventId) return true;
  const key = toPrefixedKey(`idempotency:cashfree:${eventId}`);

  if (isRedisAvailable()) {
    try {
      const res = await client.set(key, Date.now(), 'EX', ttlSeconds, 'NX');
      return res === 'OK';
    } catch (err) {
      isAvailable = false;
    }
  }

  // Fallback
  if (fallbackWebhookEvents.has(eventId)) return false;
  fallbackWebhookEvents.set(eventId, Date.now());
  return true;
}

async function clearWebhookIdempotency(eventId) {
  if (!eventId) return false;
  const key = `idempotency:cashfree:${eventId}`;
  fallbackWebhookEvents.delete(eventId);
  return await cacheDel(key);
}

async function disconnect() {
  if (client) {
    try {
      client.disconnect();
    } catch (_) {}
    client = null;
    isAvailable = false;
  }
}

function getFallbackAdminSession(token) {
  if (!token) return null;
  const fallback = fallbackAdminSessions.get(token);
  if (fallback && Date.now() < fallback.expiresAt) return fallback;
  return null;
}


/**
 * Phase 2: Atomic SET NX EX
 * Atomically sets key if not exists with an expiration TTL.
 * Returns true if key was set, false if key already existed.
 */
async function setNxEx(key, value, ttlSeconds = 60) {
  const k = toPrefixedKey(key);
  const serialized = (typeof value === 'object' && value !== null) ? JSON.stringify(value) : String(value);

  if (isRedisAvailable()) {
    try {
      const res = await client.set(k, serialized, 'EX', Math.floor(Number(ttlSeconds)), 'NX');
      return res === 'OK';
    } catch (err) {
      isAvailable = false;
    }
  }

  // Dual-tier in-memory fallback
  const existing = fallbackCache.get(k);
  if (existing && (!existing.expiresAt || Date.now() < existing.expiresAt)) {
    return false;
  }
  fallbackCache.set(k, {
    value,
    expiresAt: Date.now() + Number(ttlSeconds) * 1000
  });
  return true;
}

/**
 * Replay protection for TOTP codes: ensures a 6-digit code cannot be replayed
 * within its valid 90-second timestamp window.
 */
async function recordUsedTotp(username, codeHash, windowSeconds = 90) {
  const key = `totp_used:${username}:${codeHash}`;
  return await setNxEx(key, '1', windowSeconds);
}

/**
 * Atomic 60-second OTP dispatch cooldown per email.
 */
async function checkOtpCooldown(email, cooldownSeconds = 60) {
  const key = `ratelimit:otp_cooldown:${String(email).toLowerCase().trim()}`;
  const setSuccess = await setNxEx(key, String(Date.now()), cooldownSeconds);
  if (!setSuccess) {
    let ttl = cooldownSeconds;
    if (isRedisAvailable()) {
      try {
        const remaining = await client.ttl(toPrefixedKey(key));
        if (remaining > 0) ttl = remaining;
      } catch (_) {}
    } else {
      const cached = fallbackCache.get(toPrefixedKey(key));
      if (cached && cached.expiresAt) {
        ttl = Math.max(1, Math.ceil((cached.expiresAt - Date.now()) / 1000));
      }
    }
    return { allowed: false, remainingSeconds: ttl };
  }
  return { allowed: true, remainingSeconds: 0 };
}

/**
 * Atomic OTP brute-force attempt lockout counter.
 * Returns { lockedOut: boolean, attempts: number, attemptsLeft: number }
 */
async function recordOtpAttempt(email, maxAttempts = 5, lockoutSeconds = 900) {
  const cleanEmail = String(email).toLowerCase().trim();
  const attemptsKey = toPrefixedKey(`ratelimit:otp_attempts:${cleanEmail}`);
  const lockKey = toPrefixedKey(`ratelimit:otp_locked:${cleanEmail}`);

  // Check if already locked out
  if (isRedisAvailable()) {
    try {
      const isLocked = await client.exists(lockKey);
      if (isLocked) {
        const ttl = await client.ttl(lockKey);
        return { lockedOut: true, attempts: maxAttempts, attemptsLeft: 0, retryAfterSeconds: Math.max(1, ttl) };
      }
      const attempts = await client.incr(attemptsKey);
      if (attempts === 1) {
        await client.expire(attemptsKey, lockoutSeconds);
      }
      if (attempts >= maxAttempts) {
        await client.set(lockKey, '1', 'EX', lockoutSeconds);
        await client.del(attemptsKey);
        return { lockedOut: true, attempts, attemptsLeft: 0, retryAfterSeconds: lockoutSeconds };
      }
      return { lockedOut: false, attempts, attemptsLeft: Math.max(0, maxAttempts - attempts) };
    } catch (_) {
      isAvailable = false;
    }
  }

  // Fallback
  const lock = fallbackCache.get(lockKey);
  if (lock && Date.now() < lock.expiresAt) {
    const ttl = Math.max(1, Math.ceil((lock.expiresAt - Date.now()) / 1000));
    return { lockedOut: true, attempts: maxAttempts, attemptsLeft: 0, retryAfterSeconds: ttl };
  }

  const prev = fallbackCache.get(attemptsKey);
  const currentAttempts = (prev && Date.now() < prev.expiresAt ? Number(prev.value) : 0) + 1;
  if (currentAttempts >= maxAttempts) {
    fallbackCache.set(lockKey, { value: '1', expiresAt: Date.now() + lockoutSeconds * 1000 });
    fallbackCache.delete(attemptsKey);
    return { lockedOut: true, attempts: currentAttempts, attemptsLeft: 0, retryAfterSeconds: lockoutSeconds };
  }
  fallbackCache.set(attemptsKey, { value: currentAttempts, expiresAt: Date.now() + lockoutSeconds * 1000 });
  return { lockedOut: false, attempts: currentAttempts, attemptsLeft: maxAttempts - currentAttempts };
}

async function isOtpLocked(email) {
  const cleanEmail = String(email).toLowerCase().trim();
  const lockKey = toPrefixedKey(`ratelimit:otp_locked:${cleanEmail}`);
  if (isRedisAvailable()) {
    try {
      const exists = await client.exists(lockKey);
      if (exists) {
        const ttl = await client.ttl(lockKey);
        return { locked: true, retryAfterSeconds: Math.max(1, ttl) };
      }
      return { locked: false, retryAfterSeconds: 0 };
    } catch (_) {
      isAvailable = false;
    }
  }
  const lock = fallbackCache.get(lockKey);
  if (lock && Date.now() < lock.expiresAt) {
    return { locked: true, retryAfterSeconds: Math.max(1, Math.ceil((lock.expiresAt - Date.now()) / 1000)) };
  }
  return { locked: false, retryAfterSeconds: 0 };
}

async function clearOtpAttempts(email) {
  const cleanEmail = String(email).toLowerCase().trim();
  await cacheDel(`ratelimit:otp_attempts:${cleanEmail}`);
  await cacheDel(`ratelimit:otp_locked:${cleanEmail}`);
  await cacheDel(`ratelimit:otp_cooldown:${cleanEmail}`);
}

/**
 * Evaluates whether authentication state store is available or fails closed.
 */
function isAuthStoreAvailable() {
  if (process.env.REDIS_AUTH_FAIL_CLOSED === 'true') {
    return isRedisAvailable();
  }
  return true;
}

// -------------------------------------------------------------
// Admin Login Lockout with Exponential Backoff
// -------------------------------------------------------------
const memoryAdminFailures = new Map();

function getExponentialBackoffSeconds(attempts) {
  if (attempts < 3) return 0;
  if (attempts === 3) return 15;
  if (attempts === 4) return 60;
  return 900; // 5 or more failed attempts -> 15 min (900s)
}

async function recordAdminLoginFailure(username, ip) {
  const cleanUser = String(username || '').toLowerCase().trim();
  const cleanIp = String(ip || '').trim();

  let userAttempts = 1;
  let ipAttempts = 1;

  if (isRedisAvailable()) {
    try {
      if (cleanUser) {
        userAttempts = await client.incr(toPrefixedKey(`admin_fail_cnt:user:${cleanUser}`));
        if (userAttempts === 1) await client.expire(toPrefixedKey(`admin_fail_cnt:user:${cleanUser}`), 3600);
      }
      if (cleanIp) {
        ipAttempts = await client.incr(toPrefixedKey(`admin_fail_cnt:ip:${cleanIp}`));
        if (ipAttempts === 1) await client.expire(toPrefixedKey(`admin_fail_cnt:ip:${cleanIp}`), 3600);
      }

      const userLockSec = getExponentialBackoffSeconds(userAttempts);
      if (userLockSec > 0 && cleanUser) {
        await client.set(toPrefixedKey(`admin_lock:user:${cleanUser}`), 'locked', 'EX', userLockSec);
      }
      const ipLockSec = getExponentialBackoffSeconds(ipAttempts);
      if (ipLockSec > 0 && cleanIp) {
        await client.set(toPrefixedKey(`admin_lock:ip:${cleanIp}`), 'locked', 'EX', ipLockSec);
      }

      return {
        userAttempts,
        ipAttempts,
        lockoutSeconds: Math.max(userLockSec, ipLockSec)
      };
    } catch (_) {
      isAvailable = false;
    }
  }

  // In-memory fallback
  const now = Date.now();
  if (cleanUser) {
    const uRec = memoryAdminFailures.get(`user:${cleanUser}`) || { count: 0, resetAt: now + 3600000 };
    uRec.count++;
    userAttempts = uRec.count;
    const lockSec = getExponentialBackoffSeconds(userAttempts);
    if (lockSec > 0) uRec.lockUntil = now + lockSec * 1000;
    memoryAdminFailures.set(`user:${cleanUser}`, uRec);
  }
  if (cleanIp) {
    const ipRec = memoryAdminFailures.get(`ip:${cleanIp}`) || { count: 0, resetAt: now + 3600000 };
    ipRec.count++;
    ipAttempts = ipRec.count;
    const lockSec = getExponentialBackoffSeconds(ipAttempts);
    if (lockSec > 0) ipRec.lockUntil = now + lockSec * 1000;
    memoryAdminFailures.set(`ip:${cleanIp}`, ipRec);
  }

  return {
    userAttempts,
    ipAttempts,
    lockoutSeconds: Math.max(getExponentialBackoffSeconds(userAttempts), getExponentialBackoffSeconds(ipAttempts))
  };
}

async function isAdminLockedOut(username, ip) {
  const cleanUser = String(username || '').toLowerCase().trim();
  const cleanIp = String(ip || '').trim();

  if (isRedisAvailable()) {
    try {
      if (cleanUser) {
        const ttl = await client.ttl(toPrefixedKey(`admin_lock:user:${cleanUser}`));
        if (ttl > 0) return { lockedOut: true, retryAfterSeconds: ttl, reason: 'username' };
      }
      if (cleanIp) {
        const ttl = await client.ttl(toPrefixedKey(`admin_lock:ip:${cleanIp}`));
        if (ttl > 0) return { lockedOut: true, retryAfterSeconds: ttl, reason: 'ip' };
      }
      return { lockedOut: false, retryAfterSeconds: 0 };
    } catch (_) {
      isAvailable = false;
    }
  }

  // Memory fallback
  const now = Date.now();
  if (cleanUser) {
    const uRec = memoryAdminFailures.get(`user:${cleanUser}`);
    if (uRec && uRec.lockUntil && now < uRec.lockUntil) {
      return { lockedOut: true, retryAfterSeconds: Math.max(1, Math.ceil((uRec.lockUntil - now) / 1000)), reason: 'username' };
    }
  }
  if (cleanIp) {
    const ipRec = memoryAdminFailures.get(`ip:${cleanIp}`);
    if (ipRec && ipRec.lockUntil && now < ipRec.lockUntil) {
      return { lockedOut: true, retryAfterSeconds: Math.max(1, Math.ceil((ipRec.lockUntil - now) / 1000)), reason: 'ip' };
    }
  }
  return { lockedOut: false, retryAfterSeconds: 0 };
}

async function clearAdminLoginFailures(username, ip) {
  const cleanUser = String(username || '').toLowerCase().trim();
  const cleanIp = String(ip || '').trim();

  if (isRedisAvailable()) {
    try {
      const keys = [];
      if (cleanUser) {
        keys.push(toPrefixedKey(`admin_fail_cnt:user:${cleanUser}`), toPrefixedKey(`admin_lock:user:${cleanUser}`));
      }
      if (cleanIp) {
        keys.push(toPrefixedKey(`admin_fail_cnt:ip:${cleanIp}`), toPrefixedKey(`admin_lock:ip:${cleanIp}`));
      }
      if (keys.length > 0) await client.del(...keys);
    } catch (_) {
      isAvailable = false;
    }
  }

  if (cleanUser) memoryAdminFailures.delete(`user:${cleanUser}`);
  if (cleanIp) memoryAdminFailures.delete(`ip:${cleanIp}`);
}


module.exports = {
  recordAdminLoginFailure,
  isAdminLockedOut,
  clearAdminLoginFailures,
  setNxEx,
  recordUsedTotp,
  checkOtpCooldown,
  recordOtpAttempt,
  isOtpLocked,
  clearOtpAttempts,
  isAuthStoreAvailable,
  get: cacheGet,
  set: cacheSet,
  initRedis,
  disconnect,
  getRedisClient,
  isRedisAvailable,
  cacheGet,
  cacheSet,
  cacheDel,
  checkRateLimit,
  getAdminSession,
  setAdminSession,
  delAdminSession,
  getFallbackAdminSession,
  getUserCart,
  setUserCart,
  checkWebhookIdempotency,
  clearWebhookIdempotency
};
