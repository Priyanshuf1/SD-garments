# Project Rules: SD Garments & GENRAGE Storefront

## 1. Empty Cart Checkout Invariant
- The checkout page and order APIs must **NEVER** permit placing an order with 0 items.
- **Frontend**: If cart count is 0, disable checkout buttons, display an empty bag call-to-action ("SHOP NOW"), and prevent form submission.
- **Backend**: In order placement endpoints (`POST /api/orders`, `POST /api/checkout/create-order`), validate that `items` is a non-empty array with `quantity > 0`. If empty, reject with `HTTP 400 Bad Request`.

## 2. Database Primary Key & Cache Invalidation Invariant
- When synchronizing local stores with external relational databases (e.g., Supabase PostgreSQL), the system must immediately adopt the persisted database UUID/ID for the entity.
- Memory cache timestamps (`memoryProductsLastFetch`, `memoryOrdersLastFetch`) must be recorded **after** network persistence succeeds to ensure consistency across cache TTL expirations.
- Deletions must safely handle UUIDs and cascade cleanly without calling unsupported query methods.

## 3. Storefront Feature Parity & Cleanliness
- Never retain mock or unsupported features (such as Gift Cards or third-party bundle scripts) unless explicitly requested.
- Product catalog count must reflect genuine streetwear drops (no mock items).

## 4. Dual Product Imagery Standard
- Every apparel product must support both a Primary Image (flat-lay / studio cutout) and a Hover Image (model wearing the garment).
- Admin product forms must provide dedicated selectors for both images.
- Storefront product cards must render both images with a smooth hover cross-dissolve.
