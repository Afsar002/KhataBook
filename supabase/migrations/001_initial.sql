-- DailyKhata Phase 2 — initial cloud schema.
--
-- The cloud mirrors the device's SQLite store, but with a uuid primary key
-- (the same `uuid` the app stamps on every row), a `user_id` owner, and sync
-- bookkeeping columns:
--   created_at / updated_at : timestamps (updated_at is the LWW clock)
--   deleted_at              : soft-delete tombstone (rows are never hard-deleted)
--   version                 : optimistic-concurrency counter (reserved)
--
-- Push uses `INSERT ... ON CONFLICT (id) DO UPDATE` (upsert keyed on the uuid),
-- pull reads rows with `updated_at > last_pulled_at`. Row Level Security keeps
-- every user's rows private: each policy only ever sees `user_id = auth.uid()`.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------
create table accounts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  version        integer not null default 1,
  name           text not null,
  type           text not null,
  opening_balance numeric(12,2) not null default 0,
  sort_order     integer not null default 0
);
alter table accounts enable row level security;
create policy "accounts owner access" on accounts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create index accounts_owner_updated_idx on accounts (user_id, updated_at);

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------
create table categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  version     integer not null default 1,
  name        text not null,
  type        text not null,
  icon        text,
  sort_order  integer not null default 0
);
alter table categories enable row level security;
create policy "categories owner access" on categories
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create index categories_owner_updated_idx on categories (user_id, updated_at);

-- ---------------------------------------------------------------------------
-- Parties (customers / suppliers)
-- ---------------------------------------------------------------------------
create table parties (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  version     integer not null default 1,
  name        text not null,
  type        text not null,
  phone       text
);
alter table parties enable row level security;
create policy "parties owner access" on parties
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create index parties_owner_updated_idx on parties (user_id, updated_at);

-- ---------------------------------------------------------------------------
-- Transactions (income / expense)
-- ---------------------------------------------------------------------------
create table transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  version     integer not null default 1,
  type        text not null,
  amount      numeric(12,2) not null,
  account_id  uuid references accounts(id),
  category_id uuid references categories(id),
  note        text,
  date        date not null
);
alter table transactions enable row level security;
create policy "transactions owner access" on transactions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create index transactions_owner_updated_idx on transactions (user_id, updated_at);
create index transactions_owner_date_idx on transactions (user_id, date);

-- ---------------------------------------------------------------------------
-- Transfers
-- ---------------------------------------------------------------------------
create table transfers (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  version         integer not null default 1,
  from_account_id uuid references accounts(id),
  to_account_id   uuid references accounts(id),
  amount          numeric(12,2) not null,
  note            text,
  date            date not null
);
alter table transfers enable row level security;
create policy "transfers owner access" on transfers
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create index transfers_owner_updated_idx on transfers (user_id, updated_at);

-- ---------------------------------------------------------------------------
-- Party transactions (khata ledger entries)
-- ---------------------------------------------------------------------------
create table party_transactions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version    integer not null default 1,
  party_id   uuid references parties(id),
  direction  text not null,
  amount     numeric(12,2) not null,
  note       text,
  date       date not null
);
alter table party_transactions enable row level security;
create policy "party_transactions owner access" on party_transactions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create index party_transactions_owner_updated_idx on party_transactions (user_id, updated_at);

-- ---------------------------------------------------------------------------
-- Settings (key/value app preferences)
-- ---------------------------------------------------------------------------
create table settings (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version    integer not null default 1,
  key        text not null,
  value      text,
  unique (user_id, key)
);
alter table settings enable row level security;
create policy "settings owner access" on settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create index settings_owner_updated_idx on settings (user_id, updated_at);
