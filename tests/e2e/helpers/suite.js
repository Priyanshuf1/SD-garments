/**
 * ALLEYRICH — Declarative Test Suite Registration DSL
 * File: tests/e2e/helpers/suite.js
 * 
 * Provides defineSuite() DSL with lifecycle hooks (beforeAll, afterAll,
 * beforeEach, afterEach), test metadata extraction, and automatic standalone
 * execution support when a test file is run directly via Node.js CLI.
 */

'use strict';

const assertions = require('./assertions.js');
const mockEnv = require('./mock_env.js');
const redisHelper = require('./redis_helper.js');

/**
 * Determine the file path of the caller invoking defineSuite().
 */
function getCallerFilePath() {
  const origPrepare = Error.prepareStackTrace;
  try {
    Error.prepareStackTrace = (_, stack) => stack;
    const err = new Error();
    const stack = err.stack;
    if (Array.isArray(stack) && stack.length > 2) {
      return stack[2].getFileName();
    }
  } catch (_) {
    return null;
  } finally {
    Error.prepareStackTrace = origPrepare;
  }
  return null;
}

/**
 * Execute a suite in standalone mode when invoked directly from command line.
 */
async function runStandaloneSuite(suite) {
  const { startServer, stopServer } = require('./server_harness.js');

  console.log('\n===============================================================');
  console.log(`🧪 STANDALONE TEST RUN: [Tier ${suite.tier || '?'}] ${suite.title || 'Suite'}`);
  console.log(`   Feature: ${suite.feature || 'N/A'}`);
  console.log('===============================================================\n');

  let harness = null;
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const failures = [];

  try {
    mockEnv.setupSandboxEnvironment();
    harness = await startServer();
    console.log(`🚀 Ephemeral server ready at: ${harness.baseUrl}\n`);

    const context = {
      client: harness.client,
      baseUrl: harness.baseUrl,
      assert: assertions,
      env: mockEnv,
      redis: redisHelper,
      helpers: harness.helpers
    };

    // Run beforeAll hooks
    for (const hook of suite.beforeAllHooks) {
      await hook(context);
    }

    // Execute tests
    for (const testCase of suite.tests) {
      if (testCase.skip) {
        skipped++;
        console.log(`   ⏩ SKIP [${testCase.id}] ${testCase.title}`);
        continue;
      }

      const start = Date.now();
      try {
        for (const hook of suite.beforeEachHooks) {
          await hook(context);
        }

        await testCase.run(context);

        for (const hook of suite.afterEachHooks) {
          await hook(context);
        }

        const duration = Date.now() - start;
        passed++;
        console.log(`   ✅ PASS [${testCase.id}] ${testCase.title} (${duration}ms)`);
      } catch (err) {
        const duration = Date.now() - start;
        failed++;
        console.error(`   ❌ FAIL [${testCase.id}] ${testCase.title} (${duration}ms)`);
        console.error(`      ${err.message}`);
        failures.push({ test: testCase, error: err });
      }
    }

    // Run afterAll hooks
    for (const hook of suite.afterAllHooks) {
      await hook(context);
    }
  } catch (fatalErr) {
    console.error('\n💥 Fatal suite execution error:', fatalErr);
    failed++;
  } finally {
    if (harness) {
      await stopServer(harness.server);
    }
    mockEnv.teardownSandboxEnvironment();
  }

  console.log('\n---------------------------------------------------------------');
  console.log(`Summary: Total: ${suite.tests.length} | Passed: ${passed} | Failed: ${failed} | Skipped: ${skipped}`);
  console.log('---------------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

/**
 * Register an E2E test suite.
 * 
 * @param {Object} meta - Suite metadata
 * @param {number} meta.tier - Test tier (1, 2, 3, or 4)
 * @param {string} meta.feature - Feature code (F1..F12, Pairwise, RealWorld)
 * @param {string} meta.title - Descriptive suite title
 * @param {string} [meta.description] - Extended suite description
 * @param {Function} setupFn - Setup callback providing test registration DSL
 * @returns {Object} suite - Complete suite definition object
 */
function defineSuite(meta = {}, setupFn) {
  const tests = [];
  const beforeAllHooks = [];
  const afterAllHooks = [];
  const beforeEachHooks = [];
  const afterEachHooks = [];
  let testCounter = 1;

  function registerTest(idOrTitle, titleOrFn, maybeFn, options = {}) {
    let id;
    let title;
    let fn;

    if (typeof idOrTitle === 'string' && typeof titleOrFn === 'string' && typeof maybeFn === 'function') {
      id = idOrTitle;
      title = titleOrFn;
      fn = maybeFn;
    } else if (typeof idOrTitle === 'string' && typeof titleOrFn === 'function') {
      const feat = meta.feature || `T${meta.tier || 1}`;
      id = `TC-${feat}-${String(testCounter).padStart(2, '0')}`;
      title = idOrTitle;
      fn = titleOrFn;
      testCounter++;
    } else {
      throw new Error(`Invalid test registration arguments: ${idOrTitle}, ${titleOrFn}`);
    }

    const testItem = {
      id,
      title,
      run: fn,
      skip: Boolean(options.skip)
    };

    tests.push(testItem);
    return testItem;
  }

  const test = (idOrTitle, titleOrFn, fn) => registerTest(idOrTitle, titleOrFn, fn, { skip: false });
  test.skip = (idOrTitle, titleOrFn, fn) => registerTest(idOrTitle, titleOrFn, fn, { skip: true });

  const it = test;
  it.skip = test.skip;

  const beforeAll = (fn) => { if (typeof fn === 'function') beforeAllHooks.push(fn); };
  const afterAll = (fn) => { if (typeof fn === 'function') afterAllHooks.push(fn); };
  const beforeEach = (fn) => { if (typeof fn === 'function') beforeEachHooks.push(fn); };
  const afterEach = (fn) => { if (typeof fn === 'function') afterEachHooks.push(fn); };

  // Execute user DSL setup function
  if (typeof setupFn === 'function') {
    setupFn({
      test,
      it,
      beforeAll,
      afterAll,
      beforeEach,
      afterEach
    });
  }

  const suite = {
    tier: meta.tier || 1,
    feature: meta.feature || 'General',
    title: meta.title || `Tier ${meta.tier || 1} Suite`,
    description: meta.description || '',
    tests,
    beforeAllHooks,
    afterAllHooks,
    beforeEachHooks,
    afterEachHooks
  };

  // Check if file is invoked directly via node CLI
  const callerFile = getCallerFilePath();
  if (require.main && callerFile && require.main.filename === callerFile) {
    setImmediate(() => {
      runStandaloneSuite(suite);
    });
  }

  return suite;
}

module.exports = {
  defineSuite
};
