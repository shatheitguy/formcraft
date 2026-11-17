import Link from 'next/link';
import { Logo } from '@/components/icons';
import { getServerT } from '@/lib/i18n/server';
import { PoweredByCredit } from '@/components/powered-by-credit';
import { getSettings } from '@/lib/settings';

export default async function NotFound() {
  const t = await getServerT();
  const { app } = await getSettings().catch(() => ({ app: { footerText: '', footerUrl: '', logoUrl: '' } }));
  return (
    <main className="bg-grid relative flex min-h-screen flex-col items-center justify-center px-4 pb-20 text-center">
      <Logo className="mb-6 h-10 w-10" />
      <h1 className="text-xl font-semibold text-slate-900">{t('Page not found')}</h1>
      <p className="mt-1 text-sm text-slate-500">{t('The form or page you’re looking for doesn’t exist or was deleted.')}</p>
      <Link href="/" className="mt-6 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-onaccent hover:bg-brand-700">
        {t('Back to dashboard')}
      </Link>
      <footer className="absolute inset-x-0 bottom-0 py-6">
        <PoweredByCredit label={t('Powered by')} footerText={app.footerText} footerUrl={app.footerUrl || undefined} logoUrl={app.logoUrl || undefined} />
      </footer>
    </main>
  );
}
