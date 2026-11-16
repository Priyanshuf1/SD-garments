-- Phase 4 Migration: Gateway-Ready Payment Foundation
-- Adds unified status to orders, creates payments table, and adds provider to webhook_events.

-- 1. Additive status column to orders for authoritative state machine
ALTER TABLE orders ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'created';
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- 2. Payments table to store immutable payment transaction records
CREATE TABLE IF NOT EXISTS payments (
  id VARCHAR(100) PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  provider_order_id VARCHAR(100),
  provider_payment_id VARCHAR(100),
  amount_paise BIGINT NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  error_code VARCHAR(100),
  error_description TEXT,
  raw_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider_payment ON payments(provider_payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- 3. Enhance webhook_events with provider column
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS provider VARCHAR(50) DEFAULT 'system';
CREATE INDEX IF NOT EXISTS idx_webhook_events_provider ON webhook_events(provider);
