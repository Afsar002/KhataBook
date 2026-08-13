/**
 * Formatting helpers used across the app (Indian rupee grouping, dates).
 */

/**
 * Android's `en-IN` locale (ICU) emits U+202F (narrow no-break space) inside
 * formatted dates/times, e.g. "04 Aug 2026, 4:30 PM". That character is not
 * part of WinAnsi/Latin-1, so pdf-lib's built-in fonts crash on it with
 * "WinAnsi cannot encode … 0x202f". Normalize it (and the regular no-break
 * space) to a plain space so downstream exporters never see it.
 */
function normalizeSpaces(value: string): string {
  return value.replace(/[\u202F\u00A0]/g, ' ');
}

/** Formats a number as Indian rupees with lakh/crore grouping, e.g. ₹1,23,456. */
export function formatINR(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const digits = String(Math.round(Math.abs(amount)));
  const lastThree = digits.slice(-3);
  let rest = digits.slice(0, -3);
  let out = lastThree;
  while (rest.length > 0) {
    const chunk = rest.length >= 2 ? rest.slice(-2) : rest;
    out = chunk + ',' + out;
    rest = rest.slice(0, -2);
  }
  return `${sign}₹${out}`;
}

/** Returns today's date as `YYYY-MM-DD` (local time). */
export function todayISODate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Current local time as `HH:MM` (24-hour), auto-recorded with new entries.
 * Built manually so it's stable across platforms (no ICU quirks).
 */
export function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * `HH:MM` (24-hour) → "4:30 PM" (12-hour). Returns `''` for empty or invalid
 * input so callers can hide the time suffix. Manual formatting avoids the
 * Android ICU U+202F spacing bug that affects `toLocaleString`.
 */
export function formatTimeOfDay(hhmm: string): string {
  if (!hhmm) {
    return '';
  }
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return '';
  }
  const period = h < 12 ? 'AM' : 'PM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

/** `YYYY-MM-DD` → human label: "Today", "Yesterday", or "Mon, 4 Aug". */
export function formatDateLabel(iso: string): string {
  const today = todayISODate();

  if (iso === today) {
    return 'Today';
  }

  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (iso === toISODate(yesterday)) {
    return 'Yesterday';
  }

  return normalizeSpaces(d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }));
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** `YYYY-MM-DD` shifted by a whole number of days (negative = earlier). */
export function shiftISODate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** `YYYY-MM` for a year and 0-indexed month. */
export function monthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

/**
 * Half-open `[start, end)` ISO-date bounds for a `YYYY-MM` month. Using a
 * range predicate lets SQLite hit the date index, unlike `substr(date,1,7)`.
 */
export function monthBounds(yearMonth: string): { start: string; end: string } {
  const [year, month] = yearMonth.split('-').map(Number);
  return {
    start: toISODate(new Date(year, month - 1, 1)),
    // month is 0-indexed; month = 12 rolls over to January of the next year.
    end: toISODate(new Date(year, month, 1)),
  };
}

/** Human label like "August 2026" for a year and 0-indexed month. */
export function monthLabel(year: number, month: number): string {
  return normalizeSpaces(
    new Date(year, month, 1).toLocaleDateString('en-IN', {
      month: 'long',
      year: 'numeric',
    })
  );
}

/** Parse ISO date string (YYYY-MM-DD) to Date object (local midnight). */
export function parseISODate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** Format ISO date string (YYYY-MM-DD) to display format "DD/MM/YYYY" (e.g., "04/08/2026"). */
export function formatISOToDisplay(iso: string): string {
  const d = parseISODate(iso);
  if (Number.isNaN(d.getTime())) {
    return iso || '—';
  }
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/** `YYYY-MM-DD` → "DD/MM/YYYY" (e.g., "04/08/2026"). */
export function formatDayMonth(iso: string): string {
  const d = parseISODate(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/** `YYYY-MM-DD` → "DD/MM/YYYY" (e.g., "04/08/2026"). */
export function formatRangeDate(iso: string): string {
  const d = parseISODate(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/** `YYYY-MM-DD` → "DD/MM/YYYY" (e.g., "04/08/2026"). */
export function formatLongDate(iso: string): string {
  const d = parseISODate(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/** Format an ISO datetime to "DD/MM/YYYY, 4:30 PM" (report "generated" line). */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const period = hours < 12 ? 'AM' : 'PM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${day}/${month}/${year}, ${hour12}:${minutes} ${period}`;
}

/** Human label for a report's date range, e.g. "01 Aug 2026 – 07 Aug 2026". */
export function formatReportRange(from: string, to: string): string {
  if (from && to) {
    return `${formatISOToDisplay(from)} – ${formatISOToDisplay(to)}`;
  }
  if (from) {
    return `From ${formatISOToDisplay(from)}`;
  }
  if (to) {
    return `Up to ${formatISOToDisplay(to)}`;
  }
  return 'All time';
}
