import { SettingsNav } from '@/components/settings/settings-nav';
import { AppFooter } from '@/components/app-footer';
import { AppHeader } from '@/components/app-header';
import { requireUser } from '@/lib/auth';
import { getServerT } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const t = await getServerT();
  return (
    <div className="min-h-screen">
      <AppHeader />
      <div className="mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Settings')}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {user.role === 'ADMIN' ? t('Manage your workspace, users, notifications and database.') : t('Manage your profile and notification preferences.')}
        </p>
        <div className="mt-6 grid gap-6 lg:grid-cols-[220px_1fr]">
          <SettingsNav isAdmin={user.role === 'ADMIN'} />
          <div className="min-w-0">{children}</div>
        </div>
      </div>
      <AppFooter />
    </div>
  );
}
