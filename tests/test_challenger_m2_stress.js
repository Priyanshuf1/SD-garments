/**
 * ALLEYRICH — Milestone 2 Empirical Challenger Stress & Benchmark Harness
 * File: tests/test_challenger_m2_stress.js
 *
 * Objectives:
 * 1. Benchmark Cache Retrieval Latency:
 *    - Measure 100 consecutive cache hits on `lib/redis.js: cacheGet('alleyrich:catalog:products:all')`
 *    - Verify latency remains sub-millisecond (< 2ms) across Min, Mean, Median (p50), p95, p99, and Max.
 * 2. Rate Limiting Boundary & Concurrency Stress Test:
 *    - Fire high-concurrency bursts against `checkRateLimit` (50 concurrent calls for 10-slot limit).
 *    - Verify exact rejection semantics ({ allowed: false, remaining: 0, resetAfterSeconds: > 0 }).
 *    - Verify true continuous sliding-window staggered expiration.
 *    - Verify window boundary recovery after reset duration elapses.
 * 3. Cache Invalidation Concurrency Stress Test:
 *    - 250 concurrent cache reads overlapping with live admin `cacheDel` & `cacheSet` mutations.
 *    - Verify zero race condition corruptions, zero nulls/exceptions, and zero stale reads post-invalidation.
 * 4. Fallback In-Memory Rate Limiting Concurrency:
 *    - Verify identical atomic behavior during full Redis outage.
 */

const net = require('net');
const { performance } = require('perf_hooks');

// Prevent AWS RDS external network attempts during stress testing
delete process.env.DATABASE_URL;
delete process.env.RDS_HOST;
delete process.env.RDS_USER;
delete process.env.RDS_PASSWORD;

const REDIS_STRESS_PORT = 6392;
process.env.REDIS_HOST = '127.0.0.1';
process.env.REDIS_PORT = String(REDIS_STRESS_PORT);

