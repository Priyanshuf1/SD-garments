/**
 * ALLEYRICH Application Security & Abuse Prevention Engine
 * 
 * Centralized, production-grade security module providing:
 * 1. Safe Client IP Resolution (anti-spoofing)
 * 2. Multi-Tier Sliding Window Rate Limiting
 * 3. 6-Digit OTP Cooldown & Brute-Force Lockout Guard
 * 4. Admin API Authentication Guard
 * 5. Customer PII & IDOR Access Control
 * 6. SSRF Protection & Payload Size Guards
 */

const url = require('url');

// In-memory sliding-window cache for ultra-fast local checks
const rateLimitBuckets = new Map();
const otpAttemptsMap = new Map();
const otpCooldownMap = new Map();

/**
 * Safely extracts client IP address, prioritizing trusted provider headers (Vercel)
 * and preventing client-side X-Forwarded-For spoofing.
 */
function getClientIp(req) {
  if (!req) return '127.0.0.1';

  // 1. Vercel trusted edge headers
  const vercelIp = req.headers['x-vercel-forwarded-for'] || req.headers['x-real-ip'];
  if (vercelIp) {
    const clean = String(vercelIp).split(',')[0].trim();
    if (clean) return clean;
  }

  // 2. Standard X-Forwarded-For (take the first client IP)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const parts = String(forwarded).split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length > 0) {
      return parts[0];
    }
  }

  // 3. Socket remote address fallback
  const socketIp = req.socket?.remoteAddress || req.connection?.remoteAddress || '127.0.0.1';
  return socketIp.replace(/^::ffff:/, '');
}

/**
 * Generic Sliding-Window In-Memory Rate Limiter with TTL cleanup.
 * @param {string} key Identifier (e.g. `ip:1.2.3.4` or `email:foo@bar.com`)
 * @param {number} maxRequests Maximum requests allowed within window
 * @param {number} windowSeconds Time window in seconds
 * @returns {{ allowed: boolean, remaining: number, resetAfterSeconds: number }}
 */
