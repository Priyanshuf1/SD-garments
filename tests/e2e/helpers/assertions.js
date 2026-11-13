/**
 * ALLEYRICH — Opaque-Box E2E Assertion Library
 * File: tests/e2e/helpers/assertions.js
 * 
 * Extends Node.js native assert module with domain-specific HTTP status,
 * header, rate limit, latency, JSON contract, and HTML assertion methods.
 */

'use strict';

const assert = require('node:assert');

/**
 * Format a helpful debug snippet of response body for failure logs.
 */
function formatResponseSnippet(res) {
  if (!res) return '(no response)';
  if (res.data && typeof res.data === 'object') {
    try {
      return JSON.stringify(res.data).slice(0, 300);
    } catch (_) {
      return '[Unserializable object]';
    }
  }
  if (res.text && typeof res.text === 'string') {
    return res.text.replace(/\s+/g, ' ').trim().slice(0, 200);
  }
  return String(res.data || res.text || '');
}

const customAssertions = {
  /**
   * Assert HTTP response status code matches expected status.
   */
  assertStatus(res, expectedStatus, customMessage) {
    assert.ok(res && typeof res.status === 'number', 'Expected a valid response object with numeric status code');
    const msg = customMessage || `Expected HTTP status ${expectedStatus}, received ${res.status}`;
    const context = `\n      Response Snippet: ${formatResponseSnippet(res)}`;
    assert.strictEqual(res.status, expectedStatus, `${msg}${context}`);
  },

  /**
   * Assert HTTP response status is 2xx OK.
   */
  assertOk(res, customMessage) {
    assert.ok(res && typeof res.status === 'number', 'Expected a valid response object');
    const msg = customMessage || `Expected 2xx OK status, received ${res.status}`;
    const context = `\n      Response Snippet: ${formatResponseSnippet(res)}`;
    assert.ok(res.ok || (res.status >= 200 && res.status < 300), `${msg}${context}`);
  },

  /**
   * Assert response contains a specified header, optionally matching expected value or regex.
   */
  assertHeader(res, headerName, expectedValue, customMessage) {
    assert.ok(res && res.headers, 'Expected response object with headers map');
    const key = headerName.toLowerCase();
    const actual = res.headers[key];
    const msg = customMessage || `Expected header '${headerName}' to be present`;
    assert.ok(actual !== undefined, `${msg}. Available headers: [${Object.keys(res.headers).join(', ')}]`);

    if (expectedValue instanceof RegExp) {
      assert.match(String(actual), expectedValue, customMessage || `Header '${headerName}' did not match pattern ${expectedValue}`);
    } else if (expectedValue !== undefined) {
      assert.strictEqual(
        String(actual).toLowerCase(),
        String(expectedValue).toLowerCase(),
        customMessage || `Header '${headerName}' expected '${expectedValue}', got '${actual}'`
      );
    }
  },

  /**
   * Assert response does NOT contain a specified header.
   */
  assertHeaderMissing(res, headerName, customMessage) {
    assert.ok(res && res.headers, 'Expected response object with headers map');
    const actual = res.headers[headerName.toLowerCase()];
    assert.strictEqual(actual, undefined, customMessage || `Expected header '${headerName}' to be absent, but got '${actual}'`);
  },

  /**
   * Assert response is HTTP 429 with Retry-After header.
   */
  assertRateLimited(res, customMessage) {
    this.assertStatus(res, 429, customMessage || 'Expected HTTP 429 Too Many Requests');
    assert.ok(
      res.headers['retry-after'] !== undefined,
      customMessage || 'Expected Retry-After header to be present on HTTP 429 rate limit response'
    );
  },

  /**
   * Assert HTML body contains specific substring or matches RegExp.
   */
  assertHtmlContains(res, substringOrRegex, customMessage) {
    const body = res && (res.text || (typeof res.data === 'string' ? res.data : '')) || '';
    if (substringOrRegex instanceof RegExp) {
      assert.match(
        body,
        substringOrRegex,
        customMessage ? `${customMessage} (Expected regex match: ${substringOrRegex})` : `Expected HTML body to match regex ${substringOrRegex}`
      );
    } else {
      assert.ok(
        body.includes(substringOrRegex),
        customMessage
          ? `${customMessage} (Expected substring: "${substringOrRegex}", length: ${body.length})`
          : `Expected HTML body to contain substring: "${substringOrRegex}". Body length: ${body.length}`
      );
    }
  },

  /**
   * Assert HTTP request completed within allowed latency budget (milliseconds).
   */
  assertLatency(res, maxAllowedMs, customMessage) {
    assert.ok(res && typeof res.durationMs === 'number', 'Expected response object with numeric durationMs');
    assert.ok(
      res.durationMs <= maxAllowedMs,
      customMessage || `Latency budget exceeded: expected <= ${maxAllowedMs}ms, actual ${res.durationMs}ms`
    );
  },

  /**
   * Assert response indicates success (2xx status and data.success !== false).
   */
  assertSuccess(res, customMessage) {
    this.assertOk(res, customMessage);
    if (res.data && typeof res.data === 'object' && res.data.success !== undefined) {
      assert.strictEqual(res.data.success, true, customMessage || `Expected data.success to be true in response: ${formatResponseSnippet(res)}`);
    }
  },

  /**
   * Assert response indicates error (status matches and data.success === false).
   */
  assertError(res, expectedStatus, customMessage) {
    this.assertStatus(res, expectedStatus, customMessage);
    if (res.data && typeof res.data === 'object' && res.data.success !== undefined) {
      assert.strictEqual(res.data.success, false, customMessage || `Expected data.success to be false in error response: ${formatResponseSnippet(res)}`);
    }
  },

  /**
   * Deep structural pattern matching. Verifies pattern keys match actual object.
   */
  assertJsonMatch(actual, pattern, customMessage) {
    assert.ok(actual !== null && typeof actual === 'object', 'Expected actual to be a non-null object');
    assert.ok(pattern !== null && typeof pattern === 'object', 'Expected pattern to be a non-null object');

    for (const [key, expectedVal] of Object.entries(pattern)) {
      const actualVal = actual[key];
      const context = customMessage ? `${customMessage} (at key '${key}')` : `Mismatch at key '${key}'`;

      if (expectedVal instanceof RegExp) {
        assert.match(String(actualVal), expectedVal, `${context}: expected regex match ${expectedVal}, got '${actualVal}'`);
      } else if (typeof expectedVal === 'object' && expectedVal !== null && !Array.isArray(expectedVal)) {
        this.assertJsonMatch(actualVal, expectedVal, context);
      } else {
        assert.deepStrictEqual(actualVal, expectedVal, context);
      }
    }
  }
};

module.exports = Object.assign(assert, customAssertions);
