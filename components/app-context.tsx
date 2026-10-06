'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { ThemePref } from '@/lib/i18n';
import type { SessionUser } from '@/lib/roles';
import type { AppSettings } from '@/lib/settings';

interface AppContextValue {
  app: AppSettings;
  user: SessionUser | null;
  theme: ThemePref;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ value, children }: { value: AppContextValue; children: ReactNode }) {
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
