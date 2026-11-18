import { NextResponse } from 'next/server';
import { getCurrentUser, unauthorized } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { sendTest } from '@/lib/notify';
import { getSettings } from '@/lib/settings';
import { waStatus } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

// A few test messages per person (the saved number / chat can be anyone's, so this can't become a spam relay).
const recent = new Map<string, number[]>();
function overLimit(key: string, max = 5, windowMs = 10 * 60_000) {
  const now = Date.now();
  const hits = (recent.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) return true;
  hits.push(now);
  recent.set(key, hits);
  return false;
}

/** Sends a test notification to the signed-in user's saved destination. */
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  const { channel } = await req.json().catch(() => ({}));
  const settings = await getSettings();
  const user = await prisma.user.findUnique({ where: { id: me.id } });
  if (!user) return unauthorized();
  if (overLimit(me.id)) return NextResponse.json({ error: 'Too many test messages — wait a few minutes and try again.' }, { status: 429 });

  if (channel === 'email') {
    if (!settings.smtp.enabled || !settings.smtp.host) {
      return NextResponse.json({ error: 'Email isn’t set up yet. Ask an admin to configure SMTP in Settings → Notification channel setup.' }, { status: 400 });
    }
    const r = await sendTest('email', user.notifyEmail || user.email);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 502 });
  }
  if (channel === 'telegram') {
    if (!settings.telegram.enabled || !settings.telegram.botToken) {
      return NextResponse.json({ error: 'Telegram isn’t set up yet. Ask an admin to add a bot token in Settings → Notification channel setup.' }, { status: 400 });
    }
    if (!user.telegramChatId) return NextResponse.json({ error: 'Save your Telegram chat ID first.' }, { status: 400 });
    const r = await sendTest('telegram', user.telegramChatId);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 502 });
  }
  if (channel === 'whatsapp') {
    if (!settings.whatsapp.enabled || waStatus().status !== 'on') {
      return NextResponse.json({ error: 'WhatsApp isn’t set up yet. Ask an admin to link it in Settings → Notification channel setup.' }, { status: 400 });
    }
    if (!user.whatsappNumber) return NextResponse.json({ error: 'Save your WhatsApp number first.' }, { status: 400 });
    const r = await sendTest('whatsapp', user.whatsappNumber);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 502 });
  }
  return NextResponse.json({ error: 'Unknown channel' }, { status: 400 });
}
