import { NextResponse } from 'next/server';
import { canViewForm, forbidden, getCurrentUser, unauthorized } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { parseSchema, toSubmissionDTO } from '@/lib/forms';
import { sendWhatsApp } from '@/lib/notify';
import { buildReport, REPORT_MIME, reportFileName, type ReportFormat } from '@/lib/reports';
import { getSettings } from '@/lib/settings';
import { waNumber, waStatus } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

// A few WhatsApp reports a minute per person at most (a number that sends fast gets blocked).
const recent = new Map<string, number[]>();
function overLimit(key: string, max = 6, windowMs = 60_000) {
  const now = Date.now();
  const hits = (recent.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) return true;
  hits.push(now);
  recent.set(key, hits);
  return false;
}

/**
 * POST { format: 'pdf' | 'xlsx', ids?: string[], action: 'download' | 'whatsapp', to?, note? }
 * Builds a report of the chosen responses (all when `ids` is missing), then downloads it or sends it over WhatsApp.
 */
export async function POST(req: Request, { params }: Ctx) {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  if (!canViewForm(me, params.id)) return forbidden();

  const body = await req.json().catch(() => ({}));
  const format: ReportFormat | null = body.format === 'pdf' || body.format === 'xlsx' ? body.format : null;
  if (!format) return NextResponse.json({ error: 'Choose PDF or Excel.' }, { status: 400 });
  const action = body.action === 'whatsapp' ? 'whatsapp' : 'download';
  const ids: string[] | null = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === 'string').slice(0, 5000) : null;

  const form = await prisma.form.findUnique({ where: { id: params.id } });
  if (!form) return NextResponse.json({ error: 'Form not found' }, { status: 404 });
  const rows = await prisma.submission.findMany({
    where: { formId: form.id, ...(ids ? { id: { in: ids } } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });
  if (!rows.length) return NextResponse.json({ error: 'There are no responses to include.' }, { status: 400 });
  if (format === 'pdf' && rows.length > 500) {
    return NextResponse.json({ error: 'PDF reports are limited to 500 responses. Filter the list or use Excel.' }, { status: 400 });
  }

  const settings = await getSettings();
  const schema = parseSchema(form.schema);

  let to = '';
  if (action === 'whatsapp') {
    if (!settings.whatsapp.enabled || waStatus().status !== 'on') {
      return NextResponse.json({ error: 'WhatsApp isn’t linked. An admin can link it in Settings → Notification channel setup.' }, { status: 400 });
    }
    to = waNumber(typeof body.to === 'string' ? body.to : '', settings.whatsapp.defaultCountryCode);
    if (!to) return NextResponse.json({ error: 'Enter the WhatsApp number with its country code, e.g. +971 50 123 4567.' }, { status: 400 });
    if (overLimit(me.id) || overLimit(`h:${me.id}`, 30, 3_600_000)) return NextResponse.json({ error: 'Too many WhatsApp messages — wait a minute.' }, { status: 429 });
  }

  const data = await buildReport(format, {
    appName: settings.app.name,
    formTitle: form.title,
    fields: schema.fields,
    quiz: !!schema.settings.quiz,
    submissions: rows.map(toSubmissionDTO),
  });
  const fileName = reportFileName(form.title, format, rows.length === 1);

  if (action === 'download') {
    return new NextResponse(new Uint8Array(data), {
      headers: {
        'Content-Type': REPORT_MIME[format],
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : '';
  const what = rows.length === 1 ? '1 response' : `${rows.length} responses`;
  const caption = `📄 *${form.title}* — ${what} (${format === 'pdf' ? 'PDF' : 'Excel'})${note ? `\n\n${note}` : ''}`;
  const target = '+' + to;
  const subject = `Report · ${form.title}`;
  try {
    await sendWhatsApp(target, caption, { data, fileName, mimetype: REPORT_MIME[format] });
    await prisma.notificationLog.create({ data: { channel: 'whatsapp', target, subject, status: 'sent' } });
    return NextResponse.json({ ok: true, to: target, count: rows.length });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await prisma.notificationLog.create({ data: { channel: 'whatsapp', target, subject, status: 'failed', error: error.slice(0, 500) } });
    return NextResponse.json({ error }, { status: 502 });
  }
}
