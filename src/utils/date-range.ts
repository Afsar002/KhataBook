/**
 * Quick date-range presets for the transactions report.
 *
 * Shared by the History page's export sheet and the Reports & Export screen so
 * both surfaces offer the same five choices (Today / Yesterday / This Week /
 * This Month / This Year), plus a custom From/To. Bounds are inclusive
 * `YYYY-MM-DD`, matching the ledger feed's `>=` / `<=` date filters.
 */
import { shiftISODate } from '@/utils/format';

export type RangePresetKey = 'today' | 'yesterday' | 'thisWeek' | 'thisMonth' | 'thisYear';

export interface RangePreset {
  key: RangePresetKey;
  label: string;
  from: string;
  to: string;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

/**
 * The five quick ranges, all ending today (or the given `now`, which makes the
 * function deterministic for tests). The week starts on Monday.
 */
export function rangePresets(now = new Date()): RangePreset[] {
  const today = toISODate(now);
  // Days since Monday of the current week (Sunday = 6 days ago … Monday = today).
  const monday = toISODate(addDays(now, -((now.getDay() + 6) % 7)));
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const year = `${now.getFullYear()}-01-01`;
  return [
    { key: 'today', label: 'Today', from: today, to: today },
    { key: 'yesterday', label: 'Yesterday', from: shiftISODate(today, -1), to: shiftISODate(today, -1) },
    { key: 'thisWeek', label: 'This Week', from: monday, to: today },
    { key: 'thisMonth', label: 'This Month', from: month, to: today },
    { key: 'thisYear', label: 'This Year', from: year, to: today },
  ];
}
