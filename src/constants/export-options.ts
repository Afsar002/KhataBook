/**
 * Shared PDF export options.
 *
 * One source of truth for the Export Options bottom sheet and the "Include in
 * Report" card on the export screen — both render this exact list, so adding a
 * future option (Include Phone Number, Date Range, Theme, Business Details…)
 * is a single entry here and no UI redesign.
 */
import type { ExportOptionSpec } from '@/components/export-options-sheet';
import type { StatementInclude } from '@/utils/statement';

export const EXPORT_OPTIONS: ExportOptionSpec<keyof StatementInclude>[] = [
  {
    key: 'entryDetails',
    label: 'Include Transaction Descriptions',
    hint: 'Show what each entry was for',
  },
  {
    key: 'notes',
    label: 'Include Notes',
    hint: 'Extra notes under each entry',
  },
  {
    key: 'runningBalance',
    label: 'Include Running Balance',
    hint: 'Balance after every entry',
  },
];
