/**
 * Excel (.xlsx) export using SheetJS (xlsx).
 * Provides professional spreadsheet exports for DailyKhata.
 */

import * as XLSX from 'xlsx';
import type { PartyDirection, PartyTransaction, PartyType } from '@/types';
import { PARTY_ACTIONS, actionForDirection } from '@/utils/party';
import { formatINR } from '@/utils/format';

/**
 * Creates a workbook with common styles applied.
 */
function createWorkbook(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  wb.Props = {
    Title: 'DailyKhata Export',
    Subject: 'Financial Records',
    Author: 'DailyKhata',
    CreatedDate: new Date(),
  };
  return wb;
}

/**
 * Adds a sheet to workbook with data and applies standard formatting.
 */
function addSheet(
  wb: XLSX.WorkBook,
  name: string,
  headers: string[],
  data: (string | number)[][],
  columnWidths?: number[]
) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);

  // Set column widths
  if (columnWidths) {
    ws['!cols'] = columnWidths.map((w) => ({ wch: w }));
  } else {
    // Auto-size columns based on content
    ws['!cols'] = headers.map((_, i) => ({
      wch: Math.max(headers[i].length, ...data.map((row) => String(row[i] ?? '').length)) + 2,
    }));
  }

  // Style header row
  const headerRange = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let C = headerRange.s.c; C <= headerRange.e.c; C++) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: C });
    if (ws[cellRef]) {
      ws[cellRef].s = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '16A34A' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: {
          top: { style: 'thin', color: { rgb: '16A34A' } },
          bottom: { style: 'thin', color: { rgb: '16A34A' } },
          left: { style: 'thin', color: { rgb: '16A34A' } },
          right: { style: 'thin', color: { rgb: '16A34A' } },
        },
      };
    }
  }

  // Style data rows
  for (let R = 1; R <= headerRange.e.r; R++) {
    for (let C = headerRange.s.c; C <= headerRange.e.c; C++) {
      const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
      if (ws[cellRef]) {
        ws[cellRef].s = {
          border: {
            top: { style: 'thin', color: { rgb: 'E3E7E4' } },
            bottom: { style: 'thin', color: { rgb: 'E3E7E4' } },
            left: { style: 'thin', color: { rgb: 'E3E7E4' } },
            right: { style: 'thin', color: { rgb: 'E3E7E4' } },
          },
          alignment: { vertical: 'center' },
        };
      }
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, name);
  return wb;
}

/**
 * Party statement → Excel workbook with running balance.
 */
export function partyStatementToExcel(
  name: string,
  phone: string,
  type: PartyType,
  openingBalance: number,
  balance: number,
  ledger: PartyTransactionWithRunningBalance[]
): XLSX.WorkBook {
  const wb = createWorkbook();

  // Summary sheet
  const summaryData = [
    ['Party Name', name],
    ['Phone', phone],
    ['Type', type === 'customer' ? 'Customer' : 'Supplier'],
    ['Opening Balance', formatINR(openingBalance)],
    ['Total Debit (You Gave)', formatINR(ledger.filter((l) => isDebit(type, l.direction)).reduce((sum, l) => sum + l.amount, 0))],
    ['Total Credit (You Got)', formatINR(ledger.filter((l) => isCredit(type, l.direction)).reduce((sum, l) => sum + l.amount, 0))],
    ['Net Balance', formatINR(balance)],
  ];

  addSheet(wb, 'Summary', ['Field', 'Value'], summaryData, [25, 25]);

  // Statement sheet
  const statementData = ledger.map((l) => [
    l.date,
    PARTY_ACTIONS[actionForDirection(type, l.direction)].title,
    isDebit(type, l.direction) ? formatINR(l.amount) : '',
    isCredit(type, l.direction) ? formatINR(l.amount) : '',
    formatINR(l.runningBalance),
    l.note ?? '',
  ]);

  addSheet(wb, 'Statement', ['Date', 'Description', 'Debit', 'Credit', 'Running Balance', 'Notes'], statementData, [12, 20, 14, 14, 18, 30]);

  return wb;
}

/**
 * Monthly report → Excel workbook with multiple sheets.
 */
export function monthlyReportToExcel(
  year: number,
  month: number,
  report: MonthlyReportData,
  parties: PartyWithBalance[]
): XLSX.WorkBook {
  const wb = createWorkbook();

  // Summary sheet
  const profit = report.summary.income - report.summary.expense;
  const summaryData = [
    ['Report Period', `${new Date(year, month).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`],
    ['Generated', new Date().toLocaleString('en-IN')],
    [''],
    ['Income', formatINR(report.summary.income)],
    ['Expense', formatINR(report.summary.expense)],
    ['Profit / Loss', formatINR(profit)],
    [''],
    ['Money Given (Khata)', formatINR(report.party.given)],
    ['Money Received (Khata)', formatINR(report.party.received)],
  ];
  addSheet(wb, 'Summary', ['Field', 'Value'], summaryData, [25, 25]);

  // Expenses breakdown
  const expData = report.expenses.map((e) => [e.name, formatINR(e.total)]);
  addSheet(wb, 'Expenses', ['Category', 'Total'], expData, [30, 18]);

  // Income breakdown
  const incData = report.incomes.map((i) => [i.name, formatINR(i.total)]);
  addSheet(wb, 'Income', ['Category', 'Total'], incData, [30, 18]);

  // Parties
  const partyData = parties.map((p) => [
    p.name,
    p.type === 'customer' ? 'Customer' : 'Supplier',
    p.phone ?? '',
    formatINR(p.openingBalance),
    formatINR(p.balance),
  ]);
  addSheet(wb, 'Parties', ['Name', 'Type', 'Phone', 'Opening Balance', 'Current Balance'], partyData, [25, 12, 18, 18, 18]);

  return wb;
}

/**
 * Save workbook to Uint8Array for sharing.
 */
export async function saveWorkbook(wb: XLSX.WorkBook): Promise<Uint8Array> {
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}

// Helper functions
function isDebit(type: PartyType, direction: PartyDirection): boolean {
  return (type === 'customer' && direction === 'out') || (type === 'supplier' && direction === 'in');
}

function isCredit(type: PartyType, direction: PartyDirection): boolean {
  return (type === 'customer' && direction === 'in') || (type === 'supplier' && direction === 'out');
}

interface PartyTransactionWithRunningBalance extends PartyTransaction {
  runningBalance: number;
}

interface MonthlyReportData {
  summary: { income: number; expense: number };
  expenses: { name: string; total: number }[];
  incomes: { name: string; total: number }[];
  party: { given: number; received: number };
}

interface PartyWithBalance {
  id: number;
  name: string;
  type: PartyType;
  phone: string;
  openingBalance: number;
  balance: number;
}