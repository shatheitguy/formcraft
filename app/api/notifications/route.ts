import { NextResponse } from 'next/server';
import { CURRENT_VERSION, latestKnownVersion, listNotifications, newerVersion } from '@/lib/activity';
import { getCurrentUser, unauthorized } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** The signed-in user's notifications, unread count and (for admins) whether an update is out. */
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  const list = await listNotifications(me.id);
  let update: { current: string; latest: string } | null = null;
  if (me.role === 'ADMIN') {
    const latest = await latestKnownVersion();
    if (latest && newerVersion(latest, CURRENT_VERSION)) update = { current: CURRENT_VERSION, latest };
  }
  return NextResponse.json({ ...list, update, version: CURRENT_VERSION });
}

/** { action: 'read', ids } · { action: 'read-all' } · { action: 'clear' } (deletes read ones) */
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const now = new Date();
  if (body.action === 'read' && Array.isArray(body.ids)) {
    const ids = body.ids.filter((x: unknown): x is string => typeof x === 'string').slice(0, 100);
    await prisma.notification.updateMany({ where: { userId: me.id, id: { in: ids }, readAt: null }, data: { readAt: now } });
  } else if (body.action === 'read-all') {
    await prisma.notification.updateMany({ where: { userId: me.id, readAt: null }, data: { readAt: now } });
  } else if (body.action === 'clear') {
    await prisma.notification.deleteMany({ where: { userId: me.id, readAt: { not: null } } });
  } else {
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
