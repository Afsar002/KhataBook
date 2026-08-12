/**
 * PDF exporters for DailyKhata (pdf-lib).
 *
 * Four documents, all A4 portrait and print/WhatsApp-friendly:
 *   - `buildMonthlyReportPdf`   — monthly income / expense / profit summary
 *   - `buildStatementReportPdf` — Khatabook-style customer/supplier statement
 *   - `buildCombinedPdf`        — monthly report + one statement per party
 *   - `buildTransactionsPdf`    — filtered transaction list with summary
 *
 * Typography: the app's bundled Inter font is embedded so amounts render with a
 * real Indian Rupee glyph (₹1,23,456). The TTF bytes live in
 * `@expo-google-fonts/inter` and are loaded by `pdf-fonts.ts`; when they are
 * unavailable the builders fall back to pdf-lib's built-in Helvetica and
 * "Rs. 1,23,456". Both paths produce identical layouts.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

import { listPartyTransactionsAsc } from '@/db/party-repo';
import type { LedgerRow, MonthReport, Party, PartyBalance, PartyTransaction, PartyType } from '@/types';
import {
  formatDateTime,
  formatINR,
  formatISOToDisplay,
  formatReportRange,
  monthLabel,
} from '@/utils/format';
import { isPartyReceivable } from '@/utils/balance';
import {
  computeStatementReport,
  type StatementInclude,
  type StatementReport,
} from '@/utils/statement';
import { getPdfFontBytes } from '@/utils/pdf-fonts';

/* ---------------------------------------------------------------------------
 * Document geometry & palette
 * ------------------------------------------------------------------------- */

const PAGE_W = 595.28; // A4 portrait (points)
const PAGE_H = 841.89;
const MARGIN = 44;
const CONTENT_W = PAGE_W - MARGIN * 2;
const TOP = PAGE_H - MARGIN;
const BOTTOM = 54; // content stops here; footers sit at y = 30

/** Converts a "#RRGGBB" hex color to a pdf-lib RGB color. */
function hex(color: string): ReturnType<typeof rgb> {
  const value = parseInt(color.slice(1), 16);
  return rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
}

const BRAND = hex('#16A34A'); // app primary green
const DARK = hex('#1F2937'); // near-black body text
const GRAY = hex('#6B7280'); // secondary text
const MUTED = hex('#9CA3AF'); // placeholder / dashes
const LIGHT = hex('#F3F6F3'); // zebra rows, panels
const BORDER = hex('#DCE3DC'); // hairline rules
const RED = hex('#DC2626');
const WHITE = hex('#FFFFFF');

/** Glyphs outside Latin-1 that WinAnsi (Helvetica) can still encode. */
const WINANSI_EXTRA = new Set([
  0x2013, 0x2014, 0x2018, 0x2019, 0x201a, 0x201b, 0x201c, 0x201d, 0x201e, 0x201f,
  0x2020, 0x2021, 0x2022, 0x2026, 0x2030, 0x2039, 0x203a, 0x20ac, 0x2122,
  0x0152, 0x0153, 0x0160, 0x0161, 0x0178, 0x017d, 0x017e, 0x0192,
]);

/* ---------------------------------------------------------------------------
 * Glyph-aware text handling
 * ------------------------------------------------------------------------- */

const charsets = new WeakMap<PDFFont, Set<number> | null>();

function charsetOf(font: PDFFont): Set<number> | null {
  let set = charsets.get(font);
  if (set === undefined) {
    try {
      const chars = (font as unknown as { getCharacterSet?: () => number[] }).getCharacterSet?.();
      set = Array.isArray(chars) ? new Set(chars) : null;
    } catch {
      set = null;
    }
    charsets.set(font, set);
  }
  return set;
}

/**
 * Keeps only characters a given font can actually render, so `doc.save()` never
 * throws ("WinAnsi cannot encode…") and no tofu boxes appear in the output.
 * Embedded fonts use their real charset; Helvetica uses Latin-1 + WinAnsi
 * punctuation. A narrow no-break space (U+202F) from the `en-IN` locale is
 * always normalized to a plain space.
 */
function sanitize(text: string, font: PDFFont): string {
  const normalized = text.replace(/[  ]/g, ' ');
  const cs = charsetOf(font);
  if (!cs) {
    let out = '';
    for (const ch of normalized) {
      const code = ch.charCodeAt(0);
      if (code <= 0xff || WINANSI_EXTRA.has(code)) out += ch;
    }
    return out;
  }
  let out = '';
  for (const ch of normalized) {
    const cp = ch.codePointAt(0);
    if (cp !== undefined && cs.has(cp)) out += ch;
  }
  return out;
}

/* ---------------------------------------------------------------------------
 * Renderer — owns the current page + y cursor and paints primitives
 * ------------------------------------------------------------------------- */

