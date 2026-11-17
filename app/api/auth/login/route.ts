import { NextResponse } from 'next/server';
import { clearLoginFailures, createSession, loginBlocked, recordLoginFailure, verifyPassword } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { codeDestination, emailAvailable, hasTwoFactor, maskTarget, sendChallengeCode, startChallenge, type CodeChannel } from '@/lib/two-factor';

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
    const challenge = await startChallenge(user.id);
    // Message channels the user turned on. Email is offered only while the workspace can send it;
    // WhatsApp / Telegram stay listed so a broken channel shows a clear error instead of vanishing.
    const channels: CodeChannel[] = [];
    if (user.emailOtpEnabled && (await emailAvailable())) channels.push('email');
    for (const ch of ['whatsapp', 'telegram'] as const) {
      if (user[ch === 'whatsapp' ? 'whatsappOtpEnabled' : 'telegramOtpEnabled'] && (await codeDestination(user, ch))) channels.push(ch);
    }
    const sentTo: Partial<Record<CodeChannel, string>> = {};
    for (const ch of channels) sentTo[ch] = maskTarget(ch, await codeDestination(user, ch));
    const methods = [...(user.totpEnabled ? ['totp'] : []), ...channels, 'recovery'];
    // With a single code channel and no authenticator app, the code goes out straight away.
    let sent: CodeChannel | null = null;
    let sendError: string | null = null;
    if (!user.totpEnabled && channels.length === 1) {
      sendError = await sendChallengeCode(challenge, user, channels[0]);
      if (!sendError) sent = channels[0];
    }
    return NextResponse.json({
      twoFactor: {
        methods,
        sentTo,
        sent,
        sendError,
        // Kept for older clients.
        emailTo: sentTo.email ?? null,
        emailSent: sent === 'email',
        emailError: channels[0] === 'email' ? sendError : null,
      },
    });
  }

  await createSession(user.id);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return NextResponse.json({ ok: true });
}
