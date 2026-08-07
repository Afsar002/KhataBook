/**
 * Profile context — the user's name, shop name and avatar emoji.
 *
 * Stored in the synced SQLite settings table, so the profile follows the user
 * across devices like the rest of their data. Mirrors the ThemeProvider
 * pattern: loaded once on boot, updated live from Settings.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { getSetting, setSetting } from '@/db/settings';

const NAME_KEY = 'profile_name';
const SHOP_KEY = 'shop_name';
const AVATAR_KEY = 'profile_avatar';

/** Emoji choices for the avatar (stored as the emoji character). */
export const AVATAR_EMOJIS = ['🏪', '👨🏽‍🦱', '👩🏽‍🦱', '👴🏽', '👵🏽', '🛍️', '🏠', '💼'];

export interface Profile {
  name: string;
  shopName: string;
  avatar: string;
}

const EMPTY_PROFILE: Profile = { name: '', shopName: '', avatar: '' };

interface ProfileContextValue {
  profile: Profile;
  /** Persists the given fields and updates live state. */
  saveProfile: (next: Partial<Profile>) => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);

  useEffect(() => {
    let mounted = true;
    void Promise.all([getSetting(NAME_KEY), getSetting(SHOP_KEY), getSetting(AVATAR_KEY)]).then(
      ([name, shopName, avatar]) => {
        if (!mounted) {
          return;
        }
        setProfile({ name: name ?? '', shopName: shopName ?? '', avatar: avatar ?? '' });
      }
    );
    return () => {
      mounted = false;
    };
  }, []);

  const saveProfile = useCallback(async (next: Partial<Profile>) => {
    const updates: Promise<void>[] = [];
    if (next.name !== undefined) {
      updates.push(setSetting(NAME_KEY, next.name));
    }
    if (next.shopName !== undefined) {
      updates.push(setSetting(SHOP_KEY, next.shopName));
    }
    if (next.avatar !== undefined) {
      updates.push(setSetting(AVATAR_KEY, next.avatar));
    }
    await Promise.all(updates);
    setProfile((prev) => ({ ...prev, ...next }));
  }, []);

  const value = useMemo(() => ({ profile, saveProfile }), [profile, saveProfile]);

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return ctx;
}