class Renderer {
  readonly doc: PDFDocument;
  readonly regular: PDFFont;
  readonly bold: PDFFont;
  /** True when an embedded font with a ₹ glyph is available. */
  readonly rupee: boolean;
  page!: PDFPage;
  y!: number;
  /** Called after a fresh page is created (e.g. to redraw table headers). */
  onPageBreak: (() => void) | undefined;

  constructor(doc: PDFDocument, regular: PDFFont, bold: PDFFont, rupee: boolean) {
    this.doc = doc;
    this.regular = regular;
    this.bold = bold;
    this.rupee = rupee;
    this.newPage();
  }

  newPage(): void {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.y = TOP;
    this.onPageBreak?.();
  }

  /** Starts a new page when `height` points won't fit above the footer zone. */
  ensure(height: number): void {
    if (this.y - height < BOTTOM) this.newPage();
  }

  width(text: string, size: number, font: PDFFont = this.regular): number {
    return font.widthOfTextAtSize(sanitize(text, font), size);
  }

  draw(
    text: string,
    x: number,
    y: number,
    size: number,
    font: PDFFont = this.regular,
    color: ReturnType<typeof rgb> = DARK
  ): void {
    this.page.drawText(sanitize(text, font), { x, y, size, font, color });
  }

  drawRight(
    text: string,
    rightX: number,
    y: number,
    size: number,
    font: PDFFont = this.regular,
    color: ReturnType<typeof rgb> = DARK
  ): void {
    this.page.drawText(sanitize(text, font), { x: rightX - this.width(text, size, font), y, size, font, color });
  }

  drawCentered(
    text: string,
    centerX: number,
    y: number,
    size: number,
    font: PDFFont = this.regular,
    color: ReturnType<typeof rgb> = DARK
  ): void {
    this.page.drawText(sanitize(text, font), { x: centerX - this.width(text, size, font) / 2, y, size, font, color });
  }

  /** Indian-grouped amount; uses "₹" when an embedded font can show it. */
  money(amount: number, font: PDFFont = this.bold): string {
    const formatted = formatINR(amount);
    return this.rupee ? formatted : formatted.replace('₹', 'Rs. ');
  }

  /** One line, cut with an ellipsis if it exceeds `maxWidth`. */
  ellipsize(text: string, font: PDFFont, size: number, maxWidth: number): string {
    const safe = sanitize(text, font);
    if (this.width(safe, size, font) <= maxWidth) return safe;
    let out = safe;
    while (out.length > 1 && this.width(`${out.slice(0, -1)}…`, size, font) > maxWidth) {
      out = out.slice(0, -1);
    }
    return `${out.slice(0, -1)}…`;
  }

  /** Wraps text onto as many lines as needed; a single word wider than the
   *  column is ellipsized rather than split mid-word. */
  wordWrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const safe = sanitize(text, font);
    const words = safe.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      if (this.width(word, size, font) > maxWidth) {
        if (line) {
          lines.push(line);
          line = '';
        }
        lines.push(this.ellipsize(word, font, size, maxWidth));
        continue;
      }
      const trial = line ? `${line} ${word}` : word;
      if (this.width(trial, size, font) <= maxWidth) line = trial;
      else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  /** `wordWrap` capped at `maxLines`, the last kept line ending in "…". */
  fit(text: string, font: PDFFont, size: number, maxWidth: number, maxLines: number): string[] {
    const lines = this.wordWrap(text, font, size, maxWidth);
    if (lines.length <= maxLines) return lines;
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = this.ellipsize(`${kept[maxLines - 1]} ${lines.slice(maxLines).join(' ')}`, font, size, maxWidth);
    return kept;
  }
}

type RenderColor = ReturnType<typeof rgb>;

/* ---------------------------------------------------------------------------
 * Shared drawing helpers
 * ------------------------------------------------------------------------- */

/** Brand band: DK logo, wordmark, centered title and a brand underline. */
function drawBrandHeader(r: Renderer, title: string, subtitle?: string): void {
  const y0 = r.y;
  const cx = MARGIN + 14;
  const cy = y0 - 13;
  r.page.drawEllipse({ x: cx, y: cy, xScale: 13, yScale: 13, color: BRAND });
  const lw = r.width('DK', 12, r.bold);
  r.draw('DK', cx - lw / 2, cy - 4.5, 12, r.bold, WHITE);
  r.draw('DailyKhata', MARGIN + 32, y0, 20, r.bold, DARK);
  r.draw('Your khata ledger, made simple', MARGIN + 32, y0 - 15, 8.5, r.regular, GRAY);
  r.drawCentered(title, PAGE_W / 2, y0 - 33, 14, r.bold, BRAND);
  if (subtitle) r.drawCentered(subtitle, PAGE_W / 2, y0 - 46, 9.5, r.regular, GRAY);
  r.y = subtitle ? y0 - 56 : y0 - 45;
  r.page.drawRectangle({ x: MARGIN, y: r.y, width: CONTENT_W, height: 2.5, color: BRAND });
  r.y -= 16;
}

