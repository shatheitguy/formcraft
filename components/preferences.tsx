'use client';

import { Check, Globe, Monitor, Moon, Sun } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { dirOf, LANG_COOKIE, LOCALE_CODES, LOCALES, THEME_COOKIE, type Locale, type ThemePref } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useApp } from './app-context';
import { useI18n } from './i18n';

const YEAR = 60 * 60 * 24 * 365;
const setCookie = (k: string, v: string) => {
  document.cookie = `${k}=${encodeURIComponent(v)}; path=/; max-age=${YEAR}; samesite=lax`;
};

/** Applies a theme instantly (no reload) and remembers it for this browser and, if signed in, the account. */
export function useThemePref() {
  const { theme, user } = useApp();
  const [current, setCurrent] = useState<ThemePref>(theme);
  const apply = async (next: ThemePref) => {
    setCurrent(next);
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    if (next !== 'system') root.classList.add(next);
    setCookie(THEME_COOKIE, next);
    if (user) await fetch('/api/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: next }) }).catch(() => {});
  };
  return [current, apply] as const;
}

/** Switches the UI language for this browser and, if signed in, the account. */
export function useLocalePref() {
  const router = useRouter();
  const { user } = useApp();
  const { locale } = useI18n();
  const apply = async (next: Locale) => {
    setCookie(LANG_COOKIE, next);
    document.documentElement.lang = next;
    document.documentElement.dir = dirOf(next);
    if (user) await fetch('/api/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ language: next }) }).catch(() => {});
    router.refresh();
  };
  return [locale, apply] as const;
}

export function ThemeSwitch({ className }: { className?: string }) {
  const { t } = useI18n();
  const [theme, setTheme] = useThemePref();
  const opts: { v: ThemePref; icon: typeof Sun; label: string }[] = [
    { v: 'system', icon: Monitor, label: t('System') },
    { v: 'light', icon: Sun, label: t('Light') },
    { v: 'dark', icon: Moon, label: t('Dark') },
  ];
  return (
    <div className={cn('inline-flex rounded-lg bg-slate-100 p-0.5', className)} role="radiogroup" aria-label={t('Theme')}>
      {opts.map(({ v, icon: Icon, label }) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={theme === v}
          title={label}
          onClick={() => setTheme(v)}
          className={cn('inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition', theme === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800')}
        >
          <Icon className="h-3.5 w-3.5" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

/** Compact language picker (globe button + menu). */
export function LanguageSwitch({ align = 'end' }: { align?: 'start' | 'end' }) {
  const { t } = useI18n();
  const [locale, setLocale] = useLocalePref();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
        aria-label={t('Language')}
        title={t('Language')}
      >
        <Globe className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase">{locale}</span>
      </button>
      {open && (
        <div className={cn('absolute z-40 mt-1 w-44 animate-pop-in rounded-xl border border-slate-200 bg-white p-1 shadow-lift', align === 'end' ? 'end-0' : 'start-0')}>
          {LOCALE_CODES.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => {
                setOpen(false);
                if (l !== locale) setLocale(l);
              }}
              className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-start text-sm text-slate-700 hover:bg-slate-100"
            >
              <span>
                {LOCALES[l].native}
                {l !== 'en' && <span className="ms-1.5 text-xs text-slate-400">{LOCALES[l].label}</span>}
              </span>
              {l === locale && <Check className="h-4 w-4 text-brand-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
