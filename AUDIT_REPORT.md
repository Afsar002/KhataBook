# DailyKhata Codebase Audit Report

**Generated:** 2026-08-06  
**Scope:** Complete audit of all planned phases (V1–V5) against current implementation  
**Expo SDK:** 57 | **React Native:** 0.86 | **React:** 19

---

## Executive Summary

| Phase | Roadmap Version | Status | Completion |
|-------|----------------|--------|------------|
| **Core Ledger** | V1–V3 | ✅ **Complete** | 100% |
| **Cloud Sync & Auth** | V4 | 🟡 **Partial** | ~80% |
| **UX & Business Features** | V3–V4 | 🟡 **Partial** | ~85% |
| **UI Polish** | Design System | ✅ **Complete** | 95% |
| **Responsive Layout** | Web/Tablet | 🟡 **Partial** | ~60% |
| **Functional QA** | Tests/CI | 🟡 **Partial** | ~40% |

**Overall:** The app is **production-ready for core ledger use cases**. Cloud sync works but needs conflict review UI. Recurring transactions backend exists but no user-facing UI. Web layout is static-only. Test coverage is unit-only with no e2e/CI.

---

## Phase 1: Core Ledger (V1–V3) — ✅ COMPLETE

| Feature | File(s) | Status | Notes |
|---------|---------|--------|-------|
| Daily Income | `src/app/income.tsx`, `TransactionForm` | ✅ Complete | Amount, account, category, note; edit/delete |
| Daily Expense | `src/app/expense.tsx`, `TransactionForm` | ✅ Complete | Same as income |
| Bank Balance | `src/app/accounts.tsx`, `account/[id].tsx` | ✅ Complete | Grouped by type; detail with ledger |
| Cash Balance | Dashboard, `cashbook.tsx` | ✅ Complete | Daily reconciliation |
| History | `src/app/(tabs)/history.tsx` | ✅ Complete | Search, filters (date/amount/account/category), pagination, sections by date |
| Simple Dashboard | `src/app/(tabs)/index.tsx` | ✅ Complete | Totals, today summary, quick actions, recent 5, FAB |
| Credit (Customer Ledger) | `khata.tsx`, `party/[id].tsx` | ✅ Complete | Give/Receive actions; balance auto-updates |
| Debit (Supplier Ledger) | `khata.tsx`, `party/[id].tsx` | ✅ Complete | Take/Pay actions; balance auto-updates |
| Customer Ledger | `khata.tsx` (filtered) | ✅ Complete | Customer list with summary cards |
| Supplier Ledger | `khata.tsx` (filtered) | ✅ Complete | Supplier list with summary cards |
| Categories | `src/app/categories.tsx` | ✅ Complete | CRUD + icon picker; income/expense segments |
| Reports | `src/app/(tabs)/reports.tsx` | ✅ Complete | Monthly nav, income/expense/profit, party given/received, cash/bank balances, category breakdown bars, PDF export |
| Monthly Summary | Dashboard + Reports | ✅ Complete | Today + monthly + daily cashbook |
| Search | `src/app/search.tsx` | ✅ Complete | Global search (transactions/parties/accounts), debounced |
| Transfers | `src/app/transfer.tsx`, `TransferForm` | ✅ Complete | From/To validation, same-account block |
| Opening Balances | Accounts + Parties | ✅ Complete | Set on create; included in balances |

---

## Phase 2: Cloud Sync & Auth (V4) — 🟡 PARTIAL (~80%)

