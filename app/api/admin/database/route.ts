import { NextResponse } from 'next/server';
import { forbidden, getCurrentUser, unauthorized } from '@/lib/auth';
import { databaseInfo, dbProvider } from '@/lib/database';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

async function admin() {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  if (me.role !== 'ADMIN') return forbidden();
  return null;
}

/** Connection test + statistics. */
export async function GET() {
  const denied = await admin();
  if (denied) return denied;
  return NextResponse.json(await databaseInfo());
}

/**
 * Maintenance actions:
 *   { action: 'purge', days }   delete submissions older than N days (optionally { dryRun: true })
 *   { action: 'optimize' }      VACUUM / ANALYZE
 *   { action: 'sessions' }      remove expired sessions
 *   { action: 'logs' }          clear the notification delivery log
 */
export async function POST(req: Request) {
  const denied = await admin();
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));

  switch (body.action) {
    case 'purge': {
      const days = Number(body.days);
      if (!Number.isInteger(days) || days < 1) return NextResponse.json({ error: 'Days must be a whole number ≥ 1.' }, { status: 400 });
      const where = { createdAt: { lt: new Date(Date.now() - days * 86_400_000) } };
      if (body.dryRun) return NextResponse.json({ count: await prisma.submission.count({ where }) });
      const { count } = await prisma.submission.deleteMany({ where });
      return NextResponse.json({ count });
    }
    case 'optimize': {
      const started = Date.now();
      if (dbProvider() === 'sqlite') await prisma.$executeRawUnsafe('VACUUM');
      else await prisma.$executeRawUnsafe('VACUUM ANALYZE');
      return NextResponse.json({ ms: Date.now() - started });
    }
    case 'sessions': {
      const { count } = await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
      return NextResponse.json({ count });
    }
    case 'logs': {
      const { count } = await prisma.notificationLog.deleteMany({});
      return NextResponse.json({ count });
    }
    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }
}
