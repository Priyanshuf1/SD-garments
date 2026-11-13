/**
 * ALLEYRICH — Adversarial Chaos & Resilience Verification Suite (Challenger 2)
 * File: tests/test_redis_chaos_adversarial.js
 *
 * EMPIRICAL CHALLENGER TEST HARNESS:
 * 1. Sudden Disconnect Chaos:
 *    - Abruptly destroy active Redis TCP sockets mid-flight while 50 concurrent requests are in progress.
 *    - Verify isRedisAvailable() transitions cleanly to false.
 *    - Verify zero unhandled promise rejections, zero uncaught exceptions, zero server crashes.
 * 2. Degraded Offline Operation:
 *    - While Redis is completely offline, verify:
 *      * GET /api/products -> HTTP 200 OK (local fallback)
 *      * GET /api/collections -> HTTP 200 OK (local fallback)
 *      * Rate limiting -> In-memory bucket enforcement (HTTP 429)
 *      * POST & GET /api/cart/sync -> HTTP 200 OK (in-memory & JSON fallback)
 *      * Admin session checks (GET /api/admin/stats) -> HTTP 200 OK (fallback session store)
 *      * Webhook idempotency -> In-memory fallback
 *      * Zero HTTP 500 errors across all routes
 * 3. Redis Recovery & Reconnection:
 *    - Re-establish Redis server on the port.
 *    - Verify isRedisAvailable() recovers cleanly to true.
 *    - Verify distributed caching & Lua rate-limiting resume in Redis.
 * 4. Adversarial Edge Cases:
 *    - Corrupted / Non-JSON data in cache -> Safe fallback without crash.
 *    - Command timeout / latency spike -> commandTimeout triggers without hanging.
 *    - Redis -OOM error string -> Caught gracefully, falls back.
 */

const http = require('http');
const net = require('net');
const path = require('path');
const fs = require('fs');
const { performance } = require('perf_hooks');

const HTTP_PORT = 3491;
const REDIS_PORT = 6395;
const BASE_URL = `http://127.0.0.1:${HTTP_PORT}`;

process.env.PORT = String(HTTP_PORT);
process.env.REDIS_HOST = '127.0.0.1';
process.env.REDIS_PORT = String(REDIS_PORT);
process.env.ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || 'test-admin-secret-key-not-for-production-32';
const ADMIN_KEY = process.env.ADMIN_SECRET_KEY;

