import type { Metadata } from 'next';
import { AboutSettings } from '@/components/settings/about-settings';
import { aboutInfo } from '@/lib/about';
import { requireAdmin } from '@/lib/auth';
import { getServerT } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return { title: t('About') };
}

export default async function AboutPage() {
  await requireAdmin();
  return <AboutSettings initial={await aboutInfo()} />;
}
