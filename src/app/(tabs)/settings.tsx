import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import { useRouter } from 'expo-router';
import { File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Cloud,
  Download,
  FileSpreadsheet,
  History,
  Lock,
  LogOut,
  Moon,
  RefreshCw,
  Repeat,
  Settings2,
  Smartphone,
  Tags,
  Trash2,
  Upload,
  FolderOpen,
} from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Switch, View } from 'react-native';

import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { feedback } from '@/components/feedback';
import { LargeButton } from '@/components/large-button';
import { NotificationsCard } from '@/components/notifications-card';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { notificationsSupported } from '@/services/notifications/expo';
import { ThemedText } from '@/components/themed-text';
import { APP_VERSION } from '@/constants/app';
import { Radius, Spacing } from '@/constants/theme';
import { useAppTheme } from '@/context/theme-context';
import { useAuth } from '@/context/auth-context';
import { AVATAR_EMOJIS, useProfile } from '@/context/profile-context';
import { useSync } from '@/context/sync-context';
import { buildBackupJSON, parseBackup, restoreBackup } from '@/db/backup';
import {
  isAutoBackupEnabled,
  setAutoBackupEnabled as setAutoBackupSetting,
} from '@/services/backup/daily-backup';
import { setSetting } from '@/db/settings';
import { wipeDatabase } from '@/db/database';
import { countUnresolvedConflicts } from '@/db/sync/conflict-repo';
import { listSyncEvents } from '@/db/sync/history-repo';
import { listSyncedDevices } from '@/db/sync/device-repo';
import { countFailed, countPending, retryAll } from '@/db/sync/queue';
import { useLastSyncFrom } from '@/hooks/use-last-sync-from';
import { useTheme } from '@/hooks/use-theme';
import { authenticateWithDevice, hasDeviceCredentials } from '@/services/app-lock/auth';
import { getAppLockEnabled, setAppLockEnabled } from '@/services/app-lock/prefs';
import { getDeviceName, setDeviceName } from '@/services/device/device-name';
import { impact } from '@/utils/haptics';
import type { SyncDevice, SyncHistoryEntry } from '@/types';
import type { SyncStatus } from '@/services/sync/engine';
import { todayISODate } from '@/utils/format';
import { writeAndShareFile } from '@/utils/share';
import { readFileFromDocuments } from '@/utils/file';

interface AutoBackupFile {
  name: string;
  displayName: string;
  date: string;
  size: string;
  uri: string;
}

/**
 * A single Cloud Sync status row: label on the left, value on the right. When
 * `dotColor` is set, a small colored dot is shown next to the value (used for
 * the live-sync indicator).
 */
function CloudInfoRow({
  label,
  value,
  dotColor,
}: {
  label: string;
  value: string;
  dotColor?: string;
}) {
  return (
    <View style={styles.cloudInfoRow}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <View style={styles.cloudInfoValue}>
        {dotColor ? <View style={[styles.liveDot, { backgroundColor: dotColor }]} /> : null}
        <ThemedText type="smallBold">{value}</ThemedText>
      </View>
    </View>
  );
}

/** Human label for the engine's sync status. */
function syncStatusLabel(status: SyncStatus, syncing: boolean): string {
  if (syncing) {
    return 'Syncing…';
  }
  switch (status.state) {
    case 'unconfigured':
      return 'Not configured';
    case 'offline':
      return 'Offline';
    case 'error':
      return 'Needs attention';
    case 'version_blocked':
      return 'Update required';
    default:
      return 'In sync';
  }
}

