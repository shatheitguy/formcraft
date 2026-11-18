import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
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
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <div className="mx-auto w-full max-w-[1680px] flex-1 px-4 pb-20 pt-8 sm:px-6 lg:px-8">
        <Link href="/" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-800 mb-4">
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t('Back to dashboard')}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Settings')}</h1>
        <p className="mt-1 text-sm text-slate-600">
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
