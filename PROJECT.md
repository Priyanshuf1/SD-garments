# Project: ALLEYRICH Production Hardening & Live Readiness Verification

## Architecture
- **Runtime**: Pure Node.js HTTP Server (`server.js`) with zero third-party web framework overhead.
- **Database Layer**: PostgreSQL connection pool (`lib/db.js`, `pg.Pool`) with secondary Supabase cloud adapter (`lib/supabase.js`) and resilient atomic JSON fallback storage (`data/*.json`).
- **Caching & State Layer**: Distributed Redis client (`lib/redis.js`) under namespace `alleyrich:*` providing sub-millisecond catalog caching, distributed sliding-window rate limiting, active cart and session management, and seamless fallback to in-memory maps and database queries.
- **Frontend Architecture**: High-performance semantic HTML5/CSS3/Vanilla JS with modular engines (`assets/js/quick-buy.js`, `collections.html`, `index.html`, `product.html`, `checkout.html`, `admin.html`).
- **Integrations & Sandbox Isolation**:
  - Cashfree Payment Gateway (`CASHFREE_ENV=TEST`, mock/sandbox verification).
  - Delhivery Logistics Express CMU (`ALLOW_SYNTHETIC_AWB=true`, synthetic waybill `14092...`).
  - Brevo Transactional Email (mock/devCode in non-production).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Numbered Catalog Pagination | 24 items/page, dynamic ellipsis, URL sync `?page=X` in CollectionEngine | M1 | Survey |