/**
 * 3×3 summary grid:
 *  Row 1: Title (spans all 3 columns, left-aligned)
 *  Row 2: Column labels (centered) — Income/Total Debit | Total Expense/Total Credit | Total Balance/Net Balance
 *  Row 3: Amount values (centered under each label)
 */
function drawFiguresBox(
  r: Renderer,
  title: string,
  figures: { label: string; value: string; color?: RenderColor }[]
): void {
  const pad = 16;
  const titleSize = 11;
  const labelSize = 8.5;
  const valueSize = 13;
  const rowGap = 10;
  const boxH = pad * 2 + titleSize + labelSize + valueSize + rowGap * 2;

  r.ensure(boxH + 12);
  const top = r.y;
  r.page.drawRectangle({ x: MARGIN, y: top - boxH, width: CONTENT_W, height: boxH, color: LIGHT });
  r.page.drawRectangle({ x: MARGIN, y: top - boxH, width: CONTENT_W, height: boxH, borderColor: BORDER, borderWidth: 1 });

  // Row 1: Title (left-aligned, spans full width)
  const titleY = top - pad - titleSize;
  r.draw(title, MARGIN + pad, titleY, titleSize, r.bold, DARK);

  // Row 2 & 3: 3 columns
  const cellW = (CONTENT_W - pad * 2) / 3;
  const labelY = titleY - rowGap - labelSize;
  const valueY = labelY - rowGap - valueSize;

  figures.forEach((fig, i) => {
    const centerX = MARGIN + pad + i * cellW + cellW / 2;
    // Row 2: Label (centered)
    r.drawCentered(fig.label, centerX, labelY, labelSize, r.regular, GRAY);
    // Row 3: Value (centered)
    r.drawCentered(fig.value, centerX, valueY, valueSize, r.bold, fig.color ?? DARK);
  });

  r.y = top - boxH - 18;
}

/** Adds "DailyKhata" + "Page N of M" on every page (call last). */
function addFooters(r: Renderer): void {
  const pages = r.doc.getPages();
  pages.forEach((page, index) => {
    page.drawText('DailyKhata', { x: MARGIN, y: 30, size: 8.5, font: r.regular, color: GRAY });
    const label = `Page ${index + 1} of ${pages.length}`;
    const width = r.width(label, 8.5, r.regular);
    page.drawText(label, { x: (PAGE_W - width) / 2, y: 30, size: 8.5, font: r.regular, color: GRAY });
  });
}

/* ---------------------------------------------------------------------------
 * Statement table
 * ------------------------------------------------------------------------- */

const DEFAULT_STATEMENT_INCLUDE: StatementInclude = {
  entryDetails: true,
  notes: true,
  runningBalance: true,
};

type ColumnKey = 'date' | 'desc' | 'notes' | 'debit' | 'credit' | 'running' | 'type' | 'note' | 'cat' | 'amount';

interface Column {
  key: ColumnKey;
  label: string;
  x: number;
  width: number;
  align: 'left' | 'right';
}

const COL_LABELS: Record<ColumnKey, string> = {
  date: 'Date',
  desc: 'Description',
  notes: 'Notes',
  debit: 'Debit (Out)',
  credit: 'Credit (In)',
  running: 'Running Balance',
  type: 'Type',
  note: 'Note',
  cat: 'Category / Account',
  amount: 'Amount',
};

/**
 * Column geometry for a statement table, built from the selected include
 * options so every one of the 2³ combinations spans the full content width:
 *  - Date and Debit/Credit are always present.
 *  - Description, Notes and Running Balance appear only when their option is on.
 * The amount columns are right-anchored at their base widths; the Description /
 * Notes columns share the space between the Date column and the first amount
 * column, growing proportionally as options are switched off so no empty column
 * or dead space is ever left behind.
 */
