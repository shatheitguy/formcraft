import { NextResponse } from 'next/server';
import { getCurrentUser, unauthorized } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { uniquenessProblem, validateUserInput } from '@/lib/users';
import { isLocale, isThemePref } from '@/lib/i18n';
import { safeImageUrl } from '@/lib/uploads';
import { isValidEmail } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** Update own profile + notification preferences. Role/scope can't be changed here. */
export async function PATCH(req: Request) {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  const body = await req.json().catch(() => ({}));

  const { data, error } = validateUserInput(
    { username: body.username, email: body.email, name: body.name },
    { partial: true },
  );
  if (error) return NextResponse.json({ error }, { status: 400 });
  const clash = await uniquenessProblem(data.username, data.email, me.id);
  if (clash) return NextResponse.json({ error: clash }, { status: 409 });

  const update: Record<string, unknown> = { ...data };
  if (body.language !== undefined) {
    if (body.language !== null && !isLocale(body.language)) return NextResponse.json({ error: 'Unsupported language.' }, { status: 400 });
    update.language = body.language;
  }
  if (body.theme !== undefined) {
    if (!isThemePref(body.theme)) return NextResponse.json({ error: 'Invalid theme.' }, { status: 400 });
    update.theme = body.theme;
  }
  if (body.avatarUrl !== undefined) {
    const url = safeImageUrl(body.avatarUrl);
    if (body.avatarUrl && !url) return NextResponse.json({ error: 'Invalid profile photo.' }, { status: 400 });
    update.avatarUrl = url || null;
  }
  if (body.notifyEmail !== undefined) {
    const e = String(body.notifyEmail ?? '').trim().toLowerCase();
    if (e && !isValidEmail(e)) return NextResponse.json({ error: 'Enter a valid notification email.' }, { status: 400 });
    update.notifyEmail = e || null;
  }
  if (body.telegramChatId !== undefined) {
    const c = String(body.telegramChatId ?? '').trim();
    if (c && !/^(-?\d{3,20}|@[A-Za-z0-9_]{4,64})$/.test(c)) {
      return NextResponse.json({ error: 'Telegram chat ID should be a number (e.g. 123456789) or @channelname.' }, { status: 400 });
    }
    update.telegramChatId = c || null;
  }
  for (const k of ['emailNotifications', 'telegramNotifications', 'notifyAllForms'] as const) {
    if (body[k] !== undefined) update[k] = !!body[k];
  }
  if (body.notifyFormIds !== undefined) {
    const ids: string[] = Array.isArray(body.notifyFormIds) ? body.notifyFormIds.filter((x: unknown) => typeof x === 'string') : [];
    update.notifyFormIds = JSON.stringify(ids);
  }

  await prisma.user.update({ where: { id: me.id }, data: update });
  return NextResponse.json({ ok: true });
}
