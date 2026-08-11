Attachments — images & PDFs on entries (2026-08-11)

Income/expense and khata (give/receive/take/pay) entries can now carry up to
**5 attachments**: photos (compressed on pick) or PDFs. Files live in the
app's document directory; only the small metadata JSON is stored in the DB and
synced, so another device shows the chip but opens it with a friendly
"not available" toast — never a crash.

- **Schema v12** — new `attachments TEXT NOT NULL DEFAULT '[]'` column on
  `transactions` and `party_transactions`. Guarded `ALTER TABLE` migration for
  legacy DBs (`PRAGMA table_info` check, mirrors v11); fresh DBs get it in
  `SCHEMA_TABLES`. Sync carries the metadata as a plain text column
  (`src/db/sync/tables.ts`), so push/pull need no other change.
- **Image compression** — `expo-image-picker` + `expo-image-manipulator`:
  every picked image is re-encoded to JPEG (quality 0.7) and the long edge is
  capped at 1600 px, so large PNG screenshots shrink too. Images above 15 MB
  and PDFs above 25 MB are rejected with a friendly toast.
- **Crash-safe by construction** — picker results validated (canceled / empty /
  missing uri), copies verified (`exists && size > 0`), stored JSON always
  parsed through `safeParseAttachments` (never throws), ids path-traversal
  guarded before building filenames, missing files degrade to a toast. Every
  flow toasts instead of crashing.
- **UI** — attachments live inside the Note field (shared `NoteField` in both
  entry forms): a small paperclip icon at the right edge of the note input
  offers Add Photo / Add PDF; chips (image thumbnail or PDF icon + name) with an
  ✕ remove appear beneath the input; full-screen in-app image viewer (PDFs open
  via the share sheet / system viewer). Ledger rows (Cashbook, Home Recent,
  History, khata) show a small paperclip indicator when an entry has
  attachments.
- **PDFs unaffected (verified)** — the report/statement PDF builders never read
  the attachments column; the ledger SELECT changes are additive. `pdf-layout`,
  `statement`, `party-statement-pdf`, `statement-pdf` suites all pass (37
  tests). Full suite: 41 suites, 390 tests green; `tsc` 0 errors, eslint 0
  problems.
- New tests: `attachments.test.ts` (23) — safe parsing, path-traversal
  rejection, size caps, compressed image + PDF flows, missing-file
  degradation, best-effort cleanup.

Cashbook + Deposit & Withdraw Report (2026-08-11)

The History tab is rebuilt as a Khatabook-style daily cashbook. The tab (now
named **Cashbook**) opens on today's ledger; other days are browsed through a
pushed report screen, and tapping a day in the report opens that day's detail.

- **Cashbook (History tab, renamed)** — today's `transactions` (transfers are
  net-zero and excluded): summary card "Cash in Hand" / "Today's Balance" (both
  green, 50/50 with a faint vertical divider) plus a full-width
  "VIEW DEPOSIT & WITHDRAW REPORT >" row; a day header with the date, entry
  count and Withdraw/Deposit totals; distinct rounded 3-column cards (Time +
  grey category pill | Withdraw red | Deposit green, vertical dividers); sticky
  −Withdraw / +Deposit buttons pre-filled with today's date.
- **Deposit & Withdraw Report (pushed, `history-report`)** — date range card,
  duration dropdown (This Month default / This Week / This Year / All Time),
  day cards (day balance + cash in hand) that drill into that day, and a sticky
  blue Download (reuses `buildTransactionsPdf`). No search bar (removed on user
  request after the initial build).
- **Day detail (pushed, `history-day/[date]`)** — same layout as the Cashbook
  minus the report row, "Day Balance" label, back arrow, buttons pre-filled
  with that date. Date pre-fill flows into the shared `TransactionForm` via a
  new `defaultDate` prop.
- **Data**: `listDaySummaries()` in `transaction-repo.ts` — per-day
  income/expense/entryCount via a SQL window function whose running
  `cashInHand` (cumulative income − expense over ALL days, opening-balance
  entries count as income) carries a pre-range balance into any bounded query.
  Verified equal to the sum of all account balances (transfers net to zero).
