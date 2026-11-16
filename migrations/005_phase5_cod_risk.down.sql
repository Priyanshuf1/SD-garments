-- Phase 5 Rollback Migration
-- Reverts additive risk scoring, reasons, mode, and confirmation columns on orders.

DROP INDEX IF EXISTS idx_orders_cod_risk_score;
DROP INDEX IF EXISTS idx_orders_cod_confirmed;

ALTER TABLE orders DROP COLUMN IF EXISTS cod_risk_score;
ALTER TABLE orders DROP COLUMN IF EXISTS cod_risk_reasons;
ALTER TABLE orders DROP COLUMN IF EXISTS cod_risk_mode;
ALTER TABLE orders DROP COLUMN IF EXISTS cod_risk_action;
ALTER TABLE orders DROP COLUMN IF EXISTS cod_confirmed;
ALTER TABLE orders DROP COLUMN IF EXISTS cod_confirmed_at;
