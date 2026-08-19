# DailyKhata Sync Redesign — Complete Architecture

## Goals
- **Zero failed pushes** — every local change uploads reliably
- **Instant cross-device visibility** — Device B sees Device A's changes within 2s
- **No stuck UI** — "Sync Now" never disables incorrectly, status always accurate
- **Observable** — every operation logs structured events for debugging
- **Testable** — pure functions, dependency injection, no module-level mutable state

---

## 1. Core Data Model (unchanged)

Tables: `accounts`, `categories`, `parties`, `transactions`, `transfers`, `party_transactions`, `settings`  
Each row has: `uuid` (PK), `user_id`, `created_at`, `updated_at`, `deleted_at`, `version`, data columns.

RLS: `for all using (user_id = auth.uid())` — already correct.

Realtime publication: all tables in `supabase_realtime` — already in `002_realtime.sql`.

---

## 2. Queue (Local) — `src/db/sync/queue.ts`

**Schema** (SQLite):
```sql
CREATE TABLE sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL,
  record_uuid TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('insert','update','delete')),
  payload TEXT NOT NULL DEFAULT '{}',          -- JSON snapshot for diagnostics
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','failed')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_attempt_at TEXT,
  UNIQUE(table_name, record_uuid)              -- coalesce: one intent per row
);
```

**Operations** (all pure functions, take `db` as first arg):
- `enqueue(db, table, uuid, operation, payload?)` — upserts queue row, emits `queueChanged`
- `getPending(db)` — returns all `pending` + `failed` rows, ordered by `created_at`
- `markDone(db, id)` — deletes row
- `markFailed(db, id, retryCount)` — updates status/retry_count/last_attempt_at
- `clear(db)` — deletes all (on user switch)
- `retryAll(db)` — resets all `failed` → `pending`, emits `queueChanged`
- `countPending(db)`, `countFailed(db)` — for badges

**No module-level state**. Event bus is a separate module (`sync/events.ts`).

---

## 3. Push — `src/services/sync/push.ts`

```ts
interface PushResult { pushed: number; deleted: number; failed: number; authError: boolean; errors: PushError[]; }
interface PushError { table: string; uuid: string; operation: string; code?: string; message: string; }

async function pushPending(supabase: SupabaseClient, userId: string): Promise<PushResult>
```

