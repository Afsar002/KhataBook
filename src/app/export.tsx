/**
 * Report & Export screen (PDF + Excel only).
 *
 * Generates professional financial statements with date range selection,
 * customizable options, and multiple export formats.
 */

import {
  CalendarRange,
  FileText,
  FileSpreadsheet,
  Share2,
  Download,
  Info,
  Check,
} from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { ExportOptionsSheet } from '@/components/export-options-sheet';
import { feedback } from '@/components/feedback';
import { EXPORT_OPTIONS } from '@/constants/export-options';
import { LargeButton } from '@/components/large-button';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { buildStatementReportPdf, buildMonthlyReportPdf, buildCombinedPdf, buildTransactionsPdf } from '@/utils/pdf';
import { saveWorkbook, partyStatementToExcel, monthlyReportToExcel, transactionsToExcel } from '@/utils/excel';
import { todayISODate } from '@/utils/format';
import { writeAndShareFile } from '@/utils/share';
import { listParties, listPartyTransactionsAsc } from '@/db/party-repo';
import { useMonthlyReport } from '@/hooks/use-monthly-report';
import type { Party, PartyDirection } from '@/types';
import { computeStatementReport, type StatementInclude, DEFAULT_INCLUDE } from '@/utils/statement';
import { listLedgerRange } from '@/db/transaction-repo';
import { rangePresets, type RangePreset } from '@/utils/date-range';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type ReportType = 'party' | 'monthly' | 'combined' | 'transactions';
type ExportFormat = 'pdf' | 'excel';