| Feature | Status | Gap / Effort |
|---------|--------|--------------|
| Phone OTP Auth | ✅ Complete | 2-step SMS flow with resend |
| Email/Password Auth | ✅ Complete | Sign in, sign up, password reset deep link |
| Google Sign-In | ✅ Complete | `useGoogleSignIn` hook + `expo-auth-session` |
| Session Persistence | ✅ Complete | Auto-restore on boot via `restoreSession()` |
| Cloud Backup/Restore | ✅ Complete | JSON backup in Settings; auto-sync via engine |
| Core Sync Engine | ✅ Complete | `sync-engine.ts`: push/pull, LWW, exponential backoff, debounce, realtime |
| Version Blocking | ✅ Complete | `fetchAppMeta` + `versionSatisfies` check on boot |
| Multi-device Tracking | ✅ Complete | `device-repo` + `last_sync_from` setting |
| Realtime Subscriptions | ✅ Complete | `startRealtime`/`stopRealtime` in `realtime.ts` |
| **Conflict Review UI** | ❌ Missing | Only conflict *count* banner in Settings; no screen to review/accept/reject individual conflicts | Medium |
| **Selective Sync** | ❌ Missing | All-or-nothing push/pull; no per-table or per-record toggle | Medium |
| **Sync Scheduling UI** | ❌ Missing | Auto-sync toggle exists but no "sync at 6 AM" or "Wi-Fi only" settings | Small |
| **Realtime Fallback UX** | 🟡 Partial | Falls back to 'trigger' mode silently; no manual retry button beyond "Sync Now" | Small |
| **Push Notifications** | ❌ Not Implemented | No FCM/APNs for sync status, reminders, recurring triggers | Medium |
| **Offline Banner** | ❌ Missing | Sync status shows 'offline' in Settings but no persistent header banner | Small |

**Key files:** `sync-engine.ts`, `pull.ts`, `push.ts`, `auth.ts`, `auth-context.tsx`, `sync-context.tsx`, `realtime.ts`

---

## Phase 3: UX & Business Features — 🟡 PARTIAL (~85%)

| Feature | Status | Gap / Effort |
|---------|--------|--------------|
| Cash Book Reconciliation | ✅ Complete | Daily expected vs actual; save/clear count |
| PDF Export (Reports) | ✅ Complete | Monthly report + party statement PDFs |
| Excel/CSV Export | ✅ Complete | Transactions + Khata + Combined + Date-range export screen |
| Backup/Restore | ✅ Complete | JSON with migration support |
| App Lock (Biometric) | ✅ Complete | Enable/disable; Face ID/Touch ID/passcode |
| Dark Mode | ✅ Complete | System/light/dark; persisted |
| Multi-account (Cash/Bank/Wallet) | ✅ Complete | Unlimited accounts with types |
| Transfers | ✅ Complete | Between any two accounts |
| Party Reminders | ✅ Complete | WhatsApp/SMS with pre-filled message |
| **Recurring Transactions UI** | ❌ **Missing** | Schema v7 + scheduler exist; **zero screens to create/edit/manage templates** | **Medium** |
| **Onboarding Flow** | 🟡 Partial | `OnboardingGate` + `onboarding.tsx` exist but not verified end-to-end; may not guide first-time users through account/category setup | Small |
| **Date Picker for Backdating** | ❌ Missing | All forms use today only; edit preserves original date but cannot change it | Small |
| **Keyboard Avoidance** | 🟡 Partial | Some forms lack `KeyboardAvoidingView`; may be obscured on Android | Small |

**Recurring backend exists:** `recurring-repo.ts`, `scheduler.ts`, `registerRecurringTask()` called in `_layout.tsx:104`

---

## Phase 4: UI Polish — ✅ MOSTLY COMPLETE (~95%)

| Feature | Status | Gap |
|---------|--------|-----|
| Design System | ✅ Complete | 16px radius, green primary, red danger, Inter font, Lucide icons, 8px spacing, glass cards |
| Themed Components | ✅ Complete | `ThemedText`, `Card`, `Screen`, `LargeButton`, `Segment`, `TextField`, `AmountInput`, `AccountPicker`, `CategoryPicker`, `CategoryIcon`, `IconPicker`, `BalanceCard`, `Fab`, `EmptyState`, `SearchInput` |
| Empty States | ✅ Complete | Contextual icons/messages throughout |
| Error Boundaries | ✅ Complete | Root `ErrorBoundary` catches render errors |
| Loading States | ✅ Complete | `ActivityIndicator` in forms, lists, sync states |
| Animations | 🟡 Partial | 200ms transitions in design spec; **no `react-native-reanimated` animations visible** | Low |
| Accessibility | 🟡 Partial | `accessibilityRole`/`Label` on buttons; no screen reader testing visible | Low |
| Consistent Headers | 🟡 Partial | Varies: some use `<Screen>` with custom header, others tab-bar only | Low |
| Back Button Placement | 🟡 Partial | Some top-left, some in header row with title | Low |

