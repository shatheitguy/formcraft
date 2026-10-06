'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { DEFAULT_LOCALE, dirOf, makeT, type TFn } from '@/lib/i18n';

interface I18nValue {
  locale: string;
  dir: 'ltr' | 'rtl';
  t: TFn;
}

const I18nContext = createContext<I18nValue>({ locale: DEFAULT_LOCALE, dir: 'ltr', t: makeT(DEFAULT_LOCALE) });

/** Provides the active language. Nest a second provider to scope a different language (e.g. a form). */
export function I18nProvider({ locale, children }: { locale: string; children: ReactNode }) {
  const value = useMemo(() => ({ locale, dir: dirOf(locale), t: makeT(locale) }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
export const useT = () => useContext(I18nContext).t;
