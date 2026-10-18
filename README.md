# GENRAGE | Streetwear Clothing Brand India (Full Website Clone)

An authentic, high-performance, pixel-perfect copy of the official [GENRAGE](https://genrage.com/) streetwear e-commerce platform.

---

## ⚡ Key Features

- **Live Official Catalog**: Full dataset of **245 real products** and **30 collections** directly replicated from the live Shopify backend.
- **Streetwear Visual Aesthetic**: High-contrast typography (`Instrument Sans` + `Nunito`), dark theme, video lookbook banners, and marquee ticker.
- **Top Bars**:
  - Auto-sliding Announcement Bar (`FREE DOORSTEP DELIVERY IN INDIA 🇮🇳`, `LOVED BY 300,000+ CUSTOMERS`, etc.)
  - Real-time Flash Sale Countdown Timer (ticking live in days, hours, minutes, seconds).
- **Navigation & Mobile Drawer**:
  - Sticky glassmorphism header with desktop links (New Arrivals, Tank Top, T-Shirt, Hoodies, Bottoms, Clearance Sale).
  - Mobile slide-in drawer menu.
  - Interactive Action Buttons (Instant Search, Wishlist counter, Cart Drawer).
- **Interactive Slideshow / Hero Video**:
  - Autoplay streetwear video background loop with fallback poster and responsive CTA buttons.
- **Infinite Marquee Ticker**:
  - Smooth 60fps ticker banner (`SHIPS UNDER 48 HOURS • LIMITED QUANTITIES • NO RESTOCKS`).
- **Visual Category Carousel**:
  - High-res category cards (Baggy Pants, Hoodies, Boxy Tees, Vests, Jackets).
- **Product Grids & Dual-Image Hover**:
  - Secondary image swap on card hover.
  - Discount calculation badges (`SAVE 35%`, `SAVE 40%`).
  - Star ratings and review count indicators.
  - Wishlist toggle (persisted to `localStorage`).
- **Interactive Cart Drawer**:
  - Slide-out drawer with backdrop blur.
  - Free shipping progress threshold indicator (Free delivery above Rs. 999).
  - Real-time quantity adjustments (`-` / `+`), item deletion, subtotal calculations.
  - 1-Click Gokwik UPI fast checkout button.
- **Quick View / Quick Buy Lightbox**:
  - Preview any of the 245 products without leaving the page.
  - High-res image thumbnail switcher, size selector (`S`, `M`, `L`, `XL`, `XXL`), and instant Add to Cart.
- **Instant Search Engine**:
  - Real-time predictive search across all 245 products by name, tag, or collection.
- **Single Product Page (`product.html`)**:
  - Multi-image zoom gallery, size guide modal, stock indicator (`🔥 Selling Fast - Only 3 left`), accordions (Fabric & Care, 7-Day Returns), and related products.
- **Collection Explorer (`collections.html`)**:
  - Filter by category, sort by price (Low to High / High to Low), wishlist view, and item counter.
- **Full Policy & Support Pages**:
  - Contact Us (`pages/contact.html`), 7-Day Exchange Portal (`pages/returns.html`), Reviews (`pages/reviews.html`), Privacy Policy, Refund Policy, Shipping Policy, Terms of Service.
- **Zero-Dependency Native Server**:
  - Built-in HTTP server (`server.js`) that runs anywhere with zero configuration!

---

## 🚀 How to Run

1. Open a terminal in this directory:
   ```bash
   cd C:\Users\apriy\.gemini\antigravity\scratch\genrage
   ```

2. Start the server:
   ```bash
   npm start
   # or
   node server.js
   ```

3. Open your browser and navigate to:
   - Storefront: `http://localhost:3000`
   - Executive Admin Portal: `http://localhost:3000/admin`

---

## 📁 Project Structure

```
genrage/
├── index.html               # Main homepage with 6 HD streaming videos
├── admin.html               # 1:1 Ditto Executive Admin Management Portal
├── collections.html         # Collections & catalog browser
├── product.html             # Dynamic single product detail page
├── server.js                # Zero-dependency Node.js HTTP server
├── package.json             # NPM package scripts
├── README.md                # Documentation
├── assets/
│   ├── css/
│   │   ├── theme.css        # Authentic theme styles
│   │   └── custom.css       # Custom streetwear UI enhancements
│   └── js/
│       └── app.js           # Frontend state, cart drawer, search & catalog engine
├── data/
│   ├── products.json        # 245 live products database
│   └── collections.json     # 30 collections database
└── pages/
    ├── contact.html         # Contact form & support details
    ├── returns.html         # 7-day exchange portal & rules
    ├── reviews.html         # Customer reviews showcase
    ├── privacy-policy.html  # Official privacy policy
    ├── shipping-policy.html # Shipping guidelines
    ├── refund-policy.html   # Refund and cancellation policy
    └── terms-of-service.html# Terms of service
```
