import { View, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WifiOff, RefreshCw, CheckCircle, AlertCircle, Info, CloudOff } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing, Radius } from '@/constants/theme';
import { useSync } from '@/context/sync-context';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';

export function SyncStatusBanner() {
  const { status, runNow, lastResult } = useSync();
  const realtimeMode = status.realtimeMode;
  const { account } = useAuth();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  // Don't show banner if not signed in or cloud sync not configured
  if (!account || status.state === 'unconfigured') {
    return null;
  }

  const getBannerConfig = () => {
    switch (status.state) {
      case 'offline':
        return {
          icon: WifiOff,
          bgColor: theme.warningSoft,
          iconColor: theme.warning,
          label: 'You\'re offline',
          message: 'Changes will sync when you\'re back online',
          action: null,
        };
      case 'syncing':
        return {
          icon: RefreshCw,
          bgColor: theme.primarySoft,
          iconColor: theme.primary,
          label: 'Syncing…',
          message: 'Uploading and downloading changes',
          action: null,
        };
      case 'error':
        return {
          icon: AlertCircle,
          bgColor: theme.expenseSoft,
          iconColor: theme.expense,
          label: 'Sync failed',
          message: lastResult
            ? `Pushed: ${lastResult.pushed}, Pulled: ${lastResult.pulled}, Failed: ${lastResult.failed}`
            : 'Tap to retry',
          action: { label: 'Retry', onPress: runNow },
        };
      case 'version_blocked':
        return {
          icon: AlertCircle,
          bgColor: theme.expenseSoft,
          iconColor: theme.expense,
          label: 'Update required',
          message: 'A new app version is available. Please update to continue syncing.',
          action: null,
        };
      case 'idle':
        if (realtimeMode === 'live') {
          return {
            icon: CheckCircle,
            bgColor: theme.incomeSoft,
            iconColor: theme.income,
            label: 'Synced',
            message: 'All changes are up to date (live sync active)',
            action: null,
          };
        } else if (realtimeMode === 'trigger') {
          return {
            icon: Info,
            bgColor: theme.primarySoft,
            iconColor: theme.primary,
            label: 'Synced',
            message: 'All changes up to date (manual sync only)',
            action: null,
          };
        } else {
          return {
            icon: CloudOff,
            bgColor: theme.primarySoft,
            iconColor: theme.primary,
            label: 'Synced',
            message: 'All changes up to date (offline mode)',
            action: null,
          };
        }
      default:
        return {
          icon: Info,
          bgColor: theme.primarySoft,
          iconColor: theme.primary,
          label: 'Syncing…',
          message: 'Checking for updates',
          action: null,
        };
    }
  };

  const config = getBannerConfig();
  const Icon = config.icon;

  // Only show banner for non-idle states (offline, syncing, error, version_blocked)
  // Hide when idle (synced) for a cleaner UI
  const showBanner = status.state !== 'idle';

  if (!showBanner) {
    return null;
  }

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={['top', 'left', 'right']}
    >
      <View style={[styles.banner, { backgroundColor: config.bgColor, paddingTop: insets.top + Spacing.two }]}>
        <View style={styles.content}>
          <Icon size={18} color={config.iconColor} style={styles.icon} />
          <View style={styles.textContainer}>
            <ThemedText type="smallBold" style={[styles.label, { color: config.iconColor }]}>
              {config.label}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.message}>
              {config.message}
            </ThemedText>
          </View>
          {config.action && (
            <View style={styles.action}>
              <ThemedText
                type="smallBold"
                onPress={config.action.onPress}
                accessibilityRole="button"
                accessibilityLabel={config.action.label}
                style={[
                  styles.actionText,
                  { color: config.iconColor },
                ]}>
                {config.action.label}
              </ThemedText>
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  banner: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomLeftRadius: Radius.input,
    borderBottomRightRadius: Radius.input,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  icon: {
    marginRight: Spacing.one,
  },
  textContainer: {
    flex: 1,
    gap: 2,
  },
  label: {},
  message: {},
  action: {
    marginLeft: Spacing.two,
  },
  actionText: {
    textDecorationLine: 'underline',
  },
});