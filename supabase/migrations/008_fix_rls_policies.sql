-- DailyKhata Phase 3.x — ensure RLS policies are correctly applied.
--
-- The initial migration (001_initial.sql) already defines RLS policies, but if they
-- were never applied to the remote project or were accidentally dropped, this
-- migration re-asserts them. It is idempotent: DROP IF EXISTS + CREATE POLICY.
--
-- Run this in the Supabase SQL Editor, or with `supabase db push` after linking.

-- ---------------------------------------------------------------------------
-- Transactions
-- ---------------------------------------------------------------------------
alter table if exists public.transactions enable row level security;

drop policy if exists "transactions owner access" on public.transactions;
drop policy if exists "transactions_select" on public.transactions;
drop policy if exists "transactions_insert" on public.transactions;
drop policy if exists "transactions_update" on public.transactions;
drop policy if exists "transactions_delete" on public.transactions;

create policy "transactions_select" on public.transactions
  for select using (user_id = auth.uid());

create policy "transactions_insert" on public.transactions
  for insert with check (user_id = auth.uid());

create policy "transactions_update" on public.transactions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "transactions_delete" on public.transactions
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------
alter table if exists public.accounts enable row level security;

drop policy if exists "accounts owner access" on public.accounts;
drop policy if exists "accounts_select" on public.accounts;
drop policy if exists "accounts_insert" on public.accounts;
drop policy if exists "accounts_update" on public.accounts;
drop policy if exists "accounts_delete" on public.accounts;

create policy "accounts_select" on public.accounts
  for select using (user_id = auth.uid());

create policy "accounts_insert" on public.accounts
  for insert with check (user_id = auth.uid());

create policy "accounts_update" on public.accounts
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "accounts_delete" on public.accounts
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------
alter table if exists public.categories enable row level security;

drop policy if exists "categories owner access" on public.categories;
drop policy if exists "categories_select" on public.categories;
drop policy if exists "categories_insert" on public.categories;
drop policy if exists "categories_update" on public.categories;
drop policy if exists "categories_delete" on public.categories;

create policy "categories_select" on public.categories
  for select using (user_id = auth.uid());

create policy "categories_insert" on public.categories
  for insert with check (user_id = auth.uid());

create policy "categories_update" on public.categories
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "categories_delete" on public.categories
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Parties
-- ---------------------------------------------------------------------------
alter table if exists public.parties enable row level security;

drop policy if exists "parties owner access" on public.parties;
drop policy if exists "parties_select" on public.parties;
drop policy if exists "parties_insert" on public.parties;
drop policy if exists "parties_update" on public.parties;
drop policy if exists "parties_delete" on public.parties;

create policy "parties_select" on public.parties
  for select using (user_id = auth.uid());

create policy "parties_insert" on public.parties
  for insert with check (user_id = auth.uid());

create policy "parties_update" on public.parties
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "parties_delete" on public.parties
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Transfers
-- ---------------------------------------------------------------------------
alter table if exists public.transfers enable row level security;

drop policy if exists "transfers owner access" on public.transfers;
drop policy if exists "transfers_select" on public.transfers;
drop policy if exists "transfers_insert" on public.transfers;
drop policy if exists "transfers_update" on public.transfers;
drop policy if exists "transfers_delete" on public.transfers;

create policy "transfers_select" on public.transfers
  for select using (user_id = auth.uid());

create policy "transfers_insert" on public.transfers
  for insert with check (user_id = auth.uid());

create policy "transfers_update" on public.transfers
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "transfers_delete" on public.transfers
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Party Transactions
-- ---------------------------------------------------------------------------
alter table if exists public.party_transactions enable row level security;

drop policy if exists "party_transactions owner access" on public.party_transactions;
drop policy if exists "party_transactions_select" on public.party_transactions;
drop policy if exists "party_transactions_insert" on public.party_transactions;
drop policy if exists "party_transactions_update" on public.party_transactions;
drop policy if exists "party_transactions_delete" on public.party_transactions;

create policy "party_transactions_select" on public.party_transactions
  for select using (user_id = auth.uid());

create policy "party_transactions_insert" on public.party_transactions
  for insert with check (user_id = auth.uid());

create policy "party_transactions_update" on public.party_transactions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "party_transactions_delete" on public.party_transactions
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
alter table if exists public.settings enable row level security;

drop policy if exists "settings owner access" on public.settings;
drop policy if exists "settings_select" on public.settings;
drop policy if exists "settings_insert" on public.settings;
drop policy if exists "settings_update" on public.settings;
drop policy if exists "settings_delete" on public.settings;

create policy "settings_select" on public.settings
  for select using (user_id = auth.uid());

create policy "settings_insert" on public.settings
  for insert with check (user_id = auth.uid());

create policy "settings_update" on public.settings
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "settings_delete" on public.settings
  for delete using (user_id = auth.uid());