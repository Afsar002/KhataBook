# DailyKhata — Production Optimization Plan

Scope: make the app production-ready (faster, cleaner, more maintainable, scalable)
without changing its UX. All changes are internal: same screens, same features, same
data model.

Baseline (verified green before execution): `tsc --noEmit` 0 errors · `expo lint` 0
problems · Jest 20 suites / 149 tests passing.

---

## Phase A — Already complete (audit + initial fixes)

| # | Change | Files |
|---|--------|-------|
| A1 | Removed opening-balance input from party add/edit + account form (UX request) | `party/new.tsx`, `party/edit.tsx`, `account-form.tsx` |
| A2 | Fixed 2 TS `never`-narrowing errors in sync banner | `sync-status-banner.tsx` |
| A3 | Removed dynamic `import()` in PDF builder (broke Jest + added lazy overhead) | `pdf.ts` |
| A4 | Updated 8 stale tests to the v8 ledger-derived model; 3 PDF tests fixed | `party-repo`, `statement`, `entry-edit-repo`, `party-statement-pdf` |
| A5 | Removed ~13 unused imports/vars (lint) | `history.tsx`, `export.tsx`, `excel.ts`, `account/[id].tsx` |

## Phase B — Dead code & complexity (now executing)

| # | Change | Files | Why |
|---|--------|-------|-----|
| B1 | ✅ Delete 4 dead exports: `transactionsToExcel`, `khataToExcel`, `KhataExcelRow`, `combinedToExcel` | `utils/excel.ts` | No callers; combined export already marked "coming soon" |
| B2 | ✅ Delete dead `loadStatementReport` (only its own file referenced it; hid a dynamic `import()`) | `utils/statement.ts` | No callers; dead DB layer |
| B3 | Make internally-only types non-exported: `MonthlyPdfInput`, `PartyStatementPdfInput`, `CombinedPdfInput`, `ShareFileOptions`, `StatementEntry`, `StatementMonth`, `ImpactStyle`, `NotificationStyle` | `utils/pdf.ts`, `utils/share.ts`, `utils/statement.ts`, `utils/haptics.ts` | Verified zero external importers |
| B4 | Deduplicate the recurring-schedule form: `recurring/new.tsx` (430) + `recurring/edit.tsx` (521) share the same fields/validation — extract one `RecurringForm` component | `app/recurring/new.tsx`, `app/recurring/edit.tsx` + new `components/recurring-form.tsx` | Every piece of logic should exist once |

## Phase C — Performance + database

| # | Change | Files | Why |
|---|--------|-------|-----|
| C1 | Add migration v9: index `idx_transactions_account_date ON transactions(account_id, date)` | `db/database.ts` | `listAccountLedgerPage`, account-balance aggregates, cash-book and delete-guards all scan `WHERE account_id` with only a date index |
| C2 | Rewrite `substr(date,1,7) = ?` month queries to `date >= ? AND date < ?` (computed bounds) | `db/transaction-repo.ts` (`getMonthSummary`, `getCategoryBreakdown`), `db/party-repo.ts` (`getMonthPartyTotals`) | `substr()` defeats `idx_*_date`; range predicate hits the index — fast on large ledgers |
| C3 | Verify search/global-search already pushed to SQLite; confirm history & account feeds use keyset pagination end-to-end (no unbounded loads) | `transaction-repo.ts`, `hooks/*` | Keep single source of truth in SQLite |
| C4 | Sweep re-renders: confirm list rows are memoized, `SectionList` sections computed with `useMemo`, heavy screens lazily loaded where expo-router allows | `components/*`, `app/**` | 60 FPS on low-end Android |

## Phase D — Production cleanup

| # | Change | Files |
|---|--------|-------|
| D1 | Gate/convert `console.log/warn`: DB init (`_layout.tsx`), `services/app-meta.ts`, recurring `scheduler.ts`, sync `realtime.ts` | `app/_layout.tsx`, `services/**` |
| D2 | Remove unused dependencies and duplicate packages; confirm `.npmrc`/`eas.json` production-ready | `package.json`, `.npmrc`, `eas.json` |
| D3 | Re-verify folder structure; keep files merged where logical, split only when justified | whole repo |

## Phase E — Final verification + deliverables report

- Re-run `tsc`, `expo lint`, `jest`; verify an on-device/emulator smoke path (add income, expense, transfer, party khata, export PDF/Excel).
- Produce final report: files modified/deleted/merged, components extracted, performance & database improvements, bundle/startup impact, bugs fixed, line-count delta (removed vs added), remaining technical debt.