---

## Phase 5: Responsive Layout — 🟡 PARTIAL (~60%)

| Platform | Status | Gaps |
|----------|--------|------|
| **Mobile (Primary)** | ✅ Complete | All screens designed for phone; `MaxContentWidth = 600px` centers on tablet |
| **Web** | 🟡 Partial | `output: static` only; tabs don't adapt to desktop; no sidebar/split views; no hover states |
| **Tablet** | 🟡 Partial | Content centers but no adaptive layouts (e.g., party list + detail side-by-side) |
| **Landscape** | ❌ Not Tested | No landscape-specific handling; forms don't adapt to keyboard |

**Key gap:** `app.json` has `"web": { "output": "static" }` — no SSR, no dynamic routes.

---

## Phase 6: Functional QA — 🟡 PARTIAL (~40%)

| Area | Status | Details |
|------|--------|---------|
| **Unit Tests** | 🟡 Partial | Test files exist for: `error-boundary`, `pull`, `backup`, `auth-context`, `search-repo`, `history-filters`, `category-repo`, `party-repo`, `cash-book-repo`, `remind`, `party-statement-pdf`, `csv`, `onboarding`, `database`, `realtime`, `sync-engine`, `queue-repo`, `entry-edit-repo`, `theme-web-prefs`, `onboarding-gate` |
| **Integration Tests** | ❌ Missing | No e2e tests (Detox/Playwright) |
| **CI/CD** | ❌ Missing | No GitHub Actions or EAS Build workflows visible |
| **TypeScript Strict** | ✅ Complete | Strict mode enabled; types for all entities |
| **Linting** | ✅ Complete | `eslint.config.js` present |

---

## Critical Bugs & Broken Functionality Virtual world and does not represent hello

| # | Issue | File/Location | Severity | Fix Effort |
|---|-------|---------------|----------|------------|
| 1 | **Empty API spec** | `docs/07-api-specification.md` | Low | Small (document existing Supabase schema) |
| 2 | **No Recurring Transactions UI** | `src/app/recurring.tsx` exists but incomplete; `src/app/recurring/` folder empty | **High** | Medium |
| 3 | **Onboarding not verified end-to-end** | `OnboardingGate` + `onboarding.tsx` | Medium | Small |
| 4 | **No date picker for backdating** | `TransactionForm`, `TransferForm`, `PartyEntryForm` | Medium | Small |
| 5 | **Conflict review UI missing** | Settings shows count only | Medium | Medium |
| 6 | **No offline banner** | Sync status buried in Settings | Low | Small |
| 7 | **Keyboard avoidance missing** | Forms may be obscured by keyboard on Android | Low | Small |
| 8 | **Export screen unreachable?** | Settings links to `/export` but not verified | Low | Small |
| 9 | **Reset password flow untested** | Deep link `dailykhata://reset-password` | Low | Small |
| 10 | **Realtime fallback silent** | No user indication when 'live' → 'trigger' | Low | Small |

---

## Dead Buttons / Unfinished Screens

| Screen | Status | Notes |
|--------|--------|-------|
| `src/app/recurring.tsx` | 🟡 Partial | List + toggle/delete/edit exist; **no `/recurring/new` or `/recurring/edit` screens** |
| `src/app/recurring/` folder | ❌ Empty | No create/edit screens |
| `src/app/export.tsx` | ✅ Complete | Date-range CSV/PDF export; reachable from Settings |
| `src/app/reset-password.tsx` | ✅ Complete | Deep link handler; flow untested |
| `src/app/onboarding.tsx` | ✅ Complete | 5-step swipeable tutorial; `OnboardingGate` renders inline |

