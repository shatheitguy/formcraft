import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ForgotForm } from '@/components/auth/forgot-form';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getServerT } from '@/lib/i18n/server';
import { CODE_CHANNELS, workspaceChannels } from '@/lib/two-factor';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return { title: t('Reset your password') };
}

export default async function ForgotPage() {
  if ((await prisma.user.count()) === 0) redirect('/setup');
  if (await getCurrentUser()) redirect('/');
  // Only what the workspace can send through (email first) — nothing about any account.
  const ws = await workspaceChannels();
  return <ForgotForm channels={CODE_CHANNELS.filter((c) => ws[c])} />;
}
