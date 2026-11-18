import type { Metadata } from 'next';
import { getServerT } from '@/lib/i18n/server';
import { NotificationSettings } from '@/components/settings/notification-settings';
import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getSettings, redactSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return { title: t('Notification channel setup') };
}

export default async function NotificationsPage() {
  const me = await requireAdmin();
  const [settings, logs, subscribers] = await Promise.all([
    getSettings(),
    prisma.notificationLog.findMany({ orderBy: { createdAt: 'desc' }, take: 25 }),
    prisma.user.groupBy({ by: ['emailNotifications', 'telegramNotifications', 'whatsappNotifications'], where: { active: true }, _count: true }),
  ]);
  const r = redactSettings(settings);
  const count = (pick: (s: (typeof subscribers)[number]) => boolean) => subscribers.filter(pick).reduce((n, s) => n + s._count, 0);

  return (
    <NotificationSettings
      smtp={r.smtp}
      telegram={r.telegram}
      whatsapp={r.whatsapp}
      adminEmail={me.email}
      stats={{ email: count((s) => s.emailNotifications), telegram: count((s) => s.telegramNotifications), whatsapp: count((s) => s.whatsappNotifications) }}
      logs={logs.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() }))}
    />
  );
}
