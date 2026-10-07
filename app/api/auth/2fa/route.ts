import { NextResponse } from 'next/server';
import { createSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  MAX_CHALLENGE_ATTEMPTS,
  codeMatches,
  consumeRecoveryCode,
  currentChallenge,
  emailAvailable,
  endChallenge,
  matchTotp,
  sendChallengeEmail,
} from '@/lib/two-factor';

export const dynamic = 'force-dynamic';

const expired = () => NextResponse.json({ error: 'Your sign-in timed out. Enter your password again.', restart: true }, { status: 401 });

/** Second step of sign-in: { action: 'send' } emails a code; { action: 'verify', method, code } finishes. */
export async function POST(req: Request) {
  const challenge = await currentChallenge();
  if (!challenge) return expired();
  const { user } = challenge;
  const body = await req.json().catch(() => ({}));

  if (body.action === 'send') {
    if (!user.emailOtpEnabled || !(await emailAvailable())) return NextResponse.json({ error: 'Email codes are not available for this account.' }, { status: 400 });
    const error = await sendChallengeEmail(challenge, user.email);
    return error ? NextResponse.json({ error }, { status: 429 }) : NextResponse.json({ ok: true });
  }

  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const method = body.method;
  if (!code) return NextResponse.json({ error: 'Enter the code.' }, { status: 400 });
  if (challenge.attempts >= MAX_CHALLENGE_ATTEMPTS) {
    await endChallenge(challenge.id);
    return NextResponse.json({ error: 'Too many wrong codes. Sign in again.', restart: true }, { status: 429 });
  }

  let ok = false;
  if (method === 'totp' && user.totpEnabled && user.totpSecret) {
    const step = matchTotp(user.totpSecret, code, user.totpLastStep);
    if (step != null) {
      ok = true;
      await prisma.user.update({ where: { id: user.id }, data: { totpLastStep: step } });
    }
  } else if (method === 'email' && user.emailOtpEnabled && challenge.emailCodeHash) {
    const fresh = challenge.emailSentAt && Date.now() - challenge.emailSentAt.getTime() < 10 * 60_000;
    if (!fresh) return NextResponse.json({ error: 'That code has expired. Ask for a new one.' }, { status: 400 });
    ok = codeMatches(user.id, code, challenge.emailCodeHash);
  } else if (method === 'recovery') {
    const left = consumeRecoveryCode(user.recoveryCodes, code);
    if (left) {
      ok = true;
      await prisma.user.update({ where: { id: user.id }, data: { recoveryCodes: left } });
    }
  }

  if (!ok) {
    await prisma.loginChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
    return NextResponse.json({ error: 'That code is not right. Check it and try again.' }, { status: 401 });
  }

  await endChallenge(challenge.id);
  await createSession(user.id);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return NextResponse.json({ ok: true, usedRecovery: method === 'recovery' });
}
