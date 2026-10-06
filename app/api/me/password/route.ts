import { NextResponse } from 'next/server';
import { currentSessionId, getCurrentUser, hashPassword, passwordProblem, unauthorized, verifyPassword } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  const { current, next } = await req.json().catch(() => ({}));

  const user = await prisma.user.findUnique({ where: { id: me.id } });
  if (!user || typeof current !== 'string' || !(await verifyPassword(current, user.passwordHash))) {
    return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400 });
  }
  const problem = passwordProblem(next);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  if (next === current) return NextResponse.json({ error: 'New password must be different.' }, { status: 400 });

  await prisma.user.update({ where: { id: me.id }, data: { passwordHash: await hashPassword(next) } });
  // Sign out every other device.
  const keep = currentSessionId();
  const { count } = await prisma.session.deleteMany({ where: { userId: me.id, id: keep ? { not: keep } : undefined } });
  return NextResponse.json({ ok: true, signedOut: count });
}
