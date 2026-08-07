/**
 * Recurring transaction scheduler service.
 *
 * Generates entries from active recurring templates based on their schedule.
 * Can be called from:
 * - App startup (to catch up on missed entries)
 * - Background task (expo-task-manager)
 * - Manual "Generate now" button in Settings
 */
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import {
  listActiveRecurringTemplatesForDate,
  listRecurringTemplates,
  updateLastGeneratedDate,
} from '@/db/recurring-repo';
import { addTransaction } from '@/db/transaction-repo';
import { addPartyTransaction } from '@/db/party-repo';
import type { RecurringTemplate } from '@/types';

interface GeneratedEntry {
  templateId: number;
  templateUuid: string;
  success: boolean;
  error?: string;
}

/**
 * Check if a template should generate an entry for the given date.
 * This is a secondary check in addition to the SQL query.
 */
function shouldGenerateForDate(template: RecurringTemplate, date: string): boolean {
  const templateDate = new Date(template.startDate + 'T00:00:00');
  const targetDate = new Date(date + 'T00:00:00');

  if (targetDate < templateDate) {
    return false;
  }

  if (template.endDate) {
    const endDate = new Date(template.endDate + 'T00:00:00');
    if (targetDate > endDate) {
      return false;
    }
  }

  // Check last generated date
  if (template.lastGeneratedDate) {
    const lastGen = new Date(template.lastGeneratedDate + 'T00:00:00');
    if (lastGen >= targetDate) {
      return false;
    }
  }

  // Frequency-specific checks (belt and suspenders - SQL already filters)
  const targetDay = targetDate.getDay(); // 0 = Sunday
  const targetDayOfMonth = targetDate.getDate();

  switch (template.frequency) {
    case 'daily':
      return true;
    case 'weekly':
      return template.dayOfWeek === targetDay;
    case 'monthly':
      return template.dayOfMonth === targetDayOfMonth;
    default:
      return false;
  }
}

/**
 * Generate entries from all active recurring templates for a specific date.
 * Returns array of generated entries with success/error status.
 */
