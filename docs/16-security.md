# Security — Keys, Rotation, and the Local Audit Log

DailyKhata is offline-first and stores the ledger in an unencrypted SQLite
database on the device. This page documents how the app protects cloud
credentials, what happens if one leaks, and the device-local audit trail that
records every mutation.

## Cloud credentials

The app talks to Supabase using two public build-time variables:

| Variable | Purpose | Sensitivity |
| --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Project URL | Public (not secret) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Project anon key | Public by design (the PostgREST anon role is locked down via Row Level Security) |

Because `EXPO_PUBLIC_*` variables are **inlined into the shipped JS bundle**,
they are readable by anyone who unpacks the app — this is inherent to client
apps with Supabase and is safe **only if** the server enforces RLS. Keep the
anon role restricted to what a logged-in user can do. A **service_role** key
(which bypasses RLS) must **never** be added to the app or committed anywhere.

### Storage rules

- `.env` is git-ignored. Never commit it.
- `.env.example` contains only placeholder values (`your-project-ref`,
  `your-anon-key`) that match no real project.
- CI runs **gitleaks** on every push/PR (`.github/workflows/ci.yml`) and fails
  the build if a secret-shaped string is committed.

## Rotating a Supabase key

Rotate when: a key was committed to git, pasted in a public chat, or a
developer with access leaves the team. Supabase issues new keys instantly; the
old one stays valid for a short grace window, so rotate and then **re-verify**
before discarding the old value.

1. **Generate a new anon key** — Dashboard → **Project Settings → API Keys →
   anon public** → **Rotate** (or copy a new `JWT secret`-based key).
2. **Update the app** — replace the value in `.env`:
   ```dotenv
   EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=new-anon-key
   ```
   Rebuild and redeploy. Because the key is inlined at build time, a rebuild
   is required — editing `.env` alone does not change an installed app.
3. **If the old key was committed to git**, scrub it from history. The key is
   public (anon) so this is hygiene, not a breach — but do it anyway:
   ```sh
   # remove the file from history and force-push (coordinated, not solo)
   git filter-branch --index-filter 'git rm --cached --ignore-unmatch .env' -- --all
   ```
   Or, for one leaked value, install the GitHub secret-scanning notification
   hook instead and let it flag future commits.
4. **Re-verify** — after the new key is live, confirm a fresh install signs in
   and syncs, then revoke the old key in the dashboard.

The `service_role` key should be rotated the same way **only from the Supabase
dashboard** and stored in server-side secrets (Supabase Edge Functions
`secrets` or your backend), never in this repo.

## Local audit log

Every syncable mutation (insert/update/delete of accounts, categories,
transactions, transfers, parties, party transactions, recurring templates,
settings) writes an **append-only** row to the `audit_log` table at the same
time it is queued for sync. The log is never coalesced, so it records the full
mutation history, not just the final state.

- **Attribution** — the signed-in `user_id` is captured at write time (`NULL`
  in offline-only mode).
- **Contents** — table, operation, record uuid, user id, payload snapshot,
  timestamp.
- **Retention** — rows older than 90 days are purged on boot (like parked sync
  ops), so the table cannot grow unbounded.
- **Locality** — `audit_log` is device-local and never synced or backed up, so
  it is a debugging/compliance trail, not a remote record.

To inspect it (Android emulator / Expo Go):

```sh
# pull the db and query, or use a SQLite viewer
sqlite3 dailykhata.db 'SELECT table_name, operation, user_id, created_at
                       FROM audit_log ORDER BY id DESC LIMIT 20;'
```

## Related

- [Supabase setup](13-supabase-setup.md) — how the keys are configured.
- [Database schema](06-database-schema.md) — the `audit_log` table definition.
