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

## Completed (Audit round 2026-08-07)

- ✓ Backdating: date picker in every entry form (income/expense/khata/transfer)
- ✓ Keyboard avoidance on shared `Screen` wrapper (Android)
- ✓ Offline / sync-status banner component at the root layout
- ✓ Realtime fallback UX — banner distinguishes "live" (Realtime) vs "trigger" mode
- ✓ EmptyState semantic icon mapping (`EmptyStateType`)
- ✓ Shared `ScreenHeader` component; standardized back buttons
- ✓ Conflict review UI — per-item review in Settings, not just a count
- ✓ Recurring transactions verified end-to-end (create/edit screens wired up)
- ✓ Performance: party ledger keyset pagination + list virtualization props
- ✓ Search: SQLite FTS5 full-text index with LIKE fallback (see CHANGELOG)
- ✓ Web/tablet responsive layout — left sidebar ≥900px, wider content column
- ✓ CI workflow (lint + typecheck + Jest) + e2e harness scaffold
- ✓ Security: local append-only `audit_log` + key-rotation & secret-scan docs
- ✓ Selective sync: Wi-Fi-only + periodic auto-sync scheduling settings
- ✓ PDF export WinAnsi crash fix

## Completed (Push notifications 2026-08-08)

- ✓ Recurring due-day reminders: one scheduled local notification per active
    template for its next due date at 08:00, re-armed on boot and on any
    template create/edit/delete/toggle (`src/services/notifications/reminders.ts`)
- ✓ Sync-outcome notifications (conflicts / upload failures / new entries from
    other devices) when a backgrounded sync finishes; foreground runs skipped,
    ~5-min cooldown (`src/services/notifications/sync.ts`)
- ✓ Device-local AsyncStorage toggles in Settings (Recurring reminders / Sync
    updates) with lazy permission + denial toast (`NotificationsCard`)
- ✓ Local-only (expo-notifications) — requires a development build; no-op on
    web and in Expo Go (importing expo-notifications crashes Expo Go Android,
    so the module is lazy-loaded via `getNotifications()` and never touched there)
- ✓ `emitRecurringChanged` / `emitSyncResult` events wired through
    recurring-repo + sync-engine
- ✓ `npx expo-doctor` 20/20 (aligned 6 pre-existing SDK57 patch drifts +
    added react-native-worklets peer)
- ✓ 21 new tests (prefs / reminders / sync-notifications); full suite 308 green

## Completed (History filters → SQL 2026-08-08)

- ✓ History search + advanced filters (date/amount/account/category) now run as
    SQL WHERE clauses over the ledger feed (`buildLedgerFilter`), applied across
    the whole table instead of only the loaded pages; pagination composes with
    filtering and resets when filters change (`useLedger` value-key reload)

## Completed (Customer Statement PDF polish 2026-08-08)

- ✓ Include Running Balance / Include Notes / Include Description work
    independently — table columns built dynamically for all 8 combinations
- ✓ Description column = transaction description (never concatenated with the
    type; falls back to Give/Receive/Took on Credit); no "…" placeholders
- ✓ Notes render in their own column, never merged with the Description
- ✓ Summary heading on its own row (no overlap); Net Balance independent of the
    Running Balance toggle
- ✓ Root-cause layout fixes: no-table run off-page no longer happens, totals
    draw after page-break checks, month headers not duplicated across pages
- ✓ Opening Balance stays in the ledger but never prints in statement/Excel
- ✓ Verified all 8 combinations + multi-page output positionally (see CHANGELOG)

## Completed (Home balances + overdraft safety 2026-08-08)

- ✓ Negative balances render red on Home — Total Balance, Cash and Total Bank
    sign-color themselves (`BalanceCard` defaults to expense red when the amount
    is negative) instead of always showing the income green
- ✓ Overdraft confirmation — an income/expense that would push an account below
    zero asks first ("Save anyway?"). Projection logic lives once in
    `src/utils/account-balance.ts`, shared by the transaction and transfer forms
- ✓ Transfers can never overdraft — moving more than the source account holds is
    blocked outright (Save disabled), not just confirmed

## Completed (Layout: no white gap above the tab bar 2026-08-08)

- ✓ Tab screens no longer re-apply the bottom safe-area inset (the tab bar owns
    it) — the blank strip between the last list item and the tab bar is gone.
    Home/Reports/Settings use `Screen`'s new `hasTabBar` flag; Khata and History
    use top-only safe edges with zero bottom padding
- ✓ Nothing hides behind the tab bar on Android or iOS; the wide/sidebar desktop
    layout is unchanged

