-- Phase 1: Server-Authoritative Pricing, Integer Paise & Atomic Inventory
-- Migration: 001_phase1_pricing_inventory.up.sql

-- 1. Additive columns to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal_paise BIGINT DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_paise BIGINT DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_paise BIGINT DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cod_fee_paise BIGINT DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_paise BIGINT DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_paise BIGINT DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS drop_item_limit_checked BOOLEAN DEFAULT false;

-- Create unique index on idempotency_key (only for non-null keys)
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency_key ON orders(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 2. Coupons Table
CREATE TABLE IF NOT EXISTS coupons (
  code TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'percentage',
  value NUMERIC NOT NULL DEFAULT 0,
  min_order_paise BIGINT DEFAULT 0,
  max_discount_paise BIGINT DEFAULT 0,
  global_usage_limit INT DEFAULT NULL,
  per_user_limit INT DEFAULT 1,
  usage_count INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_coupons_active ON coupons(is_active);

-- 3. Coupon Usage Ledger Table
CREATE TABLE IF NOT EXISTS coupon_usages (
  id BIGSERIAL PRIMARY KEY,
  coupon_code TEXT NOT NULL REFERENCES coupons(code) ON DELETE CASCADE,
  order_id TEXT NOT NULL,
  customer_id TEXT,
  customer_email TEXT NOT NULL,
  discount_paise BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_coupon_usages_code_email ON coupon_usages(coupon_code, customer_email);
CREATE INDEX IF NOT EXISTS idx_coupon_usages_order ON coupon_usages(order_id);

-- 4. Product Variants Table for Normalized Atomic Stock Control
CREATE TABLE IF NOT EXISTS product_variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku TEXT UNIQUE,
  title TEXT NOT NULL DEFAULT 'Default',
  size TEXT DEFAULT 'M',
  price_paise BIGINT NOT NULL DEFAULT 0,
  compare_at_price_paise BIGINT DEFAULT 0,
  inventory_quantity INT NOT NULL DEFAULT 0,
  is_drop_item BOOLEAN DEFAULT false,
  max_qty_per_customer INT DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_sku ON product_variants(sku);
