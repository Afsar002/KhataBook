-- DailyKhata Phase 3.13 — opening balances for parties (customers/suppliers).
--
-- Existing khata books migrating from a spreadsheet start with a non-zero
-- balance, so parties gain the same `opening_balance` column accounts got in
-- v1. Local apps run this through migrateV5; the column must exist here before
-- cloud rows start carrying it, or the push/pull would fail on a missing column.
--
-- `IF NOT EXISTS` keeps this idempotent for databases already altered manually.
-- Run this in the Supabase SQL Editor after 003_app_meta.sql.

alter table parties
  add column if not exists opening_balance numeric(12, 2) not null default 0;
