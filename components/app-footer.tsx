'use client';

import { useApp } from './app-context';
import { useT } from './i18n';
import { PoweredByCredit } from './powered-by-credit';

/** "Powered by …" credit at the bottom of app pages. Always shown; workspace branding is set in Settings → Customization. */
export function AppFooter() {
  const { app } = useApp();
  const t = useT();
  return (
    <footer className="py-6">
      <PoweredByCredit label={t('Powered by')} footerText={app.footerText} footerUrl={app.footerUrl || undefined} logoUrl={app.logoUrl || undefined} />
    </footer>
  );
}
