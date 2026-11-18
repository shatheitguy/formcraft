import { NextResponse } from 'next/server';
import { loginBlocked, recordLoginFailure } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { CODE_CHANNELS, RESEND_SECONDS, RESET_CODE_MINUTES, issueResetCode, workspaceChannels, type CodeChannel } from '@/lib/two-factor';

export const dynamic = 'force-dynamic';

/** Every answer takes at least this long, so timing doesn't show whether a code was sent. */
const MIN_RESPONSE_MS = 700;
const GENERIC = 'If an account with that name has this channel set up, a code is on its way. It expires in 3 minutes.';

/**
 * Sends a password reset code by email, WhatsApp or Telegram. Body: { identifier, channel }.
 * Answers the same whether or not the account exists or has that channel.
 */
export async function POST(req: Request) {
  const started = Date.now();
  const body = await req.json().catch(() => ({}));
  const identifier = typeof body.identifier === 'string' ? body.identifier.trim().toLowerCase() : '';
  const channel: CodeChannel = body.channel === undefined ? 'email' : body.channel;
  if (!identifier) return NextResponse.json({ error: 'Enter your username or email.' }, { status: 400 });
  // Only what the workspace offers — never anything about the account.
  const workspace = await workspaceChannels();
  if (!CODE_CHANNELS.includes(channel) || !workspace[channel]) {
    return NextResponse.json({ error: 'That way of sending codes isn’t set up on this workspace. Choose another.' }, { status: 400 });
  }

  // Per-IP and per-account limits (the same throttle as failed sign-ins), so this can't be used to spam anyone.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
  const ipKey = `reset:${ip}`;
  const accountKey = `reset-account:${identifier}`;
  if (loginBlocked(ipKey) || loginBlocked(accountKey)) return NextResponse.json({ error: 'Too many requests. Try again in 15 minutes.' }, { status: 429 });
  recordLoginFailure(ipKey);
  recordLoginFailure(accountKey);

  const user = await prisma.user.findFirst({ where: { OR: [{ username: identifier }, { email: identifier }], active: true } });
  await issueResetCode(user, channel);

  const left = MIN_RESPONSE_MS - (Date.now() - started);
  if (left > 0) await new Promise((r) => setTimeout(r, left));
  return NextResponse.json({ ok: true, message: GENERIC, expiresIn: RESET_CODE_MINUTES * 60, resendSeconds: RESEND_SECONDS });
}
