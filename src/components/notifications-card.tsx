/**
 * Settings card for local notifications: recurring due-day reminders and
 * sync-outcome alerts. Toggles are device-local (AsyncStorage); permission is
 * requested lazily the first time either switch is turned on. Hidden on web.
 */
import { Bell } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { Card } from '@/components/card';
import { feedback } from '@/components/feedback';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  cancelRecurringReminders,
  rescheduleRecurringReminders,
} from '@/services/notifications/reminders';
import {
  getRemindersEnabled,
  getSyncUpdatesEnabled,
  requestNotificationPermission,
  setRemindersEnabled,
  setSyncUpdatesEnabled,
} from '@/services/notifications/prefs';

export function NotificationsCard() {
  const theme = useTheme();
  const [reminders, setReminders] = useState(false);
  const [syncUpdates, setSyncUpdates] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    void Promise.all([getRemindersEnabled(), getSyncUpdatesEnabled()]).then(([r, s]) => {
      if (!mounted) {
        return;
      }
      setReminders(r);
      setSyncUpdates(s);
      setLoaded(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  /** Asks for permission once; explains what to do if denied. */
  const ensurePermission = async (): Promise<boolean> => {
    if (await requestNotificationPermission()) {
      return true;
    }
    feedback.alert({
      title: 'Notifications off',
      message:
        'Allow DailyKhata notifications in your phone settings to get reminders and sync updates.',
      tone: 'danger',
    });
    return false;
  };

  const toggleReminders = async (value: boolean) => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      if (value && !(await ensurePermission())) {
        return;
      }
      await setRemindersEnabled(value);
      setReminders(value);
      if (value) {
        await rescheduleRecurringReminders();
      } else {
        await cancelRecurringReminders();
      }
    } catch (error) {
      feedback.toast({ message: 'Could not update reminders.', tone: 'error' });
      console.error('[Notifications] Reminder toggle failed:', error);
    } finally {
      setBusy(false);
    }
  };

  const toggleSyncUpdates = async (value: boolean) => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      if (value && !(await ensurePermission())) {
        return;
      }
      await setSyncUpdatesEnabled(value);
      setSyncUpdates(value);
    } catch (error) {
      feedback.toast({ message: 'Could not update sync updates.', tone: 'error' });
      console.error('[Notifications] Sync toggle failed:', error);
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) {
    return null;
  }

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: theme.backgroundElement }]}>
          <Bell size={22} color={theme.primary} />
        </View>
        <View style={styles.rowLabel}>
          <ThemedText type="default">Notifications</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Reminders and sync alerts on this device
          </ThemedText>
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.rowLabel}>
          <ThemedText type="default">Recurring reminders</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Remind me in the morning when a scheduled entry is due
          </ThemedText>
        </View>
        <Switch
          value={reminders}
          onValueChange={toggleReminders}
          disabled={busy}
          trackColor={{ true: theme.primary, false: theme.border }}
          thumbColor="#FFFFFF"
          accessibilityLabel="Recurring reminders"
        />
      </View>

      <View style={styles.row}>
        <View style={styles.rowLabel}>
          <ThemedText type="default">Sync updates</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Alert me about sync issues and new data
          </ThemedText>
        </View>
        <Switch
          value={syncUpdates}
          onValueChange={toggleSyncUpdates}
          disabled={busy}
          trackColor={{ true: theme.primary, false: theme.border }}
          thumbColor="#FFFFFF"
          accessibilityLabel="Sync updates"
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  rowLabel: {
    flex: 1,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: Radius.input,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