function buildColumns(include: StatementInclude): Column[] {
  const gap = 8;
  const dateW = 54;
  const right = PAGE_W - MARGIN;

  const amounts: { key: 'debit' | 'credit' | 'running'; width: number }[] = [
    { key: 'debit', width: 78 },
    { key: 'credit', width: 78 },
  ];
  if (include.runningBalance) amounts.push({ key: 'running', width: 92 });

  const textCols: { key: 'desc' | 'notes'; width: number }[] = [];
  if (include.entryDetails) textCols.push({ key: 'desc', width: 150 });
  if (include.notes) textCols.push({ key: 'notes', width: 96 });

  const dateEnd = MARGIN + dateW + gap;
  // Where the first amount column starts, keeping the amounts right-anchored.
  let firstAmountX =
    right - (amounts.reduce((s, a) => s + a.width, 0) + Math.max(0, amounts.length - 1) * gap);

  if (textCols.length === 0) {
    // No text columns — resize the amount columns to fill the whole band
    // between the Date column and the right margin (minus the inter-column
    // gaps) and start them at dateEnd, so the table still spans the full
    // width instead of shrinking toward the right edge.
    const band = right - dateEnd;
    const gapsTotal = Math.max(0, amounts.length - 1) * gap;
    const target = band - gapsTotal;
    if (target > 0) {
      const baseSum = amounts.reduce((s, a) => s + a.width, 0);
      for (const a of amounts) a.width = (target * a.width) / baseSum;
    }
    firstAmountX = dateEnd;
  } else {
    // The whole middle band is shared across the enabled text columns; each is
    // sized proportionally to how much text it is expected to hold, so their
    // combined width exactly fills the band and never overruns the amounts.
    const available = firstAmountX - dateEnd - textCols.length * gap;
    if (available > 0) {
      const baseSum = textCols.reduce((s, t) => s + t.width, 0);
      for (const t of textCols) t.width = (available * t.width) / baseSum;
    }
  }

  const cols: Column[] = [];
  let x = MARGIN;
  cols.push({ key: 'date', label: COL_LABELS.date, x, width: dateW, align: 'left' });
  x = dateEnd;
  for (const t of textCols) {
    cols.push({ key: t.key, label: COL_LABELS[t.key], x, width: t.width, align: 'left' });
    x += t.width + gap;
  }
  let ax = firstAmountX;
  for (const a of amounts) {
    cols.push({ key: a.key, label: COL_LABELS[a.key], x: ax, width: a.width, align: 'right' });
    ax += a.width + gap;
  }
  return cols;
}

/** Grey column-header band with a brand underline. */
function drawTableHeader(r: Renderer, cols: Column[]): void {
  r.ensure(34);
  const y = r.y;
  r.page.drawRectangle({ x: MARGIN, y: y - 2, width: CONTENT_W, height: 17, color: LIGHT });
  for (const col of cols) {
    const label = r.ellipsize(col.label, r.bold, 8, col.width - 2);
    if (col.align === 'right') r.drawRight(label, col.x + col.width, y, 8, r.bold, DARK);
    else r.draw(label, col.x, y, 8, r.bold, DARK);
  }
  r.y = y - 19;
  r.page.drawRectangle({ x: MARGIN, y: r.y, width: CONTENT_W, height: 1.4, color: BRAND });
  r.y -= 9;
}

function drawMonthHeader(r: Renderer, label: string): void {
  r.ensure(30);
  const y = r.y;
  r.page.drawRectangle({ x: MARGIN, y: y - 2, width: CONTENT_W, height: 15, color: LIGHT });
  r.draw(label, MARGIN + 8, y, 9.5, r.bold, BRAND);
  r.y = y - 18;
}

type StatementEntry = StatementReport['months'][number]['entries'][number];

/** One ledger row. Description and Notes are independent left-aligned columns
 *  that each wrap to a second line; the row height fits the taller of the two. */
function drawStatementRow(r: Renderer, cols: Column[], include: StatementInclude, entry: StatementEntry, zebra: boolean): void {
  const descCol = cols.find((c) => c.key === 'desc');
  const notesCol = cols.find((c) => c.key === 'notes');
  const descLines = descCol ? r.fit(entry.description, r.regular, 9.5, descCol.width - 2, 2) : [];
  const noteLines = notesCol && entry.note ? r.fit(entry.note, r.regular, 8.5, notesCol.width - 2, 2) : [];
  const extra = Math.max(0, descLines.length - 1, noteLines.length - 1);
  const rowH = 16 + extra * 11;
  r.ensure(rowH + 4);

  const y = r.y;
  if (zebra) r.page.drawRectangle({ x: MARGIN, y: y - 2, width: CONTENT_W, height: rowH, color: LIGHT });
  for (const col of cols) {
    if (col.key === 'date') {
      r.draw(formatISOToDisplay(entry.date), col.x, y, 9.5, r.regular, DARK);
    } else if (col.key === 'desc') {
      descLines.forEach((line, i) => r.draw(line, col.x, y - i * 11, 9.5, r.regular, DARK));
    } else if (col.key === 'notes') {
      noteLines.forEach((line, i) => r.draw(line, col.x, y - i * 11, 8.5, r.regular, GRAY));
    } else if (col.key === 'debit') {
      if (entry.debit > 0) r.drawRight(r.money(entry.debit, r.regular), col.x + col.width, y, 9.5, r.regular, DARK);
      else r.drawRight('—', col.x + col.width, y, 9.5, r.regular, MUTED);
    } else if (col.key === 'credit') {
      if (entry.credit > 0) r.drawRight(r.money(entry.credit, r.regular), col.x + col.width, y, 9.5, r.regular, DARK);
      else r.drawRight('—', col.x + col.width, y, 9.5, r.regular, MUTED);
    } else if (col.key === 'running') {
      r.drawRight(r.money(entry.runningBalance, r.regular), col.x + col.width, y, 9.5, r.regular, DARK);
    }
  }
  r.y = y - rowH;
}

