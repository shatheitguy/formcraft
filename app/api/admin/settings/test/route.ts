import { NextResponse } from 'next/server';
import { forbidden, getCurrentUser, unauthorized } from '@/lib/auth';
import { sendTest } from '@/lib/notify';
import { isValidEmail } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** POST { channel: 'email' | 'telegram', target } — uses the saved configuration. */
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  if (me.role !== 'ADMIN') return forbidden();

  const { channel, target } = await req.json().catch(() => ({}));
  const to = typeof target === 'string' ? target.trim() : '';
  if (channel === 'email' && !isValidEmail(to)) return NextResponse.json({ error: 'Enter a valid email address to send the test to.' }, { status: 400 });
  if (channel === 'telegram' && !to) return NextResponse.json({ error: 'Enter a chat ID to send the test to.' }, { status: 400 });
  if (channel !== 'email' && channel !== 'telegram') return NextResponse.json({ error: 'Unknown channel' }, { status: 400 });

  const result = await sendTest(channel, to);
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: 502 });
}
