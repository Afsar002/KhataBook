# DailyKhata — Documentation

A simple ledger app for small shop owners and families. This folder holds the
project documentation.

## Project overview

- **Vision:** easiest ledger app for small shop owners and families
- **Audience:** shopkeepers and parents, including elderly users with no accounting background
- **Design principles:** minimal UI, very large buttons, one action per screen, icon-first, offline, zero learning curve
- See [`00-project-vision.md`](00-project-vision.md)

## Features

Implemented: daily income & expense, cash and bank balances, dashboard, history
with filters and search, monthly reports with category breakdown, khata credit
ledgers for customers & suppliers, JSON backup/restore, CSV export (Excel) for
transactions and khata, PDF monthly reports, phone-OTP **or Google** sign-in,
automatic cloud sync with restore-on-new-device, live multi-device sync via
Supabase Realtime, **business multi-profile** (multiple independent shops, each
with its own database & cloud session), **min version enforcement** (server-side
`app_meta` blocks sync when the app is too old), **data-migration prompts**
(restoring an old backup shows a server-managed notice), and optional
fingerprint/face/PIN unlock on app open. The app is offline-first — cloud sync
is optional. See [`03-features-roadmap.md`](03-features-roadmap.md) and
[`01-product-requirements.md`](01-product-requirements.md).

## Tech stack

- Expo SDK 57 (React Native) + TypeScript
- expo-router (file-based routing, bottom tabs)
- expo-sqlite (local, offline-first database)
- Supabase (optional phone-OTP / Google sign-in + cloud backup with Row Level Security, live multi-device sync via Realtime)
- Lucide icons, Inter font
- See [`05-design-system.md`](05-design-system.md) and `src/constants/theme.ts`

## Installation

```bash
npm install
npx expo start
```

Run with Expo Go or an emulator. The app works fully offline. To enable cloud
sync and phone sign-in, follow [`13-supabase-setup.md`](13-supabase-setup.md).

## Folder structure

```
src/
  app/            # Routes (tabs + expense/income modals + auth)
  components/     # Reusable UI components
  constants/      # Design tokens
  context/        # Theme, auth & sync contexts
  db/             # SQLite schema + repositories + sync (queue/push/pull)
  hooks/          # Data hooks
  services/       # Supabase client/auth + sync engine (UI-independent)
  types/          # Shared models
  utils/          # Formatting helpers
docs/             # This documentation
supabase/
  migrations/     # Cloud schema SQL (run in the Supabase SQL Editor)
```

## Contributing

Follow the rules in [`10-ai-context.md`](10-ai-context.md): TypeScript only,
reusable components, no inline styles, keep responsive, update navigation,
types, docs, and changelog when adding screens.

## Documentation links

| File | Contents |
| --- | --- |
| `00-project-vision.md` | Vision, mission, design principles |
| `01-product-requirements.md` | Objectives |
| `02-user-personas.md` | Primary user |
| `03-features-roadmap.md` | Version roadmap |
| `04-app-flow.md` | Screen flows |
| `05-design-system.md` | Colors, typography, spacing |
| `06-database-schema.md` | Tables |
| `07-api-specification.md` | API spec (future) |
| `08-development-status.md` | Current build status |
| `09-future-features.md` | Later ideas |
| `10-ai-context.md` | Rules for working on the codebase |
| `11-business-rules.md` | Ledger & khata business rules |
| `12-glossary.md` | Domain terms |
| `13-supabase-setup.md` | Enable cloud sync & phone sign-in |
| `14-optimization-plan.md` | Performance work plan |
| `15-optimization-report.md` | What was optimized |
| `16-security.md` | Keys, rotation & the local audit log |
| `CHANGELOG.md` | Version history |
