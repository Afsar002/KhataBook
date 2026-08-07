/** Branded destructive confirmation (design-system bottom sheet). */
import { feedback } from '@/components/feedback';

export function confirmDelete(title: string, message: string, onConfirm: () => void) {
  feedback.confirm({
    title,
    message,
    danger: true,
    confirmLabel: 'Delete',
    onConfirm,
  });
}
