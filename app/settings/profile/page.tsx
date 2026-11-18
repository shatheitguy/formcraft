import type { Metadata } from 'next';
import { getServerT } from '@/lib/i18n/server';
import { ProfileSettings } from '@/components/settings/profile-settings';
import { formWhere, notifyFormIds, requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { normalizeForced, parseNotifyEvents } from '@/lib/notify-prefs';
import { getSettings } from '@/lib/settings';
import { waStatus } from '@/lib/whatsapp';
import { ShieldAlert } from 'lucide-react';
import { codeDestination, maskTarget, recoveryCodesLeft, twoFactorRequired } from '@/lib/two-factor';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return { title: t('My profile') };
}

export default async function ProfilePage() {
  const me = await requireUser();
  const t = await getServerT();
  const [user, forms, settings] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: me.id } }),
    prisma.form.findMany({ where: formWhere(me), orderBy: { title: 'asc' }, select: { id: true, title: true, category: true } }),
    getSettings(),
  ]);
  const channels = {
    email: settings.smtp.enabled && !!settings.smtp.host,
    telegram: settings.telegram.enabled && !!settings.telegram.botToken,
    whatsapp: settings.whatsapp.enabled && waStatus().status === 'on',
  };
  const [waTo, tgTo] = await Promise.all([codeDestination(user, 'whatsapp'), codeDestination(user, 'telegram')]);
  const required = twoFactorRequired(user, settings.security.require2fa);
  const anyOn = user.totpEnabled || user.emailOtpEnabled || user.whatsappOtpEnabled || user.telegramOtpEnabled;
  const methods = [t('Authenticator app'), ...(channels.email ? [t('Email codes')] : []), ...(channels.whatsapp ? [t('WhatsApp codes')] : []), ...(channels.telegram ? [t('Telegram codes')] : [])];

  return (
    <>
    {required && !anyOn && (
      <div className="mb-6 flex items-start gap-3 rounded-xl bg-amber-50 px-4 py-3.5 text-sm text-amber-900 ring-1 ring-amber-300" role="alert">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{t('Your admin requires two-factor sign-in')}</p>
          <p className="mt-0.5 text-slate-700">
            {t('Turn on at least one method below to keep using the workspace. Until then, only this page is available.')}{' '}
            {t('Available here: {methods}.', { methods: methods.join(t(', ')) })}
          </p>
          <a href="#security" className="mt-1.5 inline-block font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800">
            {t('Set up two-factor sign-in')}
          </a>
        </div>
      </div>
    )}
    <ProfileSettings
      profile={{
        name: user.name,
        avatarUrl: user.avatarUrl,
        username: user.username,
        email: user.email,
        role: me.role,
        createdAt: user.createdAt.toISOString(),
        notifyEmail: user.notifyEmail ?? '',
        telegramChatId: user.telegramChatId ?? '',
        emailNotifications: user.emailNotifications,
        telegramNotifications: user.telegramNotifications,
        whatsappNumber: user.whatsappNumber ?? '',
        whatsappNotifications: user.whatsappNotifications,
        whatsappAttach: user.whatsappAttach === 'pdf' || user.whatsappAttach === 'xlsx' ? user.whatsappAttach : 'none',
        notifyAllForms: user.notifyAllForms,
        notifyFormIds: notifyFormIds(user),
        notifyEvents: parseNotifyEvents(user.notifyEvents),
        forcedNotify: normalizeForced(user.forcedNotify),
      }}
      forms={forms}
      channels={channels}
      isAdmin={me.role === 'ADMIN'}
      twoFactor={{
        totp: user.totpEnabled,
        email: user.emailOtpEnabled,
        whatsapp: user.whatsappOtpEnabled,
        telegram: user.telegramOtpEnabled,
        recoveryLeft: recoveryCodesLeft(user.recoveryCodes),
        whatsappAvailable: channels.whatsapp,
        telegramAvailable: channels.telegram,
        whatsappTo: waTo ? maskTarget('whatsapp', waTo) : '',
        telegramTo: tgTo ? maskTarget('telegram', tgTo) : '',
        required,
      }}
    />
    </>
  );
}
