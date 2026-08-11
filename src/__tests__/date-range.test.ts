/**
 * `rangePresets` bound computation — every preset ends today, and the start
 * rolls back to the Monday of the week / the 1st of the month / Jan 1st.
 * A fixed clock keeps the expected bounds deterministic.
 */
import { rangePresets } from '@/utils/date-range';

/** 2026-08-07 is a Friday. */
const NOW = new Date(2026, 7, 7);

function byKey(now: Date) {
  return Object.fromEntries(rangePresets(now).map((p) => [p.key, p]));
}

describe('rangePresets', () => {
  it('Today and Yesterday are single days around the given date', () => {
    const p = byKey(NOW);
    expect(p.today).toMatchObject({ from: '2026-08-07', to: '2026-08-07' });
    expect(p.yesterday).toMatchObject({ from: '2026-08-06', to: '2026-08-06' });
  });

  it('This Week starts on the Monday of the current week', () => {
    expect(byKey(NOW).thisWeek).toMatchObject({ from: '2026-08-03', to: '2026-08-07' });
  });

  it('This Month starts on the 1st of the current month', () => {
    expect(byKey(NOW).thisMonth).toMatchObject({ from: '2026-08-01', to: '2026-08-07' });
  });

  it('This Year starts on January 1st', () => {
    expect(byKey(NOW).thisYear).toMatchObject({ from: '2026-01-01', to: '2026-08-07' });
  });

  it('every preset ends today (except yesterday) and never starts after it ends', () => {
    for (const p of rangePresets(NOW)) {
      if (p.key === 'yesterday') {
        expect(p.to).toBe('2026-08-06');
      } else {
        expect(p.to).toBe('2026-08-07');
      }
      expect(p.from <= p.to).toBe(true);
    }
  });

  it('collapses to a single day when the date is a Monday', () => {
    const monday = new Date(2026, 7, 3);
    expect(byKey(monday).thisWeek).toMatchObject({ from: '2026-08-03', to: '2026-08-03' });
  });

  it('collapses to a single day on January 1st', () => {
    const jan1 = new Date(2026, 0, 1);
    expect(byKey(jan1).thisYear).toMatchObject({ from: '2026-01-01', to: '2026-01-01' });
  });
});
