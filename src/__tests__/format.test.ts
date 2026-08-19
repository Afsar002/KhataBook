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
  it('formats "YYYY-MM-DD" as DD/MM/YYYY', () => {
    expect(formatDayMonth('2026-08-11')).toBe('11/08/2026');
  });

  it('returns the raw input when the date is unparseable', () => {
    expect(formatDayMonth('not-a-date')).toBe('not-a-date');
  });
});

describe('formatRangeDate', () => {
  it('formats "YYYY-MM-DD" as DD/MM/YYYY', () => {
    expect(formatRangeDate('2026-08-01')).toBe('01/08/2026');
  });

  it('returns the raw input when the date is unparseable', () => {
    expect(formatRangeDate('garbage')).toBe('garbage');
  });
});

describe('formatLongDate', () => {
  it('formats "YYYY-MM-DD" as DD/MM/YYYY', () => {
    expect(formatLongDate('2026-08-11')).toBe('11/08/2026');
  });

  it('returns the raw input when the date is unparseable', () => {
    expect(formatLongDate('')).toBe('');
  });
});

describe('formatISOToDisplay (existing behavior, regression guard)', () => {
  it('formats "YYYY-MM-DD" as DD/MM/YYYY', () => {
    expect(formatISOToDisplay('2026-08-04')).toBe('04/08/2026');
  });
});

describe('todayISODate', () => {
  it('returns a local YYYY-MM-DD string', () => {
    expect(todayISODate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
