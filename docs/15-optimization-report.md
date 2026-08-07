# DailyKhata — Production Optimization Report

Executed against `docs/14-optimization-plan.md`. Final verification:
`tsc --noEmit` 0 errors · `expo lint` 0 problems · Jest 20 suites / 149 tests passing.

## Files modified

| File | Change |
|------|--------|
| `src/app/_layout.tsx` | Import production log gate as the first statement |
| `src/app/(tabs)/history.tsx` | Stable `openEntry` handler; simpler `renderItem` (removed per-row conditional) |
| `src/app/(tabs)/khata.tsx` | Stable `openParty` handler; `PartyBalance` type |
| `src/app/account/[id].tsx` | Moved `useCallback`s above the early-return guard (was a rules-of-hooks violation); stable `handleRemoveRow`; `LedgerRow` type |
| `src/app/party/[id].tsx` | Stable `openEntry` handler; `PartyTransaction` type |
| `src/app/recurring/new.tsx` | Thin wrapper over the shared form (was 430 lines of form) |
| `src/app/recurring/edit.tsx` | Thin wrapper + template load (was 521 lines of form) |
| `src/app/search.tsx` | Stable `openParty` handler; `useCallback` + `PartyBalance` type |
| `src/components/transaction-item.tsx` | `React.memo` + item-parameter callbacks |
| `src/components/party-item.tsx` | `React.memo` + item-parameter callbacks |
| `src/components/party-transaction-item.tsx` | `React.memo` + item-parameter callbacks |
| `src/db/database.ts` | New index `idx_transactions_account_date` (account feeds/balances/cash-book/delete-guards) |
| `src/db/transaction-repo.ts` | `getMonthSummary` / `getCategoryBreakdown` now use index-friendly date ranges |
| `src/db/party-repo.ts` | `getMonthPartyTotals` now uses index-friendly date ranges |
| `src/utils/format.ts` | New `monthBounds()` half-open range helper |
| `src/utils/excel.ts` | Removed 4 dead exports (see deleted) |
| `src/utils/statement.ts` | Removed dead `loadStatementReport`; de-exported internal types |
| `src/utils/pdf.ts` | De-exported internal input types |
| `src/utils/share.ts` | De-exported `ShareFileOptions` |
| `src/utils/haptics.ts` | De-exported internal types |

## Files created

| File | Purpose |
|------|---------|
| `docs/14-optimization-plan.md` | Plan deliverable (required before changes) |
| `docs/15-optimization-report.md` | This report |
| `src/components/recurring-form.tsx` | Extracted single source of truth for the recurring template form |
| `src/utils/log.ts` | Production console gate (silences `log`/`warn` in prod, keeps `error`) |

## Files deleted

None — every source file is used. Dead code was removed **inside** files:

- `src/utils/excel.ts`: `transactionsToExcel`, `khataToExcel`, `KhataExcelRow`, `combinedToExcel` (zero callers)
- `src/utils/statement.ts`: `loadStatementReport` (zero callers, hid a dynamic `import()`)

## Components / logic extracted

- **`RecurringForm`** — ~85% of the New/Edit template screens was duplicated (state, validation, dependent-field resets, schedule pickers, date range). Now one component; the two screens are thin wrappers.

## Performance improvements

- **DB index** `idx_transactions_account_date(account_id, date)` — accelerates account-ledger pagination, account balance aggregates, cash-book summaries and delete-guards that previously relied on a bare date index.
- **Index-friendly month queries** — `substr(date,1,7) = ?` (a full scan) replaced with `date >= ? AND date < ?` in three hot queries.
- **Memoized list rows** — `TransactionItem`, `PartyItem`, `PartyTransactionItem` wrapped in `React.memo` with referentially-stable handlers in history, khata, party detail, search and account detail, so visible rows skip re-renders when unrelated state changes (filter toggles, load-more, focus refresh).
- **Removed runtime `import()`** in the PDF builder (also fixed the Jest/CJS failures).
- **Verified already-optimal** (no change needed): global search is SQLite-backed; ledger feeds use keyset pagination (50/page); context providers are memoized; `reactCompiler` experiment is already enabled.

## Startup / bundle

- No new runtime dependencies. Startup path unchanged; the log gate is trivial.
- Dead exports removed so they can never re-enter the bundle.
- Source: 148 files / 21,489 lines.

## Database improvements

- One new composite index (idempotent via `SCHEMA_INDEXES`, applies to existing installs without a migration bump).
- Month-range predicates hit the date indexes.
- Balances remain derived from a single source of truth (the ledger) — no duplicated state.

## Bugs fixed

- **2 latent rules-of-hooks violations** surfaced by the memoization pass: `useCallback` calls sat after early-return guards in `account/[id].tsx` and would have been called conditionally. Moved above the guard.
- (Audit phase, already shipped): 2 TS `never`-narrowing errors in the sync banner; 11 stale tests realigned to the v8 ledger model; 13 lint errors; removed hidden dynamic `import()`.

## Code reduction statistics

| Area | Before | After | Delta |
|------|--------|-------|-------|
| `recurring/new.tsx` + `recurring/edit.tsx` | 951 | 132 | **−819** (form lives once in `recurring-form.tsx`, +529) |
| Recurring form overall | 951 | 661 | **−290** |
| `utils/excel.ts` | ~286 | 209 | **−77** dead exports |
| `utils/statement.ts` | 193 | 178 | **−15** dead function |
| All `src` | 21,766 | 21,489 | **−277** net |

## Remaining technical debt

- `react-native-svg`, `expo-web-browser`, `expo-linking` have no direct imports but are required peers of `lucide-react-native` / `expo-auth-session` / `expo-router` — **do not remove**.
- `.npmrc` `legacy-peer-deps=true` is a pragmatic override; re-validate on SDK upgrades.
- `console.log`/`console.warn` remain in source for dev diagnostics; production builds silence them via the log gate.
- No on-device/emulator smoke test was run in this environment; the unit suite (149 tests) is green, but a manual pass over add-edit-delete flows and PDF/Excel export is recommended before release.
