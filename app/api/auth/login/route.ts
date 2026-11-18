import { NextResponse } from 'next/server';
import { clearLoginFailures, createSession, loginBlocked, recordLoginFailure, verifyPassword } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { LOGIN_CODE_MINUTES, RESEND_SECONDS, codeDestinations, hasMessageCodes, hasTwoFactor, maskDestinations, startChallenge } from '@/lib/two-factor';

export const dynamic = 'force-dynamic';

// A valid scrypt hash of a random password, used for timing only.
const DUMMY_HASH = 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64');

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
  // Unknown accounts still pay for a password hash, so response time doesn't reveal which accounts exist.
  const ok = user ? await verifyPassword(password, user.passwordHash) : (await verifyPassword(password, DUMMY_HASH), false);
  if (!user || !ok) {
    recordLoginFailure(key);
    return NextResponse.json({ error: 'Incorrect username or password.' }, { status: 401 });
  }
  if (!user.active) return NextResponse.json({ error: 'This account has been disabled. Contact an administrator.' }, { status: 403 });

  clearLoginFailures(key);

  // Two-factor: the password alone doesn't sign in. Start a challenge and ask for a code.
  if (hasTwoFactor(user)) {
    await startChallenge(user.id);
    // Codes by message can go to any destination that works right now; the sign-in screen
    // lets the user pick one (email first) and sends the code from there.
    const destinations = hasMessageCodes(user)
      ? maskDestinations(await codeDestinations(user))
          .filter((d) => d.available)
          .map(({ channel, to }) => ({ channel, to }))
      : [];
    const methods = [...(user.totpEnabled ? ['totp'] : []), ...(hasMessageCodes(user) ? ['message'] : []), 'recovery'];
    return NextResponse.json({ twoFactor: { methods, destinations, codeMinutes: LOGIN_CODE_MINUTES, resendSeconds: RESEND_SECONDS } });
  }

  await createSession(user.id);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return NextResponse.json({ ok: true });
}
