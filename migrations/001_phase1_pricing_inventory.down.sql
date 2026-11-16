-- Phase 1 Down Migration: Rollback Additive Objects
-- Migration: 001_phase1_pricing_inventory.down.sql

DROP TABLE IF EXISTS coupon_usages CASCADE;
DROP TABLE IF EXISTS coupons CASCADE;
DROP TABLE IF EXISTS product_variants CASCADE;

DROP INDEX IF EXISTS idx_orders_idempotency_key;

ALTER TABLE orders DROP COLUMN IF EXISTS subtotal_paise;
ALTER TABLE orders DROP COLUMN IF EXISTS discount_paise;
ALTER TABLE orders DROP COLUMN IF EXISTS shipping_paise;
ALTER TABLE orders DROP COLUMN IF EXISTS cod_fee_paise;
ALTER TABLE orders DROP COLUMN IF EXISTS tax_paise;
ALTER TABLE orders DROP COLUMN IF EXISTS total_paise;
ALTER TABLE orders DROP COLUMN IF EXISTS idempotency_key;
ALTER TABLE orders DROP COLUMN IF EXISTS drop_item_limit_checked;
