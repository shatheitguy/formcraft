import { NextResponse } from 'next/server';
import { createSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  CODE_MINUTES,
  MAX_CHALLENGE_ATTEMPTS,
  OTP_FLAG,
  codeMatches,
  consumeRecoveryCode,
  currentChallenge,
  emailAvailable,
  endChallenge,
  isCodeChannel,
  matchTotp,
  sendChallengeCode,
} from '@/lib/two-factor';

export const dynamic = 'force-dynamic';

const expired = () => NextResponse.json({ error: 'Your sign-in timed out. Enter your password again.', restart: true }, { status: 401 });

/**
 * Second step of sign-in.
 *   { action: 'send', channel: 'email' | 'whatsapp' | 'telegram' } sends a code (email when channel is omitted)
 *   { action: 'verify', method: 'totp' | 'email' | 'whatsapp' | 'telegram' | 'recovery', code } finishes.
 */
export async function POST(req: Request) {
  const challenge = await currentChallenge();
  if (!challenge) return expired();
  const { user } = challenge;
  const body = await req.json().catch(() => ({}));

  if (body.action === 'send') {
    const channel = body.channel === undefined ? 'email' : body.channel;
    if (!isCodeChannel(channel) || !user[OTP_FLAG[channel]]) return NextResponse.json({ error: 'That method isn’t turned on for this account.' }, { status: 400 });
    if (channel === 'email' && !(await emailAvailable())) return NextResponse.json({ error: 'Email codes are not available for this account.' }, { status: 400 });
    const error = await sendChallengeCode(challenge, user, channel);
    if (!error) return NextResponse.json({ ok: true });
    return NextResponse.json({ error }, { status: error.startsWith('Please wait') ? 429 : 502 });
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
  } else if (isCodeChannel(method) && user[OTP_FLAG[method]] && challenge.emailCodeHash && (challenge.codeChannel ?? 'email') === method) {
    // The stored code only counts for the channel it was sent through.
    const fresh = challenge.emailSentAt && Date.now() - challenge.emailSentAt.getTime() < CODE_MINUTES * 60_000;
    if (!fresh) return NextResponse.json({ error: 'That code has expired. Ask for a new one.' }, { status: 400 });
    ok = codeMatches(user.id, code, challenge.emailCodeHash);
  } else if (isCodeChannel(method) && user[OTP_FLAG[method]]) {
    // No code has been sent through this channel yet (or a newer one went elsewhere).
    return NextResponse.json({ error: 'Tap “Send code” first, then enter the newest code you received.' }, { status: 400 });
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
