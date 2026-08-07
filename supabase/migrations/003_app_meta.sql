-- DailyKhata Phase 2.6 — min version enforcement & data migration prompts.
--
-- The app_meta table stores global configuration that all clients read on boot.
-- It has a single row (id = 1) with:
--   min_version   : minimum app version required to use the cloud (semver, e.g. '1.12.0')
--   notice        : optional human-readable notice shown when version < min_version
--   migrate_from  : array of old backup versions that need data-migration guidance
--                   (e.g. ['1.6.0', '1.7.0'])
--   migrate_notice: message shown when restoring a backup from a version in
--                   migrate_from — tells the user to export/import or describes
--                   what will be migrated automatically.
--
-- Run this in the Supabase SQL Editor after 001_initial.sql and 002_realtime.sql.

create table if not exists app_meta (
  id              integer primary key default 1 check (id = 1),
  min_version     text not null default '1.0.0',
  notice          text,
  migrate_from    text[] not null default '{}',
  migrate_notice  text,
  updated_at      timestamptz not null default now()
);

-- Default: no enforcement yet. Update min_version when a breaking change lands.
-- Example:
-- update app_meta set min_version = '1.12.0', notice = 'Please update DailyKhata to continue using cloud sync.' where id = 1;

-- Enable RLS so only the app's service role can manage this, but any user can read it.
alter table app_meta enable row level security;
create policy "app_meta read all" on app_meta for select using (true);
-- Service role manages this (no client write policy needed).