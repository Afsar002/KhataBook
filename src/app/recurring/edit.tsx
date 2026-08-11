/**
 * Edit recurring template screen.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { LargeButton } from '@/components/large-button';
import { RecurringForm, type RecurringFormValues } from '@/components/recurring-form';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { feedback } from '@/components/feedback';
import {
  deleteRecurringTemplate,
  getRecurringTemplate,
  updateRecurringTemplate,
} from '@/db/recurring-repo';
import type { RecurringTemplate } from '@/types';

/** Map a stored template onto the form's field shape. */
function templateToValues(template: RecurringTemplate): RecurringFormValues {
  return {
    templateType: template.templateType,
    type: template.type ?? 'expense',
    amount: template.amount.toString(),
    accountId: template.accountId ?? null,
    categoryId: template.categoryId ?? null,
    partyId: template.partyId ?? null,
    direction: template.direction ?? 'out',
    note: template.note,
    frequency: template.frequency,
    dayOfWeek: template.dayOfWeek ?? null,
    dayOfMonth: template.dayOfMonth ?? null,
    startDate: template.startDate,
    endDate: template.endDate ?? '',
    isActive: template.isActive,
  };
}

export default function RecurringEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const templateId = parseInt(id, 10);

  const [template, setTemplate] = useState<RecurringTemplate | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadTemplate = async () => {
      try {
        setTemplate(await getRecurringTemplate(templateId));
      } catch {
        feedback.toast({ message: 'Failed to load template', tone: 'error' });
      } finally {
        setLoading(false);
      }
    };
    void loadTemplate();
  }, [templateId]);

  if (loading) {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <ThemedText type="default" themeColor="textSecondary">
            Loading template…
          </ThemedText>
        </View>
      </Screen>
    );
  }

  return (
    <RecurringForm
      key={template?.id ?? 'empty'}
      title="Edit Template"
      saveLabel="Save Changes"
      showStatus
      initialValues={template ? templateToValues(template) : undefined}
      footer={
        <LargeButton
          title="Delete Template"
          variant="expense"
          onPress={() => {
            feedback.confirm({
              title: 'Delete template?',
              message: 'This action cannot be undone. Future scheduled entries will be stopped.',
              danger: true,
              confirmLabel: 'Delete',
              onConfirm: async () => {
                try {
                  await deleteRecurringTemplate(templateId);
                  router.back();
                } catch {
                  feedback.toast({ message: 'Failed to delete template', tone: 'error' });
                }
              },
            });
          }}
        />
      }
      onSubmit={async (payload) => {
        await updateRecurringTemplate(templateId, payload);
        router.back();
      }}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
