Users

Accounts

Transactions

Transfers

Categories

Customers

Suppliers

Banks

Settings

Backups

## Schema notes

Accounts: id, name, type (cash | bank | wallet), opening_balance (REAL, default 0),
sort_order, created_at. Type has no CHECK constraint so new account kinds (credit
card, loan, investment) can be added later without a migration.

Transactions: income | expense per account (account_id), with type, amount,
note, date, time, kind (normal | opening). `time` is the entry's `HH:MM`
(24-hour local) auto-recorded at insert; opening-balance entries carry ''.

Transfers: from_account_id → to_account_id (both reference accounts), amount
(>= 0), note, date, time, created_at. Balances are derived at query time:
opening_balance + income − expense + transfers-in − transfers-out.

Parties (Customers / Suppliers): name, type (customer | supplier), phone,
opening_balance (REAL, default 0), created_at. Khata balance is derived at
query time from opening_balance plus the direction sum:
customer balance = opening_balance + Σ(out) − Σ(in)  (positive → they owe you)
supplier balance = opening_balance + Σ(in) − Σ(out)  (positive → you owe them)
Party ledger entries (party_transactions): party_id, direction (in | out),
amount, note, date, time, kind (normal | opening). Opening entries have
time = '' (a balance "before the book" has no time of day).

## Sync tables

- `sync_queue` — one row per pending change, coalesced by (table_name,
  record_uuid). Operations: insert | update | delete. Failed ops are parked and
  manually retried.
- `sync_meta` — device-local key/value store (pull cursors, last sync, current
  user id, auto-sync / Wi-Fi-only / sync-interval preferences). Never synced.
- `sync_history` — human-readable log of sync runs and conflicts.
- `sync_conflicts` — captured last-write-wins conflicts (both sides snapshotted)
  for the review screen. Device-local.
- `sync_devices` — devices that have synced, for the "Synced Devices" list.
- `audit_log` — append-only trail of every syncable mutation (table,
  operation, record_uuid, user_id, payload, created_at). Written alongside the
  queue; never coalesced; purged after 90 days on boot. See
  [16-security.md](16-security.md).
- `cash_counts` — daily cash-book reconciliation ("actual cash in hand").