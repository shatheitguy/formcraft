'use client';

import { Settings } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useApp } from './app-context';
import { useT } from './i18n';
import { Logo } from './icons';
import { buttonClass } from './ui';
import { NotificationBell } from './notification-bell';
import { LanguageSwitch } from './preferences';
import { UserMenu } from './user-menu';

export function AppHeader({ children }: { children?: ReactNode }) {
  const { app, user } = useApp();
  const t = useT();
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/80 backdrop-blur-lg">
      <div className="mx-auto flex h-14 max-w-[1680px] items-center gap-2 px-3 sm:gap-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          <Logo className="h-7 w-7 shrink-0" src={app.logoUrl || undefined} />
          <span className="truncate text-[15px] font-bold tracking-tight text-slate-900">{app.name}</span>
        </Link>
        <span className="hidden rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-500 sm:inline">{t('self-hosted')}</span>
        <div className="ms-auto flex shrink-0 items-center gap-1 sm:gap-2">
          {children}
          <LanguageSwitch />
          {user && <NotificationBell />}
          {user?.role === 'ADMIN' && (
            <Link href="/settings/general" className={buttonClass('ghost', 'sm', 'hidden px-2 sm:inline-flex')} title={t('Settings')} aria-label={t('Settings')}>
              <Settings className="h-4 w-4" />
            </Link>
          )}
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
