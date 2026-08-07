/**
 * Create new recurring template screen.
 */
import { router } from 'expo-router';

import { RecurringForm } from '@/components/recurring-form';
import { addRecurringTemplate } from '@/db/recurring-repo';

export default function RecurringNewScreen() {
  return (
    <RecurringForm
      title="New Template"
      saveLabel="Save Template"
      onSubmit={async (payload) => {
        await addRecurringTemplate(payload);
        router.back();
      }}
    />
  );
}