/** "Just now" / "12 min ago" / "3 hr ago" / a date — or "Never". */
function formatLastSync(iso: string | null): string {
  if (!iso) {
    return 'Never';
  }
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return iso;
  }
  const diff = Date.now() - then;
  if (diff < 60_000) {
    return 'Just now';
  }
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hr ago`;
  }
  return new Date(iso).toLocaleDateString();
}

/** Periodic auto-sync frequency options shown as chips (0 = off). */
const SYNC_INTERVAL_OPTIONS = [
  { label: 'Off', minutes: 0 },
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '1 hr', minutes: 60 },
];

/** Cloud Sync card — shows the live account/status when configured, or the offline prompt. */
function CloudSyncCard() {
  const theme = useTheme();
  const router = useRouter();
  const { status: authStatus, account, signOut } = useAuth();
  const {
    status,
    lastSyncAt,
    lastResult,
    syncing,
    autoSync,
    setAutoSync,
    wifiOnly,
    setWifiOnly,
    intervalMinutes,
    setIntervalMinutes,
    runNow,
  } = useSync();
  const lastSyncFrom = useLastSyncFrom();
  const [deviceName, setDeviceNameState] = useState('');
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [deviceSaved, setDeviceSaved] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [conflictCount, setConflictCount] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyEvents, setHistoryEvents] = useState<SyncHistoryEntry[]>([]);
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [syncedDevices, setSyncedDevices] = useState<SyncDevice[]>([]);
  useEffect(() => {
    getDeviceName().then(setDeviceNameState);
  }, []);

  /** Reload the queue badge counts (pending + parked) from SQLite. */
  const refreshQueue = useCallback(() => {
    void Promise.all([countPending(), countFailed(), countUnresolvedConflicts()]).then(
      ([pending, failed, conflicts]) => {
        setPendingCount(pending);
        setFailedCount(failed);
        setConflictCount(conflicts);
      }
    );
  }, []);

  // Refresh on mount and whenever a sync run finishes (syncing flips back).
  useEffect(() => {
    refreshQueue();
  }, [refreshQueue, syncing]);

  /** Loads the recent sync history log (conflicts + sync runs). */
  const loadHistory = useCallback(() => {
    void listSyncEvents(20).then(setHistoryEvents);
  }, []);

  // Load the log when the section is first opened, and refresh it after a sync
  // run so a brand-new conflict appears immediately.
  useEffect(() => {
    if (historyOpen) {
      loadHistory();
    }
  }, [historyOpen, loadHistory, syncing]);

  /** Loads the list of devices that have synced. */
  const loadDevices = useCallback(() => {
    void listSyncedDevices().then(setSyncedDevices);
  }, []);

  // Load devices when the section is first opened, and refresh after a sync run.
  useEffect(() => {
    if (devicesOpen) {
      loadDevices();
    }
  }, [devicesOpen, loadDevices, syncing]);

  /** Resets parked uploads and kicks a manual sync immediately. */
  const handleRetryAll = async () => {
    impact('medium');
    try {
      await retryAll();
      refreshQueue();
      void runNow();
    } catch (error) {
      console.error('Failed to retry all:', error);
      feedback.toast({ message: 'Failed to retry sync entries. Please try again.', tone: 'error' });
    }
  };

  /** Shows detailed error info from the last sync run. */
  const showLastSyncErrors = useCallback(() => {
    if (!lastResult || lastResult.errors.length === 0) {
      feedback.toast({ message: 'No errors in last sync.', tone: 'info' });
      return;
    }
    const errorLines = lastResult.errors.map((e) =>
      `${e.table} · ${e.operation} · ${e.code ?? 'N/A'}: ${e.message}`
    );
    feedback.alert({
      title: `${lastResult.errors.length} sync error${lastResult.errors.length === 1 ? '' : 's'}`,
      message: errorLines.join('\n\n'),
    });
  }, [lastResult]);

  const saveDeviceName = () => {
    impact('light');
    setDeviceBusy(true);
    void setDeviceName(deviceName).then(async () => {
      const trimmed = deviceName.trim();
      if (trimmed) {
        await setSetting('last_sync_from', trimmed);
      }
      setDeviceBusy(false);
      setDeviceSaved(true);
      setTimeout(() => setDeviceSaved(false), 2000);
    });
  };

  if (authStatus === 'unconfigured') {
    return (
      <Card style={styles.cloudCard}>
        <View style={styles.row}>
          <View style={[styles.icon, { backgroundColor: theme.backgroundElement }]}>
            <Cloud size={22} color={theme.primary} />
          </View>
          <View style={styles.rowLabel}>
            <ThemedText type="default">Cloud Sync</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Not configured
            </ThemedText>
          </View>
        </View>

        <View style={[styles.cloudDivider, { backgroundColor: theme.border }]} />

        <CloudInfoRow label="Connected Account" value="Offline" />
        <CloudInfoRow label="Last Sync" value="Never" />
        <CloudInfoRow label="Sync Status" value="Off" />

        <ThemedText type="small" themeColor="textSecondary" style={styles.cloudNote}>
          Cloud sync is off because the app has no Supabase keys yet. Add your project in
          `.env` (see docs/10-supabase-setup.md) and it switches on automatically — until
          then everything stays safely on this device.
        </ThemedText>
      </Card>
    );
  }

  const confirmSignOut = () => {
    feedback.confirm({
      title: 'Sign out?',
      message: 'Your entries stay on this device and re-sync when you sign back in.',
      confirmLabel: 'Sign Out',
      danger: true,
      onConfirm: () => {
        void signOut();
      },
    });
  };

  return (
    <Card style={styles.cloudCard}>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: theme.incomeSoft }]}>
          <Cloud size={22} color={theme.primary} />
        </View>
        <View style={styles.rowLabel}>
          <ThemedText type="default">Cloud Sync</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {syncing ? 'Syncing now…' : status.autoSync ? 'Automatic backups on' : 'Auto sync off'}
          </ThemedText>
        </View>
      </View>

      <View style={[styles.cloudDivider, { backgroundColor: theme.border }]} />

      <CloudInfoRow label="Connected Account" value={account} />
      <CloudInfoRow label="Last Sync" value={formatLastSync(lastSyncAt)} />
      <CloudInfoRow label="Sync Status" value={syncStatusLabel(status, syncing)} />
      <CloudInfoRow
        label="Live Sync"
        value={
          status.realtimeMode === 'live' ? 'Live' : status.realtimeMode === 'degraded' ? 'Reconnecting…' : 'Off'
        }
        dotColor={
          status.realtimeMode === 'live' ? theme.income : status.realtimeMode === 'degraded' ? theme.warning : theme.border
        }
      />
      {lastSyncFrom ? <CloudInfoRow label="From Device" value={lastSyncFrom} /> : null}

      {lastResult && lastResult.conflicts > 0 ? (
        <View style={[styles.conflictBanner, { backgroundColor: theme.expenseSoft }]}>
          <AlertTriangle size={16} color={theme.danger} />
          <ThemedText type="small" themeColor="danger" style={styles.conflictText}>
            {lastResult.conflicts === 1
              ? '1 local change was overwritten by a newer version from the cloud.'
              : `${lastResult.conflicts} local changes were overwritten by newer versions from the cloud.`}
          </ThemedText>
        </View>
      ) : null}

      <Pressable
        onPress={() => {
          impact('light');
          router.push('/conflicts');
        }}
        accessibilityRole="button"
        accessibilityLabel="Review sync conflicts"
        style={styles.row}>
        <View style={styles.rowLabel}>
          <ThemedText type="default">Conflicts</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {conflictCount === 0
              ? 'No unsynced changes were overwritten'
              : `${conflictCount} local ${conflictCount === 1 ? 'change was' : 'changes were'} overwritten — review & restore`}
          </ThemedText>
        </View>
        <ChevronRight size={18} color={theme.textSecondary} />
      </Pressable>

      <LargeButton
        title="Sync Now"
        subtitle="Upload & download the latest"
        icon={RefreshCw}
        onPress={() => {
          impact('medium');
          void runNow();
        }}
        variant="outline"
        height={64}
        disabled={syncing}
      />

      <View style={styles.row}>
        <View style={styles.rowLabel}>
          <ThemedText type="default">Auto Sync</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Back up changes automatically
          </ThemedText>
        </View>
        <Switch
          value={autoSync}
          onValueChange={setAutoSync}
          trackColor={{ true: theme.primary, false: theme.border }}
          thumbColor="#FFFFFF"
          accessibilityLabel="Auto sync"
        />
      </View>

      <View style={styles.row}>
        <View style={styles.rowLabel}>
          <ThemedText type="default">Wi-Fi only</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Don&apos;t auto-sync on mobile data
          </ThemedText>
        </View>
        <Switch
          value={wifiOnly}
          onValueChange={setWifiOnly}
          trackColor={{ true: theme.primary, false: theme.border }}
          thumbColor="#FFFFFF"
          accessibilityLabel="Wi-Fi only"
        />
      </View>

      <View style={styles.row}>
        <View style={styles.rowLabel}>
          <ThemedText type="default">Auto-sync frequency</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {intervalMinutes > 0
              ? `Every ${intervalMinutes} minutes while the app is open`
              : 'Only when you edit or open the app'}
          </ThemedText>
        </View>
      </View>
      <View style={styles.frequencyRow}>
        {SYNC_INTERVAL_OPTIONS.map((option) => (
          <Chip
            key={option.minutes}
            label={option.label}
            selected={intervalMinutes === option.minutes}
            onPress={() => setIntervalMinutes(option.minutes)}
            style={styles.frequencyChip}
          />
        ))}
      </View>

      <View style={styles.row}>
        <View style={styles.rowLabel}>
          <ThemedText type="default">Pending changes</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {failedCount > 0
              ? `${pendingCount - failedCount} pending · ${failedCount} failed`
              : pendingCount > 0
                ? `${pendingCount} pending`
                : 'All caught up'}
          </ThemedText>
        </View>
      </View>
      {failedCount > 0 ? (
        <LargeButton
          title="Retry Failed Uploads"
          subtitle="Reset the queue and upload again"
          icon={RefreshCw}
          onPress={handleRetryAll}
          variant="outline"
          height={56}
        />
      ) : null}
      {failedCount > 0 ? (
        <LargeButton
          title="Show Sync Errors"
          subtitle="See exactly why uploads failed"
          icon={AlertTriangle}
          onPress={showLastSyncErrors}
          variant="outline"
          height={56}
        />
      ) : null}

      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.cloudNote}>
        Device name
      </ThemedText>
      <TextField
        placeholder="e.g. Shop counter"
        value={deviceName}
        onChangeText={setDeviceNameState}
        autoCapitalize="words"
        accessibilityLabel="Device name"
        style={styles.deviceField}
      />
      <LargeButton
        title="Save Device Name"
        subtitle="Shown as 'Last Sync from' on your devices"
        icon={Smartphone}
        onPress={saveDeviceName}
        variant="outline"
        height={56}
        disabled={deviceBusy}
      />
      {deviceSaved ? (
        <ThemedText type="small" themeColor="primary" style={styles.savedLine}>
          Saved ✓
        </ThemedText>
      ) : null}

      <Pressable
        onPress={() => {
          impact('light');
          setHistoryOpen((value) => !value);
        }}
        accessibilityRole="button"
        accessibilityLabel="Sync history"
        style={styles.row}>
        <View style={[styles.icon, { backgroundColor: theme.backgroundElement }]}>
          <History size={22} color={theme.text} />
        </View>
        <View style={styles.rowLabel}>
          <ThemedText type="default">Sync History</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Conflicts & recent syncs
          </ThemedText>
        </View>
        {historyOpen ? (
          <ChevronDown size={22} color={theme.text} />
        ) : (
          <ChevronRight size={22} color={theme.text} />
        )}
      </Pressable>
      {historyOpen ? (
        <View style={styles.historyList}>
          {historyEvents.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              No sync activity yet.
            </ThemedText>
          ) : (
            historyEvents.map((event) => (
              <View key={event.id} style={styles.historyRow}>
                <View
                  style={[
                    styles.historyDot,
                    { backgroundColor: event.eventType === 'conflict' ? theme.danger : theme.primary },
                  ]}
                />
                <ThemedText
                  type="small"
                  themeColor={event.eventType === 'conflict' ? 'danger' : 'textSecondary'}
                  style={styles.historyText}>
                  {event.message}
                </ThemedText>
              </View>
            ))
          )}
        </View>
      ) : null}

      <Pressable
        onPress={() => {
          impact('light');
          setDevicesOpen((value) => !value);
        }}
        accessibilityRole="button"
        accessibilityLabel="Synced devices"
        style={styles.row}>
        <View style={[styles.icon, { backgroundColor: theme.backgroundElement }]}>
          <Smartphone size={22} color={theme.text} />
        </View>
        <View style={styles.rowLabel}>
          <ThemedText type="default">Synced Devices</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Devices that have successfully synced
          </ThemedText>
        </View>
        {devicesOpen ? (
          <ChevronDown size={22} color={theme.text} />
        ) : (
          <ChevronRight size={22} color={theme.text} />
        )}
      </Pressable>
      {devicesOpen ? (
        <View style={styles.historyList}>
          {syncedDevices.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              No devices have synced yet.
            </ThemedText>
          ) : (
            syncedDevices.map((device) => (
              <View key={device.id} style={styles.historyRow}>
                <View style={[styles.historyDot, { backgroundColor: theme.primary }]} />
                <ThemedText type="small" themeColor="textSecondary" style={styles.historyText}>
                  {device.deviceName}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.historyText}>
                  {formatLastSync(device.lastSyncAt)}
                </ThemedText>
              </View>
            ))
          )}
        </View>
      ) : null}

      <LargeButton
        title="Sign Out"
        subtitle={account}
        icon={LogOut}
        onPress={confirmSignOut}
        variant="outline"
        height={64}
      />

      {authStatus === 'signedOut' ? (
        <LargeButton
          title="Sign In"
          subtitle="Enable cloud sync"
          icon={Cloud}
          onPress={() => router.push('/auth')}
          height={64}
        />
      ) : null}
    </Card>
  );
}

/**
 * Profile card — the user's name, shop name and avatar emoji. Stored in the
 * synced settings table, so it follows the user across devices.
 * Collapsible: shows summary by default, expands on tap to edit.
 */
function ProfileCard() {
  const theme = useTheme();
  const { profile, saveProfile } = useProfile();
  const [name, setName] = useState(profile.name);
  const [shopName, setShopName] = useState(profile.shopName);
  const [avatar, setAvatar] = useState(profile.avatar || '🏪');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setName(profile.name);
    setShopName(profile.shopName);
    if (profile.avatar) {
      setAvatar(profile.avatar);
    }
  }, [profile]);

  const save = () => {
    setBusy(true);
    void saveProfile({ name: name.trim(), shopName: shopName.trim(), avatar }).then(() => {
      setBusy(false);
      setSaved(true);
      setExpanded(false); // collapse after save
      setTimeout(() => setSaved(false), 2000);
    });
  };

  const handlePress = () => {
    if (!busy) {
      impact('light');
      setExpanded((prev) => !prev);
    }
  };

  // Summary view (collapsed)
  if (!expanded) {
    return (
      <Pressable onPress={handlePress} accessibilityRole="button" accessibilityLabel="Edit profile">
        <Card style={styles.profileCard}>
          <View style={styles.row}>
            <View style={[styles.profileAvatar, { backgroundColor: theme.incomeSoft }]}>
              <ThemedText style={styles.profileAvatarEmoji}>{profile.avatar || '🏪'}</ThemedText>
            </View>
            <View style={styles.rowLabel}>
              <ThemedText type="default">{profile.shopName || profile.name || 'DailyKhata'}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {profile.name ? `Welcome, ${profile.name}` : 'Tap to edit profile'}
              </ThemedText>
            </View>
            <ChevronRight size={22} color={theme.textSecondary} />
          </View>
        </Card>
      </Pressable>
    );
  }

  // Expanded edit view
  return (
    <Card style={styles.profileCard}>
      <View style={styles.row}>
        <View style={[styles.profileAvatar, { backgroundColor: theme.incomeSoft }]}>
          <ThemedText style={styles.profileAvatarEmoji}>{avatar}</ThemedText>
        </View>
        <View style={styles.rowLabel}>
          <ThemedText type="default">{profile.shopName || profile.name || 'DailyKhata'}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {profile.name ? `Welcome, ${profile.name}` : 'Your shop & name'}
          </ThemedText>
        </View>
        <Pressable onPress={() => { impact('light'); setExpanded(false); }} accessibilityLabel="Close editor">
          <ChevronDown size={22} color={theme.textSecondary} />
        </Pressable>
      </View>

      <TextField
        label="Your name"
        placeholder="e.g. Ramesh"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        accessibilityLabel="Your name"
      />
      <TextField
        label="Shop name"
        placeholder="e.g. Ramesh Stores"
        value={shopName}
        onChangeText={setShopName}
        autoCapitalize="words"
        accessibilityLabel="Shop name"
      />

      <ThemedText type="smallBold" themeColor="textSecondary">
        Avatar
      </ThemedText>
      <View style={styles.emojiRow}>
        {AVATAR_EMOJIS.map((emoji) => {
          const selected = emoji === avatar;
          return (
            <Pressable
              key={emoji}
              onPress={() => {
                impact('light');
                setAvatar(emoji);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Avatar ${emoji}`}
              style={[
                styles.emojiOption,
                {
                  backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement,
                  borderColor: selected ? theme.primary : theme.border,
                },
              ]}>
              <ThemedText style={styles.emoji}>{emoji}</ThemedText>
            </Pressable>
          );
        })}
      </View>

      <LargeButton
        title="Save Profile"
        subtitle="Saved & synced to your devices"
        icon={Check}
        onPress={save}
        height={56}
        disabled={busy}
      />
      {saved ? (
        <ThemedText type="small" themeColor="primary" style={styles.savedLine}>
          Profile saved ✓
        </ThemedText>
      ) : null}
    </Card>
  );
}

