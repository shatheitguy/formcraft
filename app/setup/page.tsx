import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SetupForm } from '@/components/auth/setup-form';
import { prisma } from '@/lib/db';
import { getServerT } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return { title: t('Set up') };
}

export default async function SetupPage() {
  if ((await prisma.user.count()) > 0) redirect('/login');
  return <SetupForm />;
}
