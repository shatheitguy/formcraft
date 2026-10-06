import type { Metadata, Viewport } from 'next';
import { AppProvider } from '@/components/app-context';
import { I18nProvider } from '@/components/i18n';
import { ToastProvider } from '@/components/toast';
import { getCurrentUser } from '@/lib/auth';
import { dirOf } from '@/lib/i18n';
import { getLocale, getThemePref } from '@/lib/i18n/server';
import { getSettings } from '@/lib/settings';
import { accentCss } from '@/lib/theme';
import './globals.css';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { app } = await getSettings();
  return {
    title: { default: app.name, template: `%s · ${app.name}` },
    description: app.tagline,
    icons: { icon: app.logoUrl || '/logo.svg' },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#020617' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [{ app }, user, locale, theme] = await Promise.all([getSettings(), getCurrentUser(), getLocale(), getThemePref()]);
  return (
    // "system" leaves the class off so prefers-color-scheme decides; light/dark force it.
    <html lang={locale} dir={dirOf(locale)} className={theme === 'system' ? undefined : theme} suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: accentCss(app.accent) }} />
      </head>
      <body className="min-h-screen font-sans">
        <AppProvider value={{ app, user, theme }}>
          <I18nProvider locale={locale}>
            <ToastProvider>{children}</ToastProvider>
          </I18nProvider>
        </AppProvider>
      </body>
    </html>
  );
}