function drawGrandTotal(r: Renderer, cols: Column[], report: StatementReport): void {
  r.ensure(26);
  const y = r.y;
  r.page.drawRectangle({ x: MARGIN, y: y + 4, width: CONTENT_W, height: 1.6, color: BRAND });
  r.page.drawRectangle({ x: MARGIN, y: y - 2, width: CONTENT_W, height: 18, color: LIGHT });
  r.draw('Grand Total', MARGIN + 8, y, 10.5, r.bold, DARK);
  const netColor = report.netBalance >= 0 ? BRAND : RED;
  for (const col of cols) {
    if (col.key === 'debit') r.drawRight(r.money(report.totalDebit, r.bold), col.x + col.width, y, 10.5, r.bold, DARK);
    else if (col.key === 'credit') r.drawRight(r.money(report.totalCredit, r.bold), col.x + col.width, y, 10.5, r.bold, DARK);
    else if (col.key === 'running') r.drawRight(r.money(report.netBalance, r.bold), col.x + col.width, y, 10.5, r.bold, netColor);
  }
  r.y = y - 22;
}

function drawEmptyTable(r: Renderer, message: string): void {
  r.drawCentered(message, PAGE_W / 2, r.y - 4, 10.5, r.regular, GRAY);
  r.y -= 22;
}

/** Party name + kind/phone + report period + generated timestamp. */
function drawPartyBlock(r: Renderer, report: StatementReport): void {
  const kind = report.party.type === 'customer' ? 'Customer' : 'Supplier';
  const nameLines = r.fit(report.party.name, r.bold, 15, CONTENT_W, 2);
  nameLines.forEach((line, i) => r.draw(line, MARGIN, r.y - i * 16, 15, r.bold, DARK));
  r.y -= nameLines.length * 16 + 4;
  const meta = report.party.phone ? `${kind}  •  ${report.party.phone}` : kind;
  r.draw(meta, MARGIN, r.y, 10, r.regular, GRAY);
  r.y -= 15;
  r.draw(`Report period:  ${formatReportRange(report.from, report.to)}`, MARGIN, r.y, 9.5, r.regular, GRAY);
  r.y -= 13;
  r.draw(`Generated:  ${formatDateTime(report.generatedAt)}`, MARGIN, r.y, 9.5, r.regular, GRAY);
  r.y -= 18;
}

/** Renders a full statement report (used by buildStatementReportPdf). */
function renderStatement(r: Renderer, report: StatementReport, include: StatementInclude): void {
  const kind = report.party.type === 'customer' ? 'Customer' : 'Supplier';
  drawBrandHeader(r, `${kind} Statement`);
  drawPartyBlock(r, report);
  drawFiguresBox(r, 'Summary', [
    { label: 'Total Debit (Out)', value: r.money(report.totalDebit) },
    { label: 'Total Credit (In)', value: r.money(report.totalCredit) },
    { label: 'Net Balance', value: r.money(report.netBalance), color: report.netBalance >= 0 ? BRAND : RED },
  ]);

  const cols = buildColumns(include);
  let currentMonth = '';
  r.onPageBreak = () => {
    drawTableHeader(r, cols);
    if (currentMonth) drawMonthHeader(r, currentMonth);
  };
  drawTableHeader(r, cols);

  if (report.months.length === 0) {
    drawEmptyTable(r, 'No entries recorded in this period.');
  } else {
    let zebra = false;
    for (const month of report.months) {
      currentMonth = month.label;
      const pageBefore = r.page;
      r.ensure(30);
      // If ensure() broke onto a fresh page, onPageBreak already drew the table
      // header and this month's header — drawing it again stacks a duplicate.
      if (r.page === pageBefore) drawMonthHeader(r, month.label);
      for (const entry of month.entries) {
        drawStatementRow(r, cols, include, entry, zebra);
        zebra = !zebra;
      }
      r.y -= 6;
    }
  }
  r.onPageBreak = undefined;
  if (report.months.length > 0) drawGrandTotal(r, cols, report);
}

/* ---------------------------------------------------------------------------
 * Font embedding
 * ------------------------------------------------------------------------- */