/**
 * Danger zone card: factory-reset data wipe.
 * Local files are deleted and the app re-opens fresh.
 */
function DangerCard() {
  const theme = useTheme();
  const [wiping, setWiping] = useState(false);

  const confirmWipe = async () => {
    setWiping(true);
    try {
      // Local files are deleted and re-opened fresh; AsyncStorage (onboarding,
      // session) is reset to a factory state.
      await wipeDatabase();
      await AsyncStorage.clear();
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.reload();
        return;
      }
      await Updates.reloadAsync();
    } catch (error) {
      setWiping(false);
      feedback.toast({
        message: error instanceof Error ? error.message : String(error),
        tone: 'error',
      });
    }
  };

  const handleWipe = () => {
    feedback.confirm({
      title: 'Clear all data?',
      message:
        'This permanently deletes every entry on this device. Cloud-synced data is kept. This cannot be undone.',
      danger: true,
      confirmLabel: 'Clear everything',
      onConfirm: () => void confirmWipe(),
    });
  };

  return (
    <Card style={styles.securityCard}>
      <Pressable
        onPress={() => {
          impact('heavy');
          handleWipe();
        }}
        accessibilityRole="button"
        accessibilityLabel="Clear all data"
        disabled={wiping}
        style={styles.row}>
        <View style={[styles.icon, { backgroundColor: theme.expenseSoft }]}>
          <Trash2 size={22} color={theme.expense} />
        </View>
        <View style={styles.rowLabel}>
          <ThemedText type="default">Clear All Data</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {wiping ? 'Clearing…' : 'Delete every entry on this device (keeps cloud)'}
          </ThemedText>
        </View>
      </Pressable>
    </Card>
  );
}