export default function ExportScreen() {
  const theme = useTheme();
  const [reportType, setReportType] = useState<ReportType>('party');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('pdf');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [exportOptionsOpen, setExportOptionsOpen] = useState(false);
  const [selectedPartyId, setSelectedPartyId] = useState<number | null>(null);
  const [parties, setParties] = useState<Party[]>([]);
  const [includeOptions, setIncludeOptions] = useState<StatementInclude>(DEFAULT_INCLUDE);

  // For monthly/combined reports
  const yearMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const { report: monthlyReport } = useMonthlyReport(yearMonth);

  // Load parties for selection
  useState(() => {
    listParties().then(setParties);
  });

  const validate = (): string[] | null => {
    const errors: string[] = [];
    if (from && !DATE_RE.test(from)) {
      errors.push('From must be YYYY-MM-DD.');
    }
    if (to && !DATE_RE.test(to)) {
      errors.push('To must be YYYY-MM-DD.');
    }
    if (errors.length === 0 && from && to && from > to) {
      errors.push('From must be on or before To.');
    }
    if (reportType === 'party' && !selectedPartyId) {
      errors.push('Please select a party.');
    }
    return errors.length ? errors : null;
  };

  const presets = rangePresets();

  function setBoth(fromValue: string, toValue: string) {
    setFrom(fromValue);
    setTo(toValue);
  }

  const applyPreset = (preset: RangePreset) => {
    setBoth(preset.from, preset.to);
  };

  const generate = async () => {
    if (busy) return;

    const errors = validate();
    if (errors) {
      feedback.alert({
        title: 'Check the form',
        message: errors.join('\n'),
        tone: 'danger',
      });
      return;
    }

    setBusy(true);
    try {
      const timestamp = new Date().toISOString().split('T')[0];
      
      if (reportType === 'party' && selectedPartyId) {
        const party = parties.find(p => p.id === selectedPartyId);
        if (!party) throw new Error('Party not found');

        const transactions = await listPartyTransactionsAsc(selectedPartyId);
        const report = computeStatementReport(party, transactions, from, to);

        if (exportFormat === 'pdf') {
          const pdfBytes = await buildStatementReportPdf(report, includeOptions);
          await writeAndShareFile({
            filename: `dailykhata-${party.name.toLowerCase().replace(/\s+/g, '-')}-statement-${timestamp}.pdf`,
            content: pdfBytes,
            mimeType: 'application/pdf',
            dialogTitle: 'Save PDF Statement',
          });
          feedback.toast({ message: 'PDF statement generated successfully', tone: 'success' });
        } else {
          const ledgerForExcel = report.entries.map(e => ({
            id: e.id,
            partyId: selectedPartyId,
            direction: (party.type === 'customer' ? (e.debit > 0 ? 'out' : 'in') : (e.debit > 0 ? 'in' : 'out')) as PartyDirection,
            amount: e.debit > 0 ? e.debit : e.credit,
            note: e.note,
            date: e.date,
            // Statement exports print the day-level date only, so no time.
            time: '',
            createdAt: new Date().toISOString(),
            runningBalance: e.runningBalance,
            kind: e.kind,
          }));
          const wb = partyStatementToExcel(
            party.name,
            party.phone,
            party.type,
            report.netBalance,
            ledgerForExcel
          );
          const excelBytes = await saveWorkbook(wb);
          await writeAndShareFile({
            filename: `dailykhata-${party.name.toLowerCase().replace(/\s+/g, '-')}-statement-${timestamp}.xlsx`,
            content: excelBytes,
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            dialogTitle: 'Save Excel Statement',
          });
          feedback.toast({ message: 'Excel statement generated successfully', tone: 'success' });
        }
      } else if (reportType === 'monthly') {
        if (exportFormat === 'pdf') {
          const pdfBytes = await buildMonthlyReportPdf({
            year: new Date().getFullYear(),
            month: new Date().getMonth(),
            report: monthlyReport,
          });
          await writeAndShareFile({
            filename: `dailykhata-monthly-report-${yearMonth}.pdf`,
            content: pdfBytes,
            mimeType: 'application/pdf',
            dialogTitle: 'Save PDF Report',
          });
          feedback.toast({ message: 'Monthly PDF report generated', tone: 'success' });
        } else {
          const wb = monthlyReportToExcel(
            new Date().getFullYear(),
            new Date().getMonth(),
            {
              summary: monthlyReport.summary,
              expenses: monthlyReport.expenses,
              incomes: monthlyReport.incomes,
              party: monthlyReport.party,
            },
            [] // parties list would be loaded separately
          );
          const excelBytes = await saveWorkbook(wb);
          await writeAndShareFile({
            filename: `dailykhata-monthly-report-${yearMonth}.xlsx`,
            content: excelBytes,
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            dialogTitle: 'Save Excel Report',
          });
          feedback.toast({ message: 'Monthly Excel report generated', tone: 'success' });
        }
      } else if (reportType === 'combined') {
        const partiesList = await listParties();
        
        if (exportFormat === 'pdf') {
          const pdfBytes = await buildCombinedPdf({
            year: new Date().getFullYear(),
            month: new Date().getMonth(),
            report: monthlyReport,
            parties: partiesList,
          });
          await writeAndShareFile({
            filename: `dailykhata-combined-report-${yearMonth}.pdf`,
            content: pdfBytes,
            mimeType: 'application/pdf',
            dialogTitle: 'Save PDF Report',
          });
          feedback.toast({ message: 'Combined PDF report generated', tone: 'success' });
        } else {
          // For Excel combined, we'd need to gather all transaction data
          // This is a simplified version
          feedback.toast({ message: 'Combined Excel export coming soon', tone: 'info' });
        }
      } else if (reportType === 'transactions') {
        const entries = await listLedgerRange(from || undefined, to || undefined);
        if (entries.length === 0) {
          feedback.toast({ message: 'No transactions in this range.', tone: 'info' });
          return;
        }

        const rangeLabel = from && to ? `${from}-to-${to}` : from ?? to ?? 'all';

        if (exportFormat === 'pdf') {
          const pdfBytes = await buildTransactionsPdf({ dateFrom: from ?? '', dateTo: to ?? '', entries });
          await writeAndShareFile({
            filename: `dailykhata-transactions-${rangeLabel}.pdf`,
            content: pdfBytes,
            mimeType: 'application/pdf',
            dialogTitle: 'Save PDF Report',
          });
          feedback.toast({ message: 'Transactions PDF generated', tone: 'success' });
        } else {
          const wb = transactionsToExcel(entries);
          const excelBytes = await saveWorkbook(wb);
          await writeAndShareFile({
            filename: `dailykhata-transactions-${rangeLabel}.xlsx`,
            content: excelBytes,
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            dialogTitle: 'Save Excel Report',
          });
          feedback.toast({ message: 'Transactions Excel generated', tone: 'success' });
        }
      }
    } catch (error) {
      feedback.toast({
        message: error instanceof Error ? error.message : String(error),
        tone: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  /**
   * Before generating or sharing a PDF, show the Export Options sheet so the
   * user can pick what goes in. Excel exports go straight through.
   */
  const handleGenerateReport = () => {
    if (exportFormat === 'pdf') setExportOptionsOpen(true);
    else void generate();
  };

  const handleShare = () => {
    // Share uses the same writeAndShareFile which opens the system share
    // sheet (WhatsApp, email, etc.).
    handleGenerateReport();
  };

  const handleExportOptionsConfirm = () => {
    setExportOptionsOpen(false);
    void generate();
  };

  const toggleExportOption = (key: keyof StatementInclude) => {
    setIncludeOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <Screen>
      <ScreenHeader title="Reports & Export" />

      {/* Report Type Selection */}
      <Card style={styles.section}>
        <ThemedText type="smallBold" style={styles.sectionLabel}>
          Report Type
        </ThemedText>
        <View style={styles.chipRow}>
          {[
            { key: 'party', label: 'Party Statement' },
            { key: 'monthly', label: 'Monthly Report' },
            { key: 'combined', label: 'Combined Report' },
            { key: 'transactions', label: 'Transactions' },
          ].map((option) => (
            <Pressable
              key={option.key}
              onPress={() => setReportType(option.key as ReportType)}
              style={[
                styles.chip,
                { backgroundColor: theme.backgroundElement },
                reportType === option.key && { backgroundColor: theme.primary },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: reportType === option.key }}>
              <ThemedText
                type="small"
                style={[
                  { color: reportType === option.key ? theme.background : theme.text },
                ]}>
                {option.label}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      </Card>

      {/* Party Selection (for party statements) */}
      {reportType === 'party' && (
        <Card style={styles.section}>
          <ThemedText type="smallBold" style={styles.sectionLabel}>
            Select Party
          </ThemedText>
          <View style={styles.partyList}>
            {parties.map((party) => (
              <Pressable
                key={party.id}
                onPress={() => setSelectedPartyId(party.id)}
                style={[
                  styles.partyItem,
                  { backgroundColor: theme.backgroundElement },
                  selectedPartyId === party.id && { backgroundColor: theme.primary + '20', borderColor: theme.primary },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: selectedPartyId === party.id }}>
                <View style={styles.partyInfo}>
                  <ThemedText type="default" style={selectedPartyId === party.id && { color: theme.primary, fontWeight: '600' } }>
                    {party.name}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {party.type === 'customer' ? 'Customer' : 'Supplier'} {party.phone ? `• ${party.phone}` : ''}
                  </ThemedText>
                </View>
                {selectedPartyId === party.id && <Check size={20} color={theme.primary} />}
              </Pressable>
            ))}
          </View>
        </Card>
      )}

      {/* Date Range */}
      <Card style={styles.section}>
        <View style={styles.rangeTitle}>
          <CalendarRange size={18} color={theme.text} />
          <ThemedText type="smallBold" style={styles.rangeTitleText}>
            Date Range
          </ThemedText>
        </View>
        <TextField
          label="From (YYYY-MM-DD)"
          value={from}
          onChangeText={setFrom}
          placeholder="2026-08-01"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextField
          label="To (YYYY-MM-DD)"
          value={to}
          onChangeText={setTo}
          placeholder={todayISODate()}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <View style={styles.presetRow}>
          {presets.map((preset) => (
            <Pressable
              key={preset.key}
              onPress={() => applyPreset(preset)}
              accessibilityRole="button"
              style={[styles.chip, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="small" style={{ color: theme.primary }}>
                {preset.label}
              </ThemedText>
            </Pressable>
          ))}
        </View>

        <View style={[styles.hint, { backgroundColor: theme.backgroundElement }]}>
          <Info size={14} color={theme.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary">
            Leave both blank to include all entries.
          </ThemedText>
        </View>
      </Card>

      {/* Include Options (for party statements) — same list as the Export Options sheet */}
      {reportType === 'party' && (
        <Card style={styles.section}>
          <ThemedText type="smallBold" style={styles.sectionLabel}>
            Include in Report
          </ThemedText>

          {EXPORT_OPTIONS.map((option) => {
            const on = !!includeOptions[option.key];
            return (
              <Pressable
                key={option.key}
                onPress={() => toggleExportOption(option.key)}
                style={styles.optionRow}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}>
                <View
                  style={[
                    styles.checkbox,
                    { borderColor: theme.border },
                    on && { backgroundColor: theme.primary, borderColor: theme.primary },
                  ]}>
                  {on && <Check size={16} color={theme.background} />}
                </View>
                <View style={styles.optionTextWrap}>
                  <ThemedText>{option.label}</ThemedText>
                  {option.hint ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      {option.hint}
                    </ThemedText>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </Card>
      )}

      {/* Export Format Selection */}
      <Card style={styles.section}>
        <ThemedText type="smallBold" style={styles.sectionLabel}>
          Export Format
        </ThemedText>
        <View style={styles.formatRow}>
          <Pressable
            onPress={() => setExportFormat('pdf')}
            style={[
              styles.formatButton,
              { backgroundColor: theme.backgroundElement },
              exportFormat === 'pdf' && { backgroundColor: theme.primary },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: exportFormat === 'pdf' }}>
            <FileText size={20} color={exportFormat === 'pdf' ? theme.background : theme.text} />
            <ThemedText
              type="smallBold"
              style={[
                { marginTop: Spacing.one },
                { color: exportFormat === 'pdf' ? theme.background : theme.text },
              ]}>
              PDF
            </ThemedText>
          </Pressable>

          <Pressable
            onPress={() => setExportFormat('excel')}
            style={[
              styles.formatButton,
              { backgroundColor: theme.backgroundElement },
              exportFormat === 'excel' && { backgroundColor: theme.primary },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: exportFormat === 'excel' }}>
            <FileSpreadsheet size={20} color={exportFormat === 'excel' ? theme.background : theme.text} />
            <ThemedText
              type="smallBold"
              style={[
                { marginTop: Spacing.one },
                { color: exportFormat === 'excel' ? theme.background : theme.text },
              ]}>
              Excel (.xlsx)
            </ThemedText>
          </Pressable>
        </View>
      </Card>

      {/* Action Buttons */}
      <View style={styles.actions}>
        <LargeButton
          title={busy ? 'Generating...' : `Generate ${exportFormat === 'pdf' ? 'PDF' : 'Excel'}`}
          subtitle="Create report file"
          icon={FileText}
          onPress={handleGenerateReport}
          height={56}
          disabled={busy}
        />
        
        <View style={styles.secondaryActions}>
          <LargeButton
            title="Share"
            subtitle="WhatsApp, email, etc."
            icon={Share2}
            onPress={handleShare}
            variant="outline"
            height={52}
            disabled={busy}
          />
          <LargeButton
            title="Download"
            subtitle="Save to device"
            icon={Download}
            onPress={handleGenerateReport}
            variant="outline"
            height={52}
            disabled={busy}
          />
        </View>
      </View>

      {busy && (
        <View style={styles.busyRow}>
          <ActivityIndicator size="small" color={theme.primary} />
          <ThemedText type="small" themeColor="textSecondary">
            Generating report…
          </ThemedText>
        </View>
      )}

      {/* Export Options sheet — shown before generating/sharing a PDF */}
      {exportOptionsOpen && (
        <ExportOptionsSheet<keyof StatementInclude>
          visible
          options={EXPORT_OPTIONS}
          selected={includeOptions}
          onToggle={toggleExportOption}
          onCancel={() => setExportOptionsOpen(false)}
          onConfirm={handleExportOptionsConfirm}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  sectionLabel: {
    marginBottom: Spacing.one,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  chip: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Radius.input,
  },
  rangeTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  rangeTitleText: {
    fontSize: 16,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderRadius: Radius.input,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  partyList: {
    gap: Spacing.one,
  },
  partyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.two,
    borderRadius: Radius.input,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  partyInfo: {
    flex: 1,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  optionTextWrap: {
    flex: 1,
    gap: Spacing.half,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formatRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  formatButton: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Radius.input,
    gap: Spacing.one,
  },
  actions: {
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  secondaryActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  busyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    marginTop: Spacing.two,
  },
});