import type { Metadata } from 'next';
import { getServerT } from '@/lib/i18n/server';
import { ProfileSettings } from '@/components/settings/profile-settings';
import { formWhere, notifyFormIds, requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return { title: t('My profile') };
}

export default async function ProfilePage() {
  const me = await requireUser();
  const [user, forms, settings] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: me.id } }),
    prisma.form.findMany({ where: formWhere(me), orderBy: { title: 'asc' }, select: { id: true, title: true, category: true } }),
    getSettings(),
  ]);

  return (
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
        notifyAllForms: user.notifyAllForms,
        notifyFormIds: notifyFormIds(user),
      }}
      forms={forms}
      channels={{
        email: settings.smtp.enabled && !!settings.smtp.host,
        telegram: settings.telegram.enabled && !!settings.telegram.botToken,
      }}
      isAdmin={me.role === 'ADMIN'}
    />
  );
}
