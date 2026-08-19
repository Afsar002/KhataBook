/**
 * Recurring transaction templates repository.
 *
 * Templates generate entries automatically on a schedule (daily/weekly/monthly).
 * Local-only table (never synced) — generated entries are synced individually.
 */
import { getDatabase, nowIso } from '@/db/database';
import { getCurrentUserId } from '@/services/supabase/auth';
import { emitRemoteWake } from '@/services/sync/events';
import { uuid } from '@/utils/uuid';
import type { SQLiteBindValue } from 'expo-sqlite';
import type {
  RecurringTemplate,
  NewRecurringTemplate,
  RecurringFrequency,
  RecurringTemplateType,
  PartyDirection,
  TransactionType,
} from '@/types';

/** Convert snake_case row to camelCase RecurringTemplate. */
function mapRow(row: Record<string, unknown>): RecurringTemplate {
  return {
    id: row.id as number,
    uuid: row.uuid as string,
    templateType: row.template_type as RecurringTemplateType,
    type: row.type as TransactionType | undefined,
    amount: row.amount as number,
    accountId: row.account_id as number | null | undefined,
    categoryId: row.category_id as number | null | undefined,
    note: row.note as string,
    partyId: row.party_id as number | null | undefined,
    direction: row.direction as PartyDirection | undefined,
    frequency: row.frequency as RecurringFrequency,
    dayOfWeek: row.day_of_week as number | null | undefined,
    dayOfMonth: row.day_of_month as number | null | undefined,
    startDate: row.start_date as string,
    endDate: row.end_date as string | null | undefined,
    lastGeneratedDate: row.last_generated_date as string | null | undefined,
    isActive: (row.is_active as number) === 1,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function addRecurringTemplate(
  template: NewRecurringTemplate
): Promise<number> {
  const db = getDatabase();
  const recordUuid = uuid();
  const now = nowIso();
  const userId = getCurrentUserId();

  const result = await db.runAsync(
    `INSERT INTO recurring_templates (
      uuid, user_id, template_type, type, amount, account_id, category_id, note,
      party_id, direction, frequency, day_of_week, day_of_month,
      start_date, end_date, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    recordUuid,
    userId,
    template.templateType,
    template.type ?? null,
    template.amount,
    template.accountId ?? null,
    template.categoryId ?? null,
    template.note,
    template.partyId ?? null,
    template.direction ?? null,
    template.frequency,
    template.dayOfWeek ?? null,
    template.dayOfMonth ?? null,
    template.startDate,
    template.endDate ?? null,
    1,
    now,
    now
  );

  emitRemoteWake();
  return result.lastInsertRowId;
}

export async function updateRecurringTemplate(
  id: number,
  input: Partial<NewRecurringTemplate> & { isActive?: boolean }
): Promise<void> {
  const db = getDatabase();
  const now = nowIso();

  // Build dynamic update query
  const fields: string[] = ['updated_at = ?'];
  const values: SQLiteBindValue[] = [now];

  const fieldMap: Record<string, string> = {
    templateType: 'template_type',
    type: 'type',
    amount: 'amount',
    accountId: 'account_id',
    categoryId: 'category_id',
    note: 'note',
    partyId: 'party_id',
    direction: 'direction',
    frequency: 'frequency',
    dayOfWeek: 'day_of_week',
    dayOfMonth: 'day_of_month',
    startDate: 'start_date',
    endDate: 'end_date',
    isActive: 'is_active',
  };

  for (const [key, value] of Object.entries(input)) {
    if (key in fieldMap) {
      fields.push(`${fieldMap[key]} = ?`);
      if (key === 'isActive') {
        values.push(value ? 1 : 0);
      } else {
        values.push(value ?? null);
      }
    }
  }

  if (fields.length === 1) {
    return; // nothing to update
  }

  values.push(id);

  await db.runAsync(
    `UPDATE recurring_templates SET ${fields.join(', ')} WHERE id = ?`,
    ...values
  );
  emitRemoteWake();
}

export async function deleteRecurringTemplate(id: number): Promise<void> {
  const db = getDatabase();
  await db.runAsync('DELETE FROM recurring_templates WHERE id = ?', id);
  emitRemoteWake();
}

export async function getRecurringTemplate(id: number): Promise<RecurringTemplate | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM recurring_templates WHERE id = ?',
    id
  );
  return row ? mapRow(row) : null;
}

export async function getRecurringTemplateByUuid(uuid: string): Promise<RecurringTemplate | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM recurring_templates WHERE uuid = ?',
    uuid
  );
  return row ? mapRow(row) : null;
}

export async function listRecurringTemplates(
  activeOnly = true
): Promise<RecurringTemplate[]> {
  const db = getDatabase();
  let query = 'SELECT * FROM recurring_templates';
  if (activeOnly) {
    query += ' WHERE is_active = 1';
  }
  query += ' ORDER BY template_type, created_at DESC';
  const rows = await db.getAllAsync<Record<string, unknown>>(query);
  return rows.map(mapRow);
}

export async function listActiveRecurringTemplatesForDate(
  date: string // YYYY-MM-DD
): Promise<RecurringTemplate[]> {
  const db = getDatabase();
  // SQLite: strftime('%w', date) returns 0-6 (0=Sunday), strftime('%d', date) returns 01-31
  const dayOfWeek = `CAST(strftime('%w', ?) AS INTEGER)`;
  const dayOfMonth = `CAST(strftime('%d', ?) AS INTEGER)`;

  const rows = await db.getAllAsync<Record<string, unknown>>(
    `
    SELECT * FROM recurring_templates
    WHERE is_active = 1
      AND date(start_date) <= date(?)
      AND (end_date IS NULL OR date(end_date) >= date(?))
      AND (
        (frequency = 'daily')
        OR (frequency = 'weekly' AND day_of_week = ${dayOfWeek})
        OR (frequency = 'monthly' AND day_of_month = ${dayOfMonth})
      )
      AND (last_generated_date IS NULL OR date(last_generated_date) < date(?))
    ORDER BY template_type, created_at
    `,
    date,
    date,
    date,
    date
  );
  return rows.map(mapRow);
}

export async function updateLastGeneratedDate(
  id: number,
  date: string
): Promise<void> {
  const db = getDatabase();
  await db.runAsync(
    'UPDATE recurring_templates SET last_generated_date = ?, updated_at = ? WHERE id = ?',
    date,
    nowIso(),
    id
  );
}