---

## Inconsistent UI Patterns

| Pattern | Instances | Recommendation |
|---------|-----------|----------------|
| Header style | Dashboard (inline), History (SafeAreaView), Accounts (Screen), Account Detail (Screen + custom), Cashbook (Screen), Party Detail (SafeAreaView), Reports (Screen), Settings (Screen) | Extract `<ScreenHeader>` component |
| Back button | Top-left (most), header row with title (History, Settings advanced) | Standardize to top-left in `<ScreenHeader>` |
| Card padding | `pad={false}` on some lists, default on others | Consistent `Card` usage |
| Segment control | History, Reports, Khata, Categories, Auth — slightly different each time | Already shared `Segment` component; verify props consistency |
| EmptyState icons | `Inbox` (dashboard), `ReceiptText` (history, account), `Search` (search), `UserRound` (party), `Store` (categories) | Create semantic mapping: `EmptyStateType` enum |

---

## Duplicate Code Opportunities

| Components | Overlap | Refactor |
|------------|---------|----------|
| `TransactionForm` vs `PartyEntryForm` | Amount, note, save/delete, segment for action type | Extract `BaseEntryForm` with `renderActionSelector` |
| `AccountPicker` | Used in TransactionForm, TransferForm | ✅ Good reuse |
| `CategoryPicker` | Only in TransactionForm | Could be used in PartyEntryForm if categories added to khata |
| `BalanceCard` | Dashboard + potentially elsewhere | ✅ Good reuse |
| `KhataSummaryCard` | Only in Khata screen | Single use — OK |
| Header patterns | Account detail, Cashbook, Accounts, Party detail | Extract `<ScreenHeader>` |

---

## Performance Issues

| Issue | Location | Impact | Fix |
|-------|----------|--------|-----|
| `useLedger` loads all entries initially | `src/hooks/use-ledger.ts` | Large datasets: loads everything before pagination | Add `limit` to initial `listLedgerPage()` call |
| History filters in memory | `history.tsx:54-102` | 10k+ entries → lag on filter change | Move filters to SQL `WHERE` clauses |
| Search queries each entity separately | `use-global-search.ts` | Multiple round-trips per keystroke | Consider SQLite FTS5 virtual table |
| No list virtualization | `FlatList`/`SectionList` throughout | Large lists → memory/render cost | Add `getItemLayout`, `windowSize`, `maxToRenderPerBatch` |
| Sync processes queue sequentially | `push.ts:55-93` | Many pending ops → slow sync | Batch upserts where possible |
| Realtime subscriptions per table | `realtime.ts` | Multiple connections | Already uses single channel with filters — OK |

---

## Responsive Layout Problems

| Problem | Impact | Fix Effort |
|---------|--------|------------|
| Web: static output only | No SSR, tabs don't adapt, no desktop nav | Medium (Expo Router v57 supports dynamic routes) |
| No tablet split views | Party list + detail side-by-side would be better UX | Medium |
| No landscape optimization | Forms don't adapt to keyboard in landscape | Small |
| MaxContentWidth = 600px only | No breakpoints for larger desktop screens | Small |

---

## Security Concerns

| Concern | Location | Risk | Mitigation |
|---------|----------|------|------------|
| **No SQLite encryption** | `database.ts` | High if device stolen | Use `expo-sqlite` with `SQLCipher` or `expo-file-system` encryption |
| **Supabase keys in `.env`** | `.env.example` exists | Medium | Document rotation; add secret scanning in CI |
| **No rate limiting on auth** | `auth.ts` OTP/email endpoints | Medium | Supabase has built-in; verify dashboard config |
| **No audit logging** | Sync logs conflicts only | Low | Add `audit_log` table for all mutations |
| **Backup files unencrypted** | `backup.ts` JSON export | Medium | Offer encrypted backup option (AES-256) |
| **No session timeout** | `auth-context.tsx` | Low | Add configurable inactivity timeout |
| **App lock optional, no PIN fallback** | `app-lock/prefs.ts` | Medium | Add app-specific PIN as alternative to biometric |