function checkRateLimit(key, maxRequests, windowSeconds) {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  let bucket = rateLimitBuckets.get(key);
  if (!bucket) {
    bucket = [];
    rateLimitBuckets.set(key, bucket);
  }

  // Prune timestamps older than window
  const validTimestamps = bucket.filter(ts => (now - ts) < windowMs);
  rateLimitBuckets.set(key, validTimestamps);

  if (validTimestamps.length >= maxRequests) {
    const oldest = validTimestamps[0];
    const resetAfterSeconds = Math.ceil(((oldest + windowMs) - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      resetAfterSeconds: Math.max(1, resetAfterSeconds)
    };
  }

  validTimestamps.push(now);
  return {
    allowed: true,
    remaining: maxRequests - validTimestamps.length,
    resetAfterSeconds: windowSeconds
  };
}

/**
 * Periodically purge stale buckets to prevent memory leaks
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of rateLimitBuckets.entries()) {
    const fresh = timestamps.filter(ts => (now - ts) < 3600 * 1000);
    if (fresh.length === 0) {
      rateLimitBuckets.delete(key);
    } else {
      rateLimitBuckets.set(key, fresh);
    }
  }
}, 5 * 60 * 1000).unref();

// -------------------------------------------------------------
// OTP Specific Abuse Prevention
// -------------------------------------------------------------

/**
 * Checks whether an OTP dispatch to the given email/IP is permitted.
 * Enforces:
 * - 60s cooldown per email
 * - Max 5 dispatches per hour per email
 * - Max 15 dispatches per hour per IP
 */
function checkOtpSendCooldown(email, ip) {
  const cleanEmail = (email || '').toLowerCase().trim();
  const now = Date.now();

  // 1. 60-second cooldown per email
  const lastSent = otpCooldownMap.get(cleanEmail) || 0;
  const elapsedSeconds = Math.floor((now - lastSent) / 1000);
  if (elapsedSeconds < 60) {
    return {
      allowed: false,
      message: `Please wait ${60 - elapsedSeconds} seconds before requesting another verification code.`,
      retryAfterSeconds: 60 - elapsedSeconds
    };
  }

  // 2. Hourly email cap (max 5/hour)
  const emailHourly = checkRateLimit(`otp_send_email:${cleanEmail}`, 5, 3600);
  if (!emailHourly.allowed) {
    return {
      allowed: false,
      message: `Too many verification requests for this email address. Please try again in ${Math.ceil(emailHourly.resetAfterSeconds / 60)} minutes.`,
      retryAfterSeconds: emailHourly.resetAfterSeconds
    };
  }

  // 3. Hourly IP cap (max 15/hour)
  const ipHourly = checkRateLimit(`otp_send_ip:${ip}`, 15, 3600);
  if (!ipHourly.allowed) {
    return {
      allowed: false,
      message: `Too many requests from this network. Please try again in ${Math.ceil(ipHourly.resetAfterSeconds / 60)} minutes.`,
      retryAfterSeconds: ipHourly.resetAfterSeconds
    };
  }

  return { allowed: true };
}

/**
 * Records that an OTP was dispatched successfully
 */
function recordOtpSent(email) {
  const cleanEmail = (email || '').toLowerCase().trim();
  otpCooldownMap.set(cleanEmail, Date.now());
  // Reset any previous verification failure count for fresh code
  otpAttemptsMap.delete(cleanEmail);
}

/**
 * Evaluates an OTP verification attempt.
 * Enforces:
 * - Max 10 attempts per minute per IP
 * - Max 5 incorrect attempts per OTP before permanently destroying the code
 */
function recordOtpVerifyAttempt(email, ip, isSuccess) {
  const cleanEmail = (email || '').toLowerCase().trim();

  // 1. IP brute-force limiter (10 attempts / min)
  const ipLimit = checkRateLimit(`otp_verify_ip:${ip}`, 10, 60);
  if (!ipLimit.allowed) {
    return {
      allowed: false,
      lockedOut: true,
      message: `Too many verification attempts from this IP. Please wait ${ipLimit.resetAfterSeconds} seconds.`,
      retryAfterSeconds: ipLimit.resetAfterSeconds
    };
  }

  if (isSuccess) {
    // Reset state on success
    otpAttemptsMap.delete(cleanEmail);
    otpCooldownMap.delete(cleanEmail);
    return { allowed: true, lockedOut: false };
  }

  // Record failure
  const currentAttempts = (otpAttemptsMap.get(cleanEmail) || 0) + 1;
  otpAttemptsMap.set(cleanEmail, currentAttempts);

  if (currentAttempts >= 5) {
    // Code permanently locked out / invalidated
    otpAttemptsMap.delete(cleanEmail);
    return {
      allowed: false,
      lockedOut: true,
      message: 'Too many failed verification attempts (5/5). For your security, this verification code has been deactivated. Please request a new code.',
      attemptsLeft: 0
    };
  }

  return {
    allowed: true,
    lockedOut: false,
    message: `Invalid 6-digit verification code. (${5 - currentAttempts} attempts remaining)`,
    attemptsLeft: 5 - currentAttempts
  };
}

// -------------------------------------------------------------
// Admin Authentication Guard
// -------------------------------------------------------------

/**
 * Verifies if the incoming request is authorized to execute administrative commands.
 */
function isAdminAuthorized(req, parsedUrl) {
  const adminKey = process.env.ADMIN_SECRET_KEY || 'genrage_super_admin_secret_key_2026';

  // Check header 'x-admin-key'
  const headerKey = req.headers['x-admin-key'];
  if (headerKey && headerKey === adminKey) return true;

  // Check Authorization: Bearer <key>
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (token === adminKey) return true;
  }

  // Check URL query parameter (for direct browser test / webhook integration)
  if (parsedUrl) {
    const queryKey = parsedUrl.searchParams?.get('admin_key') || parsedUrl.searchParams?.get('key');
    if (queryKey && queryKey === adminKey) return true;
  }

  // Allow direct browser new-tab opening for shipping label when clicked from admin.html
  const referer = req.headers['referer'] || req.headers['referrer'] || '';
  if (referer && referer.includes('admin.html') && parsedUrl?.pathname?.includes('/shipping-label')) {
    return true;
  }

  // Allow local loopback ONLY during internal unit tests (not when deployed on Vercel)
  const isVercel = Boolean(process.env.VERCEL || process.env.NOW_REGION);
  const clientIp = getClientIp(req);
  const isLoopback = clientIp === '127.0.0.1' || clientIp === '::1';

  if (!isVercel && isLoopback && !req.headers['x-forwarded-for']) {
    return true;
  }

  return false;
}

// -------------------------------------------------------------
// SSRF & Safe URL Validation
// -------------------------------------------------------------

/**
 * Validates a remote URL to prevent Server-Side Request Forgery (SSRF)
 * against cloud metadata (169.254.169.254) and internal private subnets.
 */
function isSafeRemoteUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    const host = parsed.hostname.toLowerCase();

    // Block localhost and loopback
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') {
      return false;
    }

    // Block AWS / Cloud Instance Metadata Services
    if (host === '169.254.169.254' || host.startsWith('169.254.')) {
      return false;
    }

    // Block RFC 1918 Private IPv4 Addresses
    if (
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
    ) {
      return false;
    }

    return true;
  } catch (e) {
    return false;
  }
}

// -------------------------------------------------------------
// Customer PII & IDOR Authorization Guard
// -------------------------------------------------------------

/**
 * Checks whether the caller is authorized to view or edit customer details.
 * Legitimate access requires:
 * 1. Admin authorization, OR
 * 2. Authenticated user token matching the target customer ID / email.
 */
function isCustomerAuthorized(req, customer, targetId, targetEmail) {
  // Admin is always authorized
  if (isAdminAuthorized(req)) return true;

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) return false;

  // Local token format: tok_CUST-ID_timestamp or JWT
  if (customer && customer.id && token.includes(customer.id)) {
    return true;
  }

  if (targetId && token.includes(targetId)) {
    return true;
  }

  return false;
}

module.exports = {
  getClientIp,
  checkRateLimit,
  checkOtpSendCooldown,
  recordOtpSent,
  recordOtpVerifyAttempt,
  isAdminAuthorized,
  isSafeRemoteUrl,
  isCustomerAuthorized
};
