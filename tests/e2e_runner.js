#!/usr/bin/env node
/**
 * ALLEYRICH — Master E2E Test Runner
 * File: tests/e2e_runner.js
 * 
 * Unified test runner executing the 4-Tier Opaque-Box E2E Test Suite.
 * Provides ephemeral in-process server lifecycle, CLI argument filtering,
 * sequential suite execution, formatted ASCII summary tables, and clean exit codes.
 * 
 * Usage:
 *   node tests/e2e_runner.js [options]
 * 
 * Options:
 *   --tier=<1|2|3|4>     Run tests only for a specific tier
 *   --feature=<F1..F12>  Run tests only for a specific feature code
 *   --grep=<pattern>     Filter tests whose titles match regex pattern
 *   --bail               Exit immediately upon first test failure
 *   --verbose, -v        Enable verbose HTTP request/response traces
 *   --help, -h           Show command-line usage and help
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { startServer, stopServer } = require('./e2e/helpers/server_harness.js');
const assertions = require('./e2e/helpers/assertions.js');
const mockEnv = require('./e2e/helpers/mock_env.js');
const redisHelper = require('./e2e/helpers/redis_helper.js');

/**
 * Parse command line arguments.
 */
function parseArgs(rawArgs) {
  const options = {
    tier: null,
    feature: null,
    grep: null,
    bail: false,
    verbose: false,
    help: false
  };

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--bail') {
      options.bail = true;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg.startsWith('--tier=')) {
      const val = parseInt(arg.split('=')[1], 10);
      if (!isNaN(val)) options.tier = val;
    } else if (arg === '--tier' && i + 1 < rawArgs.length) {
      const val = parseInt(rawArgs[++i], 10);
      if (!isNaN(val)) options.tier = val;
    } else if (arg.startsWith('--feature=')) {
      options.feature = arg.split('=')[1].toUpperCase();
    } else if (arg === '--feature' && i + 1 < rawArgs.length) {
      options.feature = rawArgs[++i].toUpperCase();
    } else if (arg.startsWith('--grep=')) {
      options.grep = new RegExp(arg.split('=')[1], 'i');
    } else if (arg === '--grep' && i + 1 < rawArgs.length) {
      options.grep = new RegExp(rawArgs[++i], 'i');
    }
  }

  return options;
}

/**
 * Display CLI usage instructions and exit.
 */
function printHelp() {
  console.log(`
================================================================================
🧪 ALLEYRICH MASTER E2E TEST RUNNER
================================================================================

Usage:
  node tests/e2e_runner.js [options]

Options:
  --tier=<1|2|3|4>     Filter test execution by tier:
                         Tier 1: Feature Coverage (F1..F12, >=60 tests)
                         Tier 2: Boundary & Corner Cases (F1..F12, >=60 tests)
                         Tier 3: Cross-Feature Pairwise (>=12 tests)
                         Tier 4: Real-World Workflows (>=6 scenarios)
  --feature=<F1..F12>  Filter tests by feature code (e.g. --feature=F1, --feature=F6)
  --grep=<pattern>     Filter tests matching a title regular expression
  --bail               Halt test execution immediately on the first failure
  --verbose, -v        Display real-time HTTP request paths, methods, and latencies
  --help, -h           Show this help manual

Examples:
  node tests/e2e_runner.js                      # Run all discovered tiers (>=138 tests)
  node tests/e2e_runner.js --tier=1             # Run only Tier 1 Feature tests
  node tests/e2e_runner.js --feature=F6         # Run all tests covering Checkout (F6)
  node tests/e2e_runner.js --grep="cart"        # Run tests matching "cart"
  node tests/e2e_runner.js --tier=2 --bail      # Run Tier 2, stopping on first failure

Exit Codes:
  0 - All tests passed successfully
  1 - One or more tests failed, or runtime error occurred
`);
}

/**
 * Discover all test files across tier directories in tests/e2e/.
 */
