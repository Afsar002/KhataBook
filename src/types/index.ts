/**
 * Shared data models for DailyKhata.
 * Mirrors `docs/06-database-schema.md` (accounts, categories, transactions, settings).
 */

export type TransactionType = 'income' | 'expense';
export type AccountType = 'cash' | 'bank' | 'wallet';
export type ThemePreference = 'system' | 'light' | 'dark';

export type PartyType = 'customer' | 'supplier';
/** Money flow direction: 'in' = money/goods came in, 'out' = money went out. */
export type PartyDirection = 'in' | 'out';
export type PartyAction = 'give' | 'receive' | 'take' | 'pay';

export interface Party {
  id: number;
  name: string;
  type: PartyType;
  phone: string;
  /** Balance the khata had before any entries were recorded (start of the book). */
  openingBalance: number;
}

export interface PartyBalance extends Party {
  /** Signed amount. Customers: positive = they owe you. Suppliers: positive = you owe them. */
  balance: number;
}

export type LedgerEntryKind = 'normal' | 'opening';

export interface PartyTransaction {
  id: number;
  partyId: number;
  direction: PartyDirection;
  amount: number;
  note: string;
  date: string;
  createdAt: string;
  /** 'opening' for the immutable Opening Balance entry, 'normal' otherwise. */
  kind: LedgerEntryKind;
}

export interface NewPartyTransaction {
  partyId: number;
  direction: PartyDirection;
  amount: number;
  note: string;
  date: string;
  /** Defaults to 'normal'. Set to 'opening' only via the dedicated workflow. */
  kind?: LedgerEntryKind;
}

export interface Account {
  id: number;
  name: string;
  type: AccountType;
  /** Balance the account had before entries were recorded. */
  openingBalance: number;
  sortOrder: number;
}

export interface Category {
  id: number;
  name: string;
  type: TransactionType;
  icon: string;
  sortOrder: number;
}

export interface Transaction {
  id: number;
  type: TransactionType;
  amount: number;
  accountId: number;
  categoryId: number | null;
  note: string;
  /** ISO date string `YYYY-MM-DD`. */
  date: string;
  createdAt: string;
  /** 'opening' for the immutable Opening Balance entry, 'normal' otherwise. */
  kind: LedgerEntryKind;
}

/** Transaction joined with its account and category for list rendering. */
export interface TransactionRow extends Transaction {
  accountName: string;
  accountType: AccountType;
  categoryName: string | null;
  categoryIcon: string | null;
}

export interface NewTransaction {
  type: TransactionType;
  amount: number;
  accountId: number;
  categoryId: number | null;
  note: string;
  date: string;
  /** Defaults to 'normal'. Set to 'opening' only via the dedicated workflow. */
  kind?: LedgerEntryKind;
}

export interface AccountBalance extends Account {
  /** Running balance: opening + income - expense + transfers in - transfers out. */
  balance: number;
}

/** Money moved from one account to another (no effect on total money). */
export interface Transfer {
  id: number;
  fromAccountId: number;
  toAccountId: number;
  amount: number;
  note: string;
  date: string;
  createdAt: string;
}

export interface NewTransfer {
  fromAccountId: number;
  toAccountId: number;
  amount: number;
  note: string;
  date: string;
}

/** Transfer joined with both account names for list rendering. */
export interface TransferRow extends Transfer {
  fromAccountName: string;
  fromAccountType: AccountType;
  toAccountName: string;
  toAccountType: AccountType;
}

export type LedgerKind = TransactionType | 'transfer' | 'opening';

/** A combined feed entry: an income/expense transaction or a transfer. */
export interface LedgerRow {
  /** Unique key (source table row id — distinct namespaces per kind). */
  id: number;
  kind: LedgerKind;
  amount: number;
  note: string;
  date: string;
  createdAt: string;
  /** income/expense fields. */
  accountId: number | null;
  accountName: string | null;
  categoryId: number | null;
  categoryName: string | null;
  categoryIcon: string | null;
  /** transfer fields. */
  fromAccountId: number | null;
  fromAccountName: string | null;
  toAccountId: number | null;
  toAccountName: string | null;
  /** 'opening' when this is an Opening Balance entry. */
  entryKind: LedgerEntryKind;
}

export interface DaySummary {
  income: number;
  expense: number;
}

/** Per-category total for a report. */
export interface CategoryTotal {
  name: string;
  icon: string | null;
  total: number;
  type: TransactionType;
}

/**
 * A day's cash position (all `type = 'cash'` accounts combined).
 * `closing` is the book's expected cash in hand at the end of the day.
 */
export interface CashBook {
  /** Date (`YYYY-MM-DD`) the entry is for. */
  date: string;
  /** Cash balance at the start of the day. */
  opening: number;
  /** Cash received that day (income on cash accounts). */
  income: number;
  /** Cash spent that day (expense on cash accounts). */
  expense: number;
  /** Cash moved into a cash account from another account that day. */
  transferIn: number;
  /** Cash moved out of a cash account to another account that day. */
  transferOut: number;
  /** opening + income - expense + transferIn - transferOut. */
  closing: number;
  /** Counted cash in hand entered by the user (0 = not counted yet). */
  actual: number;
}

