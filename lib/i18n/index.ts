import { DICTIONARIES } from './dict';

/**
 * Internationalisation
 * --------------------
 * English source strings are the translation keys: `t('Save changes')`. Missing entries fall
 * back to English, so untranslated text never breaks the UI. Placeholders use `{name}`:
 * `t('{n} responses', { n: 3 })`.
 *
 * Adding a language: add it to LOCALES and provide entries in lib/i18n/dict/*.ts.
 */

export const LOCALES = {
  en: { label: 'English', native: 'English', dir: 'ltr' },
  ar: { label: 'Arabic', native: 'العربية', dir: 'rtl' },
  ta: { label: 'Tamil', native: 'தமிழ்', dir: 'ltr' },
} as const;

export type Locale = keyof typeof LOCALES;
export const LOCALE_CODES = Object.keys(LOCALES) as Locale[];
export const DEFAULT_LOCALE: Locale = 'en';

export const isLocale = (v: unknown): v is Locale => typeof v === 'string' && v in LOCALES;
export const dirOf = (l: string) => (isLocale(l) ? LOCALES[l].dir : 'ltr');

export type TVars = Record<string, string | number>;
export type TFn = (key: string, vars?: TVars) => string;

export function format(s: string, vars?: TVars) {
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}

export function translate(locale: string, key: string, vars?: TVars) {
  const dict = locale === 'en' ? undefined : DICTIONARIES[locale as Exclude<Locale, 'en'>];
  return format(dict?.[key] ?? key, vars);
}

export const makeT = (locale: string): TFn => (key, vars) => translate(locale, key, vars);

/** Best supported locale for an Accept-Language header or navigator.languages list. */
export function matchLocale(prefs: readonly string[] | string | null | undefined, supported: readonly string[] = LOCALE_CODES): string | null {
  const list = typeof prefs === 'string' ? prefs.split(',').map((p) => p.split(';')[0].trim()) : prefs ?? [];
  for (const p of list) {
    const base = p.toLowerCase().split('-')[0];
    if (supported.includes(base)) return base;
  }
  return null;
}

/** Locale-aware number formatting (keeps Latin digits for consistency in tables). */
export const fmtNumber = (n: number, locale: string) => n.toLocaleString(locale === 'ta' ? 'ta-IN' : locale === 'ar' ? 'ar-u-nu-latn' : 'en-US');

export type ThemePref = 'system' | 'light' | 'dark';
export const isThemePref = (v: unknown): v is ThemePref => v === 'system' || v === 'light' || v === 'dark';
export const LANG_COOKIE = 'fc_lang';
export const THEME_COOKIE = 'fc_theme';
