# DailyKhata

A simple ledger app for small shop owners and families — built for people who
just want to record money in and money out. No accounting knowledge required.

Built with **Expo (React Native) + TypeScript**. Works fully **offline** with a
local SQLite database.

## Features (v1)

- **Dashboard** — total balance, cash & bank balances, today's income & expense
- **Quick Add** — large one-tap buttons for Income and Expense
- **Add Income / Add Expense** — big rupee input, account (Cash/Bank), category, note
- **History** — entries grouped by date, filter by All / Income / Expense, delete on long-press, search by note/category/account/amount
- **Reports** — monthly income, expense & profit with a per-category breakdown, exportable as a PDF
- **Khata (credit ledger)** — customers & suppliers, give/receive money, take-on-credit/pay, per-party ledger
- **Backup & Restore** — save all data to a JSON backup file, restore it later
- **Cloud Sync (optional)** — phone-OTP **or Google** sign-in, automatic
  background uploads, restore-on-new-device, and live multi-device sync via
  Supabase Realtime. Offline-first: works without it.
- **Business Profiles** — run multiple independent shops in one app; each has its
  own database & cloud session. Switch from Settings → Business Profiles.
- **Min Version Enforcement** — server-side `app_meta` table blocks sync if the
  app is too old; Settings shows "Update required".
- **Data-Migration Prompts** — restoring an old backup shows a server-managed
  notice explaining what changed.
- **Export** — transactions & khata ledgers as CSV (Excel), monthly reports as PDF
- **Unlock Protection** — optional fingerprint / face / PIN lock on app open
  (device-local, never synced)
- **Settings** — dark mode toggle, Cloud Sync (Connected Account / Last Sync /
  Sync Now / Auto Sync / Sign Out), backup & export under Advanced
- **Design system** — Inter font, Lucide icons, green = income, red = expense, 16px buttons, 8px spacing

## Getting started

```bash
npm install
npx expo start
```

Scan the QR code with **Expo Go** (Android/iOS) or press `a` for the Android emulator.

To enable cloud sync & phone sign-in, add your Supabase project to a `.env`
file — see [docs/13-supabase-setup.md](docs/13-supabase-setup.md). Without it
the app runs fully offline with manual backup/restore.

## Folder structure

```
app.json                 # Expo app config (name, splash, plugins)
supabase/migrations/     # Cloud schema SQL (run in the Supabase SQL Editor)
src/
  app/                   # expo-router routes
    _layout.tsx          # Root stack + fonts + DB init + theme + auth gate
    auth.tsx             # Phone-OTP sign-in (two-step)
    (tabs)/              # Home / History / Khata / Reports / Settings
    expense.tsx          # Add expense (modal)
    income.tsx           # Add income (modal)
    party/               # Khata: [id] ledger, new party, entry (modals)
  components/            # Reusable UI (Screen, Card, LargeButton, …)
  constants/theme.ts     # Design tokens (colors, spacing, radius, fonts)
  context/               # theme-context, auth-context, sync-context
  db/                    # SQLite schema + repositories + sync (queue/push/pull)
  hooks/                 # useTheme, useAccounts, useTransactions, …
  services/              # Supabase client/auth + sync engine (UI-independent)
  types/                 # Shared data models
  utils/format.ts        # ₹ formatting, date helpers
docs/                    # Project documentation
```

## Data

All data lives on-device in a SQLite database (`dailykhata.db`) with `accounts`,
`categories`, `transactions`, `parties`, `party_transactions` and `settings`
tables. See `docs/06-database-schema.md`.

When Supabase is configured, the same data mirrors to the cloud with a `uuid`
primary key, a `user_id` owner, LWW `updated_at`, soft-delete `deleted_at`, and
Row Level Security so users only ever access their own rows.

## Documentation

See [docs/README.md](docs/README.md) for the full documentation index.
