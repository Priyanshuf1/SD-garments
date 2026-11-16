-- Phase 2 Down Migration: Rollback Sessions Tables
-- Migration: 002_phase2_sessions_auth.down.sql

DROP TABLE IF EXISTS customer_sessions CASCADE;
DROP TABLE IF EXISTS admin_sessions CASCADE;
