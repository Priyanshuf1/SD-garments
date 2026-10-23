# ALLEYRICH — Luxury D2C Streetwear Platform & Cloud Infrastructure
## Complete System Architecture, Tech Stack & Project Status

> **Live Production Store**: [https://genrage.vercel.app](https://genrage.vercel.app)  
> **Source Repository**: [https://github.com/Priyanshuf1/SD-garments](https://github.com/Priyanshuf1/SD-garments)  
> **Target Audience**: D2C Streetwear Consumers (Pan-India) & Engineering Portfolio (Cloud/DevOps Track)  
> **Status**: Production Deployed (Vercel) + Containerized (Docker/GitHub Actions) + AWS Infrastructure (In Progress)

---

## 1. Executive Summary & Brand Identity

**ALLEYRICH** is a high-end Direct-to-Consumer (D2C) streetwear e-commerce platform engineered from scratch. The brand operates on limited-batch archival drops and architectural garment silhouettes (heavyweight 380+ GSM cotton, boxy tees, balloon cargo pants, hoodies, and vests).

### Core Brand Attributes
- **Visual Aesthetic**: Monochromatic luxury dark palette (`#000000`, `#0a0a0a`, `#111111`) with high-contrast typography and signature red accents (`#e50914`).
- **Brand Assets**: Custom vector AR crest mark, official ruins lookbook backdrop (`/assets/footer-ruins.webp`), and responsive typography (`Instrument Sans`).
- **Performance Standard**: Zero heavy client frameworks (React/Next.js overhead eliminated in favor of ultra-fast vanilla JavaScript and sub-1.2s loader performance).

---

## 2. High-Level System Architecture

```
                                  [ CUSTOMER BROWSERS & CLIENTS ]
                                                 │
                                                 ▼
                              [ CLOUD DISCOVERY & ROUTING LAYER ]
                                       Route 53 / Vercel Edge
                                                 │
                                                 ▼
                           [ APPLICATION GATEWAY & SECURITY LAYER ]
                        - Sliding-Window Rate Limiting (lib/security.js)
                        - Anti-IP Spoofing & Header Normalization
                        - OTP Brute-Force Lockout (5-Attempt Threshold)
                        - SSRF & 2MB Body Size Limits
                        - Role-Based Admin Auth (x-admin-key)
                                                 │
                                                 ▼
                             [ BACKEND APPLICATION RUNTIME ]
                              Node.js HTTP Microservices (server.js)
                                                 │
                     ┌───────────────────────────┴───────────────────────────┐
                     ▼                                                       ▼
        [ RELATIONAL DATABASE LAYER ]                           [ THIRD-PARTY INTEGRATIONS ]
   - PostgreSQL (AWS RDS / Supabase Cloud)                 - Cashfree Payments (PCI-DSS Aggregator)
   - Local JSON Fallbacks (data/*.json)                    - Delhivery Express (AWB Tracking & Dispatch)
   - Multi-Device Profile & Wishlist Sync                  - Resend API (Transactional OTP Emails)
```

---

## 3. Frontend Architecture & Features

The user interface is built using pure **HTML5, CSS3, and modern ES6+ JavaScript** encapsulated within modular component engines:

### A. Storefront & Customer Experience
- **Homepage (`index.html`)**:
  - Architectural hero banner and fast custom preloader (`allyrich-loader.js`, 1.2s timeout).
  - Curated showcases: *"JUST DROPPED"*, *"NEW ARRIVALS"*, and *"BASICS"* controlled dynamically from the Admin portal.
  - Interactive dual-image product cards with mouse-over secondary lookbook reveal.
- **Catalog & Collections (`collections.html`)**:
  - Live filter chips: *T-shirts, Long Sleeves, Tank Tops, Hoodies, Pants, Jeans, Shorts, Clearance Sale*.
  - Grid/List column layout switchers and real-time product count calculation.
  - Integrated search query handling keyword matches across 240+ SKUs.
- **Product Details (`product.html`)**:
  - Multi-image zoom gallery, size selector buttons (S, M, L, XL), quantity stepper (`+` / `-`).
  - Stock scarcity indicators and accordion tabs for garment fabric specs, wash care, and domestic shipping timelines.
- **Cart & Quick-Buy Drawer (`assets/js/quick-buy.js`)**:
  - Slide-out bottom-sheet drawer on mobile screens; side-drawer on desktop.
  - Live subtotal calculation and free shipping meter (threshold: ₹999).
  - Empty cart checkout block (prevents 0-item order submissions).
- **Customer Account Portal (`account.html`)**:
  - Password and passwordless 6-digit email OTP login.
  - Multi-device synchronized wishlist heart counter badge.
  - Full shipping address manager (Flat/Street, Locality, City, State, PIN Code).
  - Live order history with status pills and courier tracking buttons.

### B. Merchant Control Center (`admin.html`)
- **Protected by Private Admin Key**: Strict `x-admin-key` validation blocks unauthorized access.
- **Catalog Management**: Live Product CRUD (create, edit prices, update images, delete discontinued items).
- **Homepage Showcase Curator**: Admin can toggle which products appear in the homepage curated carousels without touching code.
- **Order Management & Logistics**: View incoming prepaid and COD orders, update fulfillment status, and trigger automated Delhivery AWB dispatch labels.
- **Customer Intelligence & Email Marketing**: View newsletter subscriber tables and broadcast luxury HTML campaign emails via integrated Resend API.

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
| `POST` | `/api/auth/send-otp` | Generates & emails 6-digit login OTP | Public (Rate-Limited) |
| `POST` | `/api/auth/verify-otp` | Validates OTP & issues session token | Public (Lockout-Guarded) |
| `POST` | `/api/wishlist/sync` | Persists customer wishlist to cloud database | Authenticated |
| `POST` | `/api/cart/sync` | Persists active shopping bag across devices | Authenticated |
| `POST` | `/api/newsletter` | Subscribes email to Inner Circle | Public (Rate-Limited) |
| `POST` | `/api/admin/subscribers/broadcast` | Dispatches bulk campaign emails | **Admin Only** |
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
   - Comprehensive disclosures of data categories, cookie/local storage tokens, and third-party data processors (**Cashfree**, **Delhivery**, **Resend**, **AWS/Supabase**).
   - Unconditional **Zero Data Monetization Guarantee** (strict pledge against selling customer numbers or emails).
3. **Refund & Cancellation Policy (`pages/refund-policy.html`)**:
   - 7-Day Hassle-Free Size Exchange policy.
   - 48-hour damaged/defective notification policy with photo evidence for 100% refund or free replacement.
   - Transparent refund mode breakdown table (UPI: 24–48h; Cards: 5–7 days; COD: direct NEFT/IMPS bank transfer).
4. **Shipping Policy (`pages/shipping-policy.html`)**:
   - 19,000+ PIN code pan-India coverage via Delhivery Express & Bluedart.
   - Domestic dispatch within 24–48 business hours; delivery timeline matrix (Metros: 2–4 days; Non-metros: 4–6 days).
   - Free prepaid delivery threshold and tamper-proof security polybag advisory.
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
 [ STAGE 1: TEST ]              [ STAGE 2: BUILD ]                 [ STAGE 3: SECURITY ]
Run test_legal_policies.js     Multi-Stage Docker Build            Aqua Security Trivy
Run test_security_abuse.js     Run container health check          Scan CVEs in container
                               Check http://localhost:3000/health
                                         │
                                         ▼
               ┌─────────────────────────┴─────────────────────────┐
               ▼                                                   ▼
     [ HOSTING ENVIRONMENT A ]                           [ HOSTING ENVIRONMENT B ]
         Vercel Serverless                                   AWS Enterprise Stack
        (Current Live Store)                              - Custom VPC (10.0.0.0/16)
                                                          - Public Subnets (2 AZs)
                                                          - Security Group Chaining
                                                          - EC2 (Docker Alpine Container)
                                                          - Application Load Balancer (ALB)
```

### A. Containerization Stack
- **Dockerfile**: Minimal multi-stage build using `node:20-alpine` reducing image size to `<120MB`.
- **Security**: Runs under unprivileged `USER node` with `dumb-init` for signal forwarding.
- **Docker Compose (`docker-compose.yml`)**: Local multi-container orchestration of `web` app container and `db` (PostgreSQL 16 Alpine container with persistent storage volumes and healthchecks).
- **Automated CI/CD (`.github/workflows/ci-cd.yml`)**: Automated pipeline verifying tests, building Docker containers, and scanning for vulnerabilities on every push.

### B. AWS Cloud Architecture (Active Progress)
- **VPC (`allyrich-prod-vpc`)**: Isolated `10.0.0.0/16` network spanning 2 Availability Zones with public and private subnets.
- **Security Groups**:
  - `allyrich-alb-sg`: Inbound HTTP (80) & HTTPS (443) from `0.0.0.0/0`.
  - `allyrich-ec2-sg`: Inbound SSH (22) from developer IP and Port 3000 chained strictly to `allyrich-alb-sg`.
- **Compute & Load Balancing**: Free-tier eligible `t2.micro` EC2 instance, Application Load Balancer with HTTP-to-HTTPS 301 redirection, and automated SSL termination via AWS Certificate Manager (ACM).

---

## 7. Verification Test Suite Status

| Test Suite | File | Tests Passed | Status |
|---|---|---|---|
| **Legal & Compliance Policies** | `test_legal_policies.js` | **37 / 37** (100%) | ✅ PASSING |
| **Security & Abuse Controls** | `test_security_abuse_controls.js` | **21 / 21** (100%) | ✅ PASSING |
| **Storefront & Admin Integration**| `test_admin_storefront_flow.js` | **60 / 60** (100%) | ✅ PASSING |

---

## 8. Summary Table of Key URLs & Credentials Structure

| Component | Target URL / Reference | Management Protocol |
|---|---|---|
| **Live Storefront** | `https://genrage.vercel.app` | Vercel Serverless Edge |
| **Admin Portal** | `https://genrage.vercel.app/admin` | Private `x-admin-key` Authorization |
| **Code Repository** | `https://github.com/Priyanshuf1/SD-garments` | Git VCS / GitHub Actions CI/CD |
| **Order Tracking** | `https://genrage.vercel.app/track` | Internal Delhivery AWB Redirection |
| **Database** | PostgreSQL (AWS RDS / Supabase) | SSL Encrypted TCP (Port 5432) |
| **Payments** | Cashfree Payments Integration | Webhook validation & AES encryption |
| **Fulfillment** | Delhivery Express B2B Integration | Automated AWB Label Generation |
| **Cloud Server** | AWS EC2 (`allyrich-app-server`) | Docker Container on Port 3000 |
| **Load Balancer** | AWS Application Load Balancer | Port 80/443 Listener & Target Group |
