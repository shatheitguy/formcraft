import { NextResponse } from 'next/server';
import { canCreateForms, canEditForm, forbidden, getCurrentUser, unauthorized } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { newFormLinks } from '@/lib/form-links';
import { syncPortListeners } from '@/lib/port-router';
import { toFormDTO } from '@/lib/forms';
import { notifyFormEvent } from '@/lib/activity';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  if (!canCreateForms(me) || !canEditForm(me, params.id)) return forbidden();
  const src = await prisma.form.findUnique({ where: { id: params.id } });
  if (!src) return NextResponse.json({ error: 'Form not found' }, { status: 404 });
  const copy = await prisma.form.create({
    data: {
      title: `${src.title} (copy)`,
      ...(await newFormLinks(src.title)),
      description: src.description,
      category: src.category,
      tags: src.tags,
      status: 'DRAFT',
      schema: src.schema,
      createdById: me.id,
      access: me.role !== 'ADMIN' && me.formScope === 'SELECTED' ? { create: { userId: me.id } } : undefined,
    },
  });
  await syncPortListeners();
  void notifyFormEvent('form.created', me, copy);
  return NextResponse.json(toFormDTO(copy), { status: 201 });
}
