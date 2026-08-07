Audit round (2026-08-07) — reliability, security & desktop support

Closed the audit's open items. Highlights:

**Search & performance**
- **Global search is now SQLite FTS5**: a full-text index (`ledger_fts`) over
  transaction/transfer notes, account & category names, amounts, party name/phone
  and account names. Trigram tokenizer gives substring matching with relevance
  ranking (`ORDER BY rank`); maintained by triggers so local and cloud-sync
  writes stay indexed. Falls back to the LIKE scan on SQLite builds without FTS5,
  so search can never break a database that can't host the index.
- **Party ledger pagination**: the khata detail screen now loads 50 rows at a
  time with keyset (cursor) pagination, matching the account/history feeds
  instead of pulling every entry at once.
- **List virtualization**: `initialNumToRender` / `maxToRenderPerBatch` /
  `windowSize` tuned on the long History/Khata lists.
- **PDF export crash fixed**: WinAnsi character crashes (U+202F / U+00A0 in notes)
  normalized before text drawing.

**Web / tablet**
- **Responsive layout**: windows ≥900px wide swap the bottom tab bar for a fixed
  left navigation rail (icon + label, active highlight, hover states); the
  content column widens to 960px once the sidebar is present. Phones keep the
  existing bottom tabs untouched.

**Security**
- **Local audit log**: sensitive mutations (account/party create/rename/delete,
  backup/restore/wipe) write an append-only row to `audit_log` — device-local,
  never synced. See docs/16-security.md.
- **Key rotation + secret scanning docs** and a CI secret scan step so Supabase
  keys can be rotated safely (docs/13-supabase-setup.md).

**Sync**
- **Conflict review UI**: pending sync conflicts are listed with per-item review
  in Settings instead of just a count.
- **Sync scheduling settings**: Wi-Fi-only sync and periodic auto-sync intervals
  (Settings → Cloud Sync).
- **Live vs trigger mode indicator**: the sync status banner now says whether
  realtime ("live") or trigger-based ("trigger") sync is active, and the offline
  banner appears when disconnected.

**Quality / UX**
- **CI workflow**: GitHub Actions runs lint, typecheck and the Jest suite on every
  push (`.github/workflows/ci.yml`); e2e harness scaffolded.
- **Recurring transactions verified end-to-end**: create / edit / toggle / delete
  covered, with the missing create/edit screens wired in.
- **Backdating**: entry forms got a date picker so income/expense/khata/transfer
  entries can be recorded for a past date.
- **Keyboard avoidance**: shared `Screen` wrapper keeps forms clear of the
  Android keyboard.
- **Extracted `ScreenHeader`**: one header component with standardized back
  buttons across detail screens.
- **EmptyState semantic icons**: each empty state maps to a meaningful icon
  instead of a generic one.

Maintenance (2026-08-06) — dead-code removal

Removed features that were never finished or were already rolled back:

- **Attachments** (receipt photos / voice notes): the half-built picker UI,
  `attachment-service`, `attachment-repo`, the local `attachments` table, and
  all temp-UUID re-pointing code are gone. The add-transaction and party-entry
  forms no longer show an attachment section.
- **Unlock Protection** (device lock): the LockGate overlay was never wired into
  the app, so the Settings toggle did nothing. Removed `lock-gate.tsx`,
  `lock/prefs.ts` and the Settings "Unlock Protection" / auto-lock UI. The
  factory-reset "Clear All Data" wipe stays.
- **Multi-profile stubs**: `profiles-context.tsx` and `services/profiles/`
  registry (leftovers from the removed multi-profile system).
- Unused files: `themed-view.tsx`, `use-color-scheme.{ts,web.ts}`,
  `use-transactions.ts`, plus the now-orphaned lock tests.
- Unused dependencies: `adb`, `expo-av`, `expo-image-picker`,
  `expo-local-authentication`, `expo-media-library`, `uuid`, `server-only`.

Also removed the dangling `queue-cleanup` import (Settings now calls
`retryAll` from `queue-repo` directly) and renumbered the schema migration that
created the `attachments` table.

v1.12 (2026-08-04)

Minimum version enforcement: the app checks a cloud `app_meta` table on boot.
If the installed version is below `min_version`, cloud sync is blocked and the
Settings screen shows "Update required". Configure via Supabase dashboard
(see `supabase/migrations/003_app_meta.sql`).

Data-migration prompts on restore: restoring a v1 backup (pre-v1.7) shows a
notice from `app_meta.migrate_notice` when `migrate_from` includes the old
version — e.g. to tell users about schema changes that need manual attention
or automatic migration steps.

