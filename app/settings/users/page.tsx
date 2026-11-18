import type { Metadata } from 'next';
import { getServerT } from '@/lib/i18n/server';
import { UsersManager, type ManagedUser } from '@/components/settings/users-manager';
import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { normalizeForced } from '@/lib/notify-prefs';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return { title: t('Users & roles') };
}

export default async function UsersPage() {
  const me = await requireAdmin();
  const [users, forms, settings] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: 'asc' }, include: { formAccess: { select: { formId: true } } } }),
    prisma.form.findMany({ orderBy: { title: 'asc' }, select: { id: true, title: true, category: true, status: true } }),
    getSettings(),
  ]);
  const data: ManagedUser[] = users.map((u) => ({
    id: u.id,
    username: u.username,
    email: u.email,
    name: u.name,
    avatarUrl: u.avatarUrl,
    role: u.role as ManagedUser['role'],
    formScope: u.formScope === 'SELECTED' ? 'SELECTED' : 'ALL',
    formIds: u.formAccess.map((a) => a.formId),
    active: u.active,
    whatsappNumber: u.whatsappNumber ?? '',
    whatsappNotifications: u.whatsappNotifications,
    forcedNotify: normalizeForced(u.forcedNotify),
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    twoFactor: u.totpEnabled || u.emailOtpEnabled || u.whatsappOtpEnabled || u.telegramOtpEnabled,
    require2fa: u.require2fa,
    createdAt: u.createdAt.toISOString(),
  }));
  return <UsersManager users={data} forms={forms} meId={me.id} policy={settings.security.require2fa} />;
}
