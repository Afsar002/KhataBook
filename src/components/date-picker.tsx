/** Date picker component using @react-native-community/datetimepicker. */
import { Calendar } from 'lucide-react-native';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useState } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { DateTimePickerChangeEvent } from '@react-native-community/datetimepicker';

import { ThemedText } from '@/components/themed-text';
import { Spacing, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatISOToDisplay, parseISODate } from '@/utils/format';

interface DatePickerProps {
  /** ISO date string (YYYY-MM-DD) */
  value: string;
  /** Callback when date changes */
  onChange: (date: string) => void;
  /** Optional label above the picker */
  label?: string;
  /** Maximum date allowed (ISO string). Defaults to today. */
  maxDate?: string;
  /** Minimum date allowed (ISO string) */
  minDate?: string;
  /** Accessibility label */
  accessibilityLabel?: string;
  /** Disabled state */
  disabled?: boolean;
}

export function DatePicker({
  value,
  onChange,
  label,
  maxDate = new Date().toISOString().split('T')[0],
  minDate,
  accessibilityLabel = 'Select date',
  disabled = false,
}: DatePickerProps) {
  const theme = useTheme();
  const [showPicker, setShowPicker] = useState(false);

  // Parse the current value for display
  const displayValue = formatISOToDisplay(value);

  const handleValueChange = (event: DateTimePickerChangeEvent, selectedDate: Date) => {
    setShowPicker(false);
    // Use local date components to avoid timezone issues (toISOString returns UTC)
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const day = String(selectedDate.getDate()).padStart(2, '0');
    const iso = `${year}-${month}-${day}`;
    onChange(iso);
  };

  const handleDismiss = () => {
    setShowPicker(false);
  };

  const parsedValue = parseISODate(value);
  const parsedMaxDate = maxDate ? parseISODate(maxDate) : undefined;
  const parsedMinDate = minDate ? parseISODate(minDate) : undefined;

  return (
    <View style={styles.wrap}>
      {label && (
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
          {label}
        </ThemedText>
      )}
      <Pressable
        onPress={() => !disabled && setShowPicker(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={[
          styles.button,
          { backgroundColor: disabled ? theme.backgroundElement : theme.card },
          { borderColor: theme.border },
        ]}
      >
        <View style={styles.buttonContent}>
          <Calendar size={20} color={theme.textSecondary} style={styles.icon} />
          <ThemedText type="default" style={styles.dateText} numberOfLines={1}>
            {displayValue}
          </ThemedText>
        </View>
      </Pressable>
      {showPicker && (
        <DateTimePicker
          testID="date-picker"
          value={parsedValue}
          onValueChange={handleValueChange}
          onDismiss={handleDismiss}
          maximumDate={parsedMaxDate}
          minimumDate={parsedMinDate}
          mode="date"
          style={styles.picker}
          display={Platform.OS === 'ios' ? 'spinner' : 'calendar'}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.one,
  },
  label: {
    marginBottom: Spacing.one,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.input,
    minHeight: 52,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flex: 1,
  },
  icon: {
    opacity: 0.7,
  },
  dateText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
  },
  picker: {
    width: '100%',
    marginTop: Spacing.two,
  },
});