Business multi-profile: run multiple independent shops in one app. Each profile
gets its own SQLite database (dailykhata-<id>.db) and its own cloud session,
so switching profiles swaps the entire ledger and the Supabase account.
Create, rename, switch or delete profiles from Settings → Business Profiles.
The default "My Shop" profile keeps the original dailykhata.db filename so
existing installs upgrade in place. Profile list and active id are stored
device-locally (AsyncStorage); the app remounts the whole provider tree on
switch so no stale data leaks across profiles.

v1.11 (2026-08-04)

Optional device-level lock: turn on "Unlock Protection" in Settings and the app
asks for your fingerprint, face or device PIN before it opens — and again
whenever you come back to it from another app. Purely local (AsyncStorage),
never synced, so a new phone can never lock itself out.

Built on expo-local-authentication. Fingerprint works in Expo Go on Android;
Face ID on iOS needs a development build. Turning the toggle on first runs a
test prompt so the app can't be locked behind a phone with no biometrics or PIN.

v1.10 (2026-08-04)

Google Sign-In alongside phone OTP: "Continue with Google" on the sign-in screen
(expo-auth-session → Supabase signInWithIdToken). Same session, same cloud sync.

Provider-agnostic AuthService gained a signInWithGoogle(idToken) method; the
Google button only appears when a Google web client ID is configured in `.env`.

Needs Google Cloud OAuth client IDs + enabling the Google provider in the
Supabase dashboard (docs/13-supabase-setup.md → "Google Sign-In").

v1.9 (2026-08-04)

Live multi-device sync: edits made on one device appear on your other devices
within a couple of seconds (Supabase Realtime; Postgres Changes wake the device
up for a pull). Works alongside the existing offline-first sync — LWW still
decides conflicts and echoes of your own pushes are skipped.

Realtime is enabled by running supabase/migrations/002_realtime.sql; without it
the app falls back to the trigger-based sync from v1.8.

v1.8 (2026-08-04)

Phone OTP sign-in (Supabase): stays logged in across restarts, sign out from Settings

Automatic cloud sync — every local edit queues and uploads in the background, and
remote changes pull down (last-write-wins on updated_at, no duplicates)

Automatic restore on a new device: sign in with the same number and your entries download

Offline-first: SQLite stays the primary store; the app works fully without Supabase keys;
sync retries with backoff and resumes where it left off

Cloud Sync section in Settings (Connected Account / Last Sync / Sync Status / Sync Now /
Auto Sync / Sign out); manual backup & restore moved under Advanced

Row Level Security on every cloud table so users only ever access their own data

Supabase setup docs (docs/13-supabase-setup.md) + initial migration (supabase/migrations/001_initial.sql)

v1.7 (2026-08-04)

Unlimited accounts: cash, banks & wallets with opening balances (Accounts screen)

Transfers between accounts (Cash → Bank), shown in History and account details

Dashboard: total balance, cash & bank totals, bigger headline numbers

Floating "+" button on Home: Add Income / Add Expense / Give Money / Receive Money / Transfer

Khata: Total Receivable / Total Payable / Net Balance summary cards

Plain-language balances ("You'll receive ₹X" / "You'll pay ₹X")

Reports: money given / received and cash / bank balances shown up top

Settings simplified: dark mode + backup / restore on top, CSV exports under Advanced

Larger typography and bigger touch targets throughout

Rebranded to DailyKhata (app name, splash, exports, PDFs, backup filenames; existing data and old backups still migrate/restore)

Settings: Cloud Sync placeholder (Connected Account / Last Sync / Sync Status — no backend yet); backup/restore moved under Advanced

v1.0

Dashboard created

Transactions working

Dark mode

v1.1

Expense page

Bank balance

Search

v1.2

Reports

v1.3 (2026-08-04)

Initial codebase (Expo SDK 57, TypeScript)

Dashboard: total / cash / bank balances, today's income & expense

Add Income / Add Expense screens (amount, account, category, note)

History: grouped by date, All / Income / Expense filter, delete on long-press

Settings: dark mode toggle

Local SQLite database (accounts, categories, transactions, settings)

v1.4 (2026-08-04)

Reports tab: month navigator, income / expense / profit summary

Category breakdown with progress bars (Expenses / Income toggle)

History search (by note, category, account, or amount)

v1.5 (2026-08-04)

Khata tab: customers & suppliers lists with balances

Add / delete customers and suppliers (name + optional phone)

Party ledger: give / receive money (customers), take on credit / pay (suppliers)

Ledger history with per-entry delete

v1.6 (2026-08-04)

Backup: save all entries to a JSON backup file (share sheet)

Restore: load entries from a backup file (with confirmation)

Export Transactions (Excel): income & expense as a CSV file

Export Khata (Excel): customer & supplier ledgers as a CSV file

Export monthly report (PDF): income / expense / profit + category breakdown

Data actions live in Settings ("Save my data") and on the Reports screen