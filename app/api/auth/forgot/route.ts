import { NextResponse } from 'next/server';
import { loginBlocked, recordLoginFailure } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { emailAvailable, issueOtp } from '@/lib/two-factor';

export const dynamic = 'force-dynamic';

/** Emails a password reset code. Answers the same whether or not the account exists. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const identifier = typeof body.identifier === 'string' ? body.identifier.trim().toLowerCase() : '';
  if (!identifier) return NextResponse.json({ error: 'Enter your username or email.' }, { status: 400 });
  if (!(await emailAvailable())) {
    return NextResponse.json({ error: 'Password reset by email isn’t set up on this workspace. Ask an admin to reset your password.' }, { status: 400 });
  }

  // Counts against the same throttle as failed sign-ins, so it can't be used to spam inboxes.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
  const key = `reset:${ip}`;
  if (loginBlocked(key)) return NextResponse.json({ error: 'Too many requests. Try again in 15 minutes.' }, { status: 429 });
  recordLoginFailure(key);

  const user = await prisma.user.findFirst({ where: { OR: [{ username: identifier }, { email: identifier }], active: true } });
  if (user) {
    const error = await issueOtp(user, 'reset');
    if (error) console.warn(`[formcraft] password reset email for ${user.username}: ${error}`);
  }
  return NextResponse.json({ ok: true });
}
