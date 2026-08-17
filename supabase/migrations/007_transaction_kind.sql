-- DailyKhata Phase 3.12 fix — `kind` column on transactions & party_transactions.
--
-- The local app (migrateV8) added a `kind` column to `transactions` and
-- `party_transactions` to distinguish normal entries from immutable
-- "Opening Balance" ledger entries, but the cloud never got this column.
-- This breaks sync both ways:
--
--   PUSH: tables.ts includes `kind` in sync columns, so every upsert sends
--         `kind` -> Postgres rejects with 'column "kind" does not exist'
--         -> sync fails, operations park as failed in the queue.
--   PULL: pull.ts maps spec.columns (which include `kind`), cloud row has no
--         `kind`, binds NULL -> SQLite NOT NULL constraint error -> pull throws.
--
-- `IF NOT EXISTS` keeps this idempotent. Run in the Supabase SQL Editor
-- after 006_attachments.sql, or with `supabase db push`.

alter table transactions
  add column if not exists kind text not null default 'normal';

alter table party_transactions
  add column if not exists kind text not null default 'normal';