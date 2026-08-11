# Notifications

DailyKhata uses **local notifications** (`expo-notifications`) for two things
that matter most when the app isn't on screen:

- **Recurring due-day reminders** — a template (rent, EMI, salary…) fires a
  "due today" alert at 08:00 on its next due date.
- **Sync-outcome alerts** — a backgrounded sync that hit conflicts, upload
  failures, or pulled new entries from another device gets a notification so
  the user knows to review.

There is **no remote push** (APNs / FCM) and no push-token registration. That
is deliberate: local notifications need no backend, and the data lives
on-device anyway.

## How reminders work

Only the **next occurrence** of each active template is scheduled — not every
future occurrence. When a reminder fires, the next one is scheduled on the
next app boot (or on any template create/edit/delete/toggle). This keeps the
notification roster tiny and never leaves stale schedules behind after an edit.

- Identifier: `recurring-<templateId>` — re-arming under the same id replaces
  the old notification instead of stacking duplicates.
- Due date is computed with the scheduler's real `shouldGenerateForDate`, so
  the reminder and the actual entry generator agree on what "due" means.
- Skipped when the template is inactive, its end date has passed, the 08:00
  window already passed for today, reminders are toggled off, or permission is
  denied.
- Content is informational only ("₹500 expense Rent due today"). The actual
  entry creation stays with the existing background task / scheduler.

## Sync alerts

After a finished sync run (`onSyncResult`), a notification is scheduled only
when:

- sync-updates notifications are toggled on and permission is granted,
- the app is **backgrounded** (foreground runs are already visible in-app),
- it has been ≥ 5 minutes since the last one (cooldown, so the automatic
  retry backoff can't spam).

Priority: conflicts > failed uploads > new entries pulled.

## Toggles & permission

- **Recurring reminders** / **Sync updates** switches live in Settings under
  Notifications. Prefs are stored in AsyncStorage (device-local, like app
  lock) — they never sync across devices.
- Permission is requested **lazily**, the first time a toggle is switched on.
  If denied, the toggle stays off and a toast points at the phone's settings
  screen.
- Android 13+ needs a notification channel; DailyKhata creates
  `dailykhata-reminders` at boot before scheduling.

## Expo Go / development build requirement

Notifications need a **development build** (`npx expo run:android` / EAS) —
they do **not** run in Expo Go. Since SDK 53, importing `expo-notifications`
inside Expo Go on Android throws at module load (the package auto-registers
the device push token as an import side-effect, and that push machinery is
hard-disabled in Expo Go). So DailyKhata never loads the module there:

- `src/services/notifications/expo.ts` lazily `require`s `expo-notifications`
  only when not in Expo Go (`isRunningInExpoGo()`); every notifications module
  no-ops when it isn't available.
- The Settings **Notifications** card is hidden in Expo Go.
- Nothing else changes — the app boots normally without notifications.

On a development build, notifications behave as described above. Tapping one
navigates to the screen it came from: a **recurring reminder** opens the
Recurring templates screen (`/recurring`), and a **sync alert** opens Settings
(`/settings`, Cloud Sync / conflict review).

The target lives in the notification payload as `content.data.url` and is
checked against an explicit allow-list (`src/services/notifications/deeplink.ts`)
— a payload can never send the app anywhere else. `initNotificationNavigation()`
subscribes to taps while the app runs and also handles a cold start (the app
launched by tapping a notification) via `getLastNotificationResponseAsync()`;
both use expo-router's routing queue, so navigation is safe even before the root
layout mounts. Tapping the OS default action (no recognised route) is a no-op.

## Files

- `src/services/notifications/prefs.ts` — AsyncStorage toggles + permission
- `src/services/notifications/reminders.ts` — next-due computation + scheduling
- `src/services/notifications/sync.ts` — sync-outcome notification logic
- `src/services/notifications/deeplink.ts` — tap → route navigation (allow-list)
- `src/services/notifications/index.ts` — `initNotifications()` boot wiring
- `src/components/notifications-card.tsx` — Settings card
- `src/services/sync/events.ts` — `onRecurringChanged` / `onSyncResult`
- `src/app/_layout.tsx` — boot init; `src/app/(tabs)/settings.tsx` — card mount
