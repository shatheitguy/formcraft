import { NextResponse } from 'next/server';
import { canViewForm, forbidden, getCurrentUser, unauthorized } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { probePort, suggestFreePort } from '@/lib/port-router';

export const dynamic = 'force-dynamic';

/**
 * GET ?port=4010   → diagnostics for that port (pool, other forms, free on server, HTTP response)
 * GET ?suggest=1   → { suggestion } the next port that is free everywhere
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  if (!canViewForm(me, params.id)) return forbidden();
  if (!(await prisma.form.findUnique({ where: { id: params.id }, select: { id: true } }))) {
    return NextResponse.json({ error: 'Form not found' }, { status: 404 });
  }

  const url = new URL(req.url);
  if (url.searchParams.get('suggest')) return NextResponse.json({ suggestion: await suggestFreePort() });

  const port = Number(url.searchParams.get('port'));
  if (!Number.isInteger(port) || port < 1 || port > 65535) return NextResponse.json({ error: 'Enter a port between 1 and 65535.' }, { status: 400 });
  return NextResponse.json(await probePort(port, params.id));
}
