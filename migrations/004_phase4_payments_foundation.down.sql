-- Phase 4 Rollback: Gateway-Ready Payment Foundation
DROP INDEX IF EXISTS idx_webhook_events_provider;
DROP TABLE IF EXISTS payments;
DROP INDEX IF EXISTS idx_orders_status;
ALTER TABLE orders DROP COLUMN IF EXISTS status;
