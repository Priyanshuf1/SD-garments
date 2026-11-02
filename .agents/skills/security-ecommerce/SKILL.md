---
name: security-ecommerce
description: Universal, battle-tested security and anti-fraud engineering standard for any e-commerce platform. Covers zero-trust server-side pricing, cryptographic session integrity, fails-closed payment verification, admin privilege boundaries, SSRF prevention, and rate limiting across any language or stack.
version: 1.0.0
owner: security-engineering
status: active
categories: ["ecommerce", "security", "payments", "backend", "anti-fraud", "devops"]
triggers: ["ecommerce security", "secure checkout", "prevent price tampering", "audit store security", "harden ecommerce backend", "security e commerce", "payment security", "anti-fraud ecommerce"]
related_skills: ["ui-ux-pro-max", "vanilla-creative-web"]
conflicting_skills: []
primary_tools: ["javascript", "typescript", "python", "go", "sql", "shell"]
minimum_inputs: ["ecommerce architecture, order processing endpoints, or payment flow"]
verification_required: true
last_reviewed: "2026-11-02"
---

# Universal E-Commerce Security & Anti-Fraud Playbook

This standard defines mandatory, zero-trust security engineering principles for any e-commerce storefront, order processing engine, checkout pipeline, and administrative dashboard regardless of language, framework, database, or payment gateway.

---

## Pillar 1: Zero-Trust Server-Side Order Pricing & Stock Validation

### Universal Law: The client proposes; the server determines.
Never trust monetary figures, discount values, shipping costs, or stock counts originating from the client browser or API consumer.

1. **Discard Client-Supplied Prices:**
   * Strip and ignore all client-submitted `price`, `unitPrice`, `itemTotal`, `subtotal`, `shippingCost`, and `orderTotal` fields.
   * Discard any client-asserted discount subtotals.
2. **Authoritative Catalog Resolution:**
   * Every line item must be re-queried directly from the server's authoritative database by its canonical identifier (`productId`, `sku`, or `variantId`).
   * Verify that the item is active, published, and eligible for sale.
   * If any requested item or variant does not exist or is inactive, abort immediately with `HTTP 400 Bad Request` (`"Invalid or unavailable product in cart"`).
3. **Enforce Strict Quantity Bounds:**
   * Enforce integer typing: validate that `quantity` is a whole number where `1 <= quantity <= MAX_PER_ITEM` (recommended ceiling: 10–20 units).
   * Guard against negative numbers, floats, string manipulation, and integer overflow attempts (`999999999999`).
4. **Authoritative Discount & Promotion Engine:**
   * Re-evaluate discount codes and promotions on the server at the exact millisecond of checkout.
   * Verify minimum order value, valid timestamp range, per-user usage limits, and exclusion lists.
   * Never store pre-discounted final prices in the cart without server-side rule re-evaluation.
5. **Dynamic Shipping Computation:**
   * Shipping fees must be calculated server-side based on final computed subtotal, weight, dimensions, destination zone, and merchant business rules (e.g. Free Shipping thresholds).
6. **Atomic Inventory Decrement:**
   * Reserve or decrement inventory inside an atomic database transaction or distributed lock (e.g., `SELECT ... FOR UPDATE` in SQL or atomic decrement operations) upon order placement or payment authorization to prevent race-condition overselling.

---

## Pillar 2: Cryptographic Identity & Password Hygiene

### Universal Law: Passwords must be modern-hashed; sessions must be signed and tamper-proof.

1. **Password Hashing Standard:**
   * Strictly forbid plaintext, MD5, SHA-1, or unsalted/single-round SHA-256.
   * Use **scrypt** (recommended parameters: `N=16384`, `r=8`, `p=1`, `keyLen=64`) or **argon2id** with a cryptographically secure 16-byte random salt (`crypto.randomBytes(16)`).
   * Format: `scrypt$<salt>$<hash>`.
   * Verify passwords using constant-time comparison (`crypto.timingSafeEqual`) to eliminate timing attacks.
   * Transparent Migration: Automatically upgrade legacy plaintext or weak hashes upon successful user authentication.
2. **Signed, Expiring Customer Sessions:**
   * Never issue predictable, sequential, or forgeable tokens (`tok_<id>_<timestamp>`).
   * Issue cryptographically signed sessions (HMAC-SHA256 tokens or signed JWTs) containing:
     * `sub`: Canonical user identifier
     * `email`: Lowercase normalized email
     * `iat`: Timestamp issued
     * `exp`: Explicit expiration timestamp (recommended: 7 days)
   * Verify signatures in constant-time. Expired tokens must be immediately rejected with `HTTP 401 Unauthorized`.
3. **Anti-IDOR (Insecure Direct Object Reference):**
   * Customer-specific endpoints (`/api/orders`, `/api/cart`, `/api/wishlist`, `/api/profile`) must pull the identity exclusively from the validated session claims.
   * Never allow a client query parameter (`?userId=...` or `?email=...`) to access or modify records belonging to another account.

---

## Pillar 3: Fails-Closed Payment Gateway Architecture

### Universal Law: Never trust frontend callbacks; confirm transactions server-to-server.
Applicable across all payment gateways: Stripe, Razorpay, Cashfree, PayPal, Adyen, Mollie.

1. **Two-Stage Payment Handshake:**
   * **Stage 1 (Server Order Creation):** Server computes authoritative total, creates an order/session at the gateway API, and returns an ephemeral payment session token or client secret to the frontend.
   * **Stage 2 (Gateway Direct Flow):** Client opens the gateway's hosted checkout or modal using the session token.