- **Cash in Hand = total balance even on entry-less days**: `listDaySummaries`
  only emits rows for days in the ledger, so a day with no transactions (e.g.
  today before any entry) previously showed ₹0. New `getRunningBalance(date)`
  lets the Cashbook and day-detail screens synthesize the row and keep showing
  the true running balance.
- **Components**: `DayEntryCard`, `DayLedgerView` (shared body of Cashbook +
  day detail), `DurationPicker` (bottom-sheet, mirrors the export sheets).
- **Layout fix**: non-scroll `Screen` now fills the window (`flex:1`) so sticky
  bottom actions pin above the tab bar instead of collapsing under the list;
  the new surface cards carry a soft shadow so they read against the
  background.
  Green/red/blue are `theme.income` / `theme.expense` / `theme.info` — no
  hardcoded hex, dark mode stays correct.
- New tests: `day-ledger.test.ts` (real SQLite via `node:sqlite` — per-day math,
  running balance carry-in, bounds) + `format.test.ts`. The existing
  cash-reconciliation screen (`src/app/cashbook.tsx`) is untouched.
- `tsc` 0 errors · eslint 0 problems · 358 tests green.

Cashbook UI polish — Older Entries rename, column alignment (2026-08-11)

- **Report screen renamed "Older Entries"** (was "Deposit & Withdraw Report") so
  the top-bar title no longer truncates.
- **Global column header** on the report: a small uppercase grey row
  (DATE / Daily Balance / Cash in Hand) between the duration picker and the day
  list, laid out to mirror the day cards (same padding, gap, min-width and
  chevron width) so the columns line up.
- **Day cards cleaned up** — the grey "Day Balance" / "Cash in Hand" captions are
  removed; each card now shows only the date (left), the day-balance amount
  (center, green/red), and the cash-in-hand amount + chevron (right).
- **Running total guarantee**: new `runningCashInHand()` re-derives each day's
  `cashInHand` bottom-up as *previous cash in hand + current day balance*,
  seeded from the SQL's pre-range carry-in. Applied on the report screen so an
  off-by-one (current day missing from its own total) can never render.
- **Day-detail header alignment**: the Withdraw/Deposit totals row mirrors the
  entry cards' columns so the totals sit above their transaction columns.
- **Cashbook card overflow fix**: the 3-column entry cards now use **2:1:1 flex**
  (Time/Tag | Withdraw | Deposit) with Withdraw centered and Deposit strictly
  right-aligned; horizontal padding moved onto the card row (`Spacing.three`) so
  a right-aligned amount never touches the card edge; amounts get
  `numberOfLines={1}` + `adjustsFontSizeToFit` so large figures shrink instead
  of clipping. The header row uses the same 2:1:1 ratios + padding + alignment
  so columns stay in line.
- **Home + Khata carry-over**: the Home page's "Recent" ledger now matches the
  Cashbook's ledger style — it renders the same `DayEntryCard` 3-column cards
  (Time + category pill | Withdraw | Deposit, 2:1:1 flex, dividers, rounded,
  soft shadow) with a small Time / Withdraw / Deposit column header above (no
  totals), transfers filtered out, tapping a row opens its edit form.
  Khata amounts (`PartyItem`, `PartyTransactionItem`) got the same overflow
  guards as the Cashbook (right-aligned + `numberOfLines` + `adjustsFontSizeToFit`
  + `flexShrink`) so large figures never bleed past the card edge.
- **Newest-first everywhere**: `listLedgerRange` (Cashbook, day detail, the
  report/export lists) now returns rows **newest first** — the previous
  `reverse()` put today's newest entry at the bottom. All on-screen ledgers
  (Cashbook, day detail, Home Recent, khata ledger) now show the newest entry
  at the top. Statement reports keep oldest-first on purpose (running balance
  builds forward from the opening balance).
- 367 tests green · `tsc` 0 errors · eslint 0 problems.

Transactions print/export with quick ranges (2026-08-08)

