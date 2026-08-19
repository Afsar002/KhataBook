-- DailyKhata Phase 3.x — defensive updated_at triggers.
--
-- NOTE: This is a safety net, NOT the multi-device sync fix. The app already
-- stamps `updated_at` on every insert and update it sends (see
-- src/db/transaction-repo.ts, src/db/sync/push.ts), and the cloud columns
-- default to now(), so the pull cursor (`updated_at > last_pulled_at`) already
-- advances correctly. These triggers only protect against a future code path
-- that updates a row without setting updated_at — they never fire on INSERT,
-- so they do not affect newly created transactions.
--
-- Run this in the Supabase SQL Editor after 001_initial.sql. It is idempotent:
-- the function is CREATE OR REPLACE and each trigger is DROP IF EXISTS first.

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_transactions_updated_at on public.transactions;
drop trigger if exists set_party_transactions_updated_at on public.party_transactions;
drop trigger if exists set_accounts_updated_at on public.accounts;
drop trigger if exists set_parties_updated_at on public.parties;
drop trigger if exists set_transfers_updated_at on public.transfers;

create trigger set_transactions_updated_at
before update on public.transactions
for each row execute function public.set_updated_at();

create trigger set_party_transactions_updated_at
before update on public.party_transactions
for each row execute function public.set_updated_at();

create trigger set_accounts_updated_at
before update on public.accounts
for each row execute function public.set_updated_at();

create trigger set_parties_updated_at
before update on public.parties
for each row execute function public.set_updated_at();

create trigger set_transfers_updated_at
before update on public.transfers
for each row execute function public.set_updated_at();
