import type { Metadata } from 'next';
import { getServerT } from '@/lib/i18n/server';
import { GeneralSettingsForm } from '@/components/settings/general-form';
import { requireAdmin } from '@/lib/auth';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return { title: t('Customization') };
}

export default async function GeneralSettingsPage() {
  await requireAdmin();
  const { app } = await getSettings();
  return <GeneralSettingsForm initial={app} />;
}