/**
 * App lock card — toggles the device-credential lock. Turning it ON verifies
 * the user can authenticate first; OFF just clears the preference.
 */
function AppLockCard() {
  const theme = useTheme();
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    void getAppLockEnabled().then((value) => {
      if (!mounted) {
        return;
      }
      setEnabled(value);
      setLoaded(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleToggle = async (value: boolean) => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      if (value) {
        if (!(await hasDeviceCredentials())) {
          feedback.alert({
            title: 'No phone lock found',
            message: 'Set up a fingerprint, face or phone passcode in your phone settings first.',
            tone: 'danger',
          });
          return;
        }
        const ok = await authenticateWithDevice('Enable app lock', 'Cancel');
        if (ok) {
          await setAppLockEnabled(true);
          setEnabled(true);
          feedback.toast({ message: 'App lock enabled.', tone: 'success' });
        } else {
          feedback.toast({ message: 'App lock not enabled — authentication cancelled.', tone: 'error' });
        }
      } else {
        await setAppLockEnabled(false);
        setEnabled(false);
        feedback.toast({ message: 'App lock disabled.', tone: 'success' });
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

  if (!loaded) {
    return null;
  }

  return (
    <Card style={styles.row}>
      <View style={[styles.icon, { backgroundColor: theme.backgroundElement }]}>
        <Lock size={22} color={theme.text} />
      </View>
      <View style={styles.rowLabel}>
        <ThemedText type="default">App Lock</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {enabled ? 'Lock with fingerprint, face or passcode' : 'Lock the app with your phone'}
        </ThemedText>
      </View>
      <Switch
        value={enabled}
        onValueChange={handleToggle}
        disabled={busy}
        trackColor={{ true: theme.primary, false: theme.border }}
        thumbColor="#FFFFFF"
        accessibilityLabel="App lock"
      />
    </Card>
  );
}

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { scheme, preference, setPreference } = useAppTheme();
  const [busy, setBusy] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);
  const [autoBackupFiles, setAutoBackupFiles] = useState<AutoBackupFile[]>([]);

  const isDark = scheme === 'dark';

  const handleToggleDarkMode = (value: boolean) => {
    // The switch directly sets light/dark. Toggling back from a 'system'
    // default of dark also lands on light, which is expected behaviour.
    setPreference(value ? 'dark' : 'light');
  };

  // Load auto-backup setting on mount
  useEffect(() => {
    let mounted = true;
    void isAutoBackupEnabled().then((enabled) => {
      if (mounted) {
        setAutoBackupEnabled(enabled);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleAutoBackupToggle = async (value: boolean) => {
    if (busy !== null) {
      return;
    }
    setBusy('autobackup');
    try {
      await setAutoBackupSetting(value);
      setAutoBackupEnabled(value);
      feedback.toast({
        message: value ? 'Automatic daily backup enabled' : 'Automatic daily backup disabled',
        tone: value ? 'success' : 'info',
      });
    } catch (error) {
      feedback.toast({ message: 'Could not update backup setting.', tone: 'error' });
      console.error('[Settings] Auto backup toggle failed:', error);
    } finally {
      setBusy(null);
    }
  };

  /** Enumerates the auto-backup files saved in the Documents directory. */
  const loadAutoBackupFiles = useCallback(async () => {
    try {
      // Paths.document is a Directory instance with a sync list() method in expo-file-system v2
      // The list() returns (Directory | File)[]; we filter to only File instances (which have .extension)
      const files = Paths.document.list();
      const backups = files
        .filter((f) => 'extension' in f && f.name?.startsWith('dailykhata-auto-backup-'))
        .map((f) => {
          const match = f.name?.match(/dailykhata-auto-backup-(.+)\.json/);
          const dateStr = match?.[1] ?? '';
          const sizeKB = f.size ? Math.max(1, Math.round(f.size / 1024)) : 0;
          return {
            name: f.name ?? '',
            displayName: `Backup (${dateStr})`,
            date: dateStr,
            size: `${sizeKB} KB`,
            uri: f.uri,
          };
        })
        .sort((a, b) => b.date.localeCompare(a.date));
      setAutoBackupFiles(backups);
    } catch (error) {
      console.error('[Settings] Failed to load auto-backup files:', error);
    }
  }, []);

  /** Shares an auto-backup file via the system share sheet. */
  const handleShareAutoBackup = (filename: string) => {
    void runBusy(`share-${filename}`, async () => {
      const json = await readFileFromDocuments(filename);
      if (!json) {
        return { title: 'Backup not found', message: 'The backup file could not be read.' };
      }
      await writeAndShareFile({
        filename,
        content: json,
        mimeType: 'application/json',
        dialogTitle: 'Share backup',
      });
      return null;
    });
  };

  // Load auto-backup files on mount and after the toggle changes.
  useEffect(() => {
    void loadAutoBackupFiles();
  }, [loadAutoBackupFiles, autoBackupEnabled]);

  /** Runs a data task with a shared busy state; reports the result in a branded dialog. */
  const runBusy = async (key: string, task: () => Promise<{ title: string; message: string } | null>) => {
    setBusy(key);
    try {
      const result = await task();
      if (result) {
        feedback.alert({ title: result.title, message: result.message });
      }
    } catch (error) {
      feedback.toast({
        message: error instanceof Error ? error.message : String(error),
        tone: 'error',
      });
    } finally {
      setBusy(null);
    }
  };

  const handleBackup = () => {
    void runBusy('backup', async () => {
      const json = await buildBackupJSON();
      await writeAndShareFile({
        filename: `dailykhata-backup-${todayISODate()}.json`,
        content: json,
        mimeType: 'application/json',
        dialogTitle: 'Save backup',
      });
      return { title: 'Backup created', message: 'Your backup file is ready to save or share.' };
    });
  };

  const doRestore = async () => {
    await runBusy('restore', async () => {
      const picked = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets || picked.assets.length === 0) {
        return null;
      }
      const backup = parseBackup(await new File(picked.assets[0].uri).text());
      if (!backup) {
        return { title: 'Not a backup', message: 'This file is not a DailyKhata backup file.' };
      }
      const result = await restoreBackup(backup);
      let message = result.message;
      if (result.migrationNotice) {
        message += '\n\n' + result.migrationNotice;
      }
      return { title: 'Backup restored', message };
    });
  };

  const handleRestore = () => {
    feedback.confirm({
      title: 'Restore backup?',
      message: 'This will replace all current entries with the backup file.',
      danger: true,
      confirmLabel: 'Restore',
      onConfirm: () => void doRestore(),
    });
  };

  const handleExportTransactions = () => {
    feedback.toast({
      message: 'Please use the Reports & Export screen for Excel exports.',
      tone: 'info',
    });
    router.push('/export');
  };

  const handleExportKhata = () => {
    feedback.toast({
      message: 'Please use the Reports & Export screen for Excel exports.',
      tone: 'info',
    });
    router.push('/export');
  };

  return (
    <Screen hasTabBar>
      <ThemedText type="subtitle">Settings</ThemedText>

      <ProfileCard />

      <Card style={styles.row}>
        <View style={[styles.icon, { backgroundColor: theme.backgroundElement }]}>
          <Moon size={22} color={theme.text} />
        </View>
        <View style={styles.rowLabel}>
          <ThemedText type="default">Dark Mode</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {preference === 'system' ? 'Following system' : isDark ? 'On' : 'Off'}
          </ThemedText>
        </View>
        <Switch
          value={isDark}
          onValueChange={handleToggleDarkMode}
          trackColor={{ true: theme.primary, false: theme.border }}
          thumbColor="#FFFFFF"
          accessibilityLabel="Dark mode"
        />
      </Card>

      {Platform.OS !== 'web' ? <AppLockCard /> : null}
      {notificationsSupported() ? <NotificationsCard /> : null}

      <Pressable
        onPress={() => router.push('/categories')}
        accessibilityRole="button"
        accessibilityLabel="Manage categories"
        style={styles.row}>
        <View style={[styles.icon, { backgroundColor: theme.backgroundElement }]}>
          <Tags size={22} color={theme.text} />
        </View>
        <View style={styles.rowLabel}>
          <ThemedText type="default">Categories</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Add, edit or delete income & expense categories
          </ThemedText>
        </View>
        <ChevronRight size={22} color={theme.text} />
      </Pressable>

      <Pressable
        onPress={() => router.push('/recurring')}
        accessibilityRole="button"
        accessibilityLabel="Recurring transactions"
        style={styles.row}>
        <View style={[styles.icon, { backgroundColor: theme.backgroundElement }]}>
          <Repeat size={22} color={theme.text} />
        </View>
        <View style={styles.rowLabel}>
          <ThemedText type="default">Recurring</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Set up income, expense or khata entries on a schedule
          </ThemedText>
        </View>
        <ChevronRight size={22} color={theme.text} />
      </Pressable>

      {Platform.OS !== 'web' ? <DangerCard /> : null}

      <CloudSyncCard />

      <Pressable
        onPress={() => setAdvancedOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityLabel="Advanced options"
        style={styles.advancedHeader}>
        <View style={[styles.icon, { backgroundColor: theme.backgroundElement }]}>
          <Settings2 size={22} color={theme.text} />
        </View>
        <View style={styles.rowLabel}>
          <ThemedText type="default">Advanced</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Backup, restore, exports & about
          </ThemedText>
        </View>
        {advancedOpen ? (
          <ChevronDown size={22} color={theme.text} />
        ) : (
          <ChevronRight size={22} color={theme.text} />
        )}
      </Pressable>

      {advancedOpen ? (
        <>
          <Card style={styles.dataCard}>
            <LargeButton
              title="Create Backup"
              subtitle="Save all entries as a file"
              icon={Download}
              onPress={handleBackup}
              height={64}
              disabled={busy !== null}
            />
            <LargeButton
              title="Restore Backup"
              subtitle="Load entries from a backup file"
              icon={Upload}
              onPress={handleRestore}
              variant="outline"
              height={64}
              disabled={busy !== null}
            />
            {busy ? (
              <View style={styles.busyRow}>
                <ActivityIndicator size="small" color={theme.primary} />
                <ThemedText type="small" themeColor="textSecondary">
                  Working…
                </ThemedText>
              </View>
            ) : null}
          </Card>

          <Card style={styles.dataCard}>
            <View style={styles.row}>
              <View style={styles.rowLabel}>
                <ThemedText type="default">Automatic Daily Backup</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Create a backup at 12:00 AM and notify me
                </ThemedText>
              </View>
              <Switch
                value={autoBackupEnabled}
                onValueChange={handleAutoBackupToggle}
                disabled={busy !== null}
                trackColor={{ true: theme.primary, false: theme.border }}
                thumbColor="#FFFFFF"
                accessibilityLabel="Automatic daily backup"
              />
            </View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.backupPath}>
              Saved to: {Paths.document.uri}
            </ThemedText>
          </Card>

          <Card style={styles.dataCard}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionHeader}>
              Auto Backups
            </ThemedText>
            {autoBackupFiles.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
                No automatic backups yet. They will appear here after 12:00 AM.
              </ThemedText>
            ) : (
              <View style={styles.backupList}>
                {autoBackupFiles.map((file) => (
                  <Pressable
                    key={file.name}
                    onPress={() => handleShareAutoBackup(file.name)}
                    style={styles.backupRow}
                    accessibilityRole="button"
                    accessibilityLabel={`Share ${file.name}`}
                  >
                    <View style={[styles.icon, { backgroundColor: theme.backgroundElement }]}>
                      <FolderOpen size={22} color={theme.text} />
                    </View>
                    <View style={styles.backupInfo}>
                      <ThemedText type="default">{file.displayName}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {file.date} · {file.size}
                      </ThemedText>
                    </View>
                    <ThemedText type="small" themeColor="textSecondary">
                      Tap to share
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            )}
          </Card>

          <Card style={styles.dataCard}>
            <LargeButton
              title="Export Transactions"
              subtitle="Income & expense as Excel file"
              icon={FileSpreadsheet}
              onPress={handleExportTransactions}
              variant="outline"
              height={64}
              disabled={busy !== null}
            />
            <LargeButton
              title="Export Khata "
              subtitle="Customer & supplier ledgers as Excel"
              icon={FileSpreadsheet}
              onPress={handleExportKhata}
              variant="outline"
              height={64}
              disabled={busy !== null}
            />
            
          </Card>

          <Card style={styles.about}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              About
            </ThemedText>
            <View style={styles.row}>
              <ThemedText type="default">DailyKhata</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                v{APP_VERSION}
              </ThemedText>
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              Simple bookkeeping for shops and families. All data stays on this device.
            </ThemedText>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  rowLabel: {
    flex: 1,
  },
  frequencyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  frequencyChip: {
    flexGrow: 1,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  securityCard: {
    gap: Spacing.two,
  },
  cloudCard: {
    gap: Spacing.two,
  },
  cloudDivider: {
    height: 1,
  },
  cloudInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cloudInfoValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cloudNote: {
    lineHeight: 18,
  },
  conflictBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.input,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  conflictText: {
    flex: 1,
    lineHeight: 18,
  },
  historyList: {
    gap: Spacing.two,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  historyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  historyText: {
    flex: 1,
    lineHeight: 18,
  },
  dataCard: {
    gap: Spacing.two,
  },
  sectionHeader: {
    marginBottom: Spacing.one,
  },
  emptyText: {
    textAlign: 'center',
    paddingVertical: Spacing.two,
  },
  backupList: {
    gap: Spacing.two,
  },
  backupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.input,
    backgroundColor: 'transparent',
  },
  backupInfo: {
    flex: 1,
    gap: 2,
  },
  advancedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 56,
  },
  busyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  about: {
    gap: Spacing.two,
  },
  profileCard: {
    gap: Spacing.three,
  },
  profileAvatar: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarEmoji: {
    fontSize: 30,
  },
  emojiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  emojiOption: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  emoji: {
    fontSize: 22,
  },
  savedLine: {
    textAlign: 'center',
  },
  backupPath: {
    marginTop: Spacing.one,
    opacity: 0.6,
  },
  deviceField: {
    marginTop: Spacing.one,
  },
});