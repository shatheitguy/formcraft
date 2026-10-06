import { NextResponse } from 'next/server';
import { canCreateForms, forbidden, formWhere, getCurrentUser, unauthorized } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { newFormLinks } from '@/lib/form-links';
import { isValidSchema, normalizeTags, toFormDTO } from '@/lib/forms';
import { syncPortListeners } from '@/lib/port-router';
import { getTemplate } from '@/lib/templates';

export const dynamic = 'force-dynamic';

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  const forms = await prisma.form.findMany({
    where: formWhere(me),
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { submissions: true } } },
  });
  return NextResponse.json(forms.map((f) => ({ ...toFormDTO(f), responses: f._count.submissions })));
}

/** Create a form from a template id, or from an explicit payload. */
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  if (!canCreateForms(me)) return forbidden();

  const body = await req.json().catch(() => ({}));
  const template = getTemplate(body.templateId);
  const schema = isValidSchema(body.schema) ? body.schema : template.build();

  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 200) : template.title;
  const form = await prisma.form.create({
    data: {
      title,
      // Every form gets a unique public link and, if a port pool is configured, its own port.
      ...(await newFormLinks(title)),
      description: typeof body.description === 'string' ? body.description : template.description,
      category: typeof body.category === 'string' && body.category.trim() ? body.category.trim() : template.category,
      tags: JSON.stringify(normalizeTags(body.tags ?? template.tags)),
      status: 'DRAFT',
      schema: JSON.stringify(schema),
      createdById: me.id,
      // Editors limited to selected forms automatically get access to what they create.
      access: me.role !== 'ADMIN' && me.formScope === 'SELECTED' ? { create: { userId: me.id } } : undefined,
    },
  });
  await syncPortListeners();
  return NextResponse.json(toFormDTO(form), { status: 201 });
}
