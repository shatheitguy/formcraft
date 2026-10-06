import { NextResponse } from 'next/server';
import { clearLoginFailures, createSession, loginBlocked, recordLoginFailure, verifyPassword } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const identifier = typeof body.identifier === 'string' ? body.identifier.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!identifier || !password) return NextResponse.json({ error: 'Enter your username and password.' }, { status: 400 });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
  const key = `${ip}:${identifier}`;
  if (loginBlocked(key)) {
    return NextResponse.json({ error: 'Too many failed attempts. Try again in 15 minutes.' }, { status: 429 });
  }

  const user = await prisma.user.findFirst({ where: { OR: [{ username: identifier }, { email: identifier }] } });
  const ok = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !ok) {
    recordLoginFailure(key);
    return NextResponse.json({ error: 'Incorrect username or password.' }, { status: 401 });
  }
  if (!user.active) return NextResponse.json({ error: 'This account has been disabled. Contact an administrator.' }, { status: 403 });

  clearLoginFailures(key);
  await createSession(user.id);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return NextResponse.json({ ok: true });
}
