/** Floating action button — the primary entry point for new entries. */
import { router } from 'expo-router';
import {
  ArrowLeftRight,
  HandCoins,
  Plus,
  Send,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { InterFonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { impact } from '@/utils/haptics';

type FabAction = {
  key: string;
  label: string;
  icon: LucideIcon;
  color: string;
  onPress: () => void;
};

export function Fab() {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  const close = () => setOpen(false);

  const actions: FabAction[] = [
    {
      key: 'income',
      label: 'Deposit',
      icon: TrendingUp,
      color: theme.income,
      onPress: () => {
        impact('light');
        close();
        router.push('/income');
      },
    },
    {
      key: 'expense',
      label: 'Withdraw',
      icon: TrendingDown,
      color: theme.expense,
      onPress: () => {
        impact('light');
        close();
        router.push('/expense');
      },
    },
    {
      key: 'give',
      label: 'Money Out',
      icon: Send,
      color: theme.text,
      onPress: () => {
        impact('light');
        close();
        router.push({ pathname: '/party/pick', params: { action: 'give' } });
      },
    },
    {
      key: 'receive',
      label: 'Money In',
      icon: HandCoins,
      color: theme.text,
      onPress: () => {
        impact('light');
        close();
        router.push({ pathname: '/party/pick', params: { action: 'receive' } });
      },
    },
    {
      key: 'transfer',
      label: 'Transfer',
      icon: ArrowLeftRight,
      color: theme.text,
      onPress: () => {
        impact('light');
        close();
        router.push('/transfer');
      },
    },
  ];

  return (
    <View style={styles.host} pointerEvents="box-none">
      {open ? (
        <Pressable
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close menu"
          style={[styles.backdrop, { backgroundColor: theme.overlay }]}
        />
      ) : null}

      {open ? (
        <View style={[styles.menu, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Pressable
                key={action.key}
                onPress={action.onPress}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
                <View style={[styles.actionIcon, { backgroundColor: theme.backgroundElement }]}>
                  <Icon size={22} color={action.color} />
                </View>
                <ThemedText style={styles.actionLabel}>{action.label}</ThemedText>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <Pressable
        onPress={() => {
          impact('medium');
          setOpen((value) => !value);
        }}
        accessibilityRole="button"
        accessibilityLabel="Add"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: theme.primary },
          pressed && styles.pressed,
        ]}>
        <Plus size={30} color="#FFFFFF" strokeWidth={2.4} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  menu: {
    position: 'absolute',
    right: Spacing.three,
    bottom: Spacing.three + 60, // FAB height + spacing
    width: 240,
    borderRadius: Radius.card,
    borderWidth: 1,
    padding: Spacing.two,
    gap: Spacing.half,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 56,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.chip,
  },
  pressed: {
    opacity: 0.6,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontFamily: InterFonts.semibold,
    fontSize: 17,
  },
  fab: {
    position: 'absolute',
    right: Spacing.three,
    bottom: Spacing.three,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
