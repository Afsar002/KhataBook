/** Date picker component with calendar picker + manual entry (auto-slash). */
import { Calendar, X } from 'lucide-react-native';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
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
  const [manualValue, setManualValue] = useState('');
  const [showManual, setShowManual] = useState(false);

  // Parse the current value for display
  const displayValue = formatISOToDisplay(value);

  // Format manual input: auto-insert slashes (DD/MM/YYYY)
  const formatManualInput = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 8);
    let formatted = '';
    for (let i = 0; i < digits.length; i++) {
      if (i === 2 || i === 4) formatted += '/';
      formatted += digits[i];
    }
    return formatted;
  };

  const handleManualChange = (text: string) => {
    const formatted = formatManualInput(text);
    setManualValue(formatted);
    // If complete DD/MM/YYYY, parse and validate
    if (formatted.length === 10) {
      const day = parseInt(formatted.slice(0, 2), 10);
      const month = parseInt(formatted.slice(3, 5), 10);
      const year = parseInt(formatted.slice(6, 10), 10);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= 2100) {
        // Validate actual date
        const testDate = new Date(year, month - 1, day);
        if (testDate.getDate() === day && testDate.getMonth() === month - 1 && testDate.getFullYear() === year) {
          // Check min/max
          let valid = true;
          if (minDate) {
            const min = parseISODate(minDate);
            if (testDate < min) valid = false;
          }
          if (maxDate) {
            const max = parseISODate(maxDate);
            if (testDate > max) valid = false;
          }
          if (valid) {
            const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            onChange(iso);
            setShowManual(false);
            setManualValue('');
          }
        }
      }
    }
  };

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

  const handleManualPress = () => {
    if (!disabled) {
      setShowManual(true);
      setManualValue('');
    }
  };

  const handleManualBlur = () => {
    // If incomplete, revert to display value
    if (manualValue.length > 0 && manualValue.length < 10) {
      setManualValue('');
    }
    setShowManual(false);
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
      <View style={styles.inputWrap}>
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
        <Pressable
          onPress={handleManualPress}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Enter date manually"
          style={styles.manualButton}
        >
          {showManual ? (
            <X size={20} color={theme.textSecondary} />
          ) : (
            <ThemedText type="small" themeColor="textSecondary" style={styles.manualHint}>
              Type
            </ThemedText>
          )}
        </Pressable>
      </View>

      {showManual && (
        <TextInput
          value={manualValue}
          onChangeText={handleManualChange}
          onBlur={handleManualBlur}
          placeholder="DD/MM/YYYY"
          placeholderTextColor={theme.textSecondary}
          keyboardType="number-pad"
          maxLength={10}
          style={[
            styles.manualInput,
            { backgroundColor: theme.card, borderColor: theme.border, color: theme.text },
          ]}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
        />
      )}

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
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
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
    flex: 1,
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
  manualButton: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualHint: {
    fontFamily: 'Inter_500Medium',
  },
  manualInput: {
    flex: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.input,
    fontFamily: 'Inter_500Medium',
    fontSize: 16,
    minHeight: 52,
  },
  picker: {
    width: '100%',
    marginTop: Spacing.two,
  },
});