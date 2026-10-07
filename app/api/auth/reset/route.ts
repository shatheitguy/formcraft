import { NextResponse } from 'next/server';
import { hashPassword, loginBlocked, passwordProblem, recordLoginFailure } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { checkOtp } from '@/lib/two-factor';

export const dynamic = 'force-dynamic';

/** Sets a new password with an emailed reset code. Two-factor stays on: it is still asked at sign-in. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const identifier = typeof body.identifier === 'string' ? body.identifier.trim().toLowerCase() : '';
  const code = typeof body.code === 'string' ? body.code : '';
  const problem = passwordProblem(body.password);
  if (!identifier || !code) return NextResponse.json({ error: 'Enter the code from the email.' }, { status: 400 });
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
  const key = `reset-code:${ip}`;
  if (loginBlocked(key)) return NextResponse.json({ error: 'Too many requests. Try again in 15 minutes.' }, { status: 429 });

  const user = await prisma.user.findFirst({ where: { OR: [{ username: identifier }, { email: identifier }], active: true } });
  const error = user ? await checkOtp(user.id, 'reset', code) : 'That code is not right. Check it and try again.';
  if (error || !user) {
    recordLoginFailure(key);
    return NextResponse.json({ error }, { status: 400 });
  }

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(body.password) } });
  // A reset signs the account out everywhere.
  await prisma.session.deleteMany({ where: { userId: user.id } });
  await prisma.loginChallenge.deleteMany({ where: { userId: user.id } });
  return NextResponse.json({ ok: true });
}