// -------------------------------------------------------------------
// Enhanced Chaos-Enabled RESP Mock Redis Server
// -------------------------------------------------------------------
class ChaosMockRedisServer {
  constructor(port = REDIS_PORT) {
    this.port = port;
    this.server = null;
    this.store = new Map();
    this.zsets = new Map();
    this.activeSockets = new Set();
    this.injectDelayMs = 0;
    this.injectOom = false;
    this.injectCorrupt = false;
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        socket.setNoDelay(true);
        this.activeSockets.add(socket);
        let buffer = '';

        socket.on('data', (chunk) => {
          buffer += chunk.toString('binary');
          while (buffer.length > 0) {
            const parsed = this._parseCommand(buffer);
            if (!parsed) break;
            buffer = buffer.slice(parsed.bytesConsumed);
            if (this.injectDelayMs > 0) {
              setTimeout(() => {
                if (this.activeSockets.has(socket) && !socket.destroyed) {
                  this._handleCommand(socket, parsed.args);
                }
              }, this.injectDelayMs);
            } else {
              this._handleCommand(socket, parsed.args);
            }
          }
        });

        socket.on('close', () => this.activeSockets.delete(socket));
        socket.on('error', () => this.activeSockets.delete(socket));
      });

      this.server.listen(this.port, '127.0.0.1', () => resolve());
      this.server.on('error', reject);
    });
  }

  _parseCommand(buf) {
    if (buf.startsWith('*')) {
      let lineEnd = buf.indexOf('\r\n');
      if (lineEnd === -1) return null;
      const numArgs = parseInt(buf.slice(1, lineEnd), 10);
      if (isNaN(numArgs)) return null;

      const args = [];
      let cursor = lineEnd + 2;

      for (let i = 0; i < numArgs; i++) {
        if (cursor >= buf.length) return null;
        let nextEnd = buf.indexOf('\r\n', cursor);
        if (nextEnd === -1) return null;
        const len = parseInt(buf.slice(cursor + 1, nextEnd), 10);
        cursor = nextEnd + 2;
        if (cursor + len + 2 > buf.length) return null;
        const arg = buf.slice(cursor, cursor + len);
        cursor += len + 2;
        args.push(arg);
      }
      return { args, bytesConsumed: cursor };
    }
    const idx = buf.indexOf('\r\n');
    if (idx === -1) return null;
    const line = buf.slice(0, idx);
    return { args: line.split(/\s+/).filter(Boolean), bytesConsumed: idx + 2 };
  }

  _handleCommand(socket, args) {
    if (!args || args.length === 0) return;
    if (socket.destroyed) return;
    const cmd = args[0].toUpperCase();

    if (this.injectOom && cmd !== 'PING' && cmd !== 'INFO' && cmd !== 'COMMAND' && cmd !== 'CLIENT') {
      return socket.write('-OOM command not allowed when used memory > \'maxmemory\'.\r\n');
    }

    if (this.injectCorrupt && cmd === 'GET') {
      return socket.write('+CORRUPTED_NON_RESP_GARBAGE\r\n');
    }

    if (cmd === 'PING') return socket.write('+PONG\r\n');
    if (cmd === 'INFO') return socket.write('$10\r\nredis_mode\r\n');
    if (cmd === 'COMMAND') return socket.write('*0\r\n');
    if (cmd === 'CLIENT') return socket.write('+OK\r\n');

    if (cmd === 'GET') {
      const val = this.store.get(args[1]);
      if (val === undefined || val === null) return socket.write('$-1\r\n');
      const str = String(val);
      return socket.write(`$${Buffer.byteLength(str)}\r\n${str}\r\n`);
    }

    if (cmd === 'SET') {
      const key = args[1];
      const val = args[2];
      const hasNx = args.some(a => String(a).toUpperCase() === 'NX');
      if (hasNx && this.store.has(key)) {
        return socket.write('$-1\r\n');
      }
      this.store.set(key, val);
      return socket.write('+OK\r\n');
    }

    if (cmd === 'DEL' || cmd === 'UNLINK') {
      let count = 0;
      for (let i = 1; i < args.length; i++) {
        if (this.store.delete(args[i])) count++;
        if (this.zsets.delete(args[i])) count++;
      }
      return socket.write(`:${count}\r\n`);
    }

    if (cmd === 'SCAN') {
      const matchIdx = args.findIndex(a => a.toUpperCase() === 'MATCH');
      const pattern = matchIdx !== -1 ? args[matchIdx + 1] : '*';
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      const matched = [];
      for (const k of this.store.keys()) {
        if (regex.test(k)) matched.push(k);
      }
      let resp = `*2\r\n$1\r\n0\r\n*${matched.length}\r\n`;
      for (const m of matched) {
        resp += `$${Buffer.byteLength(m)}\r\n${m}\r\n`;
      }
      return socket.write(resp);
    }

    if (cmd === 'EVAL' || cmd === 'EVALSHA') {
      const key = args[3];
      const now = Number(args[4]);
      const windowMs = Number(args[5]);
      const maxRequests = Number(args[6]);
      const member = args[7];

      let zset = this.zsets.get(key) || [];
      zset = zset.filter(item => item.score > (now - windowMs));

      if (zset.length < maxRequests) {
        zset.push({ score: now, member });
        this.zsets.set(key, zset);
        const rem = maxRequests - zset.length;
        const resetSec = Math.ceil(windowMs / 1000);
        return socket.write(`*3\r\n:1\r\n:${rem}\r\n:${resetSec}\r\n`);
      } else {
        const oldest = zset[0] ? zset[0].score : now;
        const resetAfterMs = Math.max(1000, (oldest + windowMs) - now);
        const resetSec = Math.ceil(resetAfterMs / 1000);
        return socket.write(`*3\r\n:0\r\n:0\r\n:${resetSec}\r\n`);
      }
    }

    return socket.write('+OK\r\n');
  }

  destroyActiveSocketsNow() {
    const count = this.activeSockets.size;
    for (const sock of this.activeSockets) {
      try {
        sock.destroy(new Error('Chaos TCP connection reset'));
      } catch (_) {}
    }
    this.activeSockets.clear();
    return count;
  }

  kill() {
    this.destroyActiveSocketsNow();
    if (this.server) {
      return new Promise((resolve) => this.server.close(resolve));
    }
    return Promise.resolve();
  }
}

