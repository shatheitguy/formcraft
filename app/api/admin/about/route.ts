import { NextResponse } from 'next/server';
import { forbidden, getCurrentUser, unauthorized } from '@/lib/auth';
import { checkForUpdate, CURRENT_VERSION, latestKnownVersion } from '@/lib/activity';
import { aboutInfo } from '@/lib/about';
import { prisma } from '@/lib/db';
import { installKind, readUpdateStatus, startNativeUpdate, updateLogTail } from '@/lib/self-update';

export const dynamic = 'force-dynamic';

async function admin() {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  if (me.role !== 'ADMIN') return forbidden();
  return null;
}


export async function GET(req: Request) {
  const denied = await admin();
  if (denied) return denied;
  const url = new URL(req.url);
  if (url.searchParams.get('log') === '1') return NextResponse.json({ status: readUpdateStatus(), log: updateLogTail(80) });
  return NextResponse.json(await aboutInfo(), { headers: { 'Cache-Control': 'no-store' } });
}

/** POST { action: 'check' | 'update' } */
export async function POST(req: Request) {
  const denied = await admin();
  if (denied) return denied;
  const { action } = await req.json().catch(() => ({}));
  if (action === 'check') {
    const latest = await checkForUpdate(true);
    if (!latest) return NextResponse.json({ error: 'Couldn’t reach GitHub to check for updates. Check the server’s internet connection.' }, { status: 502 });
    const now = new Date().toISOString();
    await prisma.appMeta.upsert({ where: { key: 'update.checkedAt' }, create: { key: 'update.checkedAt', value: now }, update: { value: now } });
    return NextResponse.json(await aboutInfo());
  }
  if (action === 'update') {
    if (installKind() === 'docker') {
      return NextResponse.json({ error: 'Docker installs update with Docker. Use the command shown on this page.' }, { status: 400 });
    }
    const r = startNativeUpdate(CURRENT_VERSION, await latestKnownVersion());
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true, status: readUpdateStatus() });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
