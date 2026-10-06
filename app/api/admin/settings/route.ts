import { NextResponse } from 'next/server';
import { forbidden, getCurrentUser, unauthorized } from '@/lib/auth';
import { getSettings, redactSettings, saveSettings, type AllSettings } from '@/lib/settings';
import { ACCENT_KEYS, type AccentKey } from '@/lib/theme';
import { isLocale } from '@/lib/i18n';
import { safeImageUrl } from '@/lib/uploads';

export const dynamic = 'force-dynamic';

async function admin() {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  if (me.role !== 'ADMIN') return forbidden();
  return null;
}

export async function GET() {
  const denied = await admin();
  if (denied) return denied;
  return NextResponse.json(redactSettings(await getSettings()));
}

const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** PUT { section: 'app' | 'smtp' | 'telegram', value } */
export async function PUT(req: Request) {
  const denied = await admin();
  if (denied) return denied;
  const { section, value } = await req.json().catch(() => ({}));
  if (!value || typeof value !== 'object') return NextResponse.json({ error: 'Invalid settings' }, { status: 400 });
  const current = await getSettings();

  if (section === 'app') {
    const publicUrl = str(value.publicUrl).replace(/\/+$/, '');
    if (publicUrl && !/^https?:\/\/[^\s]+$/.test(publicUrl)) {
      return NextResponse.json({ error: 'Public URL must start with http:// or https://' }, { status: 400 });
    }
    const logoUrl = safeImageUrl(value.logoUrl);
    if (str(value.logoUrl) && !logoUrl) return NextResponse.json({ error: 'Logo must be an uploaded image or an http(s) URL.' }, { status: 400 });
    const next: AllSettings['app'] = {
      name: str(value.name, 40) || 'FormCraft',
      tagline: str(value.tagline, 120),
      accent: (ACCENT_KEYS.includes(value.accent) ? value.accent : 'indigo') as AccentKey,
      logoUrl,
      publicUrl,
      footerText: str(value.footerText, 120),
      footerUrl: /^https?:\/\/[^\s"'<>]+$/.test(str(value.footerUrl, 300)) ? str(value.footerUrl, 300) : '',
      defaultLanguage: isLocale(value.defaultLanguage) ? value.defaultLanguage : 'en',
    };
    await saveSettings('app', next);
  } else if (section === 'smtp') {
    const port = Number(value.port);
    const next: AllSettings['smtp'] = {
      enabled: !!value.enabled,
      host: str(value.host),
      port: Number.isInteger(port) && port > 0 && port < 65536 ? port : 587,
      secure: !!value.secure,
      user: str(value.user),
      // Blank keeps the stored password; `clearPass` removes it.
      pass: value.clearPass ? '' : typeof value.pass === 'string' && value.pass ? value.pass : current.smtp.pass,
      from: str(value.from),
    };
    if (next.enabled && !next.host) return NextResponse.json({ error: 'SMTP host is required to enable email.' }, { status: 400 });
    await saveSettings('smtp', next);
  } else if (section === 'telegram') {
    const token = typeof value.botToken === 'string' && value.botToken.trim() ? value.botToken.trim() : current.telegram.botToken;
    if (token && !/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) {
      return NextResponse.json({ error: 'That doesn’t look like a bot token (expected 123456:ABC…).' }, { status: 400 });
    }
    const next: AllSettings['telegram'] = { enabled: !!value.enabled, botToken: value.clearToken ? '' : token };
    if (next.enabled && !next.botToken) return NextResponse.json({ error: 'A bot token is required to enable Telegram.' }, { status: 400 });
    await saveSettings('telegram', next);
  } else {
    return NextResponse.json({ error: 'Unknown section' }, { status: 400 });
  }

  return NextResponse.json(redactSettings(await getSettings()));
}
