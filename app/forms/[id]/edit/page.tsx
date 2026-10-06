import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { FormBuilder } from '@/components/builder/form-builder';
import { canEditForm, canViewForm, requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { portRange } from '@/lib/form-links';
import { getServerT } from '@/lib/i18n/server';
import { toFormDTO } from '@/lib/forms';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const [form, t] = await Promise.all([prisma.form.findUnique({ where: { id: params.id }, select: { title: true } }), getServerT()]);
  return { title: form ? t('Edit · {title}', { title: form.title }) : t('Not found') };
}

export default async function EditFormPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!canEditForm(user, params.id)) {
    if (canViewForm(user, params.id)) redirect(`/forms/${params.id}/submissions`);
    notFound();
  }
  const row = await prisma.form.findUnique({
    where: { id: params.id },
    include: { _count: { select: { submissions: true } } },
  });
  if (!row) notFound();
  return <FormBuilder initial={toFormDTO(row)} responses={row._count.submissions} portRange={portRange()} />;
}
