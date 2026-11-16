-- Phase 5 Migration: COD Risk & Confirmation
-- Adds additive risk scoring, reasons, mode, and confirmation columns to orders table.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS cod_risk_score INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cod_risk_reasons JSONB DEFAULT '[]'::jsonb;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cod_risk_mode VARCHAR(20) DEFAULT 'shadow';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cod_risk_action VARCHAR(50) DEFAULT 'ALLOW';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cod_confirmed BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cod_confirmed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_cod_risk_score ON orders(cod_risk_score);
CREATE INDEX IF NOT EXISTS idx_orders_cod_confirmed ON orders(cod_confirmed);