New **Transactions** report type on both the History page and the Reports & Export
screen. Generate a shareable A4 PDF (or Excel) for any date range with five
quick presets — **Today / Yesterday / This Week / This Month / This Year** — plus
a custom From/To picker.

- **History page**: FileDown icon in the header opens a bottom sheet mirroring
  the Export Options look (handle, spring-in animation). Preset chips + custom
  fields + Generate PDF button with busy state.
- **Reports & Export**: new "Transactions" chip alongside Party Statement /
  Monthly / Combined. Shared `rangePresets()` from `src/utils/date-range.ts`
  replaces the old presets row.
- **Data**: `listLedgerRange(from, to)` in `transaction-repo.ts` pages through the
  SQL-filtered feed and returns rows chronological (oldest first).
- **PDF**: `buildTransactionsPdf()` reuses the existing `Renderer` — brand header
  with `formatReportRange` subtitle, Summary figures box (Income/Expense/Net
  with conditional color), Date|Type|Note|Category/Account|Amount table (zebra
  rows, signed/colored amounts, totals row, page-break headers). Empty range
  renders "No transactions in this range."
- **Excel**: `transactionsToExcel()` — sheet "Transactions" with Date|Type|Note|
  Category|Account|Amount (signed numbers).
- New `src/utils/date-range.ts` (pure, deterministic, 7 tests) and
  `src/components/transaction-export-sheet.tsx`.
- `tsc` 0 errors · eslint 0 problems · 343 tests green.

Fix: Home search returned no results (2026-08-08)

The search screen's debounce guard used a boolean `cancelled` ref that was set
`true` in the effect cleanup but never reset when a new search started. Any
query longer than one keystroke tripped the cleanup (each keystroke re-runs the
effect), so `cancelled` stayed `true` forever — every response was dropped and
the spinner spun indefinitely.

- `src/hooks/use-global-search.ts` now guards responses with a request
  generation (`++requestId`): the latest query's response is the only one that
  may land, and a new search always starts fresh. This also preserves the
  original intent — a stale in-flight response can't overwrite a newer query.
- New `src/__tests__/use-global-search.test.tsx` (4 tests): blank-query no-op,
  single-keystroke results, mid-debounce query change (the regression), and a
  late stale response being dropped. The mid-debounce test fails on the old
  code.
- `tsc` 0 errors · eslint 0 problems · 334 tests green.

Dates shown on every ledger row (2026-08-08)

Ledger rows only showed the amount — no date — so a long list of give/
receive or income/expense entries was hard to read back.

- `src/components/party-transaction-item.tsx` (customer/supplier ledger) and
  `src/components/transaction-item.tsx` (account ledger, search results,
  Home's Recent list) now print the entry date under the amount as a small
  muted line, formatted "04 Aug 2026" (`formatISOToDisplay`).
- `TransactionItem` gained a `showDate` prop (defaults to `true`). The History
  tab opts out (`showDate={false}`) because it already groups rows under
  "Today" / "Yesterday" / "Mon, 4 Aug" section headers — adding a date per row
  there would just repeat the header.
- `tsc` 0 errors · eslint 0 problems · 330 tests green.

Delete customer/supplier moved into Edit (2026-08-08)

The destructive Delete button used to sit pinned at the bottom of the party
detail screen, always visible — easy to hit by mistake.

- `src/app/party/[id].tsx`: the Delete button is gone (and with it the now
  unused delete/confirm/safe-area imports). The detail page is now purely
  read-only (balance, actions, ledger).
- `src/app/party/edit.tsx`: hosts the "Delete Customer"/"Delete Supplier"
  button (danger style, trash icon), placed below Cancel and disabled until the
  party's type loads. Deleting pops both the edit modal and the now-deleted
  detail screen (`router.dismiss(2)`) so you land back on the Khata tab — a
  plain `back()` would have stopped on the deleted detail screen.
- `tsc` 0 errors · eslint 0 problems · 330 tests green.

Customer/supplier page: scrollable ledger, no overlaps (2026-08-08)

The party detail screen's ledger `FlatList` had no bounded height, so it sized
itself to the full entry list: the page couldn't scroll (only the list can, and
it never engaged), and with many entries the Delete button was pushed past the
bottom edge of the screen.

