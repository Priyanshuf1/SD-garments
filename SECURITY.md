# ALLEYRICH — Production Security Policy & Operational Runbooks

> **Document Classification:** Engineering & Security Operations  
> **Target System:** ALLEYRICH D2C Streetwear Storefront (`alleyrich.com`)  
> **Architecture:** Zero-Framework Node.js Cluster, AWS RDS PostgreSQL, Redis Shared State, ALB Reverse Proxy

---

## 1. Security Architecture Overview

ALLEYRICH employs a layered **defense-in-depth** security architecture designed for Indian D2C e-commerce operations. All state and authorization controls operate strictly server-side; client inputs are treated as untrusted suggestions rather than authoritative values.

```
+-----------------------------------------------------------------------------------+
|                                 Edge Layer                                        |
|  - Cloudflare Access (CF_ACCESS_ENABLED) & Turnstile Bot Mitigation               |
|  - Strict Headers (HSTS, nosniff, Referrer, Permissions, X-Frame-Options)         |
|  - Content-Security-Policy (Report-Only telemetry with /csp-report endpoint)      |
+-----------------------------------------------------------------------------------+
                                       |
                                       v
+-----------------------------------------------------------------------------------+
|                               Network & HTTP Layer                                |
|  - IP Allowlist Guard (ADMIN_IP_ALLOWLIST) for admin portal & API                 |
|  - Robots Header (X-Robots-Tag: noindex, nofollow, noarchive, nosnippet)          |
|  - CSRF Token & Origin / Sec-Fetch-Site validation on state-changing methods      |
|  - Redis Sliding-Window Rate Limiters (per IP, per phone, per email, per session) |
+-----------------------------------------------------------------------------------+
                                       |
                                       v
+-----------------------------------------------------------------------------------+
|                             Application Business Logic                            |
|  - Server-Authoritative Pricing (integer paise calculation, server price lookup)  |
|  - Strict Input Sanitization & Drop Item Quantity Ceilings                        |
|  - Authoritative Order State Machine (created -> payment_pending -> paid ...)      |
|  - Gateway Scaffolding with HMAC SHA-256 constant-time webhook verification       |
|  - COD Risk Engine (Pincode mismatch, junk address, prior RTO, velocity)          |
|  - 256-bit Cryptographic Sessions with HttpOnly, Secure, SameSite=Lax, __Host-    |
+-----------------------------------------------------------------------------------+
                                       |
                                       v
+-----------------------------------------------------------------------------------+
|                               Persistence Layer                                   |
|  - AWS RDS PostgreSQL connection pool with transaction isolation                  |
|  - Atomic Stock Decrements (UPDATE ... WHERE stock >= $qty RETURNING)             |
|  - Append-Only Audit Log (audit_log table with automatic PII masking)             |
|  - Redis Shared State for single-use OTPs, TOTP anti-replay, and idempotency      |
+-----------------------------------------------------------------------------------+
```

---

## 2. Core Security Controls by Phase

### Phase 1: Server-Authoritative Pricing & Inventory
* **Zero Client Price Trust:** Checkout and cart calculation endpoints accept only `{ sku_id, size, qty, coupon_code }`. The server queries the database for authoritative unit prices and calculates subtotals, discounts, delivery fees, and taxes entirely in integer paise. Any client-sent prices, totals, or currencies are discarded.
* **Strict Quantity & Drop Ceilings:** Items are constrained to integer quantities between `1` and `MAX_QTY_PER_ITEM` (default `10`). Exclusive drop items are restricted to `DROP_ITEM_MAX_QTY` (default `2`) per customer.
* **Atomic Stock Decrements:** Inventory decrements execute inside PostgreSQL database transactions (`UPDATE variants SET stock = stock - $qty WHERE stock >= $qty RETURNING *`). Any race condition or insufficient stock triggers an automatic transaction rollback.
* **Server-Side Coupon Rule Engine:** Discount rules enforce active dates, minimum cart thresholds, and customer usage limits backed by an additive `coupon_usage_ledger` table.
* **Idempotency Protection:** Order creation accepts an `Idempotency-Key` header. Repeat submissions within 24 hours return the cached response without creating duplicate orders or double-charging.