async function embedFonts(doc: PDFDocument): Promise<{ regular: PDFFont; bold: PDFFont; rupee: boolean }> {
  const bytes = await getPdfFontBytes();
  if (bytes) {
    try {
      doc.registerFontkit(fontkit);
      const regular = await doc.embedFont(bytes.regular);
      const bold = await doc.embedFont(bytes.bold);
      return { regular, bold, rupee: true };
    } catch {
      // fall through to built-in fonts below
    }
  }
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  return { regular, bold, rupee: false };
}

/* ---------------------------------------------------------------------------
 * Transactions report (quick range — Today / Yesterday / This Week / This Month / This Year / Custom)
 * ------------------------------------------------------------------------- */

export interface TransactionsPdfInput {
  /** Inclusive `YYYY-MM-DD` lower bound. */
  dateFrom: string;
  /** Inclusive `YYYY-MM-DD` upper bound. */
  dateTo: string;
  /** Feed rows. Reversed inside so the PDF always prints oldest → newest. */
  entries: LedgerRow[];
}

/** Renders a "Transactions Report" with a summary box and a Date | Type | Note | Category/Account | Amount table. */
export async function buildTransactionsPdf(input: TransactionsPdfInput): Promise<Uint8Array> {
  const { dateFrom, dateTo, entries: newestFirst } = input;
  // Ledgers come in newest-first (matching the app's screens); the report reads
  // chronologically, so print oldest → newest.
  const entries = newestFirst.slice().reverse();
  const doc = await PDFDocument.create();
  const { regular, bold, rupee } = await embedFonts(doc);
  const r = new Renderer(doc, regular, bold, rupee);
  r.onPageBreak = undefined;

  drawBrandHeader(r, 'Transactions Report', formatReportRange(dateFrom, dateTo));

  // Summary figures (Income / Expense / Net)
  let totalIncome = 0;
  let totalExpense = 0;
  for (const e of entries) {
    if (e.kind === 'income') totalIncome += e.amount;
    else if (e.kind === 'expense') totalExpense += e.amount;
    // transfers and opening balance are ignored for the summary
  }
  const net = totalIncome - totalExpense;
  drawFiguresBox(r, 'Summary', [
    { label: 'Total Income', value: r.money(totalIncome), color: BRAND },
    { label: 'Total Expense', value: r.money(totalExpense), color: RED },
    { label: 'Net Balance', value: r.money(net), color: net >= 0 ? BRAND : RED },
  ]);

  // Table columns: Date | Note | Category/Account | Amount
  const cols: Column[] = [
    { key: 'date', label: 'Date', x: MARGIN, width: 60, align: 'left' },
    { key: 'note', label: 'Note', x: MARGIN + 68, width: 200, align: 'left' },
    { key: 'cat', label: 'Category / Account', x: MARGIN + 276, width: 180, align: 'left' },
    { key: 'amount', label: 'Amount', x: MARGIN + 464, width: 43, align: 'right' },
  ];

  drawTableHeader(r, cols);

  if (entries.length === 0) {
    drawEmptyTable(r, 'No transactions in this range.');
  } else {
    let zebra = false;
    for (const entry of entries) {
      drawTransactionRow(r, cols, entry, zebra);
      zebra = !zebra;
    }
    // Totals row
    drawTransactionTotals(r, cols, totalIncome);
  }

  addFooters(r);
  return doc.save();
}

/** Category / Account fallback string for the transactions table. */
function rowCategoryAccount(entry: LedgerRow): string {
  if (entry.entryKind === 'opening') return entry.categoryName ?? entry.accountName ?? '';
  if (entry.kind === 'transfer') {
    return `${entry.fromAccountName ?? ''} → ${entry.toAccountName ?? ''}`;
  }
  return entry.categoryName ?? entry.accountName ?? '';
}

/** One transactions-report row. Amount is signed & colored: income +BRAND, expense −RED, transfer/opening plain DARK. */
function drawTransactionRow(r: Renderer, cols: Column[], entry: LedgerRow, zebra: boolean): void {
  const catAcc = rowCategoryAccount(entry);
  const isIncome = entry.kind === 'income';
  const isExpense = entry.kind === 'expense';

  let amountText = '';
  let amountColor: RenderColor = DARK;
  if (isIncome) {
    amountText = '+' + r.money(entry.amount, r.regular);
    amountColor = BRAND;
  } else if (isExpense) {
    amountText = '-' + r.money(entry.amount, r.regular);
    amountColor = RED;
  } else {
    amountText = r.money(entry.amount, r.regular);
    amountColor = DARK;
  }

  // Note column falls back to category/account when empty
  const noteText = entry.note || catAcc;

  r.ensure(22);
  const y = r.y;
  if (zebra) r.page.drawRectangle({ x: MARGIN, y: y - 2, width: CONTENT_W, height: 16, color: LIGHT });

  // Date
  r.draw(formatISOToDisplay(entry.date), cols[0].x, y, 9.5, r.regular, DARK);
  // Note (wraps to 2 lines max)
  const noteLines = r.fit(noteText, r.regular, 9.5, cols[1].width - 2, 2);
  noteLines.forEach((line, i) => r.draw(line, cols[1].x, y - i * 10, 9.5, r.regular, DARK));
  // Category/Account (wraps to 2 lines max)
  const catLines = r.fit(catAcc, r.regular, 8.5, cols[2].width - 2, 2);
  catLines.forEach((line, i) => r.draw(line, cols[2].x, y - i * 10, 8.5, r.regular, GRAY));
  // Amount (right aligned)
  r.drawRight(amountText, cols[3].x + cols[3].width, y, 9.5, r.regular, amountColor);

  r.y = y - 20;
}

