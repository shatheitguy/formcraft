import { NextResponse } from 'next/server';
import { getCurrentUser, unauthorized } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { sendTest } from '@/lib/notify';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

/** Sends a test notification to the signed-in user's saved destination. */
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  const { channel } = await req.json().catch(() => ({}));
  const settings = await getSettings();
  const user = await prisma.user.findUnique({ where: { id: me.id } });
  if (!user) return unauthorized();

  if (channel === 'email') {
    if (!settings.smtp.enabled || !settings.smtp.host) {
      return NextResponse.json({ error: 'Email isn’t set up yet. Ask an admin to configure SMTP in Settings → Notifications.' }, { status: 400 });
    }
    const r = await sendTest('email', user.notifyEmail || user.email);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 502 });
  }
  if (channel === 'telegram') {
    if (!settings.telegram.enabled || !settings.telegram.botToken) {
      return NextResponse.json({ error: 'Telegram isn’t set up yet. Ask an admin to add a bot token in Settings → Notifications.' }, { status: 400 });
    }
    if (!user.telegramChatId) return NextResponse.json({ error: 'Save your Telegram chat ID first.' }, { status: 400 });
    const r = await sendTest('telegram', user.telegramChatId);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 502 });
  }
  return NextResponse.json({ error: 'Unknown channel' }, { status: 400 });
}