export async function generateEntriesForDate(
  date: string // YYYY-MM-DD
): Promise<GeneratedEntry[]> {
  const templates = await listActiveRecurringTemplatesForDate(date);
  const results: GeneratedEntry[] = [];

  for (const template of templates) {
    // Double-check in case of race conditions
    if (!shouldGenerateForDate(template, date)) {
      continue;
    }

    try {
      if (template.templateType === 'transaction') {
        if (!template.type || template.accountId == null) {
          throw new Error('Invalid transaction template: missing type or account');
        }

        await addTransaction({
          type: template.type,
          amount: template.amount,
          accountId: template.accountId,
          categoryId: template.categoryId ?? null,
          note: template.note,
          date,
        });
      } else if (template.templateType === 'party_transaction') {
        if (!template.direction || template.partyId == null) {
          throw new Error('Invalid party transaction template: missing direction or party');
        }

        await addPartyTransaction({
          partyId: template.partyId,
          direction: template.direction,
          amount: template.amount,
          note: template.note,
          date,
        });
      }

      // Update last generated date
      await updateLastGeneratedDate(template.id, date);

      results.push({
        templateId: template.id,
        templateUuid: template.uuid,
        success: true,
      });
    } catch (error) {
      results.push({
        templateId: template.id,
        templateUuid: template.uuid,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

/**
 * Generate entries for all dates from the last generated date up to today.
 * Used on app startup to catch up on missed days.
 */
export async function catchUpMissedEntries(): Promise<GeneratedEntry[]> {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const allResults: GeneratedEntry[] = [];

  // Get all active templates to find the earliest start date
  const templates = await listRecurringTemplates(true);

  if (templates.length === 0) {
    return [];
  }

  // Find the earliest date we need to check from
  let earliestDate = today;
  for (const template of templates) {
    const templateStart = new Date(template.startDate + 'T00:00:00');
    const lastGen = template.lastGeneratedDate
      ? new Date(template.lastGeneratedDate + 'T00:00:00')
      : templateStart;

    // We need to check from the day after last generated (or start date) up to today
    const checkFrom = new Date(lastGen);
    checkFrom.setDate(checkFrom.getDate() + 1);

    if (checkFrom < new Date(earliestDate + 'T00:00:00')) {
      earliestDate = checkFrom.toISOString().split('T')[0];
    }
  }

  // Generate for each date from earliest to today
  const currentDate = new Date(earliestDate + 'T00:00:00');
  const endDate = new Date(today + 'T00:00:00');

  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split('T')[0];
    const results = await generateEntriesForDate(dateStr);
    allResults.push(...results);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return allResults;
}

/**
 * Generate entries for today only.
 * Used by background task or manual trigger.
 */
export async function generateTodaysEntries(): Promise<GeneratedEntry[]> {
  const today = new Date().toISOString().split('T')[0];
  return generateEntriesForDate(today);
}

/**
 * Register the recurring task with expo-task-manager.
 * This should be called once during app initialization.
 */
// Module-level flag to prevent duplicate registrations
let isRecurringTaskRegistered = false;

export async function registerRecurringTask(): Promise<void> {
  // Prevent duplicate registrations
  if (isRecurringTaskRegistered) {
    console.log('[RecurringTask] Already registered - skipping duplicate call');
    return;
  }

  // Check if we're in Expo Go (which doesn't support background tasks).
  // Use expo-constants' ExecutionEnvironment for reliable detection in SDK 57.
  const isExpoGo =
    Platform.OS !== 'web' &&
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient &&
    Constants.appOwnership === 'expo';

  if (isExpoGo) {
    // Mark as registered to prevent future calls
    isRecurringTaskRegistered = true;
    console.log('[RecurringTask] Running in Expo Go - skipping background task registration');
    // In Expo Go, we'll rely on polling or manual triggers.
    // No console.warn here — it would spam LogBox on every launch.
    return;
  }

  // Import dynamically to avoid issues on web
  const TaskManager = await import('expo-task-manager');
  const BackgroundTask = await import('expo-background-task');

  const TASK_NAME = 'recurring-transaction-generator';

  // Define the task
  TaskManager.defineTask(TASK_NAME, async () => {
    try {
      const results = await generateTodaysEntries();
      const successCount = results.filter((r) => r.success).length;
      const failureCount = results.filter((r) => !r.success).length;

      console.log(
        `[RecurringTask] Generated ${successCount} entries, ${failureCount} failed`
      );

      return BackgroundTask.BackgroundTaskResult.Success;
    } catch (error) {
      console.error('[RecurringTask] Failed:', error);
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });

  // Register the task to run daily at a specific time (e.g., 6 AM)
  // Note: expo-background-task doesn't support exact time scheduling directly.
  // For production, consider using expo-notifications with scheduled triggers
  // or a native module for precise timing.
  try {
    await BackgroundTask.registerTaskAsync(TASK_NAME, {
      minimumInterval: 24 * 60, // 24 hours in minutes
    });
    console.log('[RecurringTask] Registered successfully');
    // Mark as registered only after successful registration
    isRecurringTaskRegistered = true;
  } catch (error) {
    console.error('[RecurringTask] Registration failed:', error);
    // In development, provide helpful error message
    if (__DEV__) {
      console.warn('[RecurringTask] Background task registration failed.');
      console.warn('  This may be due to running in Expo Go or Expo managed workflow.');
      console.warn('  For development, consider running in a development build.');
    }
    // Mark as "attempted" even on failure to prevent retries
    isRecurringTaskRegistered = true;
  }
}

/**
 * Unregister the recurring task.
 */
export async function unregisterRecurringTask(): Promise<void> {
  // Check if we're in Expo Go (which doesn't support background tasks)
  const isExpoGo =
    Platform.OS !== 'web' &&
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient &&
    Constants.appOwnership === 'expo';

  if (isExpoGo) {
    // Reset registration state so it can be registered again
    isRecurringTaskRegistered = false;
    console.log('[RecurringTask] Skipping unregister - task was never registered in Expo Go');
    return;
  }

  // Reset registration state so it can be registered again
  isRecurringTaskRegistered = false;

  const BackgroundTask = await import('expo-background-task');
  const TASK_NAME = 'recurring-transaction-generator';

  try {
    await BackgroundTask.unregisterTaskAsync(TASK_NAME);
    console.log('[RecurringTask] Unregistered');
  } catch (error) {
    console.error('[RecurringTask] Unregistration failed:', error);
    // In development, provide helpful error message
    if (__DEV__) {
      console.warn('[RecurringTask] Background task unregistration failed.');
      console.warn('  This is expected in certain environments.');
    }
  }
}
