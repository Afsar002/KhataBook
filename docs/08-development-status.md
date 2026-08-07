# Development Status

## Completed (v1)

- ✓ Authentication (local, device-only)
- ✓ Dashboard (total balance, cash & bank balances, today's income & expense)
- ✓ Bottom Navigation (Home / History / Khata / Reports / Settings)
- ✓ Local Database (SQLite: accounts, categories, transactions, settings)
- ✓ Theme (light/dark + system preference, Inter, design tokens)
- ✓ Expense Screen (large amount input, account, category, note)
- ✓ Income Screen
- ✓ History (grouped by date, All/Income/Expense filter, delete on long-press)
- ✓ History Search (by note, category, account, amount)
- ✓ Reports (monthly income / expense / profit, category breakdown)
- ✓ Khata / Credit Ledger (customers & suppliers, give/receive/take/pay, ledger history)
- ✓ Backup / Restore (JSON backup file, share sheet, restore with confirmation)
- ✓ Export CSV (Excel) for transactions and khata ledgers
- ✓ Export monthly report as PDF

## Completed (v1.7)

- ✓ Multiple accounts (cash / bank / wallet) with opening balances and an Accounts screen
- ✓ Transfers between accounts, combined ledger in History
- ✓ Dashboard rework (total balance, cash & bank totals, FAB)
- ✓ Khata summary cards (receivable / payable / net) + plain-language balances
- ✓ Reports numbers-first (income / expense / profit, money given / received, cash / bank)
- ✓ Settings simplified (advanced / CSV exports collapsed)

## Completed (v1.8) — Cloud Sync & Authentication

- ✓ Phone OTP sign-in via Supabase (two-step screen, session persists across restarts, sign out)
- ✓ Automatic cloud sync: local SQLite is still the source of truth; every write enqueues an
    operation (coalesced, offline-safe) and uploads in the background
- ✓ Pull-based sync with last-write-wins on `updated_at` (ISO ms), pull cursors, no duplicates
- ✓ Automatic restore on a new device after sign-in (initial full pull)
- ✓ Reusable sync engine (`src/services/sync/sync-engine.ts`) independent of the UI
- ✓ RLS on every cloud table (`supabase/migrations/001_initial.sql`) — users only access own data
- ✓ Settings Cloud Sync section (Connected Account / Last Sync / Sync Status / Sync Now /
    Auto Sync / Sign Out); manual backup/restore under Advanced
- ✓ Graceful offline mode: no Supabase keys → no auth gate, existing behaviour unchanged

## Completed (v1.9) — Live Multi-Device Sync

- ✓ Supabase Realtime: a single channel with Postgres Changes filters on every
    synced table emits a "remote change" event that triggers the existing
    debounced pull — edits on one device appear on others within ~2s
- ✓ LWW still decides conflicts; echoes of this device's own pushes are skipped
    by the "local row is newer" check (no extra merge logic)
- ✓ Lifecycle tied to auth: channel starts on sign-in, removed on sign-out;
    no-ops when sync isn't configured
- ✓ Enabled by `supabase/migrations/002_realtime.sql`; without it the app falls
    back to trigger-based sync

## Completed (v1.10) — Google Sign-In

- ✓ Google OAuth as a second sign-in method: `expo-auth-session` prompts the
    system browser, the ID token is exchanged via
    `AuthService.signInWithGoogle` → `supabase.auth.signInWithIdToken`
- ✓ Same session, persistence, auth gate and cloud sync as phone OTP
- ✓ Button hidden until a Google web client ID is configured; offline mode untouched
- ✓ Setup documented in docs/13-supabase-setup.md (Google Cloud OAuth clients +
    Supabase provider config + Expo Go caveat)

## Completed (v1.12) — Min Version Enforcement & Data-Migration Prompts

- ✓ Cloud `app_meta` table (`supabase/migrations/003_app_meta.sql`) stores
    `min_version`, optional `notice`, and `migrate_from` / `migrate_notice` for
    data-migration guidance
- ✓ Boot-time check in `initSyncState()` reads `app_meta` before any sync runs;
    if `app_version < min_version` the sync status becomes `version_blocked`
- ✓ Settings Cloud Sync card shows "Update required" when blocked
- ✓ `restoreBackup()` checks `file.version` against `app_meta.migrate_from` and
    returns `migrationNotice` to the caller; Settings shows it in the restore
    confirmation alert

## Removed

- Local Unlock Protection (v1.11) was never wired in — removed in the
  2026-08-06 maintenance pass (see docs/CHANGELOG.md).

## Pending

- Email + password fallback
- Profile / shop name + avatar
- Per-device device name ("Last Sync from")