- `src/app/party/[id].tsx` now gives the ledger card and the `FlatList`
  `flex: 1`, bounding the list to the space left by the fixed header, balance
  card, actions and tools. The ledger scrolls internally (virtualization and
  keyset pagination still apply), and the Delete button stays pinned on-screen.
- `tsc` 0 errors · eslint 0 problems.

Deleting a customer/supplier now refreshes the Khata list (2026-08-08)

The party detail screen fired the delete without waiting for it
(`void deleteParty(partyId); router.back();`). Returning to the Khata tab
re-triggered its focus-refresh before the delete transaction had committed, so
the deleted party could still appear — usually until the next manual refresh.

- `src/app/party/[id].tsx` now awaits `deleteParty(partyId)` and only calls
  `router.back()` once the delete has committed; a failure surfaces a
  "Can't delete" alert instead of silently navigating back. Mirrors the
  account delete flow in `src/app/account/[id].tsx`.
- Verified the Khata tab's `useFocusEffect` refresh is what propagates the
  change — it was already correct, the race was purely the un-awaited delete.
- `tsc` 0 errors · eslint 0 problems · 330 tests green.

Notification deep-linking (2026-08-08)

Tapping a notification no longer just opens the app — it opens the screen the
notification came from.

- **Recurring reminder** → `/recurring` (the templates screen); **sync alert**
  → `/settings` (Cloud Sync / conflict review). The target is stored in the
  notification payload as `content.data.url` at schedule time.
- **`src/services/notifications/deeplink.ts`** — `initNotificationNavigation()`
  subscribes to taps while the app runs and handles a cold start (app launched
  by tapping a notification) via `getLastNotificationResponseAsync()`. The route
  is checked against an explicit allow-list, so a payload can never drive the
  router to an arbitrary URL; the OS default-action tap (no route) is a no-op.
- Safe before the root layout mounts: expo-router's routing queue queues the
  navigation until the navigation container is ready.
- Tests: `deeplink.test.tsx` (allow-list routing, cold-start, error tolerance).
  Full suite: 330 tests across 36 suites.

Restored Khata / Reports toggles (2026-08-08)

The SQL-filters refactor removed the `Segment` toggles from the Khata and
Reports screens but kept their state, leaving both screens stuck in one mode:
the Khata tab could no longer switch to **Suppliers** (they became
unreachable) and Reports only ever showed **Top expenses**.

- Khata: the Customers / Suppliers toggle is back above the party list.
- Reports: the All / Expenses / Income breakdown toggle is back above the
  category breakdown card.
- Also cleaned up the 8 dead-code lint warnings left by recent refactors
  (unused `calculateKhataSummary`, `formatINR`, redundant balance re-export
  imports, `partyBalanceColor`, `PartyType`).
- `tsc` 0 errors · eslint 0 problems · 322 tests green.

Tab pages: no more white gap above the bottom tab bar (2026-08-08)

The bottom tab bar already extends to the bottom safe-area inset, so tab
screens were re-applying that inset on top of it (and, on the shared `Screen`
wrapper, stacking 64px of scroll padding over that) — leaving a blank strip of
page background between the last item and the tab bar.

- `Screen` gains a `hasTabBar` flag: screens rendered inside the tab navigator
  (Home, Reports, Settings) exclude the bottom safe-area edge — the tab bar
  owns it — and drop the scroll bottom padding from 64px to 16px. Pushed and
  modal screens keep the full inset; the wide/sidebar desktop layout is
  untouched.
- Khata: the same double-inset came from its own `SafeAreaView`, which is now
  restricted to top/left/right; the list fills the remaining space with zero
  bottom padding.
- History: kept the corrected no-gap bottom, and restored the top safe-area
  edge so the title clears the status bar on iOS (a plain `View` had dropped
  it).
- Nothing is hidden behind the tab bar: list content still scrolls to end just
  above it on both Android and iOS.

