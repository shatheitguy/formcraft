import { NextResponse } from 'next/server';
import { canEditForm, canViewForm, forbidden, getCurrentUser, unauthorized } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { parseSchema, toSubmissionDTO } from '@/lib/forms';
import { formLanguages } from '@/lib/form-i18n';
import { notifySubmission } from '@/lib/notify';
import { notifySubmissionInApp } from '@/lib/activity';
import { deleteAnswerFiles, responseFileExists } from '@/lib/response-files';
import { computeScore } from '@/lib/scoring';
import { validateAnswers } from '@/lib/validation';
import { duplicateAnswers } from '@/lib/unique-answers';
import { countPrevious, ipHashOf, newRespondentId, perPersonLimit, rememberRespondent, respondentIds } from '@/lib/respondent';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  if (!canViewForm(me, params.id)) return forbidden();
  const submissions = await prisma.submission.findMany({
    where: { formId: params.id },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(submissions.map(toSubmissionDTO));
}

/** Public endpoint: record a response. Only accepted while the form is ACTIVE. */
export async function POST(req: Request, { params }: Ctx) {
  const form = await prisma.form.findUnique({ where: { id: params.id } });
  if (!form) return NextResponse.json({ error: 'Form not found' }, { status: 404 });
  if (form.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'This form is not accepting responses right now.' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const answers = body && typeof body.answers === 'object' && !Array.isArray(body.answers) ? body.answers : null;
  if (!answers) return NextResponse.json({ error: 'Invalid submission' }, { status: 400 });

  const schema = parseSchema(form.schema);
  const { valid, errors, clean } = validateAnswers(schema.fields, answers, undefined, { fileExists: (stored) => responseFileExists(form.id, stored) });
  if (!valid) return NextResponse.json({ error: 'Please fix the highlighted fields.', errors }, { status: 422 });

  // Responses per person (device cookie / local-storage id, optionally the network).
  const limit = perPersonLimit(schema.settings);
  const previous = limit ? await countPrevious(form.id, req, schema.settings) : 0;
  if (limit && previous >= limit) {
    return NextResponse.json({ error: 'limit', message: schema.settings.limitMessage || null }, { status: 409 });
  }
  // "No duplicates" questions (one registration per email / phone number).
  const dupes = await duplicateAnswers(form.id, schema.fields, clean);
  if (Object.keys(dupes).length) return NextResponse.json({ error: 'duplicate', errors: dupes }, { status: 409 });

  const { fromCookie, fromClient } = respondentIds(req);
  const respondentId = fromCookie ?? fromClient ?? newRespondentId();

  const result = computeScore(schema, clean);
  const submission = await prisma.submission.create({
    data: {
      formId: form.id,
      data: JSON.stringify(clean),
      score: result?.score ?? null,
      maxScore: result?.maxScore ?? null,
      language: typeof body.language === 'string' && formLanguages(schema).includes(body.language) ? body.language : formLanguages(schema)[0],
      respondentId,
      ipHash: await ipHashOf(req),
    },
  });

  // Fire-and-forget: alerts must never delay or fail the respondent's submission.
  const origin = `${req.headers.get('x-forwarded-proto') ?? 'http'}://${req.headers.get('x-forwarded-host') ?? req.headers.get('host')}`;
  void notifySubmission({ formId: form.id, answers: clean, origin, submissionId: submission.id, score: submission.score, maxScore: submission.maxScore });
  void notifySubmissionInApp(form);

  const left = limit ? Math.max(0, limit - previous - 1) : null;
  const res = NextResponse.json({ id: submission.id, result: schema.settings.showScore ? result : null, remaining: left, respondentId }, { status: 201 });
  if (!fromCookie) rememberRespondent(res, respondentId, (req.headers.get('x-forwarded-proto') ?? new URL(req.url).protocol.replace(':', '')) === 'https');
  return res;
}

/** Bulk delete: { ids: string[] } */
export async function DELETE(req: Request, { params }: Ctx) {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  if (!canEditForm(me, params.id)) return forbidden();
  const body = await req.json().catch(() => null);
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => typeof x === 'string') : [];
  if (!ids.length) return NextResponse.json({ error: 'No ids provided' }, { status: 400 });
  // Remember attached files first so they can be removed with the responses.
  const doomed = await prisma.submission.findMany({ where: { formId: params.id, id: { in: ids } }, select: { data: true } });
  const { count } = await prisma.submission.deleteMany({ where: { formId: params.id, id: { in: ids } } });
  const form = await prisma.form.findUnique({ where: { id: params.id }, select: { schema: true } });
  if (form) {
    const answers = doomed.map((d) => { try { return JSON.parse(d.data); } catch { return {}; } });
    await deleteAnswerFiles(params.id, parseSchema(form.schema).fields, answers).catch(() => {});
  }
  return NextResponse.json({ deleted: count });
}
