import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/login-form';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getServerT } from '@/lib/i18n/server';
import { emailAvailable } from '@/lib/two-factor';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return { title: t('Sign in') };
}

export default async function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  if ((await prisma.user.count()) === 0) redirect('/setup');
  if (await getCurrentUser()) redirect(safeNext(searchParams.next));
  return <LoginForm next={safeNext(searchParams.next)} resetByEmail={await emailAvailable()} />;
}

/** Only allow same-site relative redirects. */
function safeNext(next?: string) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}