## Completed (Email + password fallback)

- ✓ A third sign-in path alongside phone OTP and Google: the auth screen's
    Phone / Email switch collects an email + password; signing in, creating an
    account (with confirmation-email handling) and password reset all work via
    the existing provider-agnostic AuthService
- ✓ Supabase Email provider setup documented in docs/13-supabase-setup.md

## Completed (Notification deep-linking 2026-08-08)

- ✓ Tapping a notification opens the screen it belongs to: a recurring reminder
    goes to `/recurring`, a sync alert to `/settings` (Cloud Sync / conflict
    review) — no more generic app open
- ✓ Target is carried in the payload as `content.data.url` and checked against
    an explicit allow-list (`src/services/notifications/deeplink.ts`), so a
    payload can never drive the router elsewhere; cold-start taps handled via
    `getLastNotificationResponseAsync`

## Completed (Cashbook + Deposit & Withdraw Report 2026-08-11)

- ✓ History tab renamed **Cashbook** and rebuilt as today's ledger — summary
    card (Cash in Hand / Today's Balance), day header with Withdraw/Deposit
    totals, 3-column Time | Withdraw | Deposit cards, sticky −Withdraw/+Deposit
- ✓ "VIEW DEPOSIT & WITHDRAW REPORT >" pushes the report — date range card,
    duration dropdown (This Month default), day cards that drill into a day,
    sticky blue Download (reuses the PDF export); no search bar (user request)
- ✓ Day detail screen (`history-day/[date]`) shares the Cashbook body via
    `DayLedgerView`; entry forms pre-fill the day's date (`defaultDate` prop)
- ✓ `listDaySummaries()` — per-day income/expense/entryCount with a SQL running
    `cashInHand` that carries a pre-range balance into bounded queries
- ✓ 15 new tests (real-SQLite day aggregation + date-label helpers); full
    suite 358 green

## Completed (Camera capture + Cashbook PDF columns 2026-08-12)

- ✓ Attachments now offer **Take Photo** — `launchCameraAsync` runs through the
    same compress/store pipeline as gallery picks (15 MB cap, 1600 px long-edge
    resize, JPEG @ 0.7, verified copy), permission requested up front and
    denial toasts; `cameraPermission` added to the image-picker plugin
- ✓ Transactions report (Cashbook PDF): Notes + Category merged into one column
    (category double-spaced below the note), signed Amount column replaced with
    **Deposit / Withdraw / Balance** — running balance = income − expense,
    transfers unchanged, totals row shows total deposit / total withdraw / net
- ✓ PDF regression verified (pdf-layout / statement / party-statement suites);
    full suite 403 green, tsc 0 errors, eslint 0 problems

## Completed (PDF row overlap fix 2026-08-12)

- ✓ Transactions-report rows were overlapping when a Notes/Category cell wrapped
    to two lines: the zebra stripes were anchored at the row's top baseline and
    pdf-lib paints rectangles upward, so a tall stripe reached into the row above
    while missing its own deep text. Stripes are now text-anchored (deepest
    descender → top ascender); single-line totals/grand-total stripes shrank
    accordingly. The row-height cursor advance was already correct
- ✓ Verified: `pdf-layout` / `statement` / `party-statement-pdf` suites pass;
    full suite 42 suites / 403 tests green

## Completed (Cashbook is the launch screen 2026-08-12)

- ✓ App opens on the Cashbook (today's ledger) instead of Home: the Cashbook
    tab is now the `index` route that `/` resolves to. `initialRouteName` alone
    couldn't do this — expo-router overrides it with the URL on cold start —
    so Home moved to `/home` beside it (same tab order)
- ✓ Post-login / post-onboarding redirects (`router.replace('/')`) now land on
    the Cashbook too; no references to the old `/history` tab route remain

## Completed (OTA update-downloaded notification 2026-08-12)

- ✓ When an over-the-air update finishes downloading, the user is told — in-app
    success toast while foregrounded (like the PDF-export feedback) or a local
    notification when backgrounded (like sync-outcome alerts)
- ✓ `UpdateWatcher` (`src/services/notifications/update.tsx`) rides expo-updates'
    `useUpdates()` hook and fires once per fresh download (`isUpdatePending`
    false→true); an update already pending at mount is never re-announced
- ✓ 8 new tests; full suite 43 suites / 411 tests green

## Removed

- Local Unlock Protection (v1.11) was never wired in — removed in the
  2026-08-06 maintenance pass (see docs/CHANGELOG.md).

## Pending

- None — the roadmap lives in docs/09-future-features.md.
