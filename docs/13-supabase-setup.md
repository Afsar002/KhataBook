# Supabase Setup — Cloud Sync & Phone Sign-In

DailyKhata is offline-first: SQLite is always the primary store and the app
works with **no** Supabase project at all. Adding a project turns on
phone-OTP sign-in and automatic cloud backup. This page walks through the
one-time setup.

## How the app decides

The app checks two environment variables at launch:

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Your project's anon (public) key |

When either is missing, `isSyncConfigured()` returns `false` and the app runs
exactly as before: no sign-in screen, no sync, manual backup/restore still
available in Settings → Advanced. Cloud Sync shows "Not configured".

When both are present, the auth gate turns on: first launch (or logout) shows
the phone-OTP sign-in screen, and every local edit is queued and uploaded.

> Credentials are **never** hardcoded. `EXPO_PUBLIC_*` vars are inlined by Expo
> at build time from `.env` — add `.env` to `.gitignore` (already done) and
> never commit it.

## 1. Create a Supabase project

1. Go to https://supabase.com and sign in (or create an account).
2. **New project** → pick a name (e.g. `dailykhata`), a region close to your
   users, and a database password. Wait for the project to be provisioned
   (~2 minutes).

## 2. Enable phone (SMS) authentication

1. In the project dashboard open **Authentication → Providers**.
2. Enable **Phone**.
3. Under **SMS provider**, choose one:
   - **Twilio** (recommended): create a free Twilio account, get a phone
     number, and paste the Account SID, Auth Token, and Messaging Service SID.
   - **MessageBird / Vonage**: follow the same steps with their keys.
4. Under **Email → Providers**, the built-in email provider can stay on — it
   isn't used by the app.
5. Optional: set the SMS template in **Authentication → Messages** to match
   your app ("Your DailyKhata code is `{{ .Token }}`").

## 3. Run the database migration

1. Open **SQL Editor** in the Supabase dashboard.
2. Paste the entire contents of `supabase/migrations/001_initial.sql`.
3. Run it. It creates the `accounts`, `categories`, `parties`,
   `transactions`, `transfers`, `party_transactions`, and `settings` tables —
   each with a uuid primary key, `user_id` owner, LWW `updated_at`, soft-delete
   `deleted_at`, and a Row-Level-Security policy that only ever lets a user
   touch their own rows.
4. Paste the entire contents of `supabase/migrations/002_realtime.sql` and run
   it. This adds every table to the `supabase_realtime` publication, which is
   what enables **live multi-device sync** (edits on one device appear on the
   others within a couple of seconds). If you skip it the app still syncs — it
   just waits for the normal triggers (edits, app foreground, Sync Now).

## 4. Add the env vars

Create a `.env` file in the project root (next to `package.json`):

```bash
# Supabase (project dashboard → Project Settings → API)
EXPO_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...your-anon-key...
```

`npm run start` reads it automatically. If you already ran the app without it,
the very next launch switches sync on.

## Google Sign-In (optional)

Phone OTP is the default sign-in. You can also let users sign in with Google —
it's the same session, same sync, same "restore on a new device" behaviour.

1. **Google Cloud Console** (https://console.cloud.google.com):
   - Create a project (or reuse one), then open **APIs & Services → OAuth
     consent screen** and configure it (External, app name, email).
   - **APIs & Services → Credentials → Create credentials → OAuth client ID**:
     - **Web application** → note the client ID (this is the **web client ID**).
       Add the redirect URI the app will use: the app's scheme
       (`dailykhata://oauth2redirect` on Android) or the exact redirect shown
       when Google fails to match (the setup doc's troubleshooting table).
     - **Android** → your app's package name + the **SHA-1** signing fingerprint
       (from `keytool -list -v -keystore <your-release.keystore>` or your EAS
       project). Note this client ID.
     - **iOS** → your app's bundle identifier. Note this client ID.
2. **Supabase dashboard** — **Authentication → Providers → Google**: enable it
   and paste the **Web client ID** from step 1. This is the ID Supabase uses to
   validate the ID token, so it must match the app's web client ID.
3. **App `.env`** — add the client IDs (the web one is required; the platform
   ones are used by their matching platform):
   ```bash
   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=1234.apps.googleusercontent.com
   EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=5678.apps.googleusercontent.com
   EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=9012.apps.googleusercontent.com
   ```
   Restart the dev server. The auth screen now shows **Continue with Google**.

> **Expo Go note:** Google Sign-In uses `expo-auth-session`, which needs the
> OAuth redirect to reach your app. In Expo Go the redirect host isn't your app,
> so Google Sign-In generally requires a **development build** (`npx expo run:
> android`, or EAS Build). Phone OTP works fine in Expo Go.
>
> **Build a development build** (`eas.json` is already configured):
> ```bash
> eas build --profile development --platform android
> ```
> or locally with `npx expo run:android`. Install the resulting APK on the
> device and run the app from the "development build" (not Expo Go) to test
> Google Sign-In. The `android.package` / `ios.bundleIdentifier` in `app.json`
> (`com.dailykhata.app`) is what the OAuth redirect matches, so the Google
> Cloud Console Android/iOS client IDs must use the same package name.

## Email + password (optional)

A third way to sign in: an email address and a password. The auth screen has a
**Phone / Email** switch.

**Supabase dashboard — Authentication → Providers → Email**: make sure **Email**
is enabled. Two settings worth knowing:
- **Confirm email** (on by default): new sign-ups must tap a confirmation link
  in their email first. The app shows a message telling them to check their
  email. Turn it off for instant sign-ups on test projects.
- **Secure email change / password change**: keep the defaults (enabled).

No app `.env` changes are needed — email + password uses the same
`EXPO_PUBLIC_SUPABASE_URL` / `_ANON_KEY` as everything else.

## 5. Verify end-to-end

1. `npx expo start` and open the app.
2. Settings → Cloud Sync shows your phone and "In sync".
3. Sign out (Settings → Sign Out) → the sign-in screen appears.
4. Enter a phone number, tap **Send OTP**, type the SMS code → the app opens
   and (on a fresh device) automatically downloads your entries — this is the
   "restore on a new device" flow.
5. Add an income/expense/transfer/khata entry, then check the matching table
   in **Supabase → Table Editor**: the row appears a moment later.
6. Sign in on a second device with the same number → your entries restore.
   Edit the same row on two devices → the newer `updated_at` wins.
7. Live sync: with `002_realtime.sql` applied, add an entry on one device and
   watch it appear on the other within a couple of seconds.
8. Google (in a dev build): sign out, tap **Continue with Google**, complete the
   browser grant → the app opens signed in and the session persists.

## Offline behaviour

- No internet: the app stays fully usable; edits queue locally.
- Sync retries automatically with backoff until it succeeds.
- Auto-sync can be toggled in Settings; **Sync Now** forces an upload/download.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Sign-in screen never appears | `.env` missing / URL or key wrong |
| "Cloud sync is not configured yet" | App was built before `.env` existed — restart the bundler |
| OTP not received | Check the SMS provider in Authentication → Providers |
| Tables empty on cloud | Sign in, make an edit, confirm queue drains in the Table Editor |
| RLS errors in logs | The migration wasn't run — check `001_initial.sql` ran in SQL Editor |
