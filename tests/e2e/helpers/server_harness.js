/**
 * ALLEYRICH — In-Process Ephemeral Server Test Harness
 * File: tests/e2e/helpers/server_harness.js
 * 
 * Manages in-process HTTP server lifecycle on ephemeral port 0.
 * Eliminates port collisions (EADDRINUSE), provides zero-dependency socket tracking,
 * and executes clean teardown of HTTP sockets, database pools, and Redis connections.
 */

'use strict';

const http = require('node:http');
const path = require('node:path');
const { HttpClient } = require('./http_client.js');
const assertions = require('./assertions.js');
const mockEnv = require('./mock_env.js');
const redisHelper = require('./redis_helper.js');

let activeHarness = null;
const activeSockets = new Set();

/**
 * Boot the application server in-process on an OS-assigned ephemeral port (0).
 * 
 * @param {Object} [options]
 * @param {boolean} [options.verbose] - Enable verbose HTTP logging
 * @returns {Promise<Object>} harness - Running server instance and test client
 */
async function startServer(options = {}) {
  if (activeHarness && activeHarness.server && activeHarness.server.listening) {
    return activeHarness;
  }

  // Ensure sandbox environment is configured prior to server handler loading
  mockEnv.setupSandboxEnvironment();

  // Load server.js request handler
  const serverPath = path.resolve(__dirname, '../../../server.js');
  let rawExport = require(serverPath);
  const appHandler = typeof rawExport === 'function' ? rawExport : (rawExport.default || rawExport.appHandler || rawExport);

  if (typeof appHandler !== 'function') {
    throw new TypeError(`Expected server.js to export an HTTP request handler function, got: ${typeof appHandler}`);
  }

  const testServer = http.createServer(appHandler);

  // Track active network sockets for immediate, non-hanging teardown
  testServer.on('connection', (socket) => {
    activeSockets.add(socket);
    socket.once('close', () => {
      activeSockets.delete(socket);
    });
  });

  // Listen on ephemeral port 0 (OS allocates available high-range port)
  await new Promise((resolve, reject) => {
    testServer.listen(0, '127.0.0.1', () => resolve());
    testServer.once('error', reject);
  });

  const address = testServer.address();
  const port = address.port;
  const baseUrl = `http://127.0.0.1:${port}`;

  // Update PORT environment variable so internal URLs match the ephemeral port
  process.env.PORT = String(port);

  const client = new HttpClient({
    baseUrl,
    verbose: options.verbose
  });

  activeHarness = {
    server: testServer,
    port,
    baseUrl,
    client,
    assert: assertions,
    env: mockEnv,
    redis: redisHelper,
    helpers: {
      mockEnv,
      redisHelper,
      assertions,
      HttpClient
    },
    close: async () => {
      await stopServer(testServer);
    }
  };

  return activeHarness;
}

/**
 * Gracefully stop the test server and tear down all associated resources.
 * 
 * @param {http.Server} [serverInstance] - Specific server instance to terminate
 */
async function stopServer(serverInstance) {
  const targetServer = serverInstance || (activeHarness ? activeHarness.server : null);

  if (targetServer) {
    // Terminate active socket connections
    if (typeof targetServer.closeAllConnections === 'function') {
      targetServer.closeAllConnections();
    } else if (typeof targetServer.closeIdleConnections === 'function') {
      targetServer.closeIdleConnections();
    }

    // Force-destroy any remaining lingering sockets
    for (const socket of activeSockets) {
      try {
        socket.destroy();
      } catch (_) {}
    }
    activeSockets.clear();

    // Close HTTP server listener
    if (targetServer.listening) {
      await new Promise((resolve) => targetServer.close(() => resolve()));
    }
  }

  // Teardown PostgreSQL connection pool if initialized
  try {
    const dbPath = path.resolve(__dirname, '../../../lib/db.js');
    if (require.cache[dbPath]) {
      const db = require(dbPath);
      if (db && db.pool && typeof db.pool.end === 'function') {
        await db.pool.end().catch(() => {});
      }
    }
  } catch (_) {}

  // Disconnect Redis client if active
  try {
    const rClient = redisHelper.getRedisClient();
    if (rClient && typeof rClient.disconnect === 'function') {
      rClient.disconnect();
    }
  } catch (_) {}

  activeHarness = null;
}

module.exports = {
  startServer,
  stopServer
};
