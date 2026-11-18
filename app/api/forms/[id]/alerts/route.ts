import { NextResponse } from 'next/server';
import { canEditForm, forbidden, getCurrentUser, unauthorized } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { sampleAnswers, sanitizeFormNotify, sendConfirmation, workspaceChannels } from '@/lib/form-alerts';
import { parseSchema } from '@/lib/forms';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

/** Which workspace channels work, and where a test confirmation would go (the editor's own details). */
export async function GET(_req: Request, { params }: Ctx) {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  if (!canEditForm(me, params.id)) return forbidden();
  const [settings, user] = await Promise.all([getSettings(), prisma.user.findUnique({ where: { id: me.id } })]);
  if (!user) return unauthorized();
  return NextResponse.json({
    channels: workspaceChannels(settings),
    isAdmin: me.role === 'ADMIN',
    defaultCountryCode: settings.whatsapp.defaultCountryCode,
    me: { email: user.notifyEmail || user.email || '', whatsapp: user.whatsappNumber || '' },
  });
}

const recent = new Map<string, number[]>();
function overLimit(key: string, max = 5, windowMs = 10 * 60_000) {
  const now = Date.now();
  const hits = (recent.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) return true;
  hits.push(now);
  recent.set(key, hits);
  return false;
}

/**
 * Sends the confirmation message (from the builder's current, possibly unsaved settings) with sample
 * answers to the signed-in editor's own WhatsApp number / email — never to anyone else.
 */
export async function POST(req: Request, { params }: Ctx) {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  if (!canEditForm(me, params.id)) return forbidden();
  const body = await req.json().catch(() => null);
  const channel = body?.channel === 'email' ? 'email' : body?.channel === 'whatsapp' ? 'whatsapp' : null;
  if (!channel) return NextResponse.json({ error: 'Unknown channel' }, { status: 400 });

  const [form, user, settings] = await Promise.all([
    prisma.form.findUnique({ where: { id: params.id } }),
    prisma.user.findUnique({ where: { id: me.id } }),
    getSettings(),
  ]);
  if (!form) return NextResponse.json({ error: 'Form not found' }, { status: 404 });
  if (!user) return unauthorized();

  const on = workspaceChannels(settings);
  if (!on[channel]) {
    return NextResponse.json(
      { error: channel === 'email' ? 'Email isn’t set up yet. An admin can configure SMTP in Settings → Notification channel setup.' : 'WhatsApp isn’t set up yet. An admin can link it in Settings → Notification channel setup.' },
      { status: 400 },
    );
  }
  const email = user.notifyEmail || user.email || '';
  const whatsapp = user.whatsappNumber || '';
  if (channel === 'whatsapp' && !whatsapp) return NextResponse.json({ error: 'Save your WhatsApp number in My profile first.' }, { status: 400 });
  if (channel === 'email' && !email) return NextResponse.json({ error: 'Save your email in My profile first.' }, { status: 400 });
  if (overLimit(me.id)) return NextResponse.json({ error: 'Too many test messages — wait a few minutes and try again.' }, { status: 429 });

  const schema = parseSchema(form.schema);
  const raw = body?.confirm !== undefined ? { confirm: body.confirm } : { confirm: schema.settings.confirm };
  const { confirm } = sanitizeFormNotify(raw, schema.fields, settings.whatsapp.defaultCountryCode);
  // Only the requested channel, forced on so the editor can try it before switching it on.
  const only = channel === 'whatsapp'
    ? { whatsapp: { enabled: true, fieldId: confirm?.whatsapp?.fieldId ?? '', message: confirm?.whatsapp?.message ?? '' }, attachPdf: confirm?.attachPdf }
    : { email: { enabled: true, fieldId: confirm?.email?.fieldId ?? '', subject: confirm?.email?.subject ?? '', message: confirm?.email?.message ?? '' }, attachPdf: confirm?.attachPdf };

  const r = await sendConfirmation({
    form,
    fields: schema.fields,
    quiz: !!schema.settings.quiz,
    confirm: only,
    answers: sampleAnswers(schema.fields, { email, whatsapp, name: user.name }),
    testTo: { whatsapp, email },
  });
  const res = r[channel];
  if (!res) return NextResponse.json({ error: 'Couldn’t send the test message.' }, { status: 502 });
  return res.ok ? NextResponse.json({ ok: true, to: channel === 'email' ? email : whatsapp }) : NextResponse.json({ error: res.error }, { status: 502 });
}
