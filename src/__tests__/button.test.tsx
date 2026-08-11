/**
 * Button (shadcn port): variant/size styling, disabled, pressed feedback and
 * asChild slot behaviour.
 */
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet, View } from 'react-native';

import { Button, buttonVariants } from '@/components/button';

jest.mock('@/hooks/use-theme', () => ({
  useTheme: () => ({
    text: '#111827',
    textSecondary: '#6B7280',
    background: '#F4F6F5',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E6ECE8',
    card: '#FFFFFF',
    border: '#E3E7E4',
    primary: '#16A34A',
    income: '#16A34A',
    expense: '#EF4444',
    danger: '#DC2626',
    info: '#2563EB',
    incomeSoft: '#E7F6EC',
    expenseSoft: '#FDEBEC',
    primarySoft: '#E7F6EC',
    warning: '#F59E0B',
    warningSoft: '#FEF3C7',
    overlay: 'rgba(17, 24, 39, 0.45)',
  }),
}));

/** The Pressable resolves its style via a function of the press state. */
function pressableStyle(el: unknown, _pressed = false) {
  const props = (el as { props: Record<string, unknown> }).props;
  const style = props.style;
  // In test renderer, Pressable style is already resolved/flattened as an array
  return StyleSheet.flatten(style) as Record<string, unknown>;
}

describe('Button', () => {
  it('renders a string label as a themed text', () => {
    const { getByText } = render(<Button>Save</Button>);
    expect(getByText('Save')).toBeTruthy();
  });

  it('applies the primary background for the default variant', () => {
    const { getByRole } = render(<Button>Save</Button>);
    expect(pressableStyle(getByRole('button')).backgroundColor).toBe('#16A34A');
  });

  it('applies the danger background for the destructive variant', () => {
    const { getByRole } = render(<Button variant="destructive">Delete</Button>);
    expect(pressableStyle(getByRole('button')).backgroundColor).toBe('#DC2626');
  });

  it('outline variant renders a bordered card-colored surface', () => {
    const { getByRole } = render(<Button variant="outline">Cancel</Button>);
    const style = pressableStyle(getByRole('button'));
    expect(style.backgroundColor).toBe('#FFFFFF');
    expect(style.borderColor).toBe('#E3E7E4');
  });

  it('link variant is a transparent text link without the touch-target height', () => {
    const { getByRole } = render(<Button variant="link">Learn more</Button>);
    const style = pressableStyle(getByRole('button'));
    expect(style.backgroundColor).toBe('transparent');
    expect(style.minHeight).toBeUndefined();
  });

  it('every size keeps the minimum touch target', () => {
    for (const size of ['default', 'sm', 'lg', 'icon'] as const) {
      const { getByRole, unmount } = render(<Button size={size}>x</Button>);
      const style = pressableStyle(getByRole('button'));
      if (size === 'icon') {
        expect(style.width).toBe(56);
        expect(style.height).toBe(56);
      } else {
        expect(style.minHeight).toBe(56);
      }
      unmount();
    }
  });

  it('fires onPress on press but not when disabled', () => {
    const onPress = jest.fn();
    const { getByRole, rerender } = render(<Button onPress={onPress}>Save</Button>);
    fireEvent.press(getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);

    rerender(
      <Button onPress={onPress} disabled>
        Save
      </Button>
    );
    fireEvent.press(getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('asChild clones the child with the merged style and onPress', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <Button asChild onPress={onPress}>
        <View testID="child" style={{ marginTop: 4 }} />
      </Button>
    );
    const child = getByTestId('child');
    expect(child.props.onPress).toBeDefined();
    expect(child.props.accessibilityRole).toBe('button');
    const style = StyleSheet.flatten(child.props.style) as Record<string, unknown>;
    expect(style.backgroundColor).toBe('#16A34A');
    expect(style.marginTop).toBe(4);
    fireEvent.press(child);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('buttonVariants resolves the same styles the component applies', () => {
    expect(buttonVariants({ variant: 'destructive' }, {
      text: '#111827',
      textSecondary: '#6B7280',
      background: '#F4F6F5',
      backgroundElement: '#FFFFFF',
      backgroundSelected: '#E6ECE8',
      card: '#FFFFFF',
      border: '#E3E7E4',
      primary: '#16A34A',
      income: '#16A34A',
      expense: '#EF4444',
      danger: '#DC2626',
      info: '#2563EB',
      incomeSoft: '#E7F6EC',
      expenseSoft: '#FDEBEC',
      primarySoft: '#E7F6EC',
      warning: '#F59E0B',
      warningSoft: '#FEF3C7',
      overlay: 'rgba(17, 24, 39, 0.45)',
    }).backgroundColor).toBe('#DC2626');
    expect(buttonVariants({ size: 'icon' }, {
      text: '#111827',
      textSecondary: '#6B7280',
      background: '#F4F6F5',
      backgroundElement: '#FFFFFF',
      backgroundSelected: '#E6ECE8',
      card: '#FFFFFF',
      border: '#E3E7E4',
      primary: '#16A34A',
      income: '#16A34A',
      expense: '#EF4444',
      danger: '#DC2626',
      info: '#2563EB',
      incomeSoft: '#E7F6EC',
      expenseSoft: '#FDEBEC',
      primarySoft: '#E7F6EC',
      warning: '#F59E0B',
      warningSoft: '#FEF3C7',
      overlay: 'rgba(17, 24, 39, 0.45)',
    }).borderRadius).toBe(16);
  });
});
