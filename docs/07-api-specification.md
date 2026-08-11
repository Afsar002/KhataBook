# API Specification

DailyKhata talks to **Supabase** for authentication, cloud sync and live
multi-device updates. There is no custom backend — the "API" is the standard
Supabase surface (PostgREST over HTTPS, GoTrue auth, Realtime), scoped by Row
Level Security so every request only ever touches the signed-in user's rows.

- Base URL: `https://<project-ref>.supabase.co` (configured in `.env` via
  `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`)
- Client library: `@supabase/supabase-js` (wired up in `src/services/supabase/`)
- Data access is **read/write via PostgREST REST** (`supabase.from(...)`) — there
  are no RPCs except the standard auth helpers
- Live updates use **Realtime** `postgres_changes` (see [Realtime](#realtime))

---

## Authentication

Handled by GoTrue through the Supabase JS client. All endpoints return
`{ data, error }`; the app wraps them in `AuthResult`.

| Action | Function (`src/services/supabase/auth.ts`) | Underlying call |
|--------|--------------------------------------------|-----------------|
| Phone OTP | `requestPhoneOtp(phone)` | `signInWithOtp({ phone })` |
| Verify SMS code | `verifyPhoneOtp(phone, token)` | `verifyOtp({ phone, token, type: 'sms' })` |
| Email + password | `signInWithEmail(email, password)` | `signInWithPassword({ email, password })` |
| Email sign-up | `signUpWithEmail(email, password)` | `signUp({ email, password })` |
| Google | `signInWithGoogle(idToken)` | `signInWithIdToken({ provider: 'google', idToken })` |
| Reset password | `resetPassword(email)` | `resetPasswordForEmail(email, { redirectTo: 'dailykhata://reset-password' })` |
| Update password | `updatePassword(newPassword)` | `updateUser({ password })` |
| Sign out | `signOut()` | `signOut()` |
| Restore session | `restoreSession()` | `getSession()` + `setSession()` |

- Sessions persist via AsyncStorage; `onAuthStateChange` keeps the app's
  `auth-context` in sync.
- The session id (`user_id`) is stamped on every row a user creates, so
  `getCurrentUserId()` in `src/services/supabase/auth.ts` is the source of
  truth for row ownership.
- Password reset deep link: `dailykhata://reset-password`.

---

## Data model conventions

Every synced table shares the same bookkeeping columns:

| Column | Type | Meaning |
|--------|------|---------|
| `id` | `uuid` | Cloud primary key (equals the app's row `uuid`) |
| `user_id` | `uuid` | Owner — always `auth.uid()` via RLS |
| `created_at` | `timestamptz` | Server creation timestamp |
| `updated_at` | `timestamptz` | **LWW clock** — the newest value wins in a pull conflict |
| `deleted_at` | `timestamptz` | Soft-delete tombstone (rows are never hard-deleted) |
| `version` | `integer` | Optimistic-concurrency counter (reserved) |

Row Level Security is enabled on every table with a single policy pattern:

```sql
create policy "<table> owner access" on <table>
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

Each table also has `(user_id, updated_at)` indexed for the pull cursor.

---

## Tables

### `accounts`

Cash / bank / wallet accounts.

| Column | Type | Notes |
|--------|------|-------|
| `name` | `text` | Display name |
| `type` | `text` | `cash` \| `bank` \| `wallet` |
| `opening_balance` | `numeric(12,2)` | Balance at account creation |
| `sort_order` | `integer` | Manual ordering |

### `categories`

Income / expense categories.

| Column | Type | Notes |
|--------|------|-------|
| `name` | `text` | |
| `type` | `text` | `income` \| `expense` |
| `icon` | `text` | Lucide icon name |
| `sort_order` | `integer` | |

### `parties`

Customers and suppliers (khata books).

| Column | Type | Notes |
|--------|------|-------|
| `name` | `text` | |
| `type` | `text` | `customer` \| `supplier` |
| `phone` | `text` | Optional, used for reminders |
| `opening_balance` | `numeric(12,2)` | Non-zero starting balance (migration 004) |

### `transactions`

Income / expense ledger entries.

| Column | Type | Notes |
|--------|------|-------|
| `type` | `text` | `income` \| `expense` |
| `amount` | `numeric(12,2)` | |
| `account_id` | `uuid → accounts.id` | |
| `category_id` | `uuid → categories.id` | |
| `note` | `text` | Free text |
| `date` | `date` | Ledger date (can be backdated) |

### `transfers`

Money moved between two accounts.

| Column | Type | Notes |
|--------|------|-------|
| `from_account_id` | `uuid → accounts.id` | |
| `to_account_id` | `uuid → accounts.id` | Must differ |
| `amount` | `numeric(12,2)` | |
| `note` | `text` | |
| `date` | `date` | |

### `party_transactions`

Khata ledger entries (give/receive/take/pay).

| Column | Type | Notes |
|--------|------|-------|
| `party_id` | `uuid → parties.id` | |
| `direction` | `text` | `in` \| `out` (semantics depend on party type) |
| `amount` | `numeric(12,2)` | |
| `note` | `text` | |
| `date` | `date` | |

### `settings`

Key/value user preferences that sync across devices.

| Column | Type | Notes |
|--------|------|-------|
| `key` | `text` | `unique (user_id, key)` |
| `value` | `text` | JSON-encoded |

### `app_meta`

Global configuration, single row `id = 1`. **No `user_id`** — readable by all,
writable only by the service role.

| Column | Type | Notes |
|--------|------|-------|
| `min_version` | `text` | Minimum semver to use the cloud; clients below show "Update required" |
| `notice` | `text` | Shown when `app_version < min_version` |
| `migrate_from` | `text[]` | Backup versions needing migration guidance |
| `migrate_notice` | `text` | Shown when restoring a backup from `migrate_from` |

---

## Sync protocol

The device SQLite store is the source of truth; the cloud mirrors it.

### Push (`src/db/sync/push.ts`)

- Local writes stamp `uuid`, `user_id`, `updated_at` and enqueue into
  `sync_queue` (coalesced per `table + uuid`) inside the same SQLite
  transaction.
- The engine uploads pending entries as a `POST /rest/v1/<table>` **upsert**
  (`INSERT ... ON CONFLICT (id) DO UPDATE`) keyed on the row `uuid`.
- Rows are pushed **parent-before-child**: `accounts, categories, parties →
  transactions, transfers, party_transactions → settings`.
- Deletes become `deleted_at = now()` tombstones (a `DELETE` request), never a
  hard row removal.

### Pull (`src/db/sync/pull.ts`)

- Each table is fetched as
  `GET /rest/v1/<table>?user_id=eq.<uid>&updated_at=gt.<cursor>&order=updated_at`.
- Applied **last-write-wins**: if a local row is newer than the incoming
  `updated_at`, the incoming change is skipped (`skipped`); otherwise insert /
  update locally.
- A remote tombstone (`deleted_at` set) hard-deletes the local row.
- A per-table cursor (`sync_meta`) avoids re-fetching unchanged rows.

### Live updates (`src/services/sync/realtime.ts`)

- One Realtime channel subscribes to `postgres_changes` filters on all 7 synced
  tables (requires migration `002_realtime.sql` — the `supabase_realtime`
  publication).
- Rows are scoped by RLS, so each device only receives its own user's changes.
- Realtime is a **wake-up signal only** — payload rows are never applied
  directly; the event schedules a debounced pull so LWW stays in one place.
- If the channel drops (e.g. network flap), the app falls back to trigger-based
  sync and the status banner switches to "trigger" mode.

---

## Migrations (`supabase/migrations/`)

| File | Content |
|------|---------|
| `001_initial.sql` | All 7 tables + RLS policies + indexes + `pgcrypto` |
| `002_realtime.sql` | Adds tables to the `supabase_realtime` publication |
| `003_app_meta.sql` | `app_meta` table + read-all policy |
| `004_party_opening_balance.sql` | `parties.opening_balance` column (idempotent) |

Run them in order in the Supabase SQL Editor. Migrations run once; re-running
errors are safe to ignore (002 reports "already a member of publication").

---

## Error handling

- All auth calls return `{ data, error }`; the app surfaces localized messages.
- Network failures during push/pull are retried with exponential backoff (the
  operations stay queued, so nothing is lost offline).
- Version blocking: if `app_meta.min_version > app_version`, sync status becomes
  `version_blocked` and Settings shows "Update required".
- Offline (no `.env` keys or no network): the app works entirely against local
  SQLite with no cloud calls, identical to pre-sync behavior.
