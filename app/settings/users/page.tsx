import type { Metadata } from 'next';
import { getServerT } from '@/lib/i18n/server';
import { UsersManager, type ManagedUser } from '@/components/settings/users-manager';
import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return { title: t('Users & roles') };
}

export default async function UsersPage() {
  const me = await requireAdmin();
  const [users, forms] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: 'asc' }, include: { formAccess: { select: { formId: true } } } }),
    prisma.form.findMany({ orderBy: { title: 'asc' }, select: { id: true, title: true, category: true, status: true } }),
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
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    twoFactor: u.totpEnabled || u.emailOtpEnabled,
    createdAt: u.createdAt.toISOString(),
  }));
  return <UsersManager users={data} forms={forms} meId={me.id} />;
}
