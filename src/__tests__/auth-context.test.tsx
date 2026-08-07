/**
 * Auth context tests.
 *
 * Uses the jest-expo preset's real react-native environment. The auth service,
 * sync config and sync engine are mocked so the provider's boot effect runs
 * against predictable inputs.
 */
import { AuthProvider, useAuth } from '@/context/auth-context';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

jest.mock('@/services/supabase/auth', () => ({
  onAuthStateChange: jest.fn((cb) => {
    cb(null);
    return () => {};
  }),
  restoreSession: jest.fn().mockResolvedValue(null),
  requestPhoneOtp: jest.fn().mockResolvedValue({ ok: true }),
  verifyPhoneOtp: jest.fn().mockResolvedValue({ ok: true }),
  signInWithEmail: jest.fn().mockResolvedValue({ ok: true }),
  signUpWithEmail: jest.fn().mockResolvedValue({ ok: true }),
  resetPassword: jest.fn().mockResolvedValue({ ok: true }),
  updatePassword: jest.fn().mockResolvedValue({ ok: true }),
  signOut: jest.fn().mockResolvedValue(undefined),
  getCurrentPhone: jest.fn().mockReturnValue('+1234567890'),
  getCurrentEmail: jest.fn().mockReturnValue('test@example.com'),
}));

jest.mock('@/services/supabase/config', () => ({
  isSyncConfigured: jest.fn(() => true),
}));

jest.mock('@/services/sync/sync-engine', () => ({
  onAuthChanged: jest.fn().mockResolvedValue(undefined),
}));

function StatusProbe() {
  const { status, phone, email, account } = useAuth();
  return (
    <>
      <Text testID="status">{status}</Text>
      <Text testID="account">{account}</Text>
      <Text testID="phone">{phone ?? 'none'}</Text>
      <Text testID="email">{email ?? 'none'}</Text>
    </>
  );
}

describe('Auth Context', () => {
  it('settles to signedOut when no persisted session exists', async () => {
    render(
      <AuthProvider>
        <StatusProbe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('status').props.children).toBe('signedOut'));
    // Account label is derived from the (mocked) signed-in email/phone.
    expect(screen.getByTestId('account').props.children).toBe('test@example.com');
    expect(screen.getByTestId('phone').props.children).toBe('+1234567890');
    expect(screen.getByTestId('email').props.children).toBe('test@example.com');
  });

  it('settles to signedIn when restoreSession returns a session', async () => {
    const { restoreSession } = require('@/services/supabase/auth');
    restoreSession.mockResolvedValueOnce({ user: { id: 'test-user' } });

    render(
      <AuthProvider>
        <StatusProbe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('status').props.children).toBe('signedIn'));
  });

  it('sets status to unconfigured when sync is not configured', async () => {
    const { isSyncConfigured } = require('@/services/supabase/config');
    isSyncConfigured.mockReturnValueOnce(false);

    render(
      <AuthProvider>
        <StatusProbe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('status').props.children).toBe('unconfigured'));
  });

  it('exposes auth actions that call the underlying service', async () => {
    const actions = require('@/services/supabase/auth');
    const AuthActions = () => {
      const { requestOtp, verifyOtp, signInEmail, signUpEmail, resetPassword, updatePassword, signOut } =
        useAuth();
      return (
        <>
          <Text testID="requestOtp" onPress={() => requestOtp('+1234567890')}>
            request
          </Text>
          <Text testID="verifyOtp" onPress={() => verifyOtp('+1234567890', '123456')}>
            verify
          </Text>
          <Text testID="signInEmail" onPress={() => signInEmail('a@b.com', 'pw')}>
            signin
          </Text>
          <Text testID="signUpEmail" onPress={() => signUpEmail('a@b.com', 'pw')}>
            signup
          </Text>
          <Text testID="resetPassword" onPress={() => resetPassword('a@b.com')}>
            reset
          </Text>
          <Text testID="updatePassword" onPress={() => updatePassword('newpw')}>
            update
          </Text>
          <Text testID="signOut" onPress={signOut}>
            signout
          </Text>
        </>
      );
    };

    render(
      <AuthProvider>
        <AuthActions />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('requestOtp')).toBeTruthy());

    fireEvent.press(screen.getByTestId('requestOtp'));
    fireEvent.press(screen.getByTestId('verifyOtp'));
    fireEvent.press(screen.getByTestId('signInEmail'));
    fireEvent.press(screen.getByTestId('signUpEmail'));
    fireEvent.press(screen.getByTestId('resetPassword'));
    fireEvent.press(screen.getByTestId('updatePassword'));
    fireEvent.press(screen.getByTestId('signOut'));

    expect(actions.requestPhoneOtp).toHaveBeenCalledWith('+1234567890');
    expect(actions.verifyPhoneOtp).toHaveBeenCalledWith('+1234567890', '123456');
    expect(actions.signInWithEmail).toHaveBeenCalledWith('a@b.com', 'pw');
    expect(actions.signUpWithEmail).toHaveBeenCalledWith('a@b.com', 'pw');
    expect(actions.resetPassword).toHaveBeenCalledWith('a@b.com');
    expect(actions.updatePassword).toHaveBeenCalledWith('newpw');
    expect(actions.signOut).toHaveBeenCalled();
  });

  it('throws when useAuth is used outside an AuthProvider', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<StatusProbe />)).toThrow('useAuth must be used within an AuthProvider');
    consoleError.mockRestore();
  });
});
