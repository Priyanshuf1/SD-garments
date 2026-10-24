# ALLEYRICH — Luxury D2C Streetwear Platform & Cloud Infrastructure
## Complete System Architecture, Tech Stack & Production Status

> **Live Production Store**: [https://alleyrich.com](https://alleyrich.com) & [https://www.alleyrich.com](https://www.alleyrich.com)  
> **Source Repository**: [https://github.com/Priyanshuf1/SD-garments](https://github.com/Priyanshuf1/SD-garments)  
> **Target Audience**: D2C Streetwear Consumers (Pan-India) & Engineering Portfolio (Full-Stack / Cloud / DevOps Track)  
> **Status**: 100% Production Deployed on AWS EC2 via Docker + Cloudflare Edge CDN/SSL + Active 3-Stage GitHub Actions CI/CD Pipeline

---

## 1. Executive Summary & Brand Identity

**ALLEYRICH** is an authentic, production-grade Direct-to-Consumer (D2C) luxury streetwear e-commerce platform engineered from scratch for **SD Garments**. The brand operates on limited-batch archival drops and architectural garment silhouettes (heavyweight 380+ GSM cotton, boxy tees, balloon cargo pants, hoodies, and vests).

### Core Brand Attributes
- **Visual Aesthetic**: Monochromatic luxury dark palette (`#000000`, `#0a0a0a`, `#111111`) with high-contrast typography and signature red accents (`#e50914`).
- **Brand Assets**: Custom vector AR crest mark, official ruins lookbook backdrop (`/assets/footer-ruins.webp`), and responsive typography (`Instrument Sans`).
- **Performance Standard**: Zero heavy client frameworks (React/Next.js overhead eliminated in favor of ultra-fast vanilla JavaScript and sub-1.2s loader performance).
- **Interactive 3D WebGL Engine**: Hardware-accelerated 3D phone showcase with custom WebGL render gating (`splineApp.renderMode = 'manual'`), eliminating idle GPU overhead and ensuring smooth 60 FPS scrolling.

---

## 2. High-Level System Architecture

```
                                  [ CUSTOMER BROWSERS & CLIENTS ]
                                                 │
                                                 ▼
                              [ CLOUDFLARE GLOBAL EDGE NETWORK ]
                         - Anycast DNS & Edge Reverse Proxy (SSL / DDoS)
                         - Cloudflare Flexible SSL (Auto HTTP->HTTPS 301)
                         - Intelligent Edge Caching for CSS/JS/WebGL Assets
                                                 │
                                                 ▼
                              [ AWS ELASTIC IP (EIP) ]
                                   15.134.19.99
                                                 │
                                                 ▼
                            [ APPLICATION GATEWAY & SECURITY LAYER ]
                         - Sliding-Window Rate Limiting (lib/security.js)
                         - Anti-IP Spoofing & Header Normalization
                         - OTP Brute-Force Lockout (5-Attempt Threshold)
                         - SSRF & 2MB Body Size Limits
                         - Role-Based Admin Auth (RFC 6238 TOTP 2FA)
                                                 │
                                                 ▼
                              [ BACKEND APPLICATION RUNTIME ]
                               Node.js HTTP Microservices (server.js)
                                                 │
                     ┌───────────────────────────┴───────────────────────────┐
                     ▼                                                       ▼
        [ RELATIONAL DATABASE LAYER ]                           [ THIRD-PARTY INTEGRATIONS ]
    - PostgreSQL 16 (AWS RDS / Docker)                      - Cashfree Payments (PCI-DSS Aggregator)
    - Persistent Docker Volumes                             - Delhivery Express (Live AWB Tracking & Dispatch)
    - Local JSON Resilient Caching                          - Resend & Brevo APIs (Transactional OTP & Notifications)
    - Multi-Device Profile & Wishlist Sync                  - n8n Cloud Webhook (Order Automation)
```

---

## 3. Frontend Architecture & Features

The user interface is built using pure **HTML5, CSS3, and modern ES6+ JavaScript** encapsulated within modular component engines:

### A. Storefront & Customer Experience
- **Homepage (`index.html`)**:
  - Architectural hero banner and fast custom preloader (`allyrich-loader.js`, 1.2s timeout).
  - Curated showcases: *"JUST DROPPED"*, *"NEW ARRIVALS"*, and *"BASICS"* controlled dynamically from the Admin portal.
  - Interactive dual-image product cards with mouse-over secondary lookbook reveal.
  - **60 FPS Spline 3D Phone Hero (`assets/js/allyrich-3d-hero.js`)**: Interactive 3D phone model with manual render loop gating, zero WebGL renders at rest (true 0% GPU), and `pointer-events: none` compositor scroll offload.
  - **3D Review Carousel (`assets/js/review-fisheye.js`)**: GPU-composited reviews gallery with pre-rendered CubeCamera passes, horizontal touch-action isolation, and zero vertical scroll hijacking.
- **Catalog & Collections (`collections.html`)**:
  - Live filter chips: *T-shirts, Long Sleeves, Tank Tops, Hoodies, Pants, Jeans, Shorts, Clearance Sale*.
  - Grid/List column layout switchers and real-time product count calculation.
  - Integrated search query handling keyword matches across 240+ SKUs.
- **Product Details (`product.html`)**:
  - Multi-image zoom gallery, size selector buttons (S, M, L, XL), quantity stepper (`+` / `-`).
  - Stock scarcity indicators and accordion tabs for garment fabric specs, wash care, and domestic shipping timelines.
  - **Delhivery Live Pincode Estimator**: Real-time serviceability check providing dynamic delivery days and COD eligibility.
  - **Sticky Add-to-Bag Bottom Bar**: Persistent mobile purchasing bar with size cycling badge.
- **Cart & Quick-Buy Drawer (`assets/js/quick-buy.js`)**:
  - Slide-out bottom-sheet drawer on mobile screens; side-drawer on desktop.
  - Live subtotal calculation and free shipping meter (threshold: ₹1,999).
  - 1-Click Express UPI and COD checkout dispatch.
  - Empty cart checkout block (prevents 0-item order submissions).
- **Customer Account Portal (`account.html`)**:
  - Password and passwordless 6-digit email OTP login.
  - Multi-device synchronized wishlist heart counter badge.
  - Full shipping address manager (Flat/Street, Locality, City, State, PIN Code).
  - Live order history with status pills and courier tracking buttons.

### B. Founder Admin HQ (`admin.html` / `/allyrich-hq`)
- **Protected by RFC 6238 TOTP 2FA**: Mandatory time-based 6-digit authenticator code verification required on login.
- **Catalog Management**: Live Product CRUD (create, edit prices, update images, delete discontinued items).
- **Homepage Showcase Curator**: Admin can toggle which products appear in the homepage curated carousels without touching code.
- **Order Management & Logistics**: View incoming prepaid and COD orders, update fulfillment status, and trigger automated Delhivery AWB dispatch labels.
- **Customer Intelligence & Email Marketing**: View newsletter subscriber tables and broadcast luxury HTML campaign emails via integrated Resend API and direct WhatsApp links.

---

## 4. Backend Services & Security Architecture (`server.js` & `lib/security.js`)

### A. Core RESTful APIs
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/products` | Retrieves product catalog with category filtering | Public |
| `POST` | `/api/products` | Creates a new product in DB and local store | **Admin Only** |
| `PUT` | `/api/products/:id` | Updates price, images, or metadata | **Admin Only** |
| `DELETE` | `/api/products/:id` | Deletes product from catalog | **Admin Only** |
| `POST` | `/api/orders` | Creates customer order with validation | Public |
| `GET` | `/api/orders` | Retrieves order history | Admin / Authenticated |
| `PUT` | `/api/orders/:id` | Updates order fulfillment status | **Admin Only** |
| `GET` | `/api/shipping/pincode-check` | Live Delhivery postal code validation & SLA | Public |
| `POST` | `/api/admin/orders/:id/delhivery-awb` | Generates official Delhivery waybill & shipping label | **Admin Only** |
| `GET` | `/api/orders/track` | Live shipment checkpoint tracking lookup | Public |
| `POST` | `/api/auth/send-otp` | Generates & emails 6-digit login OTP | Public (Rate-Limited) |
| `POST` | `/api/auth/verify-otp` | Validates OTP & issues session token | Public (Lockout-Guarded) |
| `POST` | `/api/wishlist/sync` | Persists customer wishlist to cloud database | Authenticated |
| `POST` | `/api/cart/sync` | Persists active shopping bag across devices | Authenticated |
| `POST` | `/api/newsletter` | Subscribes email to Inner Circle | Public (Rate-Limited) |
| `POST` | `/api/admin/marketing/broadcast` | Dispatches bulk campaign emails & WhatsApp broadcasts | **Admin Only** |
| `GET` | `/api/health` | Healthcheck endpoint for Docker & AWS ALB | Public |

### B. Hardened Abuse Controls & Security Defenses
1. **Sliding-Window Rate Limiting**: Memory and DB backed rate limiters applied to OTP requests (1 per 60s), newsletter submissions (5 per 5m), and checkout attempts.
2. **OTP Brute-Force Lockout Defense**: Allows a maximum of **5 failed attempts**. On attempt 5, the active OTP code is destroyed from database storage, and the identifier is locked out with `HTTP 429` for 15 minutes.
3. **Client IP Anti-Spoofing**: Ignores forged `x-forwarded-for` headers by scanning leftmost valid public IP addresses while stripping internal private CIDR ranges.
4. **SSRF Guard**: Strict URL validation blocks internal network probes (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.169.254` AWS metadata).
5. **Memory Guard**: Rejects payloads exceeding 2MB to eliminate heap buffer overflow attacks.

---

## 5. Legal & Statutory E-Commerce Compliance

All customer-facing policy pages are fully populated and legally compliant under Indian commerce laws:

1. **Terms of Service (`pages/terms-of-service.html`)**:
   - Compliant with **Consumer Protection (E-Commerce) Rules, 2020** and **Information Technology Act, 2000**.
   - Intellectual Property notice protecting architectural cuts, patterns, trademarks, and photography.
   - Statutory Grievance Redressal desk details (Mumbai, Maharashtra jurisdiction, 48-hour response guarantee).
2. **Privacy Policy (`pages/privacy-policy.html`)**:
   - Compliant with India's **Digital Personal Data Protection Act, 2023 (DPDP Act)**.
   - Comprehensive disclosures of data categories, cookie/local storage tokens, and third-party data processors (**Cashfree**, **Delhivery**, **Resend**, **AWS RDS**).
   - Unconditional **Zero Data Monetization Guarantee** (strict pledge against selling customer numbers or emails).
3. **Refund & Cancellation Policy (`pages/refund-policy.html`)**:
   - 7-Day Hassle-Free Size Exchange policy.
   - 48-hour damaged/defective notification policy with photo evidence for 100% refund or free replacement.
   - Transparent refund mode breakdown table (UPI: 24–48h; Cards: 5–7 days; COD: direct NEFT/IMPS bank transfer).
4. **Shipping Policy (`pages/shipping-policy.html`)**:
   - 19,000+ PIN code pan-India coverage via Delhivery Express & Bluedart.
   - Domestic dispatch within 24–48 business hours; delivery timeline matrix (Metros: 2–3 days; Non-metros: 3–5 days).
   - Free prepaid delivery threshold (₹1,999) and tamper-proof security polybag advisory.
5. **Returns Walkthrough (`pages/returns.html`)**:
   - 4-step doorstep pickup and exchange walkthrough, eligibility criteria, and ₹100 courier self-ship reimbursement policy.

---

## 6. Cloud & DevOps Infrastructure

```
                   [ CODE COMMIT & PUSH (git push origin main) ]
                                         │
                                         ▼
                      [ GITHUB ACTIONS AUTOMATED CI/CD ]
     ┌───────────────────────────────────┼───────────────────────────────────┐
     ▼                                   ▼                                   ▼
 [ STAGE 1: TEST ]              [ STAGE 2: BUILD ]                 [ STAGE 3: DEPLOY ]
Run test_legal_policies.js     Multi-Stage Docker Build            Zero-Downtime SSH Deploy
Run test_security_abuse.js     Verify /api/health Check            Pull main on AWS EC2
Run test_complete_fixes.js     Aqua Security Trivy Scan            docker compose build & up -d
Run test_d2c_performance.js                                        Live Healthcheck (~55s)
                                         │
                                         ▼
                     [ PRODUCTION ENVIRONMENT: AWS + CLOUDFLARE ]
                     - Cloudflare Edge CDN (DDoS Mitigation & SSL)
                     - AWS Elastic IP (15.134.19.99)
                     - AWS EC2 Instance (t3.micro, ap-south-1)
                     - Docker Compose (allyrich-web + allyrich-db)
                     - PostgreSQL 16 Persistent Relational Storage
```

### A. Containerization Stack
- **Dockerfile**: Minimal multi-stage build using `node:20-alpine` reducing image size to `<120MB`.
- **Security**: Runs under unprivileged `USER node` with `dumb-init` for signal forwarding.
- **Docker Compose (`docker-compose.yml`)**: Local and production multi-container orchestration of `web` app container and `db` (PostgreSQL 16 Alpine container with persistent storage volumes and healthchecks).
- **Automated CI/CD (`.github/workflows/ci-cd.yml`)**: Automated pipeline verifying tests, building Docker containers, and scanning for vulnerabilities on every push.

### B. AWS Cloud Architecture (Production Verified)
- **EC2 Instance (`allyrich-app-server`)**:
  - `t3.micro` instance in AWS Mumbai region (`ap-south-1`).
  - Managed under Docker Compose with automated service restart policies (`restart: unless-stopped`).
- **Elastic IP (`15.134.19.99`)**:
  - Dedicated public IPv4 address permanently attached to the EC2 production instance.
  - Ensures zero DNS reconfiguration during EC2 restarts or container migrations.
- **Security Groups (`allyrich-ec2-sg`)**:
  - Inbound HTTP (80) & HTTPS (443) open to public ingress and Cloudflare edge proxies.
  - Inbound SSH (22) restricted to deployer key pair.
  - PostgreSQL (5432) isolated from public internet exposure.

---

## 7. Verification Test Suite Status

| Test Suite | File | Tests Passed | Status |
|---|---|---|---|
| **Legal & Compliance Policies** | `test_legal_policies.js` | **49 / 49** (100%) | ✅ PASSING |
| **Security & Abuse Controls** | `test_security_abuse_controls.js` | **21 / 21** (100%) | ✅ PASSING |
| **Logistics, OTP & Webhooks** | `test_complete_fixes.js` | **Passing** (100%) | ✅ PASSING |
| **D2C Performance Engine** | `test_d2c_performance.js` | **35 / 35** (100%) | ✅ PASSING |
| **Master Bot Audit Suite** | `test_master_bot_audit.js` | **102 / 102** (100%) | ✅ PASSING |
| **Real-World 60 FPS Benchmark** | `test_fps_performance.js` | **Passing** (0 renders at rest, 56+ FPS) | ✅ PASSING |

---

## 8. Summary Table of Key URLs & Credentials Structure

| Component | Target URL / Reference | Management Protocol |
|---|---|---|
| **Live Storefront** | `https://alleyrich.com` | Cloudflare Edge + AWS EC2 Origin |
| **Secondary Production URL** | `https://www.alleyrich.com` | Cloudflare Edge SSL Proxy |
| **Founder Admin HQ** | `https://alleyrich.com/allyrich-hq` | RFC 6238 TOTP 2FA Authentication |
| **Code Repository** | `https://github.com/Priyanshuf1/SD-garments` | Git VCS / GitHub Actions CI/CD |
| **Order Tracking** | `https://alleyrich.com/pages/track-order.html` | Live Delhivery B2B Tracking Lookup |
| **Database** | PostgreSQL 16 (AWS RDS / Container) | Persistent Docker Volume & Connection Pool |
| **Payments** | Cashfree Payments Integration | Webhook validation & AES encryption |
| **Fulfillment** | Delhivery Express Production API | Live 19,000+ PIN Serviceability & AWB Generation |
| **Cloud Server** | AWS EC2 (`allyrich-app-server`) | Elastic IP `15.134.19.99` (Port 3000 / 80 / 443) |