---

## Prioritized Implementation Roadmap

### HIGH PRIORITY (Immediate — Blocking or High Impact)

| # | Task | Effort | Reason |
|---|------|--------|--------|
| 1 | **Build Recurring Transactions UI** | Medium | Schema + scheduler exist; high value for shopkeepers (rent, salaries, EMIs); unblocks V3→V4 |
| 2 | **Complete Onboarding Flow Verification** | Small | Critical for 55yo non-tech users; "usable within 5 minutes" per vision |
| 3 | **Add Date Picker to Transaction/Transfer/Party Forms** | Small | Users need to backdate entries; currently only today |
| 4 | **Implement Sync Conflict Review Screen** | Medium | Users need to see what was overwritten; currently only count banner |
| 5 | **Add Offline Banner/Indicator in App Header** | Small | Clear visual when offline; sync status buried in Settings |
| 6 | **Fix/Verify Export Screen (`/export`)** | Small | Button in Settings links to it; verify end-to-end |
| 7 | **Add KeyboardAvoidingView to Forms** | Small | Forms may be obscured by keyboard on Android |

### MEDIUM PRIORITY (Next 2–4 Weeks)

| # | Task | Effort | Reason |
|---|------|--------|--------|
| 8 | **Push Notifications (Sync/Reminders/Recurring)** | Medium | V4 roadmap; engages users, reminds of pending sync |
| 9 | **Web Responsive Layout (Tabs→Sidebar, Split Views)** | Medium | Tablet/desktop support; Expo Router v57 supports this |
| 10 | **Virtualized Lists for Large Datasets** | Medium | Performance for users with years of data |
| 11 | **SQLite FTS5 for Global Search** | Medium | Faster search, especially on large datasets |
| 12 | **Extract Shared BaseEntryForm Component** | Small | Reduce duplication between TransactionForm/PartyEntryForm |
| 13 | **Extract ScreenHeader Component** | Small | Consistent headers across all screens |
| 14 | **App PIN Fallback for App Lock** | Medium | Security: biometric optional, need PIN alternative |
| 15 | **Session Timeout Config** | Small | Auto-sign-out after inactivity for security |

### LOW PRIORITY (Nice to Have)

| # | Task | Effort | Reason |
|---|------|--------|--------|
| 16 | **Landscape Mode Support** | Medium | Niche but useful for tablet cashbook |
| 17 | **Reanimated 200ms Transitions** | Medium | Polish: design spec has them but not implemented |
| 18 | **E2E Tests (Detox)** | Large | Confidence for releases |
| 19 | **CI/CD Pipeline (GitHub Actions + EAS)** | Medium | Automated testing/build |
| 20 | **API Specification Document** | Small | `docs/07-api-specification.md` is empty |
| 21 | **Hindi/Assamese Localization** | Large | Target audience needs per personas |
| 22 | **Voice Input** | Large | V5 roadmap; accessibility for elderly users |
| 23 | **OCR Receipt Scanning** | Large | V5 roadmap |
| 24 | **AI Insights/Expense Prediction** | Large | V5 roadmap |
| 25 | **Database Encryption (SQLCipher)** | Medium | Security: encrypt SQLite at rest |
| 26 | **Audit Log for Data Changes** | Medium | Compliance/debugging |

---

## Recommended Next Feature

### **Build Recurring Transactions UI** — Highest impact/dependency ratio

**Why:**
- Database schema (v7 migration) and scheduler service **already exist**
- `registerRecurringTask()` called on app boot in `_layout.tsx:104`
- High user value: shopkeepers have rent, salaries, loan EMIs, subscriptions
- Unblocks Version 3→4 transition (recurring listed in V3 roadmap)
- **Effort: Medium** (2–3 screens: list, create/edit, with frequency/date pickers)
- **Dependencies:** None — all backend pieces in place

