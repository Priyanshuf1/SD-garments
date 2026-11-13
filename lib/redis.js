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

module.exports = {
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
