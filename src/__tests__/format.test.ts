/**
 * Date-label helpers for the Cashbook / Deposit & Withdraw Report screens.
 * All three fall back to the raw input when the ISO string is unparseable, so
 * a bad stored date degrades to showing the value rather than crashing.
 */
import {
  formatDayMonth,
  formatISOToDisplay,
  formatLongDate,
  formatRangeDate,
  todayISODate,
} from '@/utils/format';

describe('formatDayMonth', () => {
  it('formats "YYYY-MM-DD" as day + short month ("11 Aug")', () => {
    expect(formatDayMonth('2026-08-11')).toMatch(/11\s+Aug/);
  });

  it('drops the year', () => {
    expect(formatDayMonth('2026-08-11')).not.toMatch(/2026/);
  });

  it('returns the raw input when the date is unparseable', () => {
    expect(formatDayMonth('not-a-date')).toBe('not-a-date');
  });
});

describe('formatRangeDate', () => {
  it('includes weekday and 2-digit year ("Sat, 01 Aug 26")', () => {
    expect(formatRangeDate('2026-08-01')).toMatch(/Sat/);
    // Node ICU renders a comma before the 2-digit year: "Sat, 01 Aug, 26".
    expect(formatRangeDate('2026-08-01')).toMatch(/01\s+Aug,?\s+26/);
  });

  it('returns the raw input when the date is unparseable', () => {
    expect(formatRangeDate('garbage')).toBe('garbage');
  });
});

describe('formatLongDate', () => {
  it('formats as day + month + full year ("11 Aug 2026")', () => {
    expect(formatLongDate('2026-08-11')).toMatch(/11\s+Aug\s+2026/);
  });

  it('returns the raw input when the date is unparseable', () => {
    expect(formatLongDate('')).toBe('');
  });
});

describe('formatISOToDisplay (existing behavior, regression guard)', () => {
  it('formats "YYYY-MM-DD" with 2-digit day and full year', () => {
    expect(formatISOToDisplay('2026-08-04')).toMatch(/04\s+Aug\s+2026/);
  });
});

describe('todayISODate', () => {
  it('returns a local YYYY-MM-DD string', () => {
    expect(todayISODate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