function discoverTestSuites(options) {
  const rootE2E = path.join(__dirname, 'e2e');
  const tierDefinitions = [
    { tier: 1, dirName: 'tier1_feature', label: 'Feature Coverage (F1..F12)' },
    { tier: 2, dirName: 'tier2_boundary', label: 'Boundary & Negative Cases' },
    { tier: 3, dirName: 'tier3_pairwise', label: 'Cross-Feature Pairwise' },
    { tier: 4, dirName: 'tier4_realworld', label: 'Real-World Workflows' }
  ];

  const suites = [];

  for (const { tier, dirName, label } of tierDefinitions) {
    if (options.tier && options.tier !== tier) {
      continue;
    }

    const dirPath = path.join(rootE2E, dirName);
    if (!fs.existsSync(dirPath)) {
      continue;
    }

    const files = fs.readdirSync(dirPath)
      .filter(f => f.endsWith('.test.js') || f.endsWith('.spec.js'))
      .sort();

    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      try {
        const exported = require(fullPath);
        const suite = exported.default || exported;

        if (suite && Array.isArray(suite.tests)) {
          suite.tier = suite.tier || tier;
          suite.tierLabel = label;
          suite.filePath = fullPath;
          suite.fileName = file;
          suites.push(suite);
        } else {
          console.warn(`[WARN] File ${file} did not export a valid suite definition via defineSuite().`);
        }
      } catch (err) {
        console.error(`[ERROR] Failed to load test suite ${file}:`, err.message);
        suites.push({
          tier,
          tierLabel: label,
          fileName: file,
          filePath: fullPath,
          title: `FAILED LOAD: ${file}`,
          feature: 'LOAD_ERROR',
          tests: [
            {
              id: 'ERR_LOAD',
              title: `Load ${file}`,
              run: () => { throw err; }
            }
          ],
          beforeAllHooks: [],
          afterAllHooks: [],
          beforeEachHooks: [],
          afterEachHooks: []
        });
      }
    }
  }

  return suites;
}

/**
 * Helper to normalize feature codes for comparison (e.g. 'f01' -> 'F1').
 */
function normalizeFeatureCode(code) {
  if (!code) return '';
  const cleaned = String(code).trim().toUpperCase();
  const match = cleaned.match(/^F0?(\d+)$/);
  if (match) {
    return `F${parseInt(match[1], 10)}`;
  }
  return cleaned;
}

/**
 * Pad a string or number to a fixed column width.
 */
function pad(val, width) {
  return String(val).padEnd(width);
}

/**
 * Pad a string or number aligned to the right.
 */
function padLeft(val, width) {
  return String(val).padStart(width);
}

/**
 * Master runner execution entry point.
 */