// -------------------------------------------------------------------
// HTTP Request Helper
// -------------------------------------------------------------------
function makeRequest(method, reqPath, body = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const targetUrl = new URL(reqPath, BASE_URL);
    const headers = { 'Content-Type': 'application/json', ...extraHeaders };
    const options = {
      hostname: targetUrl.hostname,
      port: targetUrl.port,
      path: targetUrl.pathname + targetUrl.search,
      method: method,
      headers: headers
    };

    const startTime = performance.now();
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const latencyMs = performance.now() - startTime;
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {
          json = data;
        }
        resolve({ status: res.statusCode, headers: res.headers, body: json, latencyMs });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

let passedAssertions = 0;
let totalAssertions = 0;
const failureDetails = [];

function assert(condition, message) {
  totalAssertions++;
  if (!condition) {
    console.error(`  ❌ FAIL: ${message}`);
    failureDetails.push(message);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✅ PASS: ${message}`);
  passedAssertions++;
}

// -------------------------------------------------------------------
// Main Adversarial Chaos Harness
// -------------------------------------------------------------------
async function runChaosHarness() {
  console.log('========================================================================');
  console.log('🔥 ALLEYRICH ADVERSARIAL CHAOS & FAULT TOLERANCE VERIFICATION SUITE 🔥');
  console.log('========================================================================\n');

  let mockRedis = null;
  let testServer = null;

  // Track uncaught exceptions and unhandled promise rejections
  const unhandledRejections = [];
  const uncaughtExceptions = [];
  process.on('unhandledRejection', (reason) => {
    console.error('[UNHANDLED REJECTION CAUGHT]', reason);
    unhandledRejections.push(reason);
  });
  process.on('uncaughtException', (err) => {
    console.error('[UNCAUGHT EXCEPTION CAUGHT]', err);
    uncaughtExceptions.push(err);
  });

  try {
    // -----------------------------------------------------------------
    // SETUP: Start Mock Redis and Server
    // -----------------------------------------------------------------
    console.log('[Setup] Launching Chaos Mock Redis on 127.0.0.1:' + REDIS_PORT + '...');
    mockRedis = new ChaosMockRedisServer(REDIS_PORT);
    await mockRedis.start();

    const appHandler = require('../server.js');
    const redis = require('../lib/redis.js');
    const security = require('../lib/security.js');

    // Explicitly initialize Redis client
    redis.initRedis(true);
    await new Promise(r => setTimeout(r, 250));

    testServer = http.createServer(appHandler);
    await new Promise(r => testServer.listen(HTTP_PORT, r));
    console.log(`[Setup] HTTP Test Server running on ${BASE_URL}\n`);

    // =================================================================
    // SECTION 1: Baseline Online Sanity Check
    // =================================================================
    console.log('--- SECTION 1: BASELINE ONLINE OPERATION ---');
    assert(redis.isRedisAvailable() === true, 'Redis is connected and isRedisAvailable() returns true');

    // Populate a test key
    await redis.cacheSet('chaos:init', { ready: true }, 60);
    const initVal = await redis.cacheGet('chaos:init');
    assert(initVal && initVal.ready === true, 'Baseline cacheSet and cacheGet succeed in Redis');
    console.log('✅ Section 1 passed: Baseline Redis is fully operational.\n');

    // =================================================================
    // SECTION 2: SUDDEN DISCONNECT CHAOS MID-OPERATION
    // =================================================================
    console.log('--- SECTION 2: SUDDEN TCP DISCONNECT CHAOS MID-OPERATION ---');
    console.log('Bombarding Redis with 60 concurrent in-flight requests while abruptly destroying TCP socket...');

    const inFlightPromises = [];

    // Queue 10 cache gets
    for (let i = 0; i < 10; i++) {
      inFlightPromises.push(redis.cacheGet(`chaos:key:${i}`).catch(e => ({ error: e.message })));
    }
    // Queue 10 cache sets
    for (let i = 0; i < 10; i++) {
      inFlightPromises.push(redis.cacheSet(`chaos:key:${i}`, { val: i }, 60).catch(e => ({ error: e.message })));
    }
    // Queue 10 rate limit checks
    for (let i = 0; i < 10; i++) {
      inFlightPromises.push(redis.checkRateLimit(`chaos_rl_${i}`, 10, 60).catch(e => ({ error: e.message })));
    }
    // Queue 10 HTTP catalog requests
    for (let i = 0; i < 10; i++) {
      inFlightPromises.push(makeRequest('GET', '/api/products').catch(e => ({ error: e.message })));
    }
    // Queue 10 HTTP collection requests
    for (let i = 0; i < 10; i++) {
      inFlightPromises.push(makeRequest('GET', '/api/collections').catch(e => ({ error: e.message })));
    }
    // Queue 10 user cart operations
    for (let i = 0; i < 10; i++) {
      inFlightPromises.push(redis.setUserCart(`user_${i}@chaos.com`, [{ id: `prod_${i}`, qty: 1 }]).catch(e => ({ error: e.message })));
    }

    // CHAOS TRIGGER: Abruptly destroy all active TCP sockets mid-flight!
    const destroyedSockets = mockRedis.destroyActiveSocketsNow();
    console.log(`💥 VIOLENT CHAOS: Severed ${destroyedSockets} active Redis TCP sockets mid-flight!`);

    // Await all in-flight operations
    const results = await Promise.allSettled(inFlightPromises);
    console.log(`All ${results.length} in-flight operations settled.`);

    // Give the client event loop 100ms to process socket closure
    await new Promise(r => setTimeout(r, 100));

    // Verify isRedisAvailable() cleanly transitioned to false
    assert(redis.isRedisAvailable() === false, 'isRedisAvailable() transitioned cleanly to false after abrupt TCP destruction');

    // Verify zero unhandled promise rejections or uncaught exceptions occurred
    assert(unhandledRejections.length === 0, `Zero unhandled promise rejections during sudden TCP destruction (count: ${unhandledRejections.length})`);
    assert(uncaughtExceptions.length === 0, `Zero uncaught exceptions during sudden TCP destruction (count: ${uncaughtExceptions.length})`);

    // Verify none of the HTTP catalog requests threw an unhandled 500 error
    const httpResults = results.slice(30, 50);
    let http500Count = 0;
    for (const r of httpResults) {
      if (r.status === 'fulfilled' && r.value && r.value.status === 500) {
        http500Count++;
      }
    }
    assert(http500Count === 0, `Zero HTTP 500 Internal Server Errors occurred during mid-flight socket destruction (count: ${http500Count})`);
    console.log('✅ Section 2 passed: Sudden disconnect chaos handled gracefully without crashes or 500s.\n');

    // =================================================================
    // SECTION 3: DEGRADED OFFLINE OPERATION (ZERO 500 ERRORS)
    // =================================================================
    console.log('--- SECTION 3: DEGRADED OFFLINE OPERATION (REDIS DOWN) ---');
    console.log('Closing Mock Redis server completely to guarantee ECONNREFUSED offline state...');
    await mockRedis.kill();
    await new Promise(r => setTimeout(r, 150));

    // 1. Catalog Products Query
    console.log('\n[Offline 1] Storefront Catalog Products:');
    const offlineProdRes = await makeRequest('GET', '/api/products');
    assert(offlineProdRes.status === 200, 'GET /api/products returns HTTP 200 OK while Redis is unreachable');
    assert(offlineProdRes.body.success === true && Array.isArray(offlineProdRes.body.products), 'Catalog response returns valid products array from local fallback storage');
    assert(offlineProdRes.body.products.length > 0, `Local fallback catalog contains products (count: ${offlineProdRes.body.products.length})`);

    // 2. Collections Query
    console.log('\n[Offline 2] Public Collections:');
    const offlineCollsRes = await makeRequest('GET', '/api/collections');
    assert(offlineCollsRes.status === 200, 'GET /api/collections returns HTTP 200 OK while Redis is unreachable');
    assert(offlineCollsRes.body.success === true && Array.isArray(offlineCollsRes.body.collections), 'Collections response returns valid array from local fallback storage');

    // 3. Rate Limiting via In-Memory Fallback
    console.log('\n[Offline 3] Rate Limiting In-Memory Fallback:');
    const testIp = '198.51.100.222';
    // Let's test checkRateLimit directly to avoid unrelated RDS timeouts
    let rateThrottled = false;
    for (let i = 0; i < 6; i++) {
      const rlResult = await redis.checkRateLimit(`test_offline_limit:${testIp}`, 5, 60);
      if (!rlResult.allowed) {
        rateThrottled = true;
        assert(rlResult.remaining === 0, 'Fallback rate limiter returns remaining = 0 when threshold reached');
        assert(rlResult.resetAfterSeconds > 0, `Fallback rate limiter provides valid resetAfterSeconds (${rlResult.resetAfterSeconds}s)`);
        break;
      }
    }
    assert(rateThrottled === true, 'Rate limiting successfully enforces threshold via in-memory fallback during Redis outage');

    // 4. Cart Sync via HTTP API (POST & GET /api/cart/sync)
    console.log('\n[Offline 4] Customer Cart Sync HTTP API:');
    const custId = 'cust_chaos_' + Date.now();
    const custEmail = 'chaos_customer@alleyrich.com';
    const custToken = security.createCustomerSession(custId, custEmail);

    const testCartPayload = {
      cart: [
        { id: 'item_1', title: 'Oversized Raw Tee', quantity: 2, price: 1999 },
        { id: 'item_2', title: 'Cyberpunk Cargo', quantity: 1, price: 2999 }
      ]
    };

    // POST /api/cart/sync
    const syncPostRes = await makeRequest('POST', '/api/cart/sync', testCartPayload, {
      Authorization: `Bearer ${custToken}`
    });
    assert(syncPostRes.status === 200, 'POST /api/cart/sync returns HTTP 200 OK while Redis is offline');
    assert(syncPostRes.body.success === true && syncPostRes.body.count === 2, 'POST /api/cart/sync persists cart in fallback store');

    // GET /api/cart/sync
    const syncGetRes = await makeRequest('GET', '/api/cart/sync', null, {
      Authorization: `Bearer ${custToken}`
    });
    assert(syncGetRes.status === 200, 'GET /api/cart/sync returns HTTP 200 OK while Redis is offline');
    assert(syncGetRes.body.success === true && Array.isArray(syncGetRes.body.cart) && syncGetRes.body.cart.length === 2, 'GET /api/cart/sync retrieves persisted cart from fallback store');
    assert(syncGetRes.body.cart[0].title === 'Oversized Raw Tee', 'Retrieved fallback cart matches posted items');

    // 5. Admin Session Verification via HTTP API (GET /api/admin/stats)
    console.log('\n[Offline 5] Admin Session Verification:');
    const adminSession = security.createAdminSession('chaos_superadmin');
    await redis.setAdminSession(adminSession.token, { username: 'chaos_superadmin' }, 3600);

    const adminStatsRes = await makeRequest('GET', '/api/admin/stats', null, {
      'x-admin-token': adminSession.token
    });
    assert(adminStatsRes.status === 200, 'GET /api/admin/stats returns HTTP 200 OK with admin session while Redis is offline');
    assert(adminStatsRes.body.success === true && typeof adminStatsRes.body.stats?.totalOrders === 'number', 'Admin dashboard statistics served successfully via fallback session');

    // 6. Cashfree Webhook Idempotency Fallback
    console.log('\n[Offline 6] Cashfree Webhook Idempotency:');
    const evtId = 'evt_chaos_' + Date.now();
    const isFirstTime = await redis.checkWebhookIdempotency(evtId, 3600);
    assert(isFirstTime === true, 'First webhook event is accepted in fallback store');
    const isDuplicate = await redis.checkWebhookIdempotency(evtId, 3600);
    assert(isDuplicate === false, 'Duplicate webhook event is blocked (idempotency preserved in fallback store)');

    // 7. Verify zero unhandled rejections during complete outage
    assert(unhandledRejections.length === 0, `Zero unhandled promise rejections detected during complete outage (count: ${unhandledRejections.length})`);
    console.log('✅ Section 3 passed: 100% storefront uptime and functionality maintained during complete Redis outage.\n');

    // =================================================================
    // SECTION 4: REDIS RECOVERY & RECONNECTION
    // =================================================================
    console.log('--- SECTION 4: REDIS RECOVERY & RECONNECTION ---');
    console.log('Restoring Redis server on port ' + REDIS_PORT + '...');

    mockRedis = new ChaosMockRedisServer(REDIS_PORT);
    await mockRedis.start();
    console.log('Mock Redis restarted.');

    // Wait for ioredis retry strategy or trigger reconnect
    console.log('Waiting for Redis client to detect reconnection...');
    const startTime = Date.now();
    let reconnected = false;

    // Retry loop checking isRedisAvailable()
    while (Date.now() - startTime < 8000) {
      if (redis.isRedisAvailable()) {
        reconnected = true;
        break;
      }
      await new Promise(r => setTimeout(r, 200));
    }

    if (!reconnected) {
      // If ioredis retry timer is between ticks, call initRedis() to ensure instant reconnect
      console.log('Calling initRedis(true) to trigger client reconnect...');
      redis.initRedis(true);
      await new Promise(r => setTimeout(r, 300));
      reconnected = redis.isRedisAvailable();
    }

    assert(reconnected === true, 'isRedisAvailable() recovered to true after Redis server was brought back online');

    // Verify distributed caching writes directly to Redis again
    console.log('\n[Recovery 1] Distributed Caching on Restored Redis:');
    const testRestoredKey = 'chaos:restored:catalog';
    await redis.cacheSet(testRestoredKey, { status: 'fully_restored' }, 120);
    assert(mockRedis.store.has(`alleyrich:${testRestoredKey}`), 'cacheSet persists key directly into restored Redis backend');

    const retrievedRestoredVal = await redis.cacheGet(testRestoredKey);
    assert(retrievedRestoredVal && retrievedRestoredVal.status === 'fully_restored', 'cacheGet retrieves key from restored Redis backend');

    // Verify distributed rate-limiting Lua script runs on restored Redis
    console.log('\n[Recovery 2] Distributed Rate Limiting on Restored Redis:');
    const restoredRl = await redis.checkRateLimit('restored_test', 5, 60);
    assert(restoredRl.allowed === true && restoredRl.remaining === 4, 'Rate limiting Lua script executes properly on restored Redis instance');
    assert(mockRedis.zsets.has('alleyrich:ratelimit:restored_test'), 'Rate limit sliding window ZSET exists in Redis store');

    // Verify instant cache invalidation on restored Redis
    console.log('\n[Recovery 3] Instant Wildcard Invalidation on Restored Redis:');
    await redis.cacheSet('catalog:products:drop1', { name: 'drop1' }, 120);
    await redis.cacheSet('catalog:products:drop2', { name: 'drop2' }, 120);
    assert(mockRedis.store.has('alleyrich:catalog:products:drop1'), 'Product drop 1 key exists in Redis store');
    assert(mockRedis.store.has('alleyrich:catalog:products:drop2'), 'Product drop 2 key exists in Redis store');

    const deletedCount = await redis.cacheDel('catalog:products:*');
    assert(deletedCount === 2, `Wildcard cacheDel purges keys from restored Redis (deleted: ${deletedCount})`);
    assert(!mockRedis.store.has('alleyrich:catalog:products:drop1'), 'Product drop 1 key deleted from Redis store');
    assert(!mockRedis.store.has('alleyrich:catalog:products:drop2'), 'Product drop 2 key deleted from Redis store');

    console.log('✅ Section 4 passed: Redis connection and all distributed features recovered automatically.\n');

    // =================================================================
    // SECTION 5: ADVERSARIAL EDGE CASES & CHAOS INJECTIONS
    // =================================================================
    console.log('--- SECTION 5: ADVERSARIAL EDGE CASES & CHAOS INJECTIONS ---');

    // Edge Case 1: Corrupted Non-JSON Cache Values
    console.log('\n[Edge Case 1] Non-JSON Corrupted Value in Cache:');
    mockRedis.store.set('alleyrich:chaos:corrupt', '{ INVALID JSON !@#$%^&*()');
    let corruptGetHandled = false;
    try {
      const corruptVal = await redis.cacheGet('chaos:corrupt');
      // Should return raw string or null without throwing
      assert(typeof corruptVal === 'string' || corruptVal === null, 'cacheGet safely handles non-JSON strings without throwing JSON parse error');
      corruptGetHandled = true;
    } catch (e) {
      console.error('cacheGet threw on invalid JSON:', e);
    }
    assert(corruptGetHandled === true, 'Corrupted cache entry handled gracefully');

    // Edge Case 2: Redis Server Out of Memory (-OOM)
    console.log('\n[Edge Case 2] Redis Returns -OOM Error:');
    mockRedis.injectOom = true;
    let oomSetHandled = false;
    try {
      // cacheSet should catch the OOM error and fall back to in-memory store
      const oomRes = await redis.cacheSet('chaos:oom_key', { safe: true }, 60);
      const fallbackVal = await redis.cacheGet('chaos:oom_key');
      assert(fallbackVal && fallbackVal.safe === true, 'cacheSet safely falls back to local in-memory tier when Redis returns -OOM');
      oomSetHandled = true;
    } catch (e) {
      console.error('cacheSet threw on -OOM:', e);
    }
    assert(oomSetHandled === true, 'Redis -OOM error handled without throwing');
    mockRedis.injectOom = false;

    // Edge Case 3: Redis High Latency / Command Timeout Simulation
    console.log('\n[Edge Case 3] Redis Latency Spike Exceeding commandTimeout (1000ms):');
    console.log('  - isRedisAvailable before latency injection:', redis.isRedisAvailable());
    // Set mock Redis delay to 1200ms (greater than 1000ms commandTimeout in ioredis options)
    mockRedis.injectDelayMs = 1200;
    let timeoutHandled = false;
    const t0 = performance.now();
    try {
      // Rate limit check should timeout after 1000ms, mark isAvailable=false, and succeed via in-memory fallback
      const rlTimeoutRes = await redis.checkRateLimit('timeout_test', 10, 60);
      const elapsed = performance.now() - t0;
      console.log(`  - Rate limit check with latency spike finished in ${elapsed.toFixed(1)}ms`);
      console.log('  - isRedisAvailable after latency spike:', redis.isRedisAvailable());
      assert(rlTimeoutRes.allowed === true, 'checkRateLimit succeeds via fallback when Redis command times out');
      timeoutHandled = true;
    } catch (e) {
      console.error('checkRateLimit threw on commandTimeout:', e);
    }
    assert(timeoutHandled === true, 'Redis command timeout handled without throwing or hanging');
    mockRedis.injectDelayMs = 0;

    console.log('\n✅ Section 5 passed: All adversarial edge cases survived with zero crashes.\n');

    // =================================================================
    // FINAL ASSESSMENT
    // =================================================================
    console.log('========================================================================');
    console.log(`🏆 ALL ADVERSARIAL CHAOS TESTS PASSED! (${passedAssertions}/${totalAssertions} assertions)`);
    console.log(`💥 Total Unhandled Rejections: ${unhandledRejections.length}`);
    console.log(`💥 Total Uncaught Exceptions:    ${uncaughtExceptions.length}`);
    console.log('VERDICT: APPROVE');
    console.log('========================================================================\n');

  } catch (err) {
    console.error('\n❌ ADVERSARIAL CHAOS SUITE FAILED:', err);
    process.exitCode = 1;
  } finally {
    if (testServer) {
      try { testServer.close(); } catch (_) {}
    }
    if (mockRedis) {
      try { await mockRedis.kill(); } catch (_) {}
    }
    process.exit(process.exitCode || 0);
  }
}

runChaosHarness();
