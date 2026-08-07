/** Friendly empty state with icon and message. */
import {
  Inbox,
  ReceiptText,
  Search,
  ShieldCheck,
  Store,
  Tags,
  UserRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Semantic empty-state kinds — prefer these over passing a raw icon. */
export type EmptyStateType =
  | 'transactions' // dashboard: no transactions yet
  | 'entries' // a ledger/account/party with no entries
  | 'search' // search idle or no results
  | 'party' // no customers
  | 'store' // no suppliers
  | 'accounts' // no accounts
  | 'account' // a single account not found
  | 'categories' // no categories
  | 'conflicts'; // sync: no open conflicts

const ICON_BY_TYPE: Record<EmptyStateType, LucideIcon> = {
  transactions: Inbox,
  entries: ReceiptText,
  search: Search,
  party: UserRound,
  store: Store,
  accounts: Wallet,
  account: Wallet,
  categories: Tags,
  conflicts: ShieldCheck,
};

type EmptyStateProps = {
  /** Semantic kind that selects a default icon. */
  type?: EmptyStateType;
  /** Explicit icon — only used when no `type` is given. */
  icon?: LucideIcon;
  title: string;
  message?: string;
};

export function EmptyState({ type, icon, title, message }: EmptyStateProps) {
  const theme = useTheme();
  const Icon = type ? ICON_BY_TYPE[type] : icon;

  return (
    <View style={styles.wrap}>
      {Icon ? (
        <View style={[styles.iconWrap, { backgroundColor: theme.backgroundElement }]}>
          <Icon size={32} color={theme.textSecondary} />
        </View>
      ) : null}
      <ThemedText type="default" style={styles.title}>
        {title}
      </ThemedText>
      {message ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.message}>
          {message}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.six,
    paddingHorizontal: Spacing.four,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  title: {
    fontFamily: 'Inter_600SemiBold',
    textAlign: 'center',
  },
  message: {
    textAlign: 'center',
  },
});
