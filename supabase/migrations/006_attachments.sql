-- DailyKhata Phase 3.15 — image/PDF attachments on entries.
--
-- Local apps run this through migrateV12; the columns must exist here before
-- cloud rows start carrying them, or the push/pull would fail on a missing
-- column. Only the small `AttachmentMeta` JSON is stored/synced — the file
-- bytes live on the device (see src/utils/attachments.ts).
--
-- `IF NOT EXISTS` keeps this idempotent for databases already altered manually.
-- Run this in the Supabase SQL Editor after 005_transaction_time.sql.

alter table transactions
  add column if not exists attachments text not null default '[]';

alter table party_transactions
  add column if not exists attachments text not null default '[]';