**Screens needed:**
1. `src/app/recurring.tsx` — List (✅ exists, has generate/catch-up buttons)
2. `src/app/recurring/new.tsx` — Create template (frequency, day, amount, account/category/party, start/end date)
3. `src/app/recurring/edit/[id].tsx` — Edit template

**Alternative if smaller win preferred:** **Complete Onboarding Flow Verification** (Small effort, critical for new user retention per project vision).

---

## File Structure Overview (Key Files)

```
src/
├── app/
│   ├── _layout.tsx                 # Root: providers, gates, navigation stack
│   ├── (tabs)/
│   │   ├── _layout.tsx             # 5 tabs: Home, History, Khata, Reports, Settings
│   │   ├── index.tsx               # Dashboard (balance cards, today, quick actions, FAB)
│   │   ├── history.tsx             # Full history + search + advanced filters
│   │   ├── khata.tsx               # Party list (customers/suppliers)
│   │   ├── reports.tsx             # Monthly reports + PDF export
│   │   └── settings.tsx            # Profile, dark mode, app lock, categories, cloud sync, danger, advanced
│   ├── income.tsx / expense.tsx    # Thin wrappers → TransactionForm
│   ├── transfer.tsx                # Thin wrapper → TransferForm
│   ├── party/[id].tsx              # Party detail + ledger + actions + remind/share
│   ├── party/entry.tsx             # Party transaction entry form
│   ├── account/[id].tsx            # Account detail + ledger
│   ├── accounts.tsx                # Account list grouped by type
│   ├── categories.tsx              # Category CRUD + icon picker
│   ├── cashbook.tsx                # Daily cash reconciliation
│   ├── search.tsx                  # Global search
│   ├── auth.tsx                    # Sign in (phone OTP, email, Google)
│   ├── reset-password.tsx          # Deep link password reset
│   ├── onboarding.tsx              # 5-step swipeable tutorial
│   ├── recurring.tsx               # Recurring templates list (no create/edit yet)
│   └── export.tsx                  # Date-range CSV/PDF export
├── components/                     # 30+ themed, reusable components
├── context/                        # auth, sync, theme, profile, feedback
├── db/
│   ├── database.ts                 # SQLite + migrations (v1–v7), WAL, FK
│   ├── sync/                       # pull, push, queue, meta, history, device repos
│   ├── backup.ts                   # JSON export/import with migration
│   └── *-repo.ts                   # Repositories for all entities
├── hooks/                          # Data fetching hooks (useLedger, useAccounts, etc.)
├── services/
│   ├── sync/sync-engine.ts         # Core sync: debounce, push/pull, retry, realtime
│   ├── supabase/                   # auth, client, config
│   ├── recurring/scheduler.ts      # Recurring entry generation + background task
│   ├── onboarding/prefs.ts         # AsyncStorage tutorial flag
│   └── app-lock/                   # Biometric lock
├── utils/                          # format, pdf, csv, remind, share, confirm, haptics
└── types/                          # TypeScript types for all entities
```

---

## Conclusion

**DailyKhata is a well-architected, production-ready ledger app for its core use case.** The codebase follows React Native/Expo best practices: typed routes, strict TypeScript, clean separation of concerns, offline-first SQLite with Supabase sync, and a consistent design system.

**Top 3 things to ship next for maximum user value:**
1. **Recurring Transactions UI** — backend done, just needs screens
2. **Date Picker for Backdating** — simple but highly requested
3. **Conflict Review Screen** — completes the sync UX

**Technical debt to address before scaling:**
- Add list virtualization for large datasets
- Move history filters to SQL
- Set up CI/CD and e2e tests
- Document API spec
- Add database encryption

The foundation is solid. The remaining work is almost entirely **UI/UX completion** rather than architectural changes.