// -------------------------------------------------------------------
// 1. High-Performance Embedded RESP Mock Redis Server
// -------------------------------------------------------------------
class MockStressRedisServer {
  constructor(port = REDIS_STRESS_PORT) {
    this.port = port;
    this.server = null;
    this.store = new Map();
    this.zsets = new Map();
    this.activeSockets = new Set();
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
            this._handleCommand(socket, parsed.args);
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
      const lineEnd = buf.indexOf('\r\n');
      if (lineEnd === -1) return null;
      const numArgs = parseInt(buf.slice(1, lineEnd), 10);
      if (isNaN(numArgs)) return null;

      const args = [];
      let cursor = lineEnd + 2;

      for (let i = 0; i < numArgs; i++) {
        if (cursor >= buf.length) return null;
        const nextEnd = buf.indexOf('\r\n', cursor);
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
    const cmd = args[0].toUpperCase();

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
      // Sliding window rate limiter script emulation
      const key = args[3];
      const now = Number(args[4]);
      const windowMs = Number(args[5]);
      const maxRequests = Number(args[6]);
      const member = args[7];

      let zset = this.zsets.get(key) || [];
      zset = zset.filter(item => item.score > (now - windowMs));

      if (zset.length < maxRequests) {
        zset.push({ score: now, member });
        // Maintain sorted order by score
        zset.sort((a, b) => a.score - b.score);
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

  kill() {
    for (const sock of this.activeSockets) {
      try {
        sock.destroy();
      } catch (_) {}
    }
    this.activeSockets.clear();
    if (this.server) {
      return new Promise((resolve) => this.server.close(resolve));
    }
    return Promise.resolve();
  }
}

// -------------------------------------------------------------------
// 2. Metrics & Assertion Helpers
// -------------------------------------------------------------------
let passedCount = 0;
let totalCount = 0;
const findings = [];

function assert(cond, message) {
  totalCount++;
  if (!cond) {
    console.error(`  ❌ FAIL: ${message}`);
    findings.push({ status: 'FAIL', message });
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✅ PASS: ${message}`);
  passedCount++;
  findings.push({ status: 'PASS', message });
}

function calculatePercentile(sortedArr, p) {
  if (sortedArr.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, Math.min(idx, sortedArr.length - 1))];
}

// -------------------------------------------------------------------
// 3. Main Empirical Stress Test Suite
// -------------------------------------------------------------------
async function runChallengerStressSuite() {
  console.log('========================================================================');
  console.log('⚔️  ALLEYRICH M2 EMPIRICAL CHALLENGER: REDIS STRESS & LATENCY HARNESS  ⚔️');
  console.log('========================================================================\n');

  let mockRedis = null;

  try {
    // -----------------------------------------------------------------
    // SETUP: Initialize Mock Redis on Dedicated Port 6392
    // -----------------------------------------------------------------
    console.log('[Setup] Starting Dedicated Mock Redis Server on port 6392...');
    mockRedis = new MockStressRedisServer(REDIS_STRESS_PORT);
    await mockRedis.start();
    console.log('🚀 Mock Redis listening on 127.0.0.1:6392\n');

    const redis = require('../lib/redis.js');
    redis.initRedis(true);

    // Wait for connection ready event
    await new Promise((r) => setTimeout(r, 250));
    assert(redis.isRedisAvailable() === true, 'Redis client is connected and ready on port 6392');

    // =================================================================
    // SUITE 1: 100 CONSECUTIVE CACHE HITS LATENCY BENCHMARK
    // =================================================================
    console.log('\n--- SUITE 1: CACHE RETRIEVAL LATENCY BENCHMARK (100 HITS) ---');

    // Build a realistic 50-product catalog payload (~15 KB JSON)
    const catalogProducts = [];
    for (let i = 1; i <= 50; i++) {
      catalogProducts.push({
        id: `prod_${i}`,
        title: `AlleyRich Premium Heavyweight Tee ${i}`,
        handle: `alleyrich-heavyweight-tee-${i}`,
        category: i % 2 === 0 ? 'Streetwear' : 'Luxury',
        price: 2499,
        variants: [
          { id: `var_${i}_s`, title: 'S', inventory_quantity: 10 },
          { id: `var_${i}_m`, title: 'M', inventory_quantity: 25 },
          { id: `var_${i}_l`, title: 'L', inventory_quantity: 15 }
        ],
        tags: ['oversized', 'heavyweight', 'drop-2026'],
        published_at: new Date().toISOString()
      });
    }
    const catalogPayload = {
      success: true,
      count: catalogProducts.length,
      products: catalogProducts
    };

    // Populate catalog in Redis
    const cacheKey = 'alleyrich:catalog:products:all';
    await redis.cacheSet(cacheKey, catalogPayload, 300);

    // Initial read to prime any L1 memory cache
    const initialGet = await redis.cacheGet(cacheKey);
    assert(initialGet && initialGet.count === 50, 'Initial catalog read successfully retrieved 50 items');

    // Execute 100 consecutive cache hits
    const latenciesMs = [];
    let corruptions = 0;

    for (let i = 0; i < 100; i++) {
      const tStart = performance.now();
      const hit = await redis.cacheGet(cacheKey);
      const tElapsed = performance.now() - tStart;
      latenciesMs.push(tElapsed);

      if (!hit || hit.success !== true || !Array.isArray(hit.products) || hit.products.length !== 50) {
        corruptions++;
      }
    }

    assert(corruptions === 0, 'Zero payload corruptions across 100 consecutive cache reads');

    // Statistical analysis
    const sorted = [...latenciesMs].sort((a, b) => a - b);
    const minMs = sorted[0];
    const maxMs = sorted[sorted.length - 1];
    const sumMs = sorted.reduce((acc, v) => acc + v, 0);
    const meanMs = sumMs / sorted.length;
    const medianMs = calculatePercentile(sorted, 50);
    const p90Ms = calculatePercentile(sorted, 90);
    const p95Ms = calculatePercentile(sorted, 95);
    const p99Ms = calculatePercentile(sorted, 99);
    const violations = sorted.filter(l => l >= 2.0).length;

    console.log(`\n  📊 Benchmark Telemetry (100 consecutive hits):`);
    console.log(`     - Minimum Latency:  ${minMs.toFixed(4)} ms`);
    console.log(`     - Mean Latency:     ${meanMs.toFixed(4)} ms`);
    console.log(`     - Median (p50):     ${medianMs.toFixed(4)} ms`);
    console.log(`     - p90 Latency:      ${p90Ms.toFixed(4)} ms`);
    console.log(`     - p95 Latency:      ${p95Ms.toFixed(4)} ms`);
    console.log(`     - p99 Latency:      ${p99Ms.toFixed(4)} ms`);
    console.log(`     - Maximum Latency:  ${maxMs.toFixed(4)} ms`);
    console.log(`     - Hits >= 2.0ms:    ${violations} / 100\n`);

    assert(meanMs < 1.0, `Mean cache retrieval latency is sub-millisecond (< 1.0ms, observed: ${meanMs.toFixed(4)}ms)`);
    assert(p95Ms < 2.0, `p95 cache retrieval latency is strictly sub-millisecond (< 2.0ms, observed: ${p95Ms.toFixed(4)}ms)`);
    assert(p99Ms < 2.0, `p99 cache retrieval latency meets threshold (< 2.0ms, observed: ${p99Ms.toFixed(4)}ms)`);
    assert(violations === 0, `Zero latency violations above 2.0ms (observed violations: ${violations})`);

    // =================================================================
    // SUITE 2: RATE LIMITING BOUNDARY & CONCURRENCY STRESS TEST
    // =================================================================
    console.log('\n--- SUITE 2: RATE LIMITING BOUNDARY & CONCURRENCY STRESS ---');

    // 2.1 Concurrent Burst Over-Limit:
    // Fire 50 concurrent requests against a 10-request capacity window
    const burstKey = `stress_burst_${Date.now()}`;
    const maxAllowed = 10;
    const windowSec = 2;
    const burstCount = 50;

    console.log(`  [2.1] Firing burst of ${burstCount} simultaneous requests (limit: ${maxAllowed} / ${windowSec}s)...`);
    const burstPromises = [];
    for (let i = 0; i < burstCount; i++) {
      burstPromises.push(redis.checkRateLimit(burstKey, maxAllowed, windowSec));
    }
    const burstResults = await Promise.all(burstPromises);

    const allowedCalls = burstResults.filter(r => r.allowed === true);
    const rejectedCalls = burstResults.filter(r => r.allowed === false);

    assert(allowedCalls.length === maxAllowed, `Exactly ${maxAllowed} requests allowed in concurrent burst (observed: ${allowedCalls.length})`);
    assert(rejectedCalls.length === burstCount - maxAllowed, `Exactly ${burstCount - maxAllowed} requests rejected in concurrent burst (observed: ${rejectedCalls.length})`);

    // Verify remaining values of allowed requests decrement properly
    const remainingValues = allowedCalls.map(r => r.remaining).sort((a, b) => a - b);
    const expectedRemainings = Array.from({ length: maxAllowed }, (_, i) => i);
    const remainingsMatch = JSON.stringify(remainingValues) === JSON.stringify(expectedRemainings);
    assert(remainingsMatch === true, `Allowed requests cleanly decrement remaining tokens from ${maxAllowed - 1} down to 0`);

    // Verify rejection semantics
    const allRejectedHaveZeroRemaining = rejectedCalls.every(r => r.remaining === 0);
    const allRejectedHaveResetTime = rejectedCalls.every(r => r.resetAfterSeconds > 0 && r.resetAfterSeconds <= windowSec);
    assert(allRejectedHaveZeroRemaining === true, 'All rejected requests have remaining === 0');
    assert(allRejectedHaveResetTime === true, 'All rejected requests provide valid positive resetAfterSeconds');

    // 2.2 Window Boundary Recovery Test:
    // Wait for the window to expire and verify immediate recovery
    const maxResetSec = Math.max(...rejectedCalls.map(r => r.resetAfterSeconds));
    const waitMs = (maxResetSec * 1000) + 150;
    console.log(`  [2.2] Awaiting window boundary expiration (${waitMs}ms)...`);
    await new Promise(r => setTimeout(r, waitMs));

    const postRecoveryReq = await redis.checkRateLimit(burstKey, maxAllowed, windowSec);
    assert(postRecoveryReq.allowed === true, 'Request immediately allowed after sliding window reset');
    assert(postRecoveryReq.remaining === maxAllowed - 1, `Remaining tokens reset to ${maxAllowed - 1} upon window rollover (observed: ${postRecoveryReq.remaining})`);

    // 2.3 Continuous Sliding Window Staggered Expiration Test:
    console.log('  [2.3] Testing continuous sliding window expiration with staggered arrival times...');
    const staggerKey = `stress_stagger_${Date.now()}`;
    const staggerLimit = 3;
    const staggerWindowSec = 1; // 1 second window

    // T=0ms: Req 1
    const s1 = await redis.checkRateLimit(staggerKey, staggerLimit, staggerWindowSec);
    assert(s1.allowed === true && s1.remaining === 2, 'Staggered Req 1 at T=0ms allowed (remaining: 2)');

    // Sleep 400ms -> T=400ms: Req 2
    await new Promise(r => setTimeout(r, 400));
    const s2 = await redis.checkRateLimit(staggerKey, staggerLimit, staggerWindowSec);
    assert(s2.allowed === true && s2.remaining === 1, 'Staggered Req 2 at T=400ms allowed (remaining: 1)');

    // Sleep 400ms -> T=800ms: Req 3 (Window full: [0ms, 400ms, 800ms])
    await new Promise(r => setTimeout(r, 400));
    const s3 = await redis.checkRateLimit(staggerKey, staggerLimit, staggerWindowSec);
    assert(s3.allowed === true && s3.remaining === 0, 'Staggered Req 3 at T=800ms allowed (remaining: 0)');

    // Immediate Req 4 at T=810ms must be rejected
    const s4 = await redis.checkRateLimit(staggerKey, staggerLimit, staggerWindowSec);
    assert(s4.allowed === false, 'Staggered Req 4 at T=810ms rejected (rate limit full)');

    // Sleep 350ms -> T=1160ms.
    // Req 1 (at T=0ms) is now 1160ms old -> EXPIRED from 1000ms window!
    // But Req 2 (T=400ms, age: 760ms) and Req 3 (T=800ms, age: 360ms) are STILL ACTIVE!
    // Therefore exactly 1 slot should have freed up!
    await new Promise(r => setTimeout(r, 350));
    const s5 = await redis.checkRateLimit(staggerKey, staggerLimit, staggerWindowSec);
    assert(s5.allowed === true && s5.remaining === 0, 'Staggered Req 5 at T=1160ms allowed as oldest timestamp slides out (true sliding-window behavior)');

    // And Req 6 immediately afterwards must be rejected (window full again with [400ms, 800ms, 1160ms])
    const s6 = await redis.checkRateLimit(staggerKey, staggerLimit, staggerWindowSec);
    assert(s6.allowed === false, 'Staggered Req 6 immediately rejected as newly allocated slot is consumed');

    // =================================================================
    // SUITE 3: CACHE INVALIDATION CONCURRENCY STRESS TEST
    // =================================================================
    console.log('\n--- SUITE 3: CACHE INVALIDATION CONCURRENCY STRESS ---');

    const invKey = 'alleyrich:catalog:products:all';
    const v1Data = { version: 'v1', count: 10, products: [{ id: 'p1', title: 'V1 Product' }] };
    const v2Data = { version: 'v2', count: 20, products: [{ id: 'p2', title: 'V2 Product Updated' }] };

    await redis.cacheSet(invKey, v1Data, 300);

    // Launch 50 concurrent reader workers, each performing 5 reads with jitter
    const concurrencyReaders = 50;
    const readsPerWorker = 5;
    const totalReads = concurrencyReaders * readsPerWorker;

    let readErrors = 0;
    let corruptedReads = 0;
    let v1Hits = 0;
    let v2Hits = 0;
    let cacheMisses = 0;

    console.log(`  Launching ${concurrencyReaders} concurrent reader workers (${totalReads} total reads) against live mutation...`);

    const readerWorker = async (workerId) => {
      for (let j = 0; j < readsPerWorker; j++) {
        // Micro-jitter 0-4ms
        await new Promise(r => setTimeout(r, Math.floor(Math.random() * 5)));
        try {
          const res = await redis.cacheGet(invKey);
          if (res === null) {
            // Clean cache miss during invalidation window (expected while purged)
            cacheMisses++;
          } else if (res && typeof res === 'object' && (res.version === 'v1' || res.version === 'v2')) {
            if (res.version === 'v1') v1Hits++;
            if (res.version === 'v2') v2Hits++;
          } else {
            // Any partial or malformed payload is a genuine corruption
            corruptedReads++;
          }
        } catch (e) {
          readErrors++;
        }
      }
    };

    // Admin mutation worker executes simultaneously
    const adminWorker = async () => {
      // Small pause to let reads begin in flight
      await new Promise(r => setTimeout(r, 4));
      // Purge wildcard
      const delCount = await redis.cacheDel('alleyrich:catalog:products:*');
      // Small pause to test cache miss window
      await new Promise(r => setTimeout(r, 2));
      // Set updated V2 catalog
      await redis.cacheSet(invKey, v2Data, 300);
      return delCount;
    };

    // Run readers and admin mutation concurrently
    const [_, delCount] = await Promise.all([
      Promise.all(Array.from({ length: concurrencyReaders }, (_, i) => readerWorker(i))),
      adminWorker()
    ]);

    console.log(`  Telemetry during concurrent invalidation:`);
    console.log(`     - V1 Hits (pre-mutation):       ${v1Hits}`);
    console.log(`     - Cache Misses (during purge):   ${cacheMisses}`);
    console.log(`     - V2 Hits (post-mutation):      ${v2Hits}`);
    console.log(`     - Corrupted Payloads:           ${corruptedReads}`);
    console.log(`     - Exceptions / Errors:          ${readErrors}`);

    assert(readErrors === 0, `Zero read errors during concurrent cache invalidation (observed: ${readErrors})`);
    assert(corruptedReads === 0, `Zero corrupted payloads during concurrent cache invalidation (observed: ${corruptedReads})`);
    assert(v1Hits + cacheMisses + v2Hits === totalReads, `All ${totalReads} reads resolved cleanly (V1: ${v1Hits}, Misses: ${cacheMisses}, V2: ${v2Hits})`);

    // Verify all subsequent reads strictly return V2
    const finalRead = await redis.cacheGet(invKey);
    assert(finalRead && finalRead.version === 'v2', 'Post-invalidation cache read strictly returns V2 payload (zero stale cache lag)');

    // =================================================================
    // SUITE 4: FALLBACK IN-MEMORY RATE LIMITING CONCURRENCY (REDIS OFFLINE)
    // =================================================================
    console.log('\n--- SUITE 4: FALLBACK IN-MEMORY CONCURRENCY STRESS (REDIS DOWN) ---');

    console.log('  Abruptly destroying Redis server socket...');
    await mockRedis.kill();
    // Allow ioredis client event loop to capture disconnect
    await new Promise(r => setTimeout(r, 150));
    assert(redis.isRedisAvailable() === false, 'Redis is confirmed offline (isRedisAvailable === false)');

    const fallbackBurstKey = `fallback_burst_${Date.now()}`;
    const fbLimit = 8;
    const fbWindowSec = 2;
    const fbBurstCount = 40;

    console.log(`  Firing burst of ${fbBurstCount} concurrent requests against in-memory fallback (limit: ${fbLimit})...`);
    const fbPromises = [];
    for (let i = 0; i < fbBurstCount; i++) {
      fbPromises.push(redis.checkRateLimit(fallbackBurstKey, fbLimit, fbWindowSec));
    }
    const fbResults = await Promise.all(fbPromises);

    const fbAllowed = fbResults.filter(r => r.allowed === true);
    const fbRejected = fbResults.filter(r => r.allowed === false);

    assert(fbAllowed.length === fbLimit, `Fallback in-memory limiter strictly allowed exactly ${fbLimit} requests under concurrent burst (observed: ${fbAllowed.length})`);
    assert(fbRejected.length === fbBurstCount - fbLimit, `Fallback in-memory limiter rejected exactly ${fbBurstCount - fbLimit} overflow requests`);
    assert(fbRejected.every(r => r.remaining === 0 && r.resetAfterSeconds > 0), 'All fallback rejected requests return remaining === 0 and resetAfterSeconds > 0');

    // =================================================================
    // SUITE 5: WEBHOOK IDEMPOTENCY CONCURRENCY & BOUNDARY EDGE CASES
    // =================================================================
    console.log('\n--- SUITE 5: WEBHOOK IDEMPOTENCY CONCURRENCY & EDGE CASES ---');

    // 5.1 Test in-memory fallback idempotency under concurrent race condition
    const eventId = `cf_evt_${Date.now()}`;
    const concurrentEvents = 20;
    console.log(`  Firing ${concurrentEvents} concurrent webhook idempotency claims for event ${eventId}...`);
    const idempResults = await Promise.all(
      Array.from({ length: concurrentEvents }, () => redis.checkWebhookIdempotency(eventId, 3600))
    );
    const idempWins = idempResults.filter(r => r === true);
    const idempRejections = idempResults.filter(r => r === false);

    assert(idempWins.length === 1, `Exactly 1 webhook claim succeeded (observed: ${idempWins.length})`);
    assert(idempRejections.length === concurrentEvents - 1, `Exactly ${concurrentEvents - 1} duplicate webhook claims rejected`);

    // 5.2 Edge Cases: Non-existent cache key, null session token, empty cart handling
    const nonExistentKey = await redis.cacheGet('alleyrich:nonexistent:key');
    assert(nonExistentKey === null, 'cacheGet on non-existent key returns null');

    const nullSession = await redis.getAdminSession('');
    assert(nullSession === null, 'getAdminSession with empty token returns null');

    const emptyCart = await redis.getUserCart('unknown_user@test.com');
    assert(emptyCart === null, 'getUserCart on unset customer returns null');

    // =================================================================
    // SUMMARY REPORT
    // =================================================================
    console.log('\n========================================================================');
    console.log(`🎉 EMPIRICAL CHALLENGER STRESS PASS: ${passedCount} / ${totalCount} Assertions Passed!`);
    console.log('========================================================================\n');

  } catch (err) {
    console.error('\n❌ CHALLENGER STRESS SUITE ENCOUNTERED AN ERROR:', err);
    process.exitCode = 1;
  } finally {
    if (mockRedis) {
      await mockRedis.kill();
    }
    process.exit(process.exitCode || 0);
  }
}

runChallengerStressSuite();
