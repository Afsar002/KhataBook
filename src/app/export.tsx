/**
 * Report & Export screen (PDF + Excel only).
 *
 * Generates professional financial statements with date range selection,
 * customizable options, and multiple export formats.
 */

import { router } from 'expo-router';
import {
  CalendarRange,
  ChevronLeft,
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
import { feedback } from '@/components/feedback';
import { LargeButton } from '@/components/large-button';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { buildStatementReportPdf, buildMonthlyReportPdf, buildCombinedPdf } from '@/utils/pdf';
import { saveWorkbook, partyStatementToExcel, monthlyReportToExcel } from '@/utils/excel';
import { shiftISODate, todayISODate } from '@/utils/format';
import { writeAndShareFile } from '@/utils/share';
import { listParties, listPartyTransactionsAsc } from '@/db/party-repo';
import { useMonthlyReport } from '@/hooks/use-monthly-report';
import type { Party, PartyDirection } from '@/types';
import { computeStatementReport, type StatementInclude, DEFAULT_INCLUDE } from '@/utils/statement';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-08" → first day of that month as `YYYY-MM-DD`. */
function monthStart(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

type ReportType = 'party' | 'monthly' | 'combined';
type ExportFormat = 'pdf' | 'excel';

export default function ExportScreen() {
  const theme = useTheme();
  const [reportType, setReportType] = useState<ReportType>('party');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('pdf');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
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

  const presets = [
    { label: 'All', apply: () => setBoth('', '') },
    { label: 'Today', apply: () => setBoth(todayISODate(), todayISODate()) },
    {
      label: 'This Month',
      apply: () => {
        const now = new Date();
        setBoth(monthStart(now.getFullYear(), now.getMonth()), todayISODate());
      },
    },
    {
      label: 'Last Month',
      apply: () => {
        const now = new Date();
        const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastDay = shiftISODate(monthStart(now.getFullYear(), now.getMonth()), -1);
        setBoth(monthStart(prev.getFullYear(), prev.getMonth()), lastDay);
      },
    },
  ];

  function setBoth(fromValue: string, toValue: string) {
    setFrom(fromValue);
    setTo(toValue);
  }

  const handleGenerateReport = async () => {
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
            createdAt: new Date().toISOString(),
            runningBalance: e.runningBalance,
            kind: e.kind,
          }));
          const wb = partyStatementToExcel(
            party.name,
            party.phone,
            party.type,
            report.openingBalance,
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

  const handleShare = async () => {
    // Share functionality uses the same writeAndShareFile which opens system share sheet
    // This includes WhatsApp, email, etc.
    await handleGenerateReport();
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.back}>
          <ChevronLeft size={28} color={theme.text} />
        </Pressable>
        <ThemedText type="subtitle">Reports & Export</ThemedText>
      </View>

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
              key={preset.label}
              onPress={preset.apply}
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

      {/* Include Options (for party statements) */}
      {reportType === 'party' && (
        <Card style={styles.section}>
          <ThemedText type="smallBold" style={styles.sectionLabel}>
            Include in Report
          </ThemedText>
          
          <Pressable
            onPress={() => setIncludeOptions(prev => ({ ...prev, openingBalance: !prev.openingBalance }))}
            style={styles.optionRow}>
            <View style={[styles.checkbox, { borderColor: theme.border }, includeOptions.openingBalance && { backgroundColor: theme.primary, borderColor: theme.primary }]}>
              {includeOptions.openingBalance && <Check size={16} color={theme.background} />}
            </View>
            <ThemedText>Opening Balance</ThemedText>
          </Pressable>

          <Pressable
            onPress={() => setIncludeOptions(prev => ({ ...prev, entryDetails: !prev.entryDetails }))}
            style={styles.optionRow}>
            <View style={[styles.checkbox, { borderColor: theme.border }, includeOptions.entryDetails && { backgroundColor: theme.primary, borderColor: theme.primary }]}>
              {includeOptions.entryDetails && <Check size={16} color={theme.background} />}
            </View>
            <ThemedText>Entry Details</ThemedText>
          </Pressable>

          <Pressable
            onPress={() => setIncludeOptions(prev => ({ ...prev, notes: !prev.notes }))}
            style={styles.optionRow}>
            <View style={[styles.checkbox, { borderColor: theme.border }, includeOptions.notes && { backgroundColor: theme.primary, borderColor: theme.primary }]}>
              {includeOptions.notes && <Check size={16} color={theme.background} />}
            </View>
            <ThemedText>Notes</ThemedText>
          </Pressable>

          <Pressable
            onPress={() => setIncludeOptions(prev => ({ ...prev, runningBalance: !prev.runningBalance }))}
            style={styles.optionRow}>
            <View style={[styles.checkbox, { borderColor: theme.border }, includeOptions.runningBalance && { backgroundColor: theme.primary, borderColor: theme.primary }]}>
              {includeOptions.runningBalance && <Check size={16} color={theme.background} />}
            </View>
            <ThemedText>Running Balance</ThemedText>
          </Pressable>
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  back: {
    paddingVertical: Spacing.one,
    paddingRight: Spacing.two,
  },
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