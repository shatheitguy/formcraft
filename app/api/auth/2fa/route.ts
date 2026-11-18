import { NextResponse } from 'next/server';
import { createSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  CODE_CHANNELS,
  LOGIN_CODE_MINUTES,
  MAX_CHALLENGE_ATTEMPTS,
  codeMatches,
  consumeRecoveryCode,
  currentChallenge,
  endChallenge,
  hasMessageCodes,
  matchTotp,
  sendChallengeCode,
  type CodeChannel,
} from '@/lib/two-factor';

export const dynamic = 'force-dynamic';

const expired = () => NextResponse.json({ error: 'Your sign-in timed out. Enter your password again.', restart: true }, { status: 401 });
const isChannel = (v: unknown): v is CodeChannel => CODE_CHANNELS.includes(v as CodeChannel);

/**
 * Second step of sign-in.
 *   { action: 'send', channel: 'email' | 'whatsapp' | 'telegram' } sends a fresh code there (replacing any earlier one)
 *   { action: 'verify', method: 'totp' | 'message' | 'recovery', code } finishes.
 */
export async function POST(req: Request) {
  const challenge = await currentChallenge();
  if (!challenge) return expired();
  const { user } = challenge;
  const body = await req.json().catch(() => ({}));

  if (body.action === 'send') {
    if (!hasMessageCodes(user)) return NextResponse.json({ error: 'Codes by message aren’t turned on for this account.' }, { status: 400 });
    const channel = body.channel === undefined ? 'email' : body.channel;
    if (!isChannel(channel)) return NextResponse.json({ error: 'Choose where to send the code.' }, { status: 400 });
    const r = await sendChallengeCode(challenge, user, channel);
    if (r.restart) await endChallenge(challenge.id);
    if (r.error) return NextResponse.json({ error: r.error, restart: r.restart, wait: r.wait }, { status: r.status ?? 502 });
    return NextResponse.json({ ok: true, sent: r.sent[0], expiresIn: LOGIN_CODE_MINUTES * 60 });
  }

  const code = typeof body.code === 'string' ? body.code.trim() : '';
  // 'email' | 'whatsapp' | 'telegram' are accepted from older clients as 'message'.
  const method = isChannel(body.method) ? 'message' : body.method;
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
  } else if (method === 'message' && hasMessageCodes(user)) {
    // Only the newest code works, whichever destination it went to.
    if (!challenge.emailCodeHash) return NextResponse.json({ error: 'Send a code first, then enter it here.' }, { status: 400 });
    const fresh = challenge.emailSentAt && Date.now() - challenge.emailSentAt.getTime() < LOGIN_CODE_MINUTES * 60_000;
    if (!fresh) return NextResponse.json({ error: 'That code has expired. Send a new one.', expired: true }, { status: 400 });
    ok = codeMatches(user.id, code, challenge.emailCodeHash);
  } else if (method === 'recovery') {
    const left = consumeRecoveryCode(user.recoveryCodes, code);
    if (left) {
      ok = true;
      await prisma.user.update({ where: { id: user.id }, data: { recoveryCodes: left } });
    }
  }

  if (!ok) {
    const updated = await prisma.loginChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
    const attemptsLeft = Math.max(0, MAX_CHALLENGE_ATTEMPTS - updated.attempts);
    if (attemptsLeft === 0) {
      await endChallenge(challenge.id);
      return NextResponse.json({ error: 'Too many wrong codes. Sign in again.', restart: true }, { status: 429 });
    }
    return NextResponse.json({ error: 'That code is not right. Check it and try again.', attemptsLeft }, { status: 401 });
  }

  await endChallenge(challenge.id);
  await createSession(user.id);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return NextResponse.json({ ok: true, usedRecovery: method === 'recovery' });
}
