'use client';

import { ArrowLeft, Bell, Database, Palette, UserCircle2, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useT } from '@/components/i18n';
import { cn } from '@/lib/utils';

const ACCOUNT = [{ href: '/settings/profile', label: 'My profile', icon: UserCircle2 }];
const WORKSPACE = [
  { href: '/settings/general', label: 'Customization', icon: Palette },
  { href: '/settings/users', label: 'Users & roles', icon: Users },
  { href: '/settings/notifications', label: 'Notifications', icon: Bell },
  { href: '/settings/database', label: 'Database', icon: Database },
];

export function SettingsNav({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  const t = useT();
  const groups = [{ title: 'Account', items: ACCOUNT }, ...(isAdmin ? [{ title: 'Workspace', items: WORKSPACE }] : [])];
  return (
    <nav className="scrollbar-thin -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:block lg:space-y-6 lg:overflow-visible lg:px-0">
      {groups.map((g) => (
        <div key={g.title} className="flex gap-1 lg:block lg:space-y-0.5">
          <div className="label hidden px-3 !text-[10px] lg:block">{t(g.title)}</div>
          {g.items.map(({ href, label, icon: Icon }) => {
            const active = path.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition',
                  active ? 'bg-white text-brand-700 shadow-card ring-1 ring-slate-200' : 'text-slate-600 hover:bg-white/70 hover:text-slate-900',
                )}
              >
                <Icon className={cn('h-4 w-4', active ? 'text-brand-600' : 'text-slate-400')} />
                {t(label)}
              </Link>
            );
          })}
        </div>
      ))}
      <Link href="/" className="hidden items-center gap-2 px-3 text-xs font-medium text-slate-500 hover:text-slate-800 lg:flex">
        <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" /> {t('Back to dashboard')}
      </Link>
    </nav>
  );
}
