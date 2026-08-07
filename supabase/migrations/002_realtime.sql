-- DailyKhata Phase 2.5 — live multi-device sync.
--
-- Supabase only broadcasts row changes for tables that are members of the
-- `supabase_realtime` publication. Adding all synced tables lets the app's
-- Realtime channel receive an event whenever a row changes, which wakes the
-- device up for a pull. RLS (from 001_initial.sql) already scopes delivery to
-- rows owned by the signed-in user.
--
-- Run this after 001_initial.sql in the Supabase SQL Editor. Migrations run
-- once, so re-running is not expected; if it is, Postgres errors with
-- "table is already a member of publication" and it's safe to ignore.

alter publication supabase_realtime add table accounts;
alter publication supabase_realtime add table categories;
alter publication supabase_realtime add table parties;
alter publication supabase_realtime add table transactions;
alter publication supabase_realtime add table transfers;
alter publication supabase_realtime add table party_transactions;
alter publication supabase_realtime add table settings;