/** Money given on credit / received in a period (khata flows). */
export interface PartyTotals {
  /** Σ of 'out' party transactions (money given). */
  given: number;
  /** Σ of 'in' party transactions (money received). */
  received: number;
}

export interface MonthReport {
  /** income / expense totals for the month. */
  summary: DaySummary;
  /** Per-category expense totals, largest first. */
  expenses: CategoryTotal[];
  /** Per-category income totals, largest first. */
  incomes: CategoryTotal[];
  /** Khata money given / received for the month. */
  party: PartyTotals;
}

/** Khata headline figures for the summary cards. */
export interface KhataSummary {
  /** Money people owe you (Σ positive customer balances). */
  receivable: number;
  /** Money you owe (Σ positive supplier balances). */
  payable: number;
  /** receivable - payable. */
  net: number;
}

/* ------------------------------- Cloud sync ------------------------------- */

/** A single operation in the local sync queue. */
export type SyncOperation = 'insert' | 'update' | 'delete';

export type SyncQueueStatus = 'pending' | 'failed';

/** One queued change waiting to be uploaded. */
export interface SyncQueueEntry {
  id: number;
  operation: SyncOperation;
  tableName: string;
  /** The cloud id (`uuid`) of the affected record. */
  recordUuid: string;
  /** JSON snapshot of the row for diagnostics. */
  payload: string;
  status: SyncQueueStatus;
  retryCount: number;
  createdAt: string;
}

/** One entry in the local sync history log (sync runs + conflicts). */
export interface SyncHistoryEntry {
  id: number;
  eventType: 'info' | 'conflict';
  message: string;
  createdAt: string;
}

/**
 * A captured sync conflict: a newer cloud row overwrote a local change that
 * hadn't uploaded yet. Both sides are snapshotted so the user can review and,
 * if they prefer, restore their own version. Local-only, never synced.
 */
export interface SyncConflict {
  id: number;
  tableName: string;
  recordUuid: string;
  message: string;
  /** JSON snapshot of the local row at conflict time (null for tombstone conflicts). */
  localJson: string | null;
  /** JSON snapshot of the remote row at conflict time (null for tombstone conflicts). */
  remoteJson: string | null;
  resolved: boolean;
  createdAt: string;
}


/** A device that has successfully synced. */
export interface SyncDevice {
  id: number;
  deviceName: string;
  lastSyncAt: string;
  firstSeenAt: string;
}

/**
 * Live multi-device sync mode.
 * - `live`: realtime channel subscribed — remote edits arrive in seconds
 * - `trigger`: channel down / migration missing — sync only on manual/auto runs
 * - `off`: realtime not active (signed out or cloud sync unconfigured)
 */
export type RealtimeMode = 'live' | 'trigger' | 'off';

/** High-level sync state surfaced in the UI. */
export type SyncStatus =
  | 'unconfigured' // Supabase not set up — cloud features hidden
  | 'offline' // no internet connection
  | 'syncing' // an upload/download is running
  | 'idle' // up to date (or nothing pending)
  | 'error' // last sync run failed
  | 'version_blocked'; // app version < min_version from app_meta

/* ----------------------------- Recurring Templates ----------------------------- */

export type RecurringFrequency = 'daily' | 'weekly' | 'monthly';

export type RecurringTemplateType = 'transaction' | 'party_transaction';

export interface RecurringTemplate {
  id: number;
  uuid: string;
  templateType: RecurringTemplateType;
  // For regular transactions
  type?: TransactionType; // required for templateType = 'transaction'
  amount: number;
  accountId?: number | null; // required for templateType = 'transaction'
  categoryId?: number | null;
  note: string;
  // For party transactions
  partyId?: number | null; // required for templateType = 'party_transaction'
  direction?: PartyDirection; // required for templateType = 'party_transaction'
  // Schedule
  frequency: RecurringFrequency;
  dayOfWeek?: number | null; // 0 = Sunday, for weekly
  dayOfMonth?: number | null; // for monthly
  // Date range
  startDate: string; // YYYY-MM-DD
  endDate?: string | null; // YYYY-MM-DD, null = no end
  // Tracking
  lastGeneratedDate?: string | null; // YYYY-MM-DD of last generated entry
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NewRecurringTemplate {
  templateType: RecurringTemplateType;
  // For regular transactions
  type?: TransactionType;
  amount: number;
  accountId?: number | null;
  categoryId?: number | null;
  note: string;
  // For party transactions
  partyId?: number | null;
  direction?: PartyDirection;
  // Schedule
  frequency: RecurringFrequency;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  // Date range
  startDate: string;
  endDate?: string | null;
}

