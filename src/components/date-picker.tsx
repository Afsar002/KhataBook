/** Date picker component with calendar picker + manual entry (auto-slash). */
import { Calendar } from 'lucide-react-native';
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

  // Format manual input: auto-insert slashes (supports DDMMYY or DDMMYYYY)
  const formatManualInput = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 8);
    let formatted = '';
    for (let i = 0; i < digits.length; i++) {
      if (i === 2 || i === 4) formatted += '/';
      formatted += digits[i];
    }
    return formatted;
  };

  // Parse formatted string (DD/MM/YY or DD/MM/YYYY) to ISO, return null if invalid
  const parseFormattedToISO = (formatted: string): string | null => {
    // Expect either DD/MM/YY (8 chars) or DD/MM/YYYY (10 chars)
    if (formatted.length !== 8 && formatted.length !== 10) return null;
    const day = parseInt(formatted.slice(0, 2), 10);
    const month = parseInt(formatted.slice(3, 5), 10);
    const yearStr = formatted.slice(6);
    const year = parseInt(yearStr, 10);
    // Convert 2-digit year to 4-digit (assume 1950-2049 range)
    const fullYear = yearStr.length === 2 ? (year >= 50 ? 1900 + year : 2000 + year) : year;
    if (day < 1 || day > 31 || month < 1 || month > 12 || fullYear < 1900 || fullYear > 2100) return null;
    const testDate = new Date(fullYear, month - 1, day);
    if (testDate.getDate() !== day || testDate.getMonth() !== month - 1 || testDate.getFullYear() !== fullYear) return null;
    if (minDate) {
      const min = parseISODate(minDate);
      if (testDate < min) return null;
    }
    if (maxDate) {
      const max = parseISODate(maxDate);
      if (testDate > max) return null;
    }
    return `${fullYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  // Validate a complete formatted string, return ISO if valid, null otherwise
  const validateManualInput = (formatted: string): string | null => {
    return parseFormattedToISO(formatted);
  };

  const handleManualChange = (text: string) => {
    const formatted = formatManualInput(text);
    setManualValue(formatted);
    // If complete and valid, commit to parent immediately but keep manual mode open
    // The onBlur will close it after parent re-renders
    const iso = validateManualInput(formatted);
    if (iso) {
      onChange(iso);
      setShowPicker(false);
    }
  };

  const handleValueChange = (_event: DateTimePickerChangeEvent, selectedDate: Date) => {
    setShowPicker(false);
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const day = String(selectedDate.getDate()).padStart(2, '0');
    const iso = `${year}-${month}-${day}`;
    onChange(iso);
  };

  const handleDismiss = () => {
    setShowPicker(false);
  };

  // Clicking the date input opens manual entry mode - pre-fill with current date
  const handleInputPress = () => {
    if (!disabled) {
      setShowManual(true);
      setManualValue(displayValue);
    }
  };

  // Clicking the calendar icon opens the native calendar picker
  const handleCalendarPress = () => {
    if (!disabled) {
      setShowManual(false);
      setManualValue('');
      setShowPicker(true);
    }
  };

  const handleManualBlur = () => {
    // Always close manual mode on blur. The TextInput will show whatever manualValue
    // was last set (valid commit or incomplete). Parent value prop may not have updated
    // yet, but we don't revert here - the next render will pick up the new prop.
    setShowManual(false);
    setManualValue('');
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
        {showManual ? (
          <TextInput
            value={manualValue}
            onChangeText={handleManualChange}
            onBlur={handleManualBlur}
            placeholder="DD/MM/YYYY"
            placeholderTextColor={theme.textSecondary}
            keyboardType="number-pad"
            maxLength={10}
            style={[
              styles.input,
              { backgroundColor: disabled ? theme.backgroundElement : theme.card, borderColor: theme.border, color: theme.text },
            ]}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
          />
        ) : (
          <Pressable
            onPress={handleInputPress}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            style={[
              styles.input,
              { backgroundColor: disabled ? theme.backgroundElement : theme.card },
              { borderColor: theme.border },
            ]}
          >
            <ThemedText type="default" style={styles.dateText} numberOfLines={1}>
              {displayValue}
            </ThemedText>
          </Pressable>
        )}
        <Pressable
          onPress={handleCalendarPress}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Open calendar"
          style={styles.calendarButton}
        >
          <Calendar size={20} color={theme.textSecondary} />
        </Pressable>
      </View>

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
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.input,
    minHeight: 52,
    flex: 1,
  },
  dateText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
  },
  calendarButton: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  picker: {
    width: '100%',
    marginTop: Spacing.two,
  },
});