async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  console.log('\n===============================================================');
  console.log('🧪 ALLEYRICH MASTER E2E TEST RUNNER');
  console.log('   Opaque-Box Requirement-Driven Verification (Tiers 1–4)');
  console.log('===============================================================');

  // Discover test suites
  const suites = discoverTestSuites(options);

  if (suites.length === 0) {
    console.log('\n⚠️  No test files discovered in tests/e2e/ matching criteria.');
    if (options.tier) console.log(`   Filter --tier=${options.tier}`);
    if (options.feature) console.log(`   Filter --feature=${options.feature}`);
    if (options.grep) console.log(`   Filter --grep=${options.grep}`);
    console.log('\n   Please verify test files exist in tests/e2e/tier{1,2,3,4}*.');
    process.exit(0);
  }

  const normalizedFilterFeature = options.feature ? normalizeFeatureCode(options.feature) : null;

  // Filter suites by feature if specified
  const filteredSuites = suites.filter(s => {
    if (!normalizedFilterFeature) return true;
    const sFeat = normalizeFeatureCode(s.feature);
    return sFeat === normalizedFilterFeature || s.fileName.toUpperCase().includes(options.feature);
  });

  if (filteredSuites.length === 0) {
    console.log(`\n⚠️  No test suites matched --feature=${options.feature}`);
    process.exit(0);
  }

  // Initialize Sandbox Environment
  mockEnv.setupSandboxEnvironment();

  // Boot In-Process Ephemeral Server
  console.log('\n🚀 Spawning in-process test server on ephemeral port (0)...');
  let harness;
  try {
    harness = await startServer({ verbose: options.verbose });
    console.log(`   Storefront & API ready at: ${harness.baseUrl}\n`);
  } catch (bootErr) {
    console.error('💥 Fatal error starting in-process test server:', bootErr);
    mockEnv.teardownSandboxEnvironment();
    process.exit(1);
  }

  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    tierBreakdown: {
      1: { total: 0, passed: 0, failed: 0, skipped: 0, durationMs: 0 },
      2: { total: 0, passed: 0, failed: 0, skipped: 0, durationMs: 0 },
      3: { total: 0, passed: 0, failed: 0, skipped: 0, durationMs: 0 },
      4: { total: 0, passed: 0, failed: 0, skipped: 0, durationMs: 0 }
    },
    failures: []
  };

  const runnerStartTime = Date.now();
  let bailTriggered = false;

  try {
    for (const suite of filteredSuites) {
      if (bailTriggered) break;

      const suiteTier = suite.tier || 1;
      const tierStats = results.tierBreakdown[suiteTier] || { total: 0, passed: 0, failed: 0, skipped: 0, durationMs: 0 };
      results.tierBreakdown[suiteTier] = tierStats;

      console.log(`\n📌 [Tier ${suiteTier}] ${suite.title || suite.fileName} (${suite.feature || 'General'})`);
      const suiteStart = Date.now();

      const context = {
        client: harness.client,
        baseUrl: harness.baseUrl,
        assert: assertions,
        env: mockEnv,
        redis: redisHelper,
        helpers: harness.helpers
      };

      // Run suite beforeAll hooks
      if (Array.isArray(suite.beforeAllHooks)) {
        for (const hook of suite.beforeAllHooks) {
          try {
            await hook(context);
          } catch (hookErr) {
            console.error(`   ⚠️ [beforeAll Hook Failed]: ${hookErr.message}`);
          }
        }
      }

      for (const testCase of suite.tests) {
        if (bailTriggered) break;

        // Apply grep filter if specified
        if (options.grep && !options.grep.test(testCase.title) && !options.grep.test(testCase.id)) {
          results.skipped++;
          tierStats.skipped++;
          continue;
        }

        // Handle skipped tests
        if (testCase.skip) {
          results.skipped++;
          tierStats.skipped++;
          console.log(`   ⏩ SKIP [${testCase.id || 'TEST'}] ${testCase.title}`);
          continue;
        }

        results.total++;
        tierStats.total++;
        const testStart = Date.now();

        try {
          // Run beforeEach hooks
          if (Array.isArray(suite.beforeEachHooks)) {
            for (const hook of suite.beforeEachHooks) {
              await hook(context);
            }
          }

          // Execute test function
          await testCase.run(context);

          // Run afterEach hooks
          if (Array.isArray(suite.afterEachHooks)) {
            for (const hook of suite.afterEachHooks) {
              await hook(context);
            }
          }

          const durationMs = Date.now() - testStart;
          results.passed++;
          tierStats.passed++;
          console.log(`   ✅ PASS [${testCase.id || 'TEST'}] ${testCase.title} (${durationMs}ms)`);
        } catch (testErr) {
          const durationMs = Date.now() - testStart;
          results.failed++;
          tierStats.failed++;
          console.error(`   ❌ FAIL [${testCase.id || 'TEST'}] ${testCase.title} (${durationMs}ms)`);
          console.error(`      ${testErr.message}`);

          results.failures.push({
            tier: suiteTier,
            suite: suite.title || suite.fileName,
            id: testCase.id || 'TEST',
            title: testCase.title,
            error: testErr.message,
            stack: testErr.stack
          });

          if (options.bail) {
            console.warn('\n⚠️  --bail active: Halting test runner execution upon first failure.');
            bailTriggered = true;
            break;
          }
        }
      }

      // Run suite afterAll hooks
      if (Array.isArray(suite.afterAllHooks)) {
        for (const hook of suite.afterAllHooks) {
          try {
            await hook(context);
          } catch (hookErr) {
            console.error(`   ⚠️ [afterAll Hook Failed]: ${hookErr.message}`);
          }
        }
      }

      tierStats.durationMs += (Date.now() - suiteStart);
    }
  } finally {
    console.log('\n🧹 Tearing down test server & closing active socket connections...');
    if (harness) {
      await stopServer(harness.server);
    }
    mockEnv.teardownSandboxEnvironment();
  }

  const totalWallClockDuration = ((Date.now() - runnerStartTime) / 1000).toFixed(2);

  // Formatted ASCII Summary Table
  console.log('\n================================================================================');
  console.log('📊 E2E TEST EXECUTION SUMMARY REPORT');
  console.log('================================================================================');
  console.log('| Tier   | Description                     | Total | Pass  | Fail  | Skip | Duration |');
  console.log('|--------|---------------------------------|-------|-------|-------|------|----------|');

  const printTierRow = (tierNum, desc) => {
    const s = results.tierBreakdown[tierNum] || { total: 0, passed: 0, failed: 0, skipped: 0, durationMs: 0 };
    const dur = `${(s.durationMs / 1000).toFixed(2)}s`;
    console.log(
      `| Tier ${tierNum} | ${pad(desc, 31)} | ${padLeft(s.total, 5)} | ${padLeft(s.passed, 5)} | ${padLeft(s.failed, 5)} | ${padLeft(s.skipped, 4)} | ${padLeft(dur, 8)} |`
    );
  };

  printTierRow(1, 'Feature Coverage (F1..F12)');
  printTierRow(2, 'Boundary & Negative Cases');
  printTierRow(3, 'Cross-Feature Pairwise');
  printTierRow(4, 'Real-World Application Flows');
  console.log('|--------|---------------------------------|-------|-------|-------|------|----------|');
  console.log(
    `| TOTAL  | ${pad('All Tiers Combined', 31)} | ${padLeft(results.total, 5)} | ${padLeft(results.passed, 5)} | ${padLeft(results.failed, 5)} | ${padLeft(results.skipped, 4)} | ${padLeft(`${totalWallClockDuration}s`, 8)} |`
  );
  console.log('================================================================================');

  // Print failure details
  if (results.failures.length > 0) {
    console.log(`\n❌ FAILED TESTS BREAKDOWN (${results.failures.length}):`);
    results.failures.forEach((f, idx) => {
      console.log(`\n${idx + 1}) [Tier ${f.tier}] ${f.suite} > ${f.id}: ${f.title}`);
      console.log(`   Error: ${f.error}`);
      if (f.stack) {
        const stackLines = f.stack.split('\n').slice(1, 4).join('\n');
        console.log(`   ${stackLines}`);
      }
    });
    console.log('\n💥 E2E Test Suite Run: FAILED\n');
    process.exit(1);
  }

  // Check minimum threshold requirement when running the full suite without filters
  const isFullRun = !options.tier && !options.feature && !options.grep;
  if (isFullRun && results.total < 138) {
    console.warn(`\n⚠️  Coverage Target Notice: Executed ${results.total} tests (Specification minimum: >=138 tests across Tiers 1-4).`);
  }

  console.log(`\n🎉 ALL ${results.passed} TESTS PASSED CLEANLY! (100% SUCCESS)\n`);
  process.exit(0);
}

main().catch((fatalError) => {
  console.error('\n💥 Unhandled fatal error in E2E master test runner:', fatalError);
  process.exit(1);
});
