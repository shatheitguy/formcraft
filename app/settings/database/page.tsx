import type { Metadata } from 'next';
import { getServerT } from '@/lib/i18n/server';
import { DatabaseSettings } from '@/components/settings/database-settings';
import { requireAdmin } from '@/lib/auth';
import { databaseInfo } from '@/lib/database';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return { title: t('Database') };
}

export default async function DatabasePage() {
  await requireAdmin();
  return <DatabaseSettings initial={await databaseInfo()} />;
}