/** Totals row at the bottom of the transactions table. */
function drawTransactionTotals(r: Renderer, cols: Column[], totalIncome: number): void {
  r.ensure(26);
  const y = r.y;
  r.page.drawRectangle({ x: MARGIN, y: y + 2, width: CONTENT_W, height: 0.8, color: BORDER });
  r.page.drawRectangle({ x: MARGIN, y: y - 2, width: CONTENT_W, height: 16, color: LIGHT });

  r.draw('Totals', MARGIN + 8, y, 9.5, r.bold, DARK);
  r.drawRight(r.money(totalIncome), cols[3].x + cols[3].width, y, 9.5, r.bold, BRAND);

  r.y = y - 22;
}

/* ---------------------------------------------------------------------------
 * Public builders
 * ------------------------------------------------------------------------- */

interface MonthlyPdfInput {
  /** 0-indexed month. */
  year: number;
  month: number;
  report: MonthReport;
}

export async function buildMonthlyReportPdf({ year, month, report }: MonthlyPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const { regular, bold, rupee } = await embedFonts(doc);
  const r = new Renderer(doc, regular, bold, rupee);
  r.onPageBreak = undefined;
  drawBrandHeader(r, 'Monthly Report', monthLabel(year, month));
  const profit = report.summary.income - report.summary.expense;
  drawFiguresBox(r, 'Summary', [
    { label: 'Total Income', value: r.money(report.summary.income), color: BRAND },
    { label: 'Total Expense', value: r.money(report.summary.expense), color: RED },
    { label: 'Net Balance', value: r.money(profit), color: profit >= 0 ? BRAND : RED },
  ]);
  drawCategorySection(r, 'Top Expenses', report.expenses, RED);
  drawCategorySection(r, 'Top Income', report.incomes, BRAND);
  addFooters(r);
  return doc.save();
}

function drawCategorySection(
  r: Renderer,
  title: string,
  items: MonthReport['expenses'],
  color: RenderColor
): void {
  r.ensure(26);
  r.draw(title, MARGIN, r.y, 12, r.bold, DARK);
  r.y -= 10;
  if (items.length === 0) {
    r.draw('Nothing recorded.', MARGIN, r.y, 10, r.regular, GRAY);
    r.y -= 22;
    return;
  }
  for (const item of items) {
    r.ensure(16);
    const name = r.ellipsize(item.name, r.regular, 10, CONTENT_W - 130);
    r.draw(name, MARGIN, r.y, 10, r.regular, DARK);
    r.drawRight(r.money(item.total), PAGE_W - MARGIN, r.y, 10, r.regular, color);
    r.y -= 17;
  }
  r.y -= 6;
}

export async function buildStatementReportPdf(
  report: StatementReport,
  include: StatementInclude = DEFAULT_STATEMENT_INCLUDE
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const { regular, bold, rupee } = await embedFonts(doc);
  const r = new Renderer(doc, regular, bold, rupee);
  r.onPageBreak = undefined;
  renderStatement(r, report, include);
  addFooters(r);
  return doc.save();
}

interface PartyStatementPdfInput {
  name: string;
  phone: string;
  type: PartyType;
  /** Kept for callers that pass it; the report is rebuilt from `ledger`. */
  balance?: number;
  ledger: PartyTransaction[];
  /** Which columns/rows to include; defaults to all on. */
  include?: StatementInclude;
}

/**
 * Convenience wrapper used by the party screen's quick "Share PDF" action.
 * Builds a full statement report from the party's in-memory ledger and renders
 * it with `buildStatementReportPdf` (all-time; `include` defaults to all on).
 */
export async function buildPartyStatementPdf({
  name,
  phone,
  type,
  ledger,
  include = DEFAULT_STATEMENT_INCLUDE,
}: PartyStatementPdfInput): Promise<Uint8Array> {
  const party: Party = { id: 0, name, phone, type, openingBalance: 0 };
  const report = computeStatementReport(party, ledger);
  return buildStatementReportPdf(report, include);
}

interface CombinedPdfInput {
  /** 0-indexed month. */
  year: number;
  month: number;
  /** Monthly report data. */
  report: MonthReport;
  /** All parties with their balances. */
  parties: PartyBalance[];
}

