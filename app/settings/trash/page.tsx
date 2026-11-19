import type { Metadata } from 'next';
import { TrashSettings } from '@/components/settings/trash-settings';
import { requireAdmin } from '@/lib/auth';
import { getServerT } from '@/lib/i18n/server';
import { listTrash, TRASH_DAYS } from '@/lib/trash';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return { title: t('Trash') };
}

export default async function TrashPage() {
  await requireAdmin();
  return <TrashSettings initial={await listTrash()} days={TRASH_DAYS} />;
}
