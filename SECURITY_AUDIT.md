# ALLEYRICH security audit

## High-risk findings addressed in this change

- Removed hardcoded production credentials and insecure Docker/CI fallbacks. Deployment now fails when required secrets are absent.
- Removed the admin `Referer` bypass, Basic-auth password backdoors, and URL query-string admin keys. Admin authorization now requires a configured key or a signed admin session.
- Replaced unsigned customer tokens with HMAC-signed, expiring sessions. Profile, order, cart, and wishlist APIs are bound to the authenticated identity rather than caller-supplied IDs or email addresses.
- Removed plaintext password creation/storage for new local accounts and added scrypt password hashing with one-time legacy migration.
- Server-side order pricing now resolves catalog products, variants, stock, discounts, shipping and totals. Client-submitted prices, totals, statuses and payment IDs are ignored.
- Cashfree payments now fail closed: orders are created at the gateway and payment status is changed to paid only after a successful gateway response matching the order amount and currency.
- Checkout now reserves inventory server-side, returns a one-time private checkout credential, and verifies Cashfree status only with that credential. A signed Cashfree webhook endpoint is available at `/api/webhooks/cashfree` and rejects stale, forged, duplicate, mismatched-amount events.
- Restricted public tracking to exact order/AWB identifiers, rate limited it, and removed full address exposure.
- Replaced wildcard CORS, hardened static-file exposure, made JSON writes atomic, rejected malformed JSON, added upload restrictions, and added DNS-aware SSRF checks with redirect/size/time limits.
- Production deployment no longer contains secret fallbacks. OTP delivery fails closed in production when no provider succeeds, and outbound email templates escape customer/admin-controlled content.

## Required before production deployment

1. Rotate every credential that was previously present in repository files or deployment scripts: database password, Cashfree keys, Delhivery token, Resend/Brevo keys, admin password/API key/TOTP secret, and webhook secrets.
2. Add the variables listed in `.env.example` as GitHub Actions secrets and on the host through a secret manager. Do not put them in `docker-compose.yml` or `.env` committed files.
3. Configure `TRUST_PROXY=true` only when the service is reachable exclusively through the intended Cloudflare/reverse-proxy path. Block direct origin access with the AWS security group.
4. Configure Cashfree to POST payment events to `/api/webhooks/cashfree` and confirm the provider's signature headers are preserved by the reverse proxy.
5. Move orders, inventory reservations, OTPs, sessions, rate limits, webhook idempotency and audit logs to PostgreSQL/Redis for multi-instance operation. The JSON fallback is suitable only for a single-node emergency fallback and is not a concurrency-safe source of truth.
6. Remove existing plaintext `password` fields from `data/customers.json` after migrating affected users and invalidate all existing customer/admin sessions.
7. Set Cashfree credentials before enabling online payment in the storefront; otherwise only COD should be advertised.

## Verification

Run syntax checks and the project security suite after configuring test-only environment variables:

```sh
node --check server.js
node --check lib/security.js
npm test
```
