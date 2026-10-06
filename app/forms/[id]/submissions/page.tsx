import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SubmissionsView } from '@/components/submissions/submissions-view';
import { canEditForm, canViewForm, requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getServerT } from '@/lib/i18n/server';
import { toFormDTO, toSubmissionDTO } from '@/lib/forms';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const form = await prisma.form.findUnique({ where: { id: params.id }, select: { title: true } });
  const t = await getServerT();
  return { title: form ? t('Submissions · {title}', { title: form.title }) : t('Not found') };
}

export default async function SubmissionsPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!canViewForm(user, params.id)) notFound();
  const row = await prisma.form.findUnique({
    where: { id: params.id },
    include: { submissions: { orderBy: { createdAt: 'desc' } } },
  });
  if (!row) notFound();
  return <SubmissionsView form={toFormDTO(row)} submissions={row.submissions.map(toSubmissionDTO)} canManage={canEditForm(user, row.id)} />;
}
