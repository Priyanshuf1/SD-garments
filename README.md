# ALLEYRICH — High-Performance Luxury D2C Streetwear Platform & Cloud Architecture

[![ALLYRICH DevOps CI/CD Pipeline](https://github.com/Priyanshuf1/SD-garments/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/Priyanshuf1/SD-garments/actions/workflows/ci-cd.yml)
[![Production Status](https://img.shields.io/badge/Production-Live%20on%20AWS%20EC2-232F3E?logo=amazon-aws&logoColor=white)](https://alleyrich.com)
[![CDN & Security](https://img.shields.io/badge/CDN%20%26%20SSL-Cloudflare%20Edge-F38020?logo=cloudflare&logoColor=white)](https://alleyrich.com)
[![Docker](https://img.shields.io/badge/Container-Docker%20Alpine-2496ED?logo=docker&logoColor=white)](https://alleyrich.com)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL%2016-4169E1?logo=postgresql&logoColor=white)](https://alleyrich.com)
[![Logistics](https://img.shields.io/badge/Logistics-Delhivery%20Express%20Live%20API-FF6600)](https://alleyrich.com)
[![Compliance](https://img.shields.io/badge/Compliance-DPDP%20Act%202023%20%7C%20E--Commerce%20Rules%202020-008080)](https://alleyrich.com/pages/privacy-policy.html)

> **Live Production Storefront**: [https://alleyrich.com](https://alleyrich.com) & [https://www.alleyrich.com](https://www.alleyrich.com)  
> **Client Organization**: SD Garments (Brand: **ALLEYRICH**)  
> **Founder Admin HQ**: `https://alleyrich.com/allyrich-hq` (Protected by RFC 6238 TOTP 2FA)  
> **Source Repository**: [https://github.com/Priyanshuf1/SD-garments](https://github.com/Priyanshuf1/SD-garments)  
> **Target Focus**: D2C Streetwear Retail & Full-Stack Cloud / DevOps Engineering Track

---

## 🏛️ Executive Summary

**ALLEYRICH** is an authentic, production-grade Direct-to-Consumer (D2C) luxury streetwear e-commerce platform engineered from the ground up for **SD Garments**. Operating on architectural silhouettes (heavyweight 380+ GSM French terry cotton, boxy tees, balloon cargos, and technical outerwear), the platform bridges bespoke frontend aesthetics with enterprise-grade cloud infrastructure, real-time courier automation, payment processing, and strict statutory compliance.

The platform eliminates heavy, bloated client-side JavaScript frameworks in favor of high-performance vanilla JavaScript, modern CSS3, and an optimized Node.js microservices architecture. It delivers sub-second page transitions, locked 60 FPS scrolling past interactive WebGL 3D elements, and real-time integration with national logistics carriers.

---

## 🌐 Production Cloud Architecture & Hosting

The application is deployed live in production on an **AWS EC2 infrastructure stack** fronted by **Cloudflare's Global Edge Network**.

```
                           [ CUSTOMER BROWSERS & MOBILE CLIENTS ]
                                              │
                                              ▼
                           [ CLOUDFLARE GLOBAL EDGE NETWORK ]
                       - Anycast DNS & Global Content Delivery (CDN)
                       - Edge SSL/TLS Termination & HTTP-to-HTTPS (301)
                       - Automated Layer 3/4 & Layer 7 DDoS Mitigation
                       - Intelligent Edge Caching for Static Assets
                                              │
                                              ▼
                               [ AWS ELASTIC IP (EIP) ]
                                    15.134.19.99
                                              │
                                              ▼
                         [ AWS EC2 PRODUCTION INSTANCE ]
                            Region: ap-south-1 (Mumbai)
                            Instance Type: t3.micro
                            Security Groups: Inbound 80/443 & Restricted SSH (22)
                                              │
                     ┌────────────────────────┴────────────────────────┐
                     ▼                                                 ▼
        [ DOCKER CONTAINER: allyrich-web ]             [ DOCKER CONTAINER: allyrich-db ]
        - Node.js 20 Minimal Alpine Runtime            - PostgreSQL 16 Alpine Engine
        - Microservices REST API (server.js)           - Persistent Docker Volumes
        - Dynamic Cart & Delhivery Dispatch            - Connection Pooling & Auto-Init
        - Port: 3000 (Mapped to 80/443)                - Port: 5432 (Internal Bridge Network)
                     │                                                 │
                     └────────────────────────┬────────────────────────┘
                                              ▼
                               [ THIRD-PARTY INTEGRATION RAILS ]
             - Delhivery Express Production API: Live 19,000+ PIN verification & AWB generation
             - Cashfree Payments: PCI-DSS compliant UPI, Cards, NetBanking aggregator
             - Resend & Brevo APIs: Transactional OTP verification & customer notifications
             - n8n Cloud Webhook: Automated event streaming to fulfillment pipelines
```

### Actual AWS Cloud Components in Production

1. **AWS EC2 Instance (`allyrich-app-server`)**:
   - Hosted in AWS Mumbai (`ap-south-1`).
   - Runs Docker daemon and Docker Compose orchestrating containerized microservices.
   - Non-root container process execution (`USER node`) with graceful signal management via `dumb-init`.
2. **AWS Elastic IP (`15.134.19.99`)**:
   - Dedicated public IPv4 address permanently attached to the EC2 production instance.
   - Ensures deterministic, drift-free DNS A-record mapping from Cloudflare edge proxy.
3. **AWS Security Groups**:
   - Inbound HTTP (Port 80) and HTTPS (Port 443) authorized for web traffic and Cloudflare edge proxies.
   - Inbound SSH (Port 22) restricted strictly to authorized administrative deployer key pairs.
   - PostgreSQL (Port 5432) isolated entirely within the internal Docker bridge network (`10.0.0.0/16`).
4. **AWS RDS / PostgreSQL Database Layer**:
   - Production relational database schema handling customer accounts, orders, inventory stock, addresses, and subscriber lists.
   - Resilient multi-tier architecture with local disk caching and database fallback persistence.

---

## 🔄 Automated CI/CD Pipeline (GitHub Actions)

Every code push to `main` triggers a fully automated 3-stage pipeline defined in [`.github/workflows/ci-cd.yml`](file:///.github/workflows/ci-cd.yml). All 3 stages are active and passing:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        GITHUB ACTIONS AUTOMATED CI/CD PIPELINE                         │
└────────────────────────────────────────────────────────────────────────────────────────┘
       │
       ▼
 ┌──────────────────────────────────────────────────────────────────────────────────────┐
 │ STAGE 1: AUTOMATED SECURITY, COMPLIANCE & PERFORMANCE AUDIT (test-and-verify)        │
 │ • Run DPDP Act 2023 & Consumer Protection E-Commerce Rules test (test_legal_policies) │
 │ • Run Rate Limiting, 5-Attempt Brute-Force & SSRF guard test (test_security_abuse)   │
 │ • Run Production Logistics, OTP & n8n webhook integration test (test_complete_fixes) │
 │ • Run D2C Features, DPR Clamping & 60 FPS WebGL test (test_d2c_performance.js)       │
 └──────────────────────────────────────────────────────────────────────────────────────┘
       │ [All tests pass]
       ▼
 ┌──────────────────────────────────────────────────────────────────────────────────────┐
 │ STAGE 2: DOCKER CONTAINER BUILD & DEVSECOPS SECURITY SCAN (docker-build-and-scan)    │
 │ • Multi-stage Docker build utilizing Buildx cache                                    │
 │ • Spin up ephemeral container & verify HTTP healthcheck at /api/health               │
 │ • Execute Aqua Security Trivy vulnerability scan against container layers (CVEs)     │
 └──────────────────────────────────────────────────────────────────────────────────────┘
       │ [Build & scan pass]
       ▼
 ┌──────────────────────────────────────────────────────────────────────────────────────┐
 │ STAGE 3: AUTOMATED ZERO-DOWNTIME DEPLOYMENT TO AWS EC2 (deploy-to-ec2)               │
 │ • Connect to AWS EC2 (15.134.19.99) via encrypted SSH (appleboy/ssh-action)         │
 │ • Pull latest main branch and inject production secrets                              │
 │ • Execute zero-downtime rebuild: sudo docker compose build & up -d                   │
 │ • Verify live production HTTP 200 on healthcheck and tracking routes (~55 seconds)   │
 └──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## ⚡ Key Engineering & D2C Business Features

### 1. Real-Time Delhivery Express Logistics API
- **Live Pincode Serviceability Engine (`/api/shipping/pincode-check`)**: Real-time validation against Delhivery's live carrier database covering **19,000+ Indian postal codes**.
- **Dynamic Delivery SLA Estimation**: Accurately computes delivery transit windows (2–3 days for Metros, 3–5 days for Tier 2/3) and displays live COD availability.
- **Automated AWB Generation**: One-click generation of authentic Delhivery Express Air Priority waybills (`48005610000125` series) directly from the Founder Admin HQ.
- **Customer Live Tracking Portal (`/pages/track-order.html`)**: Direct package tracking with real-time checkpoint timestamps and courier status mapping.

### 2. Dual Payment Rails & Checkout Optimization
- **Cashfree Payments Gateway**: PCI-DSS certified checkout supporting UPI (Google Pay, PhonePe, Paytm), Credit/Debit Cards, NetBanking, and Wallets.
- **Delhivery Cash on Delivery (COD)**: Verified COD checkout with mandatory phone validation and automated fee calculation.
- **Dynamic Cart Drawer**: Live subtotal calculations, size badge cycling, and animated Free Shipping progress threshold (Free Express Shipping unlocked above ₹1,999).

### 3. Founder Vault 2FA Executive Portal (`/allyrich-hq`)
- **RFC 6238 TOTP Two-Factor Authentication**: Enterprise-grade multi-factor security requiring a time-based 6-digit authenticator code (Google Authenticator, Authy, 1Password) before granting admin access.
- **Brute-Force & Flood Defenses**: Enforces a strict 5-attempt brute-force lockout, sliding-window rate limiters, and session TTL expiration.
- **Comprehensive Merchant Management**: Real-time catalog CRUD, homepage showcase curation, order fulfillment dispatch, and subscriber email broadcasting.

### 4. 60 FPS WebGL & Creative Web Optimization
- **Interactive 3D Phone Hero Canvas (`assets/js/allyrich-3d-hero.js`)**: Real-time 3D model with realistic phone screen mapping powered by Spline & Three.js.
- **True 0% GPU Sleep at Rest**: Implements manual WebGL render gating (`splineApp.renderMode = 'manual'`). Rendering only executes on active mouse/gyroscope interaction frames and sleeps immediately upon convergence.
- **Zero Scroll Jank**: Canvas `pointer-events: none !important;` lets the browser compositor thread scroll natively at 60–120 FPS without synchronous JavaScript hit-testing stalls.
- **3D Review Carousel**: GPU-composited reviews gallery with pre-rendered CubeCamera passes and horizontal touch-action isolation.

### 5. Statutory Legal & Privacy Compliance
- **Digital Personal Data Protection Act, 2023 (DPDP Act)**: Comprehensive privacy policy with clear third-party data processor disclosures, Data Protection Officer desk, and a Zero Data Monetization guarantee.
- **Consumer Protection (E-Commerce) Rules, 2020**: Fully articulated Terms of Service with statutory Grievance Redressal officer contact details.
- **Hassle-Free 7-Day Exchange Policy**: Structured size exchange protocol, defective item replacement guarantee, and doorstep reverse logistics.
- **Cookie Consent Banner (`assets/js/cookie-consent.js`)**: Granular cookie categories (Necessary, Analytics, Marketing) with local storage persistence.

---

## 📂 Project Directory Structure

```
SD-garments/
├── .github/
│   └── workflows/
│       └── ci-cd.yml                # 3-Stage GitHub Actions CI/CD Pipeline
├── assets/
│   ├── css/
│   │   ├── theme.css                # Base luxury streetwear styles
│   │   ├── custom.css               # Navigation, drawer & banner typography
│   │   ├── review-fisheye.css       # 3D review carousel layout & containment
│   │   └── ai-support.css           # Floating GPU-accelerated support widget
│   ├── js/
│   │   ├── app.js                   # Client state, cart calculations & catalog filters
│   │   ├── allyrich-3d-hero.js      # Spline 3D Phone WebGL engine (0% GPU idle)
│   │   ├── review-fisheye.js        # WebGL 3D review carousel
│   │   ├── quick-buy.js             # Global slide-out shopping drawer
│   │   ├── cookie-consent.js        # DPDP/GDPR compliant cookie preferences
│   │   └── chat-widget.js           # Floating customer support concierge
│   └── spline/
│       ├── runtime.js               # Optimized Spline WebGL runtime (manual mode)
│       └── scene.splinecode         # 3D hand & phone screen model
├── data/
│   ├── products.json                # Streetwear product catalog database
│   ├── collections.json             # Curated collection taxonomy
│   ├── orders.json                  # Order history, AWB numbers & statuses
│   └── subscribers.json             # Inner Circle newsletter subscribers
├── lib/
│   ├── security.js                  # Rate limiting, brute-force & anti-spoofing guards
│   ├── totp.js                      # RFC 6238 TOTP 2FA authenticator engine
│   └── whatsapp.js                  # Customer notification message formatter
├── pages/
│   ├── contact.html                 # Customer care & brand inquiry desk
│   ├── returns.html                 # 7-Day exchange portal & return steps
│   ├── track-order.html             # Live Delhivery shipment tracking interface
│   ├── privacy-policy.html          # DPDP Act 2023 statutory disclosures
│   ├── shipping-policy.html         # Pan-India delivery timelines & courier SLAs
│   ├── refund-policy.html           # 7-day exchange & cancellation guidelines
│   └── terms-of-service.html        # Consumer Protection (E-Commerce) Rules 2020
├── Dockerfile                       # Multi-stage minimal Node.js Alpine build
├── docker-compose.yml               # Multi-container web + PostgreSQL stack
├── server.js                        # Core Node.js HTTP microservices runtime
├── package.json                     # NPM configuration & test scripts
├── PROJECT_OVERVIEW.md              # Deep system architectural specification
└── README.md                        # Project documentation
```

---

## 🛠️ Local Setup & Development

### Prerequisites
- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **Docker & Docker Compose** (optional, for containerized local execution)
- **Git**

### Installation Steps

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Priyanshuf1/SD-garments.git
   cd SD-garments
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env` file in the project root:
   ```env
   PORT=3000
   APP_DOMAIN=localhost:3000
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=your_secure_password
   ADMIN_2FA_SECRET=JBSWY3DPEHPK3PXP
   ADMIN_SLUG=/allyrich-hq
   DELHIVERY_API_TOKEN=your_delhivery_api_token
   DELHIVERY_ENV=production
   RESEND_API_KEY=your_resend_api_key
   ```

4. **Start the Development Server**:
   ```bash
   npm start
   # or
   node server.js
   ```

5. **Access Local Endpoints**:
   - Storefront: `http://localhost:3000`
   - Collections: `http://localhost:3000/collections.html`
   - Live Tracking: `http://localhost:3000/pages/track-order.html`
   - Founder 2FA HQ: `http://localhost:3000/allyrich-hq`
   - System Health: `http://localhost:3000/api/health`

---

## 🧪 Comprehensive Test & Verification Suites

The repository contains automated unit, integration, and security test suites designed to verify every layer before deployment:

```bash
# Run Master Bot Audit Suite (102 tests: Legal, Security, Logistics, Accessibility)
npm test

# Run D2C Features & Performance Suite (35 assertions: 3D Hero, Delhivery API, PDP Bar)
node test_d2c_performance.js

# Run Real-World 60 FPS Headless Chrome Benchmark (DPR Clamping, 0% GPU WebGL Sleep)
node test_fps_performance.js
```

### Test Coverage Summary:
- **`test_master_bot_audit.js`**: **102 / 102 checks passing** (DPDP Act compliance, Consumer Protection Rules, Delhivery API, AWB generation, order tracking, cookie consent).
- **`test_d2c_performance.js`**: **35 / 35 assertions passing** (Delhivery live pincode check, 3D Hero optimizations, Review Fisheye optimizations, CSS GPU compositing, PDP sticky bar, cart drawer).
- **`test_fps_performance.js`**: **100% passing** (Desktop/mobile DPR capping, true 0% GPU idle rest, locked 56+ FPS headless scroll).

---

## 📜 License

Engineered for **SD Garments** (**ALLEYRICH**). All rights reserved.
Codebase architecture authored by Priyanshu.
