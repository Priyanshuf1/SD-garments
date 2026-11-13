/**
 * ALLEYRICH — Opaque-Box HTTP Test Client
 * File: tests/e2e/helpers/http_client.js
 * 
 * High-performance, zero-dependency HTTP client with cookie jar tracking,
 * automatic JSON serialization/deserialization, query parameter handling,
 * request timing metrics, and informative error formatting.
 */

'use strict';

const http = require('node:http');
const https = require('node:https');
const { URL } = require('node:url');

class HttpClient {
  /**
   * @param {Object} [config]
   * @param {string} [config.baseUrl] - Base server URL (e.g. 'http://127.0.0.1:3456')
   * @param {Object} [config.defaultHeaders] - Headers sent on every request
   * @param {number} [config.timeoutMs] - Request timeout in milliseconds (default 30000)
   * @param {boolean} [config.verbose] - Enable verbose request/response logging
   */
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || 'http://127.0.0.1:3000';
    this.defaultHeaders = {
      'User-Agent': 'ALLEYRICH-E2E-Suite/2.0',
      'Accept': 'application/json, text/html, */*',
      ...(config.defaultHeaders || {})
    };
    this.timeoutMs = typeof config.timeoutMs === 'number' ? config.timeoutMs : 30000;
    this.verbose = Boolean(config.verbose);
    this.cookies = new Map();
  }

  /**
   * Set a specific cookie in the cookie jar.
   */
  setCookie(key, value) {
    if (!key) return;
    this.cookies.set(String(key).trim(), String(value));
  }

  /**
   * Retrieve a specific cookie value from the cookie jar.
   */
  getCookie(key) {
    return this.cookies.get(String(key).trim());
  }

  /**
   * Clear all cookies stored in the client's cookie jar.
   */
  clearCookies() {
    this.cookies.clear();
  }

  /**
   * Return a shallow copy of all cookies as a key-value object.
   */
  getAllCookies() {
    const obj = {};
    for (const [k, v] of this.cookies.entries()) {
      obj[k] = v;
    }
    return obj;
  }

  /**
   * Parse Set-Cookie header array and update the cookie jar.
   */
  _processSetCookie(setCookieHeaders) {
    if (!setCookieHeaders) return;
    const list = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];

    for (const header of list) {
      if (!header || typeof header !== 'string') continue;
      const parts = header.split(';');
      const mainPair = parts[0];
      const eqIdx = mainPair.indexOf('=');
      if (eqIdx > 0) {
        const name = mainPair.substring(0, eqIdx).trim();
        const rawValue = mainPair.substring(eqIdx + 1).trim();
        try {
          this.cookies.set(name, decodeURIComponent(rawValue));
        } catch (_) {
          this.cookies.set(name, rawValue);
        }
      }
    }
  }

  /**
   * Format the Cookie request header from the cookie jar.
   */
  _buildCookieHeader() {
    if (this.cookies.size === 0) return null;
    const pairs = [];
    for (const [k, v] of this.cookies.entries()) {
      pairs.push(`${k}=${encodeURIComponent(v)}`);
    }
    return pairs.join('; ');
  }

  /**
   * Build the target URL by combining baseUrl, path, and optional query parameters.
   */
  _buildUrl(pathOrUrl, params) {
    let url;
    if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
      url = new URL(pathOrUrl);
    } else {
      url = new URL(pathOrUrl, this.baseUrl);
    }

    if (params && typeof params === 'object') {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    return url;
  }

  /**
   * Execute an HTTP request against the test server.
   * 
   * @param {string} method - HTTP method ('GET', 'POST', 'PUT', 'DELETE', etc.)
   * @param {string} path - Target path or relative URL
   * @param {Object} [options]
   * @param {Object} [options.headers] - Custom request headers
   * @param {any} [options.body] - Request payload (JSON object, string, or Buffer)
   * @param {Object} [options.params] - Query parameters
   * @param {Object} [options.query] - Query parameters alias
   * @param {number} [options.timeout] - Custom request timeout in ms
   */
  async request(method, path, options = {}) {
    const start = Date.now();
    const queryParams = options.params || options.query;
    const targetUrl = this._buildUrl(path, queryParams);
    const transport = targetUrl.protocol === 'https:' ? https : http;

    // Merge headers (case-preserving internally, default overrides)
    const headers = { ...this.defaultHeaders, ...(options.headers || {}) };

    // Format body payload
    let payload = null;
    if (options.body !== undefined && options.body !== null) {
      const contentTypeHeaderKey = Object.keys(headers).find(k => k.toLowerCase() === 'content-type') || 'Content-Type';
      const existingContentType = headers[contentTypeHeaderKey];

      if (Buffer.isBuffer(options.body)) {
        payload = options.body;
      } else if (typeof options.body === 'object') {
        if (!existingContentType) {
          headers['Content-Type'] = 'application/json';
          payload = Buffer.from(JSON.stringify(options.body), 'utf8');
        } else if (existingContentType.includes('application/x-www-form-urlencoded')) {
          payload = Buffer.from(new URLSearchParams(options.body).toString(), 'utf8');
        } else {
          payload = Buffer.from(JSON.stringify(options.body), 'utf8');
        }
      } else {
        payload = Buffer.from(String(options.body), 'utf8');
      }

      const contentLengthKey = Object.keys(headers).find(k => k.toLowerCase() === 'content-length') || 'Content-Length';
      if (!headers[contentLengthKey]) {
        headers[contentLengthKey] = String(payload.length);
      }
    }

    // Auto-inject Cookie header if not manually specified
    const hasManualCookie = Object.keys(headers).some(k => k.toLowerCase() === 'cookie');
    if (!hasManualCookie) {
      const cookieHeader = this._buildCookieHeader();
      if (cookieHeader) {
        headers['Cookie'] = cookieHeader;
      }
    }

    const timeout = typeof options.timeout === 'number' ? options.timeout : this.timeoutMs;

    return new Promise((resolve, reject) => {
      let isDone = false;

      const req = transport.request({
        hostname: targetUrl.hostname,
        port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
        path: targetUrl.pathname + targetUrl.search,
        method: method.toUpperCase(),
        headers,
        timeout
      }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));

        res.on('end', () => {
          if (isDone) return;
          isDone = true;
          const durationMs = Date.now() - start;
          const buffer = Buffer.concat(chunks);
          const rawText = buffer.toString('utf8');

          // Process Set-Cookie headers
          this._processSetCookie(res.headers['set-cookie']);

          // Parse JSON if applicable
          let json = null;
          const ctype = res.headers['content-type'] || '';
          if (ctype.includes('application/json') || rawText.trim().startsWith('{') || rawText.trim().startsWith('[')) {
            try {
              json = JSON.parse(rawText);
            } catch (_) {
              json = null;
            }
          }

          const response = {
            status: res.statusCode,
            statusText: res.statusMessage || '',
            ok: res.statusCode >= 200 && res.statusCode < 300,
            headers: res.headers,
            data: json !== null ? json : rawText,
            text: rawText,
            raw: buffer,
            durationMs,
            cookies: this.getAllCookies()
          };

          if (this.verbose) {
            console.log(`[HTTP] ${method.toUpperCase()} ${targetUrl.pathname}${targetUrl.search} -> ${res.statusCode} (${durationMs}ms)`);
          }

          resolve(response);
        });
      });

      req.on('timeout', () => {
        if (isDone) return;
        isDone = true;
        req.destroy();
        reject(new Error(`HTTP Request Timeout: ${method.toUpperCase()} ${targetUrl.href} exceeded ${timeout}ms`));
      });

      req.on('error', (err) => {
        if (isDone) return;
        isDone = true;
        reject(new Error(`HTTP Transport Error [${method.toUpperCase()} ${targetUrl.href}]: ${err.message}`));
      });

      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  }

  /**
   * Convenience HTTP method helpers.
   */
  get(path, options) {
    return this.request('GET', path, options);
  }

  post(path, body, options = {}) {
    return this.request('POST', path, { ...options, body });
  }

  put(path, body, options = {}) {
    return this.request('PUT', path, { ...options, body });
  }

  delete(path, options) {
    return this.request('DELETE', path, options);
  }

  patch(path, body, options = {}) {
    return this.request('PATCH', path, { ...options, body });
  }

  head(path, options) {
    return this.request('HEAD', path, options);
  }
}

module.exports = { HttpClient };