Expo Go boot crash from expo-notifications (2026-08-08)

Importing `expo-notifications` at boot crashed the whole app inside Expo Go on
Android (SDK 53+): the package auto-registers the device push token as an
import side-effect, and that push machinery is hard-disabled in Expo Go — the
import itself throws. That broke route loading, surfacing as a
"Cannot read property 'ErrorBoundary' of undefined" render error.

- **No more static imports of `expo-notifications`.** A new lazy loader
  (`src/services/notifications/expo.ts`) `require`s the module only when not in
  Expo Go (`isRunningInExpoGo()`); every notifications module
  (prefs/reminders/sync/init) calls `getNotifications()` and no-ops on null.
  Expo Go and web boot cleanly with notifications simply unavailable.
- **Notifications now need a development build** (`npx expo run:android` /
  EAS), not Expo Go. The Settings **Notifications** card is hidden in Expo Go
  so the toggles can't promise something that can't run there.
- Tests: the notification suites mock the loader boundary (jest-expo reports
  `isRunningInExpoGo()` as true), so scheduling logic is still fully covered.
  Full suite: 322 tests across 35 suites.

Push notifications — sync + recurring (2026-08-08)

Local notifications for things the app can't show while it isn't on screen.
All local-only (expo-notifications) — no APNs/FCM, no push-token registration.
Requires a development build (see the Expo Go fix above); everything degrades
gracefully: no-op on web, no-op in Expo Go, no-op when permission is denied or
a toggle is off.

- **Recurring due-day reminders** (`src/services/notifications/reminders.ts`):
  one scheduled notification per active template for its next due date at
  08:00 (reuses the scheduler's real `shouldGenerateForDate`, so the reminder
  and the generator agree on what "due" means). Re-armed on boot and whenever
  a template is created/edited/deleted/toggled — never thousands of
  pre-scheduled notifications, no stale schedules after edits.
- **Sync-outcome notifications** (`src/services/notifications/sync.ts`): when a
  sync finishes while the app is backgrounded, alerts for local changes
  overwritten (conflicts), upload failures, or new entries pulled from other
  devices. Skipped in the foreground (the in-app banner + Settings already
  show it); ~5-minute cooldown stops retry backoff from spamming.
- **Device-local prefs** (`src/services/notifications/prefs.ts`, AsyncStorage)
  — Recurring reminders / Sync updates toggles in Settings. Mirror the app
  lock prefs: notifications are a per-device choice, never synced. Permission
  is requested lazily the first time a toggle is switched on; denial keeps the
  toggle off with a toast pointing at phone settings.
- **Wiring**: `emitRecurringChanged` / `emitSyncResult` on the existing events
  bus (`src/services/sync/events.ts`), fired by `recurring-repo` after writes
  and by `sync-engine` after each run; `initNotifications()` at boot
  (`src/app/_layout.tsx`); `NotificationsCard` rendered in Settings
  (`src/app/(tabs)/settings.tsx`); `expo-notifications` plugin in `app.json`.
- **Dependency housekeeping**: aligned 6 pre-existing SDK57 patch drifts
  (expo, expo-background-task, expo-file-system, expo-router, expo-sharing,
  expo-task-manager) and added the missing `react-native-worklets` peer of
  react-native-reanimated — `npx expo-doctor` now passes 20/20.
- Tests: `notifications-prefs`, `reminders`, `sync-notifications`
  (21 tests) — permission/toggle gating, next-due computation for
  daily/weekly/monthly, stale-id cleanup, foreground/cooldown gating. Full
  suite: 308 tests across 34 suites.

Home page: negative balances in red + overdraft confirmation (2026-08-08)

- **Negative balances are now red on Home.** The Total Balance, Cash and Total
  Bank figures were hard-coded to the income green, so an overdrawn account
  read as money in hand. `BalanceCard` now defaults its color by sign
  (negative → expense red, else primary green); Home's Total Balance does the
  same.
- **Overdraft confirmation (expenses/income).** Recording an expense (or an
  income edit reduced far enough) that would push an account balance below zero
  asks first: "This expense of ₹1,500 is more than the Cash balance (₹1,000).
  Balance will become -₹500. Save anyway?" — a danger confirm, so the user can
  still deliberately overdraft.
