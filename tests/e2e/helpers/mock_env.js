/**
 * ALLEYRICH — E2E Test Suite Sandbox & Mock Environment Manager
 * File: tests/e2e/helpers/mock_env.js
 * 
 * Manages test environment variables, admin credentials, simulated network IPs,
 * and realistic shopper/order/product payload fixtures.
 */

'use strict';

const ADMIN_SECRET = 'test-e2e-admin-secret-alleyrich-key-32ch';

// Store original environment variable values to allow clean teardown
let originalEnvSnapshot = null;

/**
 * Configure sandboxed test environment variables.
 * Enables synthetic AWB dispatch, test Cashfree gateway, admin credentials,
 * and suppresses real outbound transactional emails.
 */
function setupSandboxEnvironment(options = {}) {
  if (!originalEnvSnapshot) {
    originalEnvSnapshot = {
      NODE_ENV: process.env.NODE_ENV,
      ALLOW_SYNTHETIC_AWB: process.env.ALLOW_SYNTHETIC_AWB,
      CASHFREE_ENV: process.env.CASHFREE_ENV,
      ADMIN_SECRET_KEY: process.env.ADMIN_SECRET_KEY,
      APP_ORIGIN: process.env.APP_ORIGIN,
      BREVO_API_KEY: process.env.BREVO_API_KEY,
      DELHIVERY_ENV: process.env.DELHIVERY_ENV
    };
  }

  process.env.NODE_ENV = 'test';
  process.env.ALLOW_SYNTHETIC_AWB = 'true';
  process.env.CASHFREE_ENV = 'TEST';
  process.env.ADMIN_SECRET_KEY = ADMIN_SECRET;
  process.env.APP_ORIGIN = options.appOrigin || 'https://alleyrich.com';
  process.env.BREVO_API_KEY = options.brevoApiKey || 'mock-brevo-key-for-test-isolation';
  process.env.DELHIVERY_ENV = 'sandbox';

  return {
    adminSecret: ADMIN_SECRET,
    isSandbox: true
  };
}

/**
 * Restore original environment variables captured prior to setupSandboxEnvironment.
 */
function teardownSandboxEnvironment() {
  if (!originalEnvSnapshot) return;

  for (const [key, val] of Object.entries(originalEnvSnapshot)) {
    if (val === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = val;
    }
  }

  originalEnvSnapshot = null;
}

/**
 * Return administrative authorization headers.
 * Supported by /api/admin/* endpoints via x-admin-key or Authorization Bearer.
 */
function getAdminHeaders(extraHeaders = {}) {
  return {
    'x-admin-key': ADMIN_SECRET,
    'Content-Type': 'application/json',
    ...extraHeaders
  };
}

let defaultIpCounter = 1;

/**
 * Generate HTTP headers to simulate distinct client IP addresses.
 * Resolves via security.getClientIp(req) to prevent rate limit cross-test collisions.
 */
function getForwardedIpHeaders(ip) {
  if (!ip) {
    defaultIpCounter = (defaultIpCounter % 60000) + 1;
    const b = Math.floor(defaultIpCounter / 250) + 1;
    const c = (defaultIpCounter % 250) + 1;
    ip = `198.51.${b}.${c}`;
  }
  return {
    'x-forwarded-for': ip,
    'cf-connecting-ip': ip,
    'x-real-ip': ip
  };
}

/**
 * Generate a unique, schema-valid test customer/shopper profile.
 */
function createUniqueShopper(prefix = 'shopper') {
  const ts = Date.now();
  const rand = Math.floor(Math.random() * 100000);
  return {
    name: `E2E Shopper ${ts}`,
    email: `${prefix}_${ts}_${rand}@sdgarments.in`,
    phone: '9888877777',
    address: 'Flat 402, High Street Manor',
    locality: 'Indiranagar',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560038'
  };
}

/**
 * Generate a complete, schema-valid product payload for admin CRUD tests.
 */
function createTestProduct(override = {}) {
  const ts = Date.now();
  const rand = Math.floor(Math.random() * 10000);
  const id = `test_prod_${ts}_${rand}`;
  const handle = `e2e-test-silhouette-${ts}-${rand}`;

  return {
    id,
    handle,
    title: `E2E Test Heavyweight Silhouette ${rand}`,
    category: 'Top Wear',
    product_type: 'Streetwear',
    price: '1499.00',
    compare_at_price: '2499.00',
    vendor: 'ALLEYRICH',
    tags: ['test', 'e2e', 'streetwear', 'oversized'],
    body_html: '<p>High-grade 280 GSM combed cotton heavyweight silhouette.</p>',
    variants: [
      { id: 1, title: 'M', price: '1499.00', compare_at_price: '2499.00', available: true, inventory_quantity: 50 },
      { id: 2, title: 'L', price: '1499.00', compare_at_price: '2499.00', available: true, inventory_quantity: 50 }
    ],
    images: [
      { id: 1, src: '/images/photo_1.webp', alt: 'Front view' }
    ],
    ...override
  };
}

/**
 * Generate a complete, schema-valid checkout order submission payload.
 */
function createTestOrderPayload(items = [], shopper = null, paymentMethod = 'cod', options = {}) {
  const customer = shopper || createUniqueShopper('checkout');
  const defaultItems = [
    {
      id: 'prod_1709230000000',
      handle: 'heavyweight-oversized-tee-black',
      title: 'Heavyweight Oversized Tee Black',
      size: 'M',
      quantity: 1
    }
  ];

  return {
    items: items.length > 0 ? items : defaultItems,
    customer,
    paymentMethod,
    couponCode: options.couponCode || '',
    ...options
  };
}

module.exports = {
  ADMIN_SECRET,
  setupSandboxEnvironment,
  teardownSandboxEnvironment,
  getAdminHeaders,
  getForwardedIpHeaders,
  createUniqueShopper,
  createTestProduct,
  createTestOrderPayload
};
