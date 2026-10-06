'use client';

import { ChevronDown, LogOut, Settings, UserCircle2, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ROLE_INFO, initials } from '@/lib/roles';
import { cn } from '@/lib/utils';
import { useApp } from './app-context';
import { useT } from './i18n';
import { ThemeSwitch } from './preferences';
import { Dropdown, type MenuItem } from './ui';

export function Avatar({ name, fallback, src, className }: { name: string; fallback: string; src?: string | null; className?: string }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className={cn('shrink-0 rounded-full bg-slate-100 object-cover ring-1 ring-slate-200', className ?? 'h-8 w-8')} />;
  }
  return (
    <span className={cn('flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 font-semibold text-onaccent', className ?? 'h-8 w-8 text-xs')}>
      {initials(name, fallback)}
    </span>
  );
}

export function UserMenu() {
  const { user } = useApp();
  const router = useRouter();
  const t = useT();
  if (!user) return null;

  const signOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  const items: MenuItem[] = [
    { label: t('My profile'), icon: <UserCircle2 />, onClick: () => router.push('/settings/profile') },
    ...(user.role === 'ADMIN'
      ? [
          { label: t('Settings'), icon: <Settings />, onClick: () => router.push('/settings/general') },
          { label: t('Users & roles'), icon: <Users />, onClick: () => router.push('/settings/users') },
        ]
      : []),
    { label: t('Sign out'), icon: <LogOut />, onClick: signOut, divider: true, danger: true },
  ];

  return (
    <Dropdown
      items={items}
      header={
        <div className="px-2.5 py-2">
          <div className="truncate text-sm font-semibold text-slate-900">{user.name || user.username}</div>
          <div className="truncate text-xs text-slate-500">{user.email}</div>
          <span className={cn('chip mt-1.5', ROLE_INFO[user.role].tone)}>{t(ROLE_INFO[user.role].label)}</span>
          <div className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t('Theme')}</div>
          <ThemeSwitch className="mt-1 w-full [&>button]:flex-1 [&>button]:justify-center [&>button>span]:hidden" />
        </div>
      }
      trigger={
        <button className="flex items-center gap-1.5 rounded-full p-0.5 pe-1.5 transition hover:bg-slate-100" aria-label={t('Account menu')}>
          <Avatar name={user.name} fallback={user.username} src={user.avatarUrl} />
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
        </button>
      }
    />
  );
}
