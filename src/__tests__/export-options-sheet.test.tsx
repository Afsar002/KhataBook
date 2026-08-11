/**
 * Export Options bottom sheet: renders every configured option, toggles call
 * back with the right key, and Cancel/Generate PDF fire their callbacks.
 */
import { fireEvent, render } from '@testing-library/react-native';
import { Animated } from 'react-native';

import { ExportOptionsSheet, type ExportOptionSpec } from '@/components/export-options-sheet';

// Animated.timing(useNativeDriver: true) needs the native side; make it a
// no-op under react-test-renderer (official RN guidance for Jest). jest.mock
// calls are hoisted above the imports by babel-jest.
jest.mock('react-native/src/private/animated/NativeAnimatedHelper');

// Fire the completion callback synchronously so dismiss(onConfirm/onCancel)
// runs under test instead of waiting on a 160ms animation.
beforeEach(() => {
  jest.spyOn(Animated, 'parallel').mockImplementation(() => ({
    start: (callback?: Animated.EndCallback) => callback?.({ finished: true }),
    stop: jest.fn(),
    reset: jest.fn(),
  }));
});

// The real component reads the theme via useTheme; wrap it in a tiny provider
// stub so the test doesn't need the full app tree.
jest.mock('@/hooks/use-theme', () => ({
  useTheme: () => ({
    overlay: 'rgba(0,0,0,0.5)',
    card: '#FFFFFF',
    text: '#111827',
    textSecondary: '#6B7280',
    primary: '#16A34A',
    background: '#FFFFFF',
    backgroundElement: '#FFFFFF',
    border: '#E3E7E4',
  }),
}));

const options: ExportOptionSpec<'entryDetails' | 'notes'>[] = [
  { key: 'entryDetails', label: 'Include Transaction Descriptions', hint: 'Show what each entry was for' },
  { key: 'notes', label: 'Include Notes', hint: 'Extra notes under each entry' },
];

describe('ExportOptionsSheet', () => {
  it('renders the title, every option, and the action buttons', () => {
    const { getByText } = render(
      <ExportOptionsSheet
        visible
        options={options}
        selected={{ entryDetails: true, notes: false }}
        onToggle={jest.fn()}
        onCancel={jest.fn()}
        onConfirm={jest.fn()}
      />
    );

    expect(getByText('Export Options')).toBeTruthy();
    expect(getByText('Include Transaction Descriptions')).toBeTruthy();
    expect(getByText('Include Notes')).toBeTruthy();
    expect(getByText('Generate PDF')).toBeTruthy();
    expect(getByText('Cancel')).toBeTruthy();
    expect(getByText('A4 printable · clean & professional · WhatsApp & print ready · no clipping or overlaps')).toBeTruthy();
  });

  it('calls onToggle with the option key when a row is pressed', () => {
    const onToggle = jest.fn();
    const { getByText } = render(
      <ExportOptionsSheet
        visible
        options={options}
        selected={{ entryDetails: true, notes: false }}
        onToggle={onToggle}
        onCancel={jest.fn()}
        onConfirm={jest.fn()}
      />
    );

    fireEvent.press(getByText('Include Notes'));
    expect(onToggle).toHaveBeenCalledWith('notes');
  });

  it('calls onConfirm when Generate PDF is pressed and onCancel when Cancel is', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const { getByText } = render(
      <ExportOptionsSheet
        visible
        options={options}
        selected={{ entryDetails: true, notes: false }}
        onToggle={jest.fn()}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    );

    fireEvent.press(getByText('Generate PDF'));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    fireEvent.press(getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when hidden', () => {
    const { queryByText } = render(
      <ExportOptionsSheet
        visible={false}
        options={options}
        selected={{ entryDetails: true, notes: false }}
        onToggle={jest.fn()}
        onCancel={jest.fn()}
        onConfirm={jest.fn()}
      />
    );
    expect(queryByText('Export Options')).toBeNull();
  });

  it('renders an arbitrary custom option when added to the list', () => {
    const futureOptions = [
      ...options,
      { key: 'businessDetails', label: 'Include Business Details', hint: 'Shop name and phone on the header' },
    ];
    const { getByText } = render(
      <ExportOptionsSheet
        visible
        options={futureOptions}
        selected={{ entryDetails: true, notes: true, businessDetails: false }}
        onToggle={jest.fn()}
        onCancel={jest.fn()}
        onConfirm={jest.fn()}
      />
    );
    expect(getByText('Include Business Details')).toBeTruthy();
  });
});