2. **Mandatory Server-to-Server Verification:**
   * Upon completion, the backend must make a direct authenticated API call to the gateway (e.g. `GET /orders/{id}/payments` or `stripe.paymentIntents.retrieve()`).
   * Verify three invariants:
     1. Status is conclusively captured/succeeded.
     2. Gateway captured amount matches server-calculated order amount to the exact cent/paisa.
     3. Currency matches expected merchant currency.
3. **Webhook Signature Verification & Idempotency:**
   * Always verify webhook HMAC signatures against the raw unparsed request body using the gateway's webhook secret.
   * Ensure payment webhooks are idempotent: check whether an order is already marked paid before triggering fulfillment, preventing duplicate dispatches on retried webhook events.
4. **Fails-Closed COD Fallback:**
   * If online payment credentials are unavailable, misconfigured, or unreachable, fail closed: gracefully guide the customer to Cash on Delivery (COD) or display a retry prompt rather than generating fake or unverified paid orders.

---

## Pillar 4: Admin Vault & Privilege Boundary Hardening

### Universal Law: Zero backdoors, zero credentials in browser URLs, zero plaintext secrets.

1. **Eliminate URL Credential Parameters:**
   * Never accept admin keys or auth tokens in URL query strings (`?key=...`, `?token=...`). Query parameters are captured in browser history, proxy logs, and `Referer` headers.
2. **Eliminate Header-Spoofing Bypasses:**
   * Do not grant administrative access based on `Referer` or `Origin` headers, which can be spoofed by any HTTP client.
3. **SessionStorage vs. LocalStorage:**
   * Store administrative session tokens in `sessionStorage` rather than `localStorage`.
   * Closing the browser tab or window must immediately revoke access, protecting administrative consoles on shared or public computers.
4. **Protected Binary Asset Streaming:**
   * Sensitive files (shipping labels, tax invoices, customer exports) must never be served through public URLs.
   * Fetch assets through an authenticated endpoint with `Authorization` headers, stream as binary blobs, render via temporary in-memory URLs (`URL.createObjectURL`), and revoke after use.

---

## Pillar 5: Abuse Prevention, SSRF & Denial-of-Service Defense

### Universal Law: Constrain all inputs, rate-limit sensitive endpoints, and isolate remote fetches.

1. **DNS-Aware SSRF (Server-Side Request Forgery) Defense:**
   * When accepting external URLs (e.g., product image imports, custom webhooks, remote feeds), resolve DNS before executing the request.
   * Strictly forbid connection to:
     * Loopback addresses: `127.0.0.0/8`, `::1`
     * Cloud metadata endpoints: `169.254.169.254`, `metadata.google.internal`
     * RFC 1918 Private networks: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
     * Carrier-Grade NAT: `100.64.0.0/10`
   * Enforce redirect limits (max 3) and re-check target IP on each redirect.
2. **Payload Size Clamping:**
   * Enforce strict body size limits (e.g., 2MB for standard JSON endpoints, streaming boundaries for multipart uploads). Terminate connection immediately on overflow.
3. **OTP Throttling & Anti-Brute-Force Lockouts:**
   * Enforce minimum 60-second cooldown between OTP dispatch requests for the same phone/email/IP.
   * Enforce lockout after 5 consecutive failed verification attempts.
4. **Sliding-Window Rate Limiting:**
   * Apply sliding-window rate limiters across high-risk endpoints: customer checkout, newsletter signups, password resets, review submissions, and order tracking lookups.

---

## Pillar 6: Operational Secret Hygiene & Resilient Deployment

### Universal Law: Secure pipelines should never crash on missing non-critical variables.

1. **Graceful Deployment Defaults:**
   * In container orchestrations and CI/CD pipelines, provide sensible operational defaults for non-critical environment variables rather than terminating deployments abruptly.
2. **Synchronized Container Healthchecks:**
   * Ensure container healthchecks read parameterized environment variables (e.g., `$DB_USER`, `$DB_NAME`) rather than hardcoded credentials to avoid silent startup deadlocks.
3. **Zero Secrets in Version Control:**
   * All production API keys, database passwords, and signing secrets must live exclusively in environment variables or cloud secret managers. Never commit `.env` or production credentials to git.

---

## Pillar 7: Universal E-Commerce Security Verification Checklist

Before deploying any e-commerce application to production, run this audit:

- [ ] **Price Tampering:** Does tampering with prices in DevTools or curl get overridden by the server?
- [ ] **Empty / Negative Carts:** Does the server reject orders with 0 items, negative items, or quantities > 20?
- [ ] **Expired Coupons:** Does applying an expired or inactive discount code fail on the server?
- [ ] **IDOR Protection:** Can user A fetch user B's orders or cart by modifying the request parameters?
- [ ] **Password Storage:** Are passwords encrypted with salted `scrypt` or `argon2id`?
- [ ] **Payment Verification:** Does the backend verify the captured payment amount with the gateway API before creating a paid order?
- [ ] **Admin URL Exposure:** Are admin endpoints free of query-string key bypasses?
- [ ] **SSRF Defense:** Does passing `http://169.254.169.254` to image/video fetch endpoints return `HTTP 400`?
- [ ] **Rate Limiting:** Does spamming OTP or newsletter signups return `HTTP 429 Too Many Requests`?
- [ ] **Payload Limits:** Does a request body > 2MB get cut off immediately?
