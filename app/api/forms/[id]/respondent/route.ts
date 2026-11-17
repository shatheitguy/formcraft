import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { parseSchema } from '@/lib/forms';
import { countPrevious, newRespondentId, perPersonLimit, rememberRespondent, respondentIds } from '@/lib/respondent';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

/**
 * Public: may this browser still respond? Called when the form opens, so someone who already
 * responded sees the message before filling it in. Also gives the browser its anonymous id.
 * { limited, allowed, remaining, respondentId }
 */
export async function GET(req: Request, { params }: Ctx) {
  const form = await prisma.form.findUnique({ where: { id: params.id }, select: { id: true, schema: true, status: true } });
  if (!form || form.status !== 'ACTIVE') return NextResponse.json({ error: 'Form not found' }, { status: 404 });
  const settings = parseSchema(form.schema).settings;
  const limit = perPersonLimit(settings);
  const { fromCookie, fromClient } = respondentIds(req);
  const respondentId = fromCookie ?? fromClient ?? newRespondentId();
  const used = limit ? await countPrevious(form.id, req, settings) : 0;
  const res = NextResponse.json(
    { limited: !!limit, allowed: !limit || used < limit, remaining: limit ? Math.max(0, limit - used) : null, respondentId },
    { headers: { 'Cache-Control': 'no-store' } },
  );
  if (!fromCookie) rememberRespondent(res, respondentId, (req.headers.get('x-forwarded-proto') ?? new URL(req.url).protocol.replace(':', '')) === 'https');
  return res;
}