| 2 | Category Chips | Dynamic taxonomy chips, active indicator, mobile smooth auto-centering | M1 | Survey |
| 3 | Desktop Mega-Dropdowns | Multi-column + promo card grids (Men's & Kids 3-col, Party 2-col) with 220ms debounce timing | M1 | Survey |
| 4 | Mobile Edge-to-Edge Header | Sticky `#000000`, 100vw, 28px logo, 32px touch targets, `#mobile-nav-drawer` | M1 | Survey |
| 5 | Interactive Cart Drawer | QuickBuyEngine, qty controls, ₹1,999 free shipping meter, empty guard, cloud sync | M1 | Survey |
| 6 | Checkout & Payment Flow | Cashfree JS SDK modal, HMAC checkoutToken verification, webhook, COD | M1 | Survey |
| 7 | Admin Revenue Dashboard | `GET /api/admin/stats` calculating Total Revenue, Orders Placed, AOV, timeframe filters | M1 | Survey |
| 8 | Admin AWB Dispatch | `POST /api/admin/orders/:id/delhivery-awb`, shipped status, thermal packing slip | M1 | Survey |
| 9 | External Integration Isolation | Sandbox/mock isolation for Cashfree PG, Delhivery Logistics, and Brevo Email | M1 | Survey |
| 10 | Redis Client Architecture | `lib/redis.js`, `alleyrich:*` namespace, connection retry, offline queue disabled | M2 | Survey |
| 11 | Catalog Response Caching | Caching for products (`/api/products`) and collections (`/api/collections`) | M2 | Survey |
| 12 | Instant Admin Invalidation | Cache invalidation on admin product/collection CRUD and stock reserve/release | M2 | Survey |
| 13 | Distributed Rate Limiting | Centralized sliding-window rate limiting for OTP, login, admin, checkout, search | M2 | Survey |
| 14 | Cart & Session Caching | Admin sessions (12h TTL), customer active carts (30d TTL), webhook idempotency | M2 | Survey |
| 15 | Resilient Redis Fallback | Seamless fallback to in-memory maps and database queries when Redis is offline | M2 | Survey |
| 16 | Load Test User Journeys | 4 realistic scenarios: browsing, catalog queries, filter toggles, cart sync/checkout | M3 | Survey |
| 17 | 1k to 5k VU Concurrency Suite | Automated load testing harness ramping up from 1,000 to 5,000 virtual users | M3 | Survey |
| 18 | Telemetry & Capacity Report | Empirical RPS, p95/p99 latency curves, CPU/memory, DB pool saturation report | M3 | Survey |
| 19 | Dual-Track E2E Test Suite | 4-Tier test suite (Feature, Boundary, Pairwise, Real-World) with `TEST_READY.md` | M-E2E | Survey |
| 20 | Final Adversarial Hardening | Tier 5 white-box challenger analysis and full system verification | M4 | Survey |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M-E2E | E2E Testing Suite Track | Design and publish 4-tier opaque-box test suite & `TEST_READY.md` | none | IN_PROGRESS |
| M1 | Adversarial External QA Audit | Comprehensive storefront/admin adversarial audit, mocks, QA report | none | IN_PROGRESS |
| M2 | Redis Architecture & Resilience | `lib/redis.js`, catalog caching, invalidation, distributed limits, sessions, fallback | none | PLANNED |
| M3 | Load Test Suite & Capacity | 1,000–5,000 VU load environment, telemetry, capacity report | M2 | PLANNED |
| M4 | Final E2E Pass & Hardening | 100% E2E test pass + Tier 5 adversarial coverage hardening | M-E2E, M1, M2, M3 | PLANNED |

## Interface Contracts

### Redis Client (`lib/redis.js`)
- `getRedisClient()`: Returns active Redis client instance or `null` if unreachable.
- `isRedisAvailable()`: Boolean indicating live Redis health.
- `cacheGet(key)`: Returns parsed JSON or `null`.
- `cacheSet(key, value, ttlSeconds)`: Sets key with expiration.
- `cacheDel(patternOrKey)`: Deletes key or wildcard pattern.
- `checkRateLimit(key, maxRequests, windowSeconds)`: Returns `{ allowed, remaining, resetAfterSeconds }`.
- `getAdminSession(token)`: Returns admin session data or `null`.
- `setAdminSession(token, data, ttlSeconds)`: Persists admin session.
- `delAdminSession(token)`: Revokes admin session.
- `getUserCart(userIdOrEmail)`: Returns cart items or `null`.
- `setUserCart(userIdOrEmail, cart, ttlSeconds)`: Persists user cart.

### Cache Keys & TTLs
- `alleyrich:catalog:products:all` (TTL: 300s)
- `alleyrich:catalog:products:handle:<handle>` (TTL: 300s)
- `alleyrich:catalog:collections:all` (TTL: 300s)
- `alleyrich:ratelimit:<endpoint>:<identifier>` (TTL: windowSeconds)
- `alleyrich:ratelimit:otp_cooldown:<email>` (TTL: 60s)
- `alleyrich:otp:<email>` (TTL: 600s)
- `alleyrich:otp_fail:<email>` (TTL: 900s)
- `alleyrich:session:admin:<token>` (TTL: 43200s)
- `alleyrich:cart:user:<userIdOrEmail>` (TTL: 2592000s)
- `alleyrich:idempotency:cashfree:<eventId>` (TTL: 86400s)

### Cache Invalidation Hooks
- `POST /api/admin/products` -> `cacheDel('alleyrich:catalog:products:*')`
- `PUT /api/admin/products/:id` -> `cacheDel('alleyrich:catalog:products:*')`
- `DELETE /api/admin/products/:id` -> `cacheDel('alleyrich:catalog:products:*')`
- `POST/PUT/DELETE /api/admin/collections` -> `cacheDel('alleyrich:catalog:collections:*')`
- Inventory reserve/release -> `cacheDel('alleyrich:catalog:products:*')`

## Code Layout
- Server Core: `server.js` (HTTP handling, routing, security headers)
- Database: `lib/db.js` (PostgreSQL connection pool & queries)
- Cloud Database: `lib/supabase.js` (Supabase adapter)
- Redis Architecture: `lib/redis.js` (Redis client, caching, rate limiting, sessions, fallback)
- Security: `lib/security.js` (IP resolution, HMAC tokens, security middleware)
- Logistics: `lib/delhivery.js` (Delhivery CMU API, waybill generation)
- Storefront Assets: `assets/js/quick-buy.js`, `collections.html`, `index.html`, `product.html`, `checkout.html`
- Admin Dashboard: `admin.html`
- Data Fallbacks: `data/*.json`
- Tests & Audits: `tests/`, `test_security_abuse_controls.js`, `test_delhivery_integration.js`, `test_master_bot_audit.js`