### Phase 2: Shared State, Sessions & Auth Hardening
* **Redis-Backed Shared State:** Distributed locks, rate-limiting sliding windows, single-use OTP codes, and TOTP replay caches run in Redis. When `REDIS_AUTH_FAIL_CLOSED=true`, authentication fails closed if Redis is unreachable.
* **OTP Hardening:** Codes are hashed using SHA-256 at rest, verified using `crypto.timingSafeEqual`, single-use consumed on first validation, and expire in 10 minutes. 5 consecutive incorrect attempts trigger an immediate 15-minute identity lockout.
* **Uniform Anti-Enumeration Responses:** Requesting an OTP returns identical timing and HTTP 200 responses regardless of whether the email/phone exists.
* **Session Hardening:** Customer sessions use 256-bit entropy (`crypto.randomBytes(32)`), stored only as SHA-256 hashes server-side. Cookies enforce `HttpOnly`, `Secure`, `SameSite=Lax`, and the `__Host-` prefix.
* **CSRF Protection:** State-changing HTTP methods (`POST`, `PUT`, `DELETE`, `PATCH`) validate origin headers and SameSite credentials.
* **Cloudflare Turnstile:** Server-side verification of `cf-turnstile-response` tokens on OTP requests, admin login, and checkout.

### Phase 3: Headers, Admin Hardening, Audit & Marketing Controls
* **Defensive HTTP Headers:** HSTS preload, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(self)`.
* **Content-Security-Policy (Report-Only First):** Telemetry configured via `Content-Security-Policy-Report-Only` (switchable via `CSP_ENFORCE=true`) reporting to `/csp-report`. Safelists Spline 3D (Wasm, Blob, Web Workers), Razorpay checkout frames, Google Fonts, and Turnstile.
* **Administrative Isolation:** Admin routes emit `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet`, enforce `ADMIN_IP_ALLOWLIST` when set, and verify Cloudflare Access JWT assertions (`CF_ACCESS_ENABLED=true`).
* **Admin Login Backoff:** 3 consecutive failures trigger exponential delay (HTTP 429 with `Retry-After`).
* **Sensitive Action TOTP Re-Auth:** High-risk administrative actions (refunds, bulk exports, marketing broadcasts) require real-time 6-digit TOTP confirmation with anti-replay protection.
* **Append-Only Audit Log:** Administrative events record into the `audit_log` table with automatic PII masking (emails masked as `s***h@domain.com`, phone numbers masked as `+91 ******1234`).
* **Marketing Hub Controls:** Broadcasts enforce explicit recipient opt-in consent (`marketing_consent: true`), require a two-step confirmation review (`confirmed: true`), and throttle to 1 broadcast per 60 seconds.

### Phase 4: Gateway-Ready Payment Foundation (Disabled)
* **Authoritative Order State Machine:** Valid transitions enforced in SQL:
  $$\text{created} \longrightarrow \text{payment\_pending} \longrightarrow \text{paid} \longrightarrow \text{fulfilled} \longrightarrow \text{refunded}$$
  $$\text{created} \longrightarrow \text{cancelled} \quad \text{and} \quad \text{payment\_pending} \longrightarrow \text{cancelled}$$
  Illegal transitions (e.g. `cancelled` $\rightarrow$ `paid`) throw HTTP 400.
* **Generic Webhook Receiver:** Routes `POST /api/webhooks/:provider` and `/webhooks/:provider`. Validates raw body HMAC SHA-256 using `timingSafeEqual`, dedupes via `webhook_events`, verifies amount/currency matches `order.total_paise`, and records into the `payments` table.
* **Disabled by Default:** Remains a safe HTTP 200 no-op while `ONLINE_PAYMENTS_ENABLED=false`. Existing Cash on Delivery (COD) flow is completely unaffected.
* **Reconciliation Engine:** Background job (`POST /api/admin/reconciliation/run`) identifies orders stuck in `payment_pending` past `maxAgeMinutes`, transitions them to `cancelled`, and releases inventory holds.

### Phase 5: COD Risk Engine & Phone Confirmation
* **5-Signal Risk Assessment:** Computes integer score (0–100) based on:
  1. *Pincode / City Mismatch:* Cross-checks entered PIN against the 2-digit Indian Postal Circle matrix.
  2. *Junk Address Detection:* Analyzes repetitive characters, keyboard mash, dummy tokens, and missing street/premise details.
  3. *Prior RTO History:* Scans historical customer database for unfulfilled/returned orders matching the phone number.
  4. *Order Velocity:* Evaluates submission frequency per phone and IP within a 30-minute window.
  5. *High Cart Value:* Flags orders exceeding ₹6,000 / ₹10,000 for verification.
* **Dual Operating Mode:**
  - `COD_RISK_MODE=shadow` (Default): Stores risk score and reasons on the order record without altering the checkout experience.
  - `COD_RISK_MODE=enforce`: Applies risk surcharges, enforces `MAX_COD_VALUE_INR` ceilings, or flags orders for phone confirmation.
* **Phone / WhatsApp Confirmation Hook:** High-risk COD orders receive a 6-digit confirmation token verified via `POST /api/orders/confirm-cod`. Unconfirmed orders auto-cancel after the timeout.

---

## 3. Environment Flags Reference

| Variable | Default | Allowed Values | Description |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | `development` | `production`, `development` | Enables production security checks (refuses to start without DB in prod). |
| `STRICT_PRICING_ENFORCED`| `true` | `true`, `false` | Discards client-sent prices and enforces server-side integer paise totals. |
| `MAX_CART_ITEMS` | `50` | Integer `1..200` | Maximum distinct line items allowed in a single bag. |
| `MAX_QTY_PER_ITEM` | `10` | Integer `1..50` | Maximum units allowed per item. |
| `DROP_ITEM_MAX_QTY` | `2` | Integer `1..10` | Maximum units allowed for drop items per customer. |
| `IDEMPOTENCY_REQUIRED` | `false` | `true`, `false` | Whether the `Idempotency-Key` header is mandatory for checkout. |
| `ALLOW_JSON_FALLBACK` | `true` | `true`, `false` | Allows in-memory/JSON fallback in non-production environments. |
| `REDIS_AUTH_FAIL_CLOSED` | `false` | `true`, `false` | In production, fails authentication closed if Redis is unreachable. |
| `GLOBAL_OTP_LIMIT_PER_MINUTE` | `60` | Integer | System-wide ceiling for SMS/email OTP dispatches per minute. |
| `CSRF_PROTECTION_ENABLED` | `true` | `true`, `false` | Enforces origin and header verification on state-changing requests. |
| `TURNSTILE_ENABLED` | `false` | `true`, `false` | Enables Cloudflare Turnstile token validation on auth and checkout. |
| `TURNSTILE_FAIL_MODE` | `open` | `open`, `closed` | Fail mode if Turnstile verification service times out. |
| `CSP_ENFORCE` | `false` | `true`, `false` | Set `true` to block CSP violations; `false` sends Report-Only header. |
| `ADMIN_IP_ALLOWLIST` | `""` | Comma-separated IPs | Restricts `/admin` and `/api/admin/*` to specified IPv4/IPv6 addresses. |
| `CF_ACCESS_ENABLED` | `false` | `true`, `false` | Requires and validates `Cf-Access-Jwt-Assertion` header for admin routes. |
| `CF_ACCESS_AUD` | `""` | String | Cloudflare Access Audience tag for cryptographic JWT validation. |
| `ONLINE_PAYMENTS_ENABLED`| `false` | `true`, `false` | Activates online payment gateway scaffolding (keep `false` for COD-only). |
| `PAYMENT_WEBHOOK_SECRET` | `""` | String | Shared HMAC secret for verifying online payment gateway webhooks. |
| `COD_RISK_MODE` | `shadow` | `shadow`, `enforce` | Operating mode for COD risk scoring (shadow logs only; enforce acts). |
| `COD_RISK_SURCHARGE_PAISE` | `9900` | Integer (paise) | Additional COD friction fee applied in enforce mode (₹99). |
| `MAX_COD_VALUE_INR` | `50000` | Integer (INR) | Maximum order total allowed for Cash on Delivery in enforce mode. |
| `COD_CONFIRMATION_ENABLED`| `false` | `true`, `false` | Requires customer phone/WhatsApp confirmation for COD orders. |

---

## 4. Operational Runbooks

### Runbook A: Security Incident & Data Breach Containment
**Trigger:** Suspected compromised admin credential, suspicious bulk order export, or unverified remote execution.

1. **Immediate Session Invalidation:**
   Terminate all active customer and administrative sessions across Redis and Postgres:
   ```bash
   # Flush Redis authentication keys
   redis-cli -u $REDIS_URL --scan --pattern "alleyrich:sess:*" | xargs redis-cli -u $REDIS_URL del
   redis-cli -u $REDIS_URL --scan --pattern "alleyrich:admin_totp:*" | xargs redis-cli -u $REDIS_URL del
   ```
   ```sql
   -- Invalidate all active customer sessions in PostgreSQL
   DELETE FROM customer_sessions WHERE idle_expires_at > NOW();
   ```
2. **Restrict Administrative Access:**
   Immediately lock down admin access to the emergency bastion IP:
   ```bash
   ADMIN_IP_ALLOWLIST="203.0.113.10" # Replace with authorized bastion IP
   ```
3. **Audit Log Inspection:**
   Query the append-only `audit_log` table for unauthorized actions:
   ```sql
   SELECT id, admin_username, ip_address, action, target_type, target_id, details, created_at
   FROM audit_log
   WHERE created_at >= NOW() - INTERVAL '24 hours'
   ORDER BY created_at DESC;
   ```
4. **Rotate Administrative Credentials:**
   Follow Runbook B to rotate `ADMIN_SECRET_KEY`, `ADMIN_PASSWORD`, and `ADMIN_2FA_SECRET`.

---

### Runbook B: Secret & Credential Rotation
**Frequency:** Routine rotation every 90 days, or immediately upon personnel change.

1. **Admin TOTP Secret (`ADMIN_2FA_SECRET`):**
   - Generate a new 32-character Base32 secret:
     ```bash
     node -e "console.log(require('crypto').randomBytes(20).toString('hex').slice(0, 32).toUpperCase())"
     ```
   - Update `ADMIN_2FA_SECRET` in AWS Parameter Store / Secrets Manager.
   - Scan the new QR code into the owner's Google Authenticator app.
   - Clear TOTP replay cache in Redis: `redis-cli del "alleyrich:admin_totp:*"`
2. **Session Signing Secret (`AUTH_SESSION_SECRET`):**
   - Generate a 64-character random hex string:
     ```bash
     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
     ```
   - Update `AUTH_SESSION_SECRET` in environment. Existing sessions will seamlessly re-authenticate on next idle expiry.
3. **Payment Webhook Secret (`PAYMENT_WEBHOOK_SECRET` / `RAZORPAY_WEBHOOK_SECRET`):**
   - Configure the secondary webhook secret in the payment gateway portal.
   - Update `PAYMENT_WEBHOOK_SECRET` in the server environment.
   - Trigger a test webhook via `/api/webhooks/razorpay` to verify HMAC verification passes with HTTP 200.

---

### Runbook C: High-Availability Redis Outage & Recovery
**Symptom:** Redis cluster failure or connectivity timeout.

1. **Automatic Degradation:**
   - The application automatically switches to in-memory fallback caches for non-security lookups (catalog cache, rate-limiting counters).
   - If `REDIS_AUTH_FAIL_CLOSED=false`, customer browsing and OTP login continue using the local memory fallback with process-level isolation.
   - If `REDIS_AUTH_FAIL_CLOSED=true` (high-security production mode), OTP login and admin actions fail safe with HTTP 503 until Redis recovers.
2. **Post-Recovery Verification:**
   - Once the Redis service is restored, the connection pool automatically reconnects with exponential backoff.
   - Verify Redis cluster health:
     ```bash
     node -e "require('./lib/redis.js').ping().then(console.log)"
     ```

---

### Runbook D: Activating Online Payments (Razorpay Integration)
**Pre-flight Checklist Before Flipping Flag:**

1. **Verify Environment Configuration:**
   Ensure all provider credentials are populated in `.env`:
   ```bash
   ONLINE_PAYMENTS_ENABLED=true
   PAYMENT_PROVIDER=razorpay
   RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxx
   RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
   RAZORPAY_WEBHOOK_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
   ```
2. **Execute Database Migrations:**
   Ensure additive migrations `004` and `005` are applied:
   ```bash
   node lib/migrate.js up
   ```
3. **Verify CSP Allows Gateway Origin:**
   Verify `checkout.razorpay.com` and `api.razorpay.com` are permitted in `server.js` CSP header.
4. **Run Live Smoke Test:**
   - Initiate a test payment transaction via `/api/checkout/create-payment`.
   - Send signed test webhook to `/api/webhooks/razorpay` and verify order transitions from `payment_pending` to `paid`.
   - Verify COD checkout continues to operate without interruption.
