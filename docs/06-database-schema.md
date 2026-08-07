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

Transactions: income | expense per account (account_id).

Transfers: from_account_id → to_account_id (both reference accounts), amount
(>= 0), note, date, created_at. Balances are derived at query time:
opening_balance + income − expense + transfers-in − transfers-out.

Parties (Customers / Suppliers): name, type (customer | supplier), phone,
opening_balance (REAL, default 0), created_at. Khata balance is derived at
query time from opening_balance plus the direction sum:
customer balance = opening_balance + Σ(out) − Σ(in)  (positive → they owe you)
supplier balance = opening_balance + Σ(in) − Σ(out)  (positive → you owe them)