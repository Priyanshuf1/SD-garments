# E2E Test Infra: ALLEYRICH (genrage)

## Test Philosophy
- Opaque-box, requirement-driven. No dependency on internal implementation details.
- Methodology: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Combinatorial + Workload Testing.

## Feature Inventory
| # | Feature | Source (requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|---------------------|:------:|:------:|:------:|
| 1 | Pagination & Catalog Slice | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 2 | Category Chips Navigation | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 3 | Desktop Mega-Dropdowns | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 4 | Mobile Edge-to-Edge Header | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 5 | Cart Drawer & Shipping Progress | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 6 | Checkout & Payment Verification | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 7 | Admin Revenue Dashboard | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 8 | AWB Dispatch Generation | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 9 | Catalog Caching & Invalidation | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 10 | Distributed Rate-Limiting | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 11 | Active Cart & Session Persistence | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 12 | Redis Offline Fallback Resilience | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |

## Test Architecture
- Test runner: `node tests/e2e_runner.js`
- Test case format: Automated Node.js assertion suites exercising HTTP endpoints, payload verification, and DOM contracts
- Directory layout:
  - `tests/e2e/tier1_feature/` (Tier 1: Feature coverage, ≥60 test cases)
  - `tests/e2e/tier2_boundary/` (Tier 2: Boundary & corner cases, ≥60 test cases)
  - `tests/e2e/tier3_pairwise/` (Tier 3: Cross-feature combinations, ≥12 test cases)
  - `tests/e2e/tier4_realworld/` (Tier 4: Realistic end-to-end user workflows, ≥6 scenarios)
  - `tests/e2e_runner.js` (Unified test runner aggregating results, timing, and exit code)

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Full Shopper Journey (Browse -> Filter -> Add to Cart -> Checkout -> Payment Verify) | F1, F2, F5, F6, F9, F11 | High |
| 2 | Admin Order Lifecycle (Create Product -> Cache Invalidation -> Place Order -> Generate AWB) | F7, F8, F9, F12 | High |
| 3 | Security & Rate-Limiter Abuse (OTP Cooldown, Brute-Force Lockout, IP Rate Limits) | F6, F10, F12 | Medium |
| 4 | Redis Outage Simulation (Catalog Serving & Cart Sync with Redis Disconnected) | F5, F9, F11, F12 | High |
| 5 | Cart Thresholds & Promo Discounts (Free shipping ₹1,999 bar, coupon code validation) | F5, F6 | Medium |
| 6 | Mobile Viewport Header & Category Drawer Navigation Flow | F2, F3, F4 | Medium |

## Coverage Thresholds
- Tier 1: ≥5 per feature (12 features × 5 = 60 test cases)
- Tier 2: ≥5 per feature (12 features × 5 = 60 test cases)
- Tier 3: Pairwise coverage of major feature interactions (≥12 test cases)
- Tier 4: Realistic application scenarios (≥6 test cases)
- **Total Minimum Target: ≥138 automated test cases**