- **Transfers can never overdraft.** You can't move money you don't have, so a
  transfer that would push the source account below zero is blocked outright:
  the Save button is disabled and the form explains "You can't transfer more
  than the Cash balance (₹1,000)." No confirm — it simply isn't allowed.
- New shared helper `src/utils/account-balance.ts` (`accountProjectedBalance`,
  `accountWouldOverdraft`, `buildOverdraftMessage`) — a single source of truth
  for the projection, including the edit-mode correction (the current balance
  already includes the entry being edited, so it is added back first). Both
  the transaction and transfer forms use it, so the behavior and wording are
  identical everywhere.
- Tests: `src/__tests__/account-balance.test.ts` locks the projection math for
  income/expense/transfers and edit-mode reverts. Full suite: 322 tests across
  35 suites.

History filters pushed into SQL (2026-08-08)

Moved the History screen's in-memory filtering into the SQLite query so it
applies across the **whole feed**, not just the pages already loaded.

- **`buildLedgerFilter`** (`src/db/transaction-repo.ts`) turns the History
  filters into parameterized WHERE clauses over the ledger `feed` subquery:
  text search on note/category/account names (`LIKE … ESCAPE '\'`, same
  semantics as `searchLedgerByLike`), numeric queries also matching amounts
  as text, full-`YYYY-MM-DD` date range, inclusive amount bounds, account
  ids matched against any of `accountId`/`fromAccountId`/`toAccountId`, and
  category ids against `categoryId`.
- **`listLedgerPage(filter?, cursor?)`** splices the filter and keyset cursor
  clauses with `AND`, so filtering and pagination compose.
- **`useLedger(filter?)`** reloads from the newest page whenever the filter
  *value* changes (JSON value-key gate also swallows identity-only churn) and
  drops stale `loadMore` pages when filters change mid-load.
- History screen no longer filters loaded rows in memory; it passes the query
  + filters to `useLedger` and renders the SQL-filtered pages directly. Same
  filter semantics, but matching is no longer limited to what's been scrolled
  into view. Removed the now-unused `LedgerKind` import.
- Tests: `src/__tests__/ledger-filter.test.tsx` locks the SQL shape/param
  order for every dimension; `src/__tests__/use-ledger.test.tsx` covers the
  reload-on-value-change / skip-on-identity-churn behavior.

Customer Statement PDF polish (2026-08-08)

Fixed the Customer Statement PDF export end-to-end without redesigning it or
touching any financial calculation.

- **Three independent export options**: Include Running Balance, Include Notes
  and Include Description now each work alone or in any combination. The table
  columns are built dynamically (`buildColumns`) for all 8 combinations — no
  per-combination layouts, no dead space.
- **Description column**: shows the user's transaction description when present
  ("cash" → Description "cash", never "Receive Money cash"); falls back to the
  transaction type (Give Money / Receive Money / Took on Credit). No "…"
  placeholders.
- **Notes column**: the user's Notes render in their own column and are never
  merged with the Description, even when the text matches. The two columns
  share the middle band, sized proportionally to how much text they hold.
- **Summary box**: the "Summary" heading sits on its own row with glyph-derived
  baseline spacing — no more overlap with "Total Debit (You Gave)". Net Balance
  is independent of the Running Balance toggle.
- **Layout fixes at the root**: running-balance-only export no longer overruns
  the page (amount columns now fill the Date→right-margin band exactly);
  month/grand totals draw after page-break checks (no stale positions); month
  headers are not duplicated when a month starts on a fresh page.
- **Opening Balance** (a legitimate historical ledger record) stays in the
  books but never surfaces as text in the statement or Excel — the opening row
  shows its transaction type and a blank Notes cell.
- Verified positionally across all 8 option combinations (column presence,
  right-aligned ₹-formatted amounts, no clipping/overlap) and on a multi-page
  statement (repeated headers, no duplicate month headers). Totals are
  identical under every display option.

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