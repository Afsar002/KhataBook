-- DailyKhata — Comprehensive RLS policies for all sync tables.
--
-- This migration ensures RLS is enabled and proper policies exist for ALL tables.
-- It replaces the "for all" policies in 001_initial.sql with explicit SELECT/INSERT/UPDATE/DELETE
-- policies that are easier to debug and audit. This is idempotent: DROP IF EXISTS + CREATE POLICY.
--
-- Run this in the Supabase SQL Editor, or with `supabase db push` after linking.

-- ---------------------------------------------------------------------------
-- Helper: Drop all existing policies on a table (idempotent cleanup)
-- Schema-qualified so cleanup never touches a same-named table in another
-- schema (e.g. extensions or a shadow clone) and never errors when the table
-- doesn't exist yet.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  tbl text;
  pol text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['accounts','categories','transactions','transfers','parties','party_transactions','settings'])
  LOOP
    IF to_regclass('public.' || tbl) IS NULL THEN
      CONTINUE;
    END IF;
    FOR pol IN EXECUTE format(
      'SELECT policyname FROM pg_policies WHERE schemaname = %L AND tablename = %L',
      'public', tbl
    )
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, tbl);
    END LOOP;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Resolve ownerless records BEFORE enabling row-level security.
-- Every policy below is `user_id = auth.uid()` — a row with a NULL/empty
-- owner becomes invisible AND un-updatable for everyone (silent data loss in
-- the UI, and push gets rejected by the WITH CHECK). Fail loudly so the
-- operator assigns owners first instead of discovering orphaned rows later:
--   SELECT * FROM <table> WHERE user_id IS NULL OR user_id = '';
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  tbl text;
  orphans bigint;
  offenders text := '';
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['accounts','categories','transactions','transfers','parties','party_transactions','settings'])
  LOOP
    IF to_regclass('public.' || tbl) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format(
      'SELECT count(*) FROM public.%I WHERE user_id IS NULL OR user_id = %L',
      tbl, ''
    ) INTO orphans;
    IF orphans > 0 THEN
      offenders := offenders || format('%s (%s rows)', tbl, orphans) || ', ';
    END IF;
  END LOOP;

  IF offenders <> '' THEN
    RAISE EXCEPTION
      'Ownerless rows found: %. Assign them to a user (or delete them) before enabling RLS — the user_id = auth.uid() policies would hide these rows from every client.',
      left(offenders, -2);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Transactions
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transactions_select" ON public.transactions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "transactions_insert" ON public.transactions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "transactions_update" ON public.transactions
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "transactions_delete" ON public.transactions
  FOR DELETE USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accounts_select" ON public.accounts
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "accounts_insert" ON public.accounts
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "accounts_update" ON public.accounts
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "accounts_delete" ON public.accounts
  FOR DELETE USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories_select" ON public.categories
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "categories_insert" ON public.categories
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "categories_update" ON public.categories
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "categories_delete" ON public.categories
  FOR DELETE USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Parties
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.parties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parties_select" ON public.parties
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "parties_insert" ON public.parties
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "parties_update" ON public.parties
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "parties_delete" ON public.parties
  FOR DELETE USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Transfers
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transfers_select" ON public.transfers
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "transfers_insert" ON public.transfers
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "transfers_update" ON public.transfers
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "transfers_delete" ON public.transfers
  FOR DELETE USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Party Transactions
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.party_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "party_transactions_select" ON public.party_transactions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "party_transactions_insert" ON public.party_transactions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "party_transactions_update" ON public.party_transactions
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "party_transactions_delete" ON public.party_transactions
  FOR DELETE USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settings_select" ON public.settings
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "settings_insert" ON public.settings
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "settings_update" ON public.settings
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "settings_delete" ON public.settings
  FOR DELETE USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Verify all policies are in place
-- ---------------------------------------------------------------------------
-- SELECT * FROM pg_policies WHERE tablename IN ('accounts','categories','transactions','transfers','parties','party_transactions','settings') ORDER BY tablename, policyname;