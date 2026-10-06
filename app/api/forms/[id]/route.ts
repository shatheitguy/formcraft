import { NextResponse } from 'next/server';
import { canEditForm, canViewForm, forbidden, getCurrentUser, unauthorized } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { DOMAIN_RE, nextFreePort, portRange, SLUG_RE } from '@/lib/form-links';
import { syncPortListeners } from '@/lib/port-router';
import { isValidSchema, normalizeTags, sanitizeBranding, toFormDTO } from '@/lib/forms';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  if (!canViewForm(me, params.id)) return forbidden();
  const form = await prisma.form.findUnique({ where: { id: params.id } });
  if (!form) return NextResponse.json({ error: 'Form not found' }, { status: 404 });
  return NextResponse.json(toFormDTO(form));
}

export async function PATCH(req: Request, { params }: Ctx) {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  if (!canEditForm(me, params.id)) return forbidden();
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const data: Record<string, string | number | null> = {};
  if (typeof body.title === 'string') data.title = body.title.trim().slice(0, 200) || 'Untitled form';
  if (typeof body.description === 'string') data.description = body.description.slice(0, 2000);
  if (typeof body.category === 'string') data.category = body.category.trim().slice(0, 40) || 'General';
  if (body.tags !== undefined) data.tags = JSON.stringify(normalizeTags(body.tags));
  if (body.status === 'ACTIVE' || body.status === 'DRAFT') data.status = body.status;
  if (body.schema !== undefined) {
    if (!isValidSchema(body.schema)) return NextResponse.json({ error: 'Invalid form schema' }, { status: 400 });
    const schema = body.schema;
    schema.settings = { ...schema.settings, branding: sanitizeBranding(schema.settings?.branding) };
    data.schema = JSON.stringify(schema);
  }

  // Public link, dedicated port and custom domain.
  if (body.slug !== undefined) {
    const slug = String(body.slug).trim().toLowerCase();
    if (!SLUG_RE.test(slug)) return NextResponse.json({ error: 'Link name: 1–60 lowercase letters, numbers or dashes.' }, { status: 400 });
    const taken = await prisma.form.findFirst({ where: { OR: [{ slug }, { id: slug }], NOT: { id: params.id } } });
    if (taken) return NextResponse.json({ error: 'That link is already used by another form.' }, { status: 409 });
    data.slug = slug;
  }
  if (body.customDomain !== undefined) {
    const d = String(body.customDomain ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (d && !DOMAIN_RE.test(d)) return NextResponse.json({ error: 'Enter a hostname like forms.example.com' }, { status: 400 });
    if (d && (await prisma.form.findFirst({ where: { customDomain: d, NOT: { id: params.id } } }))) {
      return NextResponse.json({ error: 'That domain is already assigned to another form.' }, { status: 409 });
    }
    data.customDomain = d || null;
  }
  if (body.port !== undefined) {
    const range = portRange();
    if (body.port === null) data.port = null;
    else if (!range) return NextResponse.json({ error: 'Dedicated ports are disabled (FORM_PORT_RANGE is not set).' }, { status: 400 });
    else if (body.port === 'auto') {
      const current = await prisma.form.findUnique({ where: { id: params.id }, select: { port: true } });
      const port = current?.port ?? (await nextFreePort());
      if (!port) return NextResponse.json({ error: `All ports ${range.from}–${range.to} are in use.` }, { status: 409 });
      data.port = port;
    } else {
      const port = Number(body.port);
      if (!Number.isInteger(port) || port < range.from || port > range.to) {
        return NextResponse.json({ error: `Port must be between ${range.from} and ${range.to}.` }, { status: 400 });
      }
      if (await prisma.form.findFirst({ where: { port, NOT: { id: params.id } } })) {
        return NextResponse.json({ error: `Port ${port} is already used by another form.` }, { status: 409 });
      }
      data.port = port;
    }
  }

  try {
    const form = await prisma.form.update({ where: { id: params.id }, data });
    if ('port' in data) await syncPortListeners();
    return NextResponse.json(toFormDTO(form));
  } catch {
    return NextResponse.json({ error: 'Form not found' }, { status: 404 });
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  if (!canEditForm(me, params.id)) return forbidden();
  try {
    await prisma.form.delete({ where: { id: params.id } });
    await syncPortListeners();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Form not found' }, { status: 404 });
  }
}