/**
 * A combined PDF with the monthly summary report followed by each party's
 * statement. Useful for sending a single file to an accountant.
 */
export async function buildCombinedPdf({ year, month, report, parties }: CombinedPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const { regular, bold, rupee } = await embedFonts(doc);
  const r = new Renderer(doc, regular, bold, rupee);
  r.onPageBreak = undefined;

  // ===== Monthly report section =====
  drawBrandHeader(r, 'Monthly Report', monthLabel(year, month));
  const profit = report.summary.income - report.summary.expense;
  drawFiguresBox(r, 'Summary', [
    { label: 'Income / Total Debit', value: r.money(report.summary.income), color: BRAND },
    { label: 'Total Expense / Total Credit', value: r.money(report.summary.expense), color: RED },
    { label: 'Net Balance', value: r.money(profit), color: profit >= 0 ? BRAND : RED },
  ]);
  drawCategorySection(r, 'Top Expenses', report.expenses, RED);
  drawCategorySection(r, 'Top Income', report.incomes, BRAND);
  r.ensure(26);
  r.draw('Khata Summary', MARGIN, r.y, 12, r.bold, DARK);
  r.y -= 10;
  r.draw('Money Out', MARGIN, r.y, 10, r.regular, RED);
  r.drawRight(r.money(report.party.given), PAGE_W - MARGIN, r.y, 10, r.regular, RED);
  r.y -= 16;
  r.draw('Money In', MARGIN, r.y, 10, r.regular, BRAND);
  r.drawRight(r.money(report.party.received), PAGE_W - MARGIN, r.y, 10, r.regular, BRAND);
  r.y -= 24;

  // ===== Party statements section =====
  r.newPage();
  drawBrandHeader(r, 'Khata Statements');

  const customers = parties.filter((p) => p.type === 'customer');
  const suppliers = parties.filter((p) => p.type === 'supplier');

  if (customers.length > 0) {
    r.ensure(22);
    r.draw('Customers (They Owe You)', MARGIN, r.y, 12, r.bold, BRAND);
    r.y -= 18;
    for (const party of customers) await renderPartyStatement(r, party);
    r.y -= 4;
  }
  if (suppliers.length > 0) {
    r.ensure(22);
    r.draw('Suppliers (You Owe Them)', MARGIN, r.y, 12, r.bold, RED);
    r.y -= 18;
    for (const party of suppliers) await renderPartyStatement(r, party);
    r.y -= 4;
  }
  if (customers.length === 0 && suppliers.length === 0) {
    drawEmptyTable(r, 'No parties to show.');
  }

  addFooters(r);
  return doc.save();
}

/** Renders one party's compact statement for the combined PDF. */
async function renderPartyStatement(r: Renderer, party: PartyBalance): Promise<void> {
  const ledger = await listPartyTransactionsAsc(party.id);
  const report = computeStatementReport(party, ledger);
  const include: StatementInclude = { entryDetails: true, notes: true, runningBalance: true };
  const receivable = isPartyReceivable(party.type, party.balance);
  const balanceColor = receivable ? BRAND : RED;
  const kind = party.type === 'customer' ? 'Customer' : 'Supplier';

  r.ensure(40);
  const nameLines = r.fit(party.name, r.bold, 13, CONTENT_W, 2);
  nameLines.forEach((line, i) => r.draw(line, MARGIN, r.y - i * 14, 13, r.bold, DARK));
  r.y -= nameLines.length * 14 + 3;
  const meta = r.ellipsize(party.phone ? `${kind}  •  ${party.phone}` : kind, r.regular, 9.5, CONTENT_W - 150);
  r.draw(meta, MARGIN, r.y, 9.5, r.regular, GRAY);
  r.drawRight(r.money(party.balance), PAGE_W - MARGIN, r.y, 9.5, r.bold, balanceColor);
  r.y -= 14;

  const cols = buildColumns(include);
  let currentMonth = '';
  r.onPageBreak = () => {
    drawTableHeader(r, cols);
    if (currentMonth) drawMonthHeader(r, currentMonth);
  };
  drawTableHeader(r, cols);

  if (report.months.length === 0) {
    drawEmptyTable(r, 'No entries recorded.');
  } else {
    let zebra = false;
    for (const month of report.months) {
      currentMonth = month.label;
      const pageBefore = r.page;
      r.ensure(30);
      if (r.page === pageBefore) drawMonthHeader(r, month.label);
      for (const entry of month.entries) {
        drawStatementRow(r, cols, include, entry, zebra);
        zebra = !zebra;
      }
      r.y -= 6;
    }
  }
  r.onPageBreak = undefined;
  if (report.months.length > 0) drawGrandTotal(r, cols, report);
  r.y -= 16;
}