**Algorithm**:
1. Load pending queue (parents first: accounts → categories → parties → transactions → transfers → party_transactions → settings)
2. For each entry:
   - **Delete**: `UPDATE table SET deleted_at=now(), updated_at=now() WHERE id=uuid`
   - **Insert/Update**: read live local row via `tables.readRowForPush(table, uuid)`, merge `user_id`, upsert on `id`
   - On success: `markDone`
   - On auth error (401/JWT): stop, return `authError=true`
   - On other error: `markFailed`, collect error, **continue** (don't stop the batch)
3. Return summary + all errors

**Key fixes vs current**:
- Never stops on non-auth errors — processes entire queue
- Returns structured errors for UI toast/log
- Parents-first ordering respects FKs
- Uses `readRowForPush` which already maps FKs to uuids

---

## 4. Pull — `src/services/sync/pull.ts`

```ts
interface PullResult { inserted: number; updated: number; deleted: number; skipped: number; conflicts: number; errors: PullError[]; }
interface PullError { table: string; uuid: string; message: string; }

async function pullRemote(supabase: SupabaseClient, userId: string): Promise<PullResult>
```

**Algorithm** (per table, parents first):
1. Get cursor: `last_pulled_<table>` from `sync_meta`
2. Query: `supabase.from(table).select('*').gt('updated_at', cursor).order('updated_at')`
3. Load `uuid→local_id` map for all FK target tables
4. For each remote row:
   - **Tombstone** (`deleted_at`): if local exists → hard delete, count `deleted`; if local was queued → `conflicts++`
   - **Live row**: compare `remote.updated_at` vs `local.updated_at`
     - Remote newer → apply (insert or update), count `inserted`/`updated`
     - Local newer/equal → `skipped++` (LWW)
     - Local queued → `conflicts++`, log conflict record
   - Advance cursor to max `updated_at` seen
5. Save cursor per table
6. Return summary

**Key fixes vs current**:
- Never throws on partial failure — collects errors, continues
- Structured conflict logging (already exists, keep)
- Cursor advances per-table only after full batch succeeds

---

## 5. Realtime — `src/services/sync/realtime.ts`

```ts
type RealtimeMode = 'off' | 'connecting' | 'live' | 'degraded';

interface RealtimeController {
  start(): Promise<void>;
  stop(): Promise<void>;
  onModeChange(listener: (mode: RealtimeMode) => void): () => void;
  getMode(): RealtimeMode;
}
```

**Behavior**:
- Single channel `dailykhata-sync` with 7 `postgres_changes` filters (one per table)
- On `SUBSCRIBED` → mode = `live`
- On `CHANNEL_ERROR` / `TIMED_OUT` / `CLOSED` → mode = `degraded`, **schedule reconnect with backoff**
- On reconnect success → mode = `live`
- Emits `remoteWake` event on any `postgres_changes` payload
- **No module-level mutable state** — channel ref held in closure, exposed via controller object

**Reconnect backoff**: 2s, 4s, 8s, 16s, 30s (cap). Reset on `live`.

---

## 6. Sync Engine — `src/services/sync/engine.ts`

```ts
type SyncSource = 'manual' | 'auto' | 'realtime' | 'retry' | 'foreground';

interface SyncEngine {
  init(): Promise<void>;
  syncNow(source?: SyncSource): Promise<SyncResult>;
  onStatusChange(listener: (status: SyncStatus) => void): () => void;
  onResult(listener: (result: SyncResult) => void): () => void;
  getStatus(): SyncStatus;
  getLastResult(): SyncResult | null;
  setAutoSync(enabled: boolean): Promise<void>;
  setWifiOnly(enabled: boolean): Promise<void>;
  setInterval(minutes: number): Promise<void>;
}

interface SyncStatus {
  state: 'unconfigured' | 'idle' | 'syncing' | 'offline' | 'error' | 'version_blocked';
  lastSyncAt: string | null;
  realtimeMode: RealtimeMode;
  autoSync: boolean;
  wifiOnly: boolean;
  intervalMinutes: number;
  pendingCount: number;
  failedCount: number;
}

interface SyncResult {
  pushed: number;
  deleted: number;
  pulled: number;
  inserted: number;
  updated: number;
  failed: number;
  conflicts: number;
  errors: (PushError | PullError)[];
  durationMs: number;
  source: SyncSource;
}
```

**Single source of truth** — no duplicate state in React context. React context just subscribes.

**Flow for `syncNow(source)`**:
```
if (running) return lastResult;           // re-entrant guard
running = true;
emitStatus({ ...status, state: 'syncing' });

try {
  if (!configured || !session) return emitStatus(idle);

  if (source === 'auto' && !autoSync) return emitStatus(idle);
  if (source === 'auto' && wifiOnly && !onWifi) return emitStatus(idle);

  const pushResult = await pushPending(supabase, userId);
  if (pushResult.authError) return emitStatus(idle);

  const pullResult = await pullRemote(supabase, userId);

  const result = merge(pushResult, pullResult, source);
  lastResult = result;
  lastSyncAt = now();
  if (pushResult.failed === 0) lastSuccessAt = now();
  emitStatus(idle);
  emitResult(result);
  return result;
} catch (e) {
  emitStatus(error);
  if (source === 'auto' && autoSync) scheduleRetry();
  if (source === 'manual') throw e;
} finally {
  running = false;
}
```

**Auto-sync triggers**:
- `queueChanged` → debounced `syncNow('auto')` (1.5s)
- `remoteWake` → debounced `syncNow('realtime')` (1.5s)
- App foreground → `syncNow('foreground')`
- Periodic timer (if `intervalMinutes > 0`) → `syncNow('auto')`
- Retry timer → `syncNow('retry')`

**No manual/auto gate on Wi-Fi** — Wi-Fi only affects `auto`/`realtime`/`foreground`/`retry`. `manual` always runs.

---

## 7. React Context — `src/context/sync-context.tsx`

Thin subscriber:
```tsx
function SyncProvider({ children }) {
  const [status, setStatus] = useState(() => engine.getStatus());
  const [lastResult, setLastResult] = useState(() => engine.getLastResult());

  useEffect(() => {
    const unsubStatus = engine.onStatusChange(setStatus);
    const unsubResult = engine.onResult(setLastResult);
    return () => { unsubStatus(); unsubResult(); };
  }, []);

  return <SyncContext.Provider value={{ ...status, syncNow: engine.syncNow, setAutoSync: engine.setAutoSync, ... }}>
```

**Button disabled only when** `status.state === 'syncing'`.

---

## 8. Event Bus — `src/services/sync/events.ts`

```ts
type Listener = () => void;
const queueListeners: Listener[] = [];
const remoteListeners: Listener[] = [];

export const onQueueChange = (l: Listener) => { queueListeners.push(l); return () => remove(queueListeners, l); };
export const emitQueueChange = () => queueListeners.forEach(l => l());

export const onRemoteWake = (l: Listener) => { remoteListeners.push(l); return () => remove(remoteListeners, l); };
export const emitRemoteWake = () => remoteListeners.forEach(l => l());
```

---

## 9. Migration Plan

### Phase 1: Core (queue, push, pull, events)
- New files: `queue.ts`, `push.ts`, `pull.ts`, `events.ts`
- Keep existing `tables.ts` (readRowForPush, SYNC_TABLES)
- Tests for each module

### Phase 2: Realtime
- New `realtime.ts` with controller pattern, reconnect backoff
- Integration test with mock channel

### Phase 3: Engine
- New `engine.ts` orchestrating push+pull+realtime+triggers
- Status/result event emission
- Periodic/retry timers

### Phase 4: React Integration
- New `sync-context.tsx` subscribing to engine
- Update `settings.tsx` CloudSyncCard to use new status shape
- Remove old `sync-engine.ts`, old `realtime.ts`, old `events.ts`

### Phase 5: Cleanup
- Delete old files
- Run full test suite
- Verify on device

---

## 10. Testing Strategy

- **Unit**: each module with mocked Supabase client + SQLite
- **Integration**: engine with real Supabase local (supabase start) + test DB
- **E2E**: two emulator devices, create on A → verify B sees it
- **Chaos**: kill network mid-sync, verify queue recovers; sign out/in mid-sync

---

## 11. Rollback Safety

- New code lives alongside old until Phase 4 switch
- Feature flag `useNewSync` in `sync-meta` (default false)
- `SyncProvider` reads flag, instantiates old or new engine
- Can flip per-user via settings for gradual rollout

---

## 12. Files to Create/Modify

| File | Action |
|---|---|
| `src/db/sync/queue.ts` | New (replace queue-repo.ts) |
| `src/services/sync/events.ts` | New (replace events.ts) |
| `src/services/sync/push.ts` | New (replace push.ts) |
| `src/services/sync/pull.ts` | New (replace pull.ts) |
| `src/services/sync/realtime.ts` | New (replace realtime.ts) |
| `src/services/sync/engine.ts` | New (replace sync-engine.ts) |
| `src/context/sync-context.tsx` | Rewrite |
| `src/app/(tabs)/settings.tsx` | Update CloudSyncCard |
| `src/__tests__/sync-*.test.tsx` | New test suite |
| `src/db/sync/queue-repo.ts` | Delete after Phase 4 |
| `src/services/sync/sync-engine.ts` | Delete after Phase 4 |
| `src/services/sync/realtime.ts` (old) | Delete after Phase 4 |
| `src/services/sync/events.ts` (old) | Delete after Phase 4 |

---

## 13. Acceptance Criteria

1. Create transaction on Device A → Device B shows it within 3s (realtime) or on next foreground (trigger)
2. "Sync Now" on Device B **always enabled** unless a sync is actively running
3. Zero failed pushes after 100 sequential edits (network on)
4. Network off → 50 edits → network on → "Sync Now" → all 50 upload, pull works
5. Sign out → sign in as different user → queue cleared, fresh pull
6. Console shows structured logs for every push/pull/realtime event
7. All existing tests pass + new tests cover failure modes