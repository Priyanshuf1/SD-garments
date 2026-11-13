/**
 * ALLEYRICH — E2E Redis Test Helper & Resilience Manager
 * File: tests/e2e/helpers/redis_helper.js
 * 
 * Provides state management and fault injection for Redis caching and
 * fallback resilience testing (Feature F12). Allows tests to inspect
 * live/offline health and simulate mid-flight disconnects without crashing.
 */

'use strict';

const path = require('node:path');

let cachedRedisModule = null;
let originalIsRedisAvailable = null;
let originalGetRedisClient = null;
let isSimulatingOffline = false;

/**
 * Safely load lib/redis.js if it exists in the codebase.
 */
function getRedisModule() {
  if (cachedRedisModule !== null) {
    return cachedRedisModule;
  }

  const redisPath = path.resolve(__dirname, '../../../lib/redis.js');
  try {
    cachedRedisModule = require(redisPath);
  } catch (_) {
    cachedRedisModule = false;
  }

  return cachedRedisModule;
}

/**
 * Check whether Redis is currently available and online.
 */
function isRedisAvailable() {
  if (isSimulatingOffline) return false;
  const mod = getRedisModule();
  if (mod && typeof mod.isRedisAvailable === 'function') {
    return Boolean(mod.isRedisAvailable());
  }
  return false;
}

/**
 * Retrieve the active Redis client or null if offline.
 */
function getRedisClient() {
  if (isSimulatingOffline) return null;
  const mod = getRedisModule();
  if (mod && typeof mod.getRedisClient === 'function') {
    return mod.getRedisClient();
  }
  return null;
}

/**
 * Simulate Redis outage/disconnect for offline resilience testing (F12).
 * Intercepts isRedisAvailable() and getRedisClient() so application code
 * immediately triggers fallback behavior.
 * 
 * @returns {Function} restore - Function to restore normal online status
 */
function simulateOffline() {
  isSimulatingOffline = true;
  const mod = getRedisModule();

  if (mod && typeof mod.isRedisAvailable === 'function' && !originalIsRedisAvailable) {
    originalIsRedisAvailable = mod.isRedisAvailable;
    mod.isRedisAvailable = () => false;
  }

  if (mod && typeof mod.getRedisClient === 'function' && !originalGetRedisClient) {
    originalGetRedisClient = mod.getRedisClient;
    mod.getRedisClient = () => null;
  }

  return () => restoreOnline();
}

/**
 * Restore Redis to its original connected state following an offline simulation.
 */
function restoreOnline() {
  isSimulatingOffline = false;
  const mod = getRedisModule();

  if (mod && originalIsRedisAvailable) {
    mod.isRedisAvailable = originalIsRedisAvailable;
    originalIsRedisAvailable = null;
  }

  if (mod && originalGetRedisClient) {
    mod.getRedisClient = originalGetRedisClient;
    originalGetRedisClient = null;
  }
}

/**
 * Safely read a cached key from Redis or fallback store.
 */
async function cacheGet(key) {
  const mod = getRedisModule();
  if (mod && typeof mod.cacheGet === 'function') {
    return await mod.cacheGet(key);
  }
  return null;
}

/**
 * Safely write a cache key to Redis or fallback store.
 */
async function cacheSet(key, value, ttlSeconds = 300) {
  const mod = getRedisModule();
  if (mod && typeof mod.cacheSet === 'function') {
    return await mod.cacheSet(key, value, ttlSeconds);
  }
  return false;
}

/**
 * Safely invalidate a cache key or pattern.
 */
async function cacheDel(patternOrKey) {
  const mod = getRedisModule();
  if (mod && typeof mod.cacheDel === 'function') {
    return await mod.cacheDel(patternOrKey);
  }
  return false;
}

/**
 * Inspect in-memory fallback stores (e.g. fallbackCache, fallbackRateLimitBuckets)
 */
function getFallbackStore(storeName) {
  const mod = getRedisModule();
  if (mod && mod[storeName]) {
    return mod[storeName];
  }
  return null;
}

module.exports = {
  getRedisModule,
  isRedisAvailable,
  getRedisClient,
  simulateOffline,
  restoreOnline,
  cacheGet,
  cacheSet,
  cacheDel,
  getFallbackStore
};
