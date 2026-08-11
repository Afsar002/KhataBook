-- DailyKhata Phase 3.14 — auto-recorded time of day (HH:MM, 24-hour local) on
-- every entry.
--
-- Local apps run this through migrateV11; the columns must exist here before
-- cloud rows start carrying them, or the push/pull would fail on a missing
-- column. New entries always carry a non-empty `time`; opening-balance entries
-- use '' (a balance "before the book" has no time of day).
--
-- `IF NOT EXISTS` keeps this idempotent for databases already altered manually.
-- Run this in the Supabase SQL Editor after 004_party_opening_balance.sql.

alter table transactions
  add column if not exists time text not null default '';

alter table transfers
  add column if not exists time text not null default '';

alter table party_transactions
  add column if not exists time text not null default '';
