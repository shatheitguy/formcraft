import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { getCurrentUser, unauthorized, verifyPassword } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import {
  MESSAGE_CODES_OFF,
  NO_DESTINATION,
  OTP_FLAG,
  checkOtp,
  codeDestinations,
  hasTwoFactor,
  hashRecoveryCodes,
  issueMessageSetupCode,
  matchTotp,
  newRecoveryCodes,
  newTotpSecret,
  otpauthUri,
  recoveryCodesLeft,
  twoFactorRequired,
  twoFactorStatus,
} from '@/lib/two-factor';

export const dynamic = 'force-dynamic';

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** Two-factor status for the signed-in user (what the profile card shows). */
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
  return NextResponse.json(await twoFactorStatus(user));
}

/**
 * Two-factor settings for the signed-in user. Body: { action, code?, password? }
 *   totp-setup → new secret + QR code (not active until totp-enable)
 *   totp-enable { code } · totp-disable { password }
 *   message-send → one setup code to every available destination (email, WhatsApp, Telegram) at once
 *   message-enable { code } · message-disable { password }
 *   recovery { password } → a fresh set of recovery codes
 * Enabling the first method also returns recovery codes, shown once.
 */
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
  const body = await req.json().catch(() => ({}));
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const needsPassword = ['totp-disable', 'message-disable', 'recovery'].includes(body.action);
  if (needsPassword && !(typeof body.password === 'string' && (await verifyPassword(body.password, user.passwordHash)))) {
    return bad('Your password is incorrect.');
  }

  /** Recovery codes come with the first method; returns them so they can be shown once. */
  const firstCodes = () => (hasTwoFactor(user) ? null : newRecoveryCodes());
  /** What turning a method off leaves on. */
  const after = { 'totp-disable': { ...user, totpEnabled: false }, 'message-disable': { ...user, ...MESSAGE_CODES_OFF } }[body.action as string];
  /** Keeps recovery codes only while another method is still on. */
  const keepCodes = () => (after && hasTwoFactor(after) ? {} : { recoveryCodes: '[]' });

  // An admin may require two-factor sign-in: the last method can't be turned off then.
  if (after && !hasTwoFactor(after)) {
    const { security } = await getSettings();
    if (twoFactorRequired(user, security.require2fa)) {
      return bad('Your admin requires two-factor sign-in. Turn on another method before turning this one off.');
    }
  }

  switch (body.action) {
    case 'totp-setup': {
      // Reuse an unfinished setup's secret so a reopened dialog shows the same QR code.
      const secret = user.totpPendingSecret ?? newTotpSecret();
      if (!user.totpPendingSecret) await prisma.user.update({ where: { id: user.id }, data: { totpPendingSecret: secret } });
      const { app } = await getSettings();
      const uri = otpauthUri(app.name || 'FormCraft', user.email || user.username, secret);
      const qr = await QRCode.toDataURL(uri, { margin: 1, width: 220, errorCorrectionLevel: 'M' });
      return NextResponse.json({ secret, uri, qr });
    }
    case 'totp-enable': {
      if (!user.totpPendingSecret) return bad('Start the setup again.');
      const step = matchTotp(user.totpPendingSecret, code);
      if (step == null) return bad('That code is not right. Check the time on your phone and try again.');
      const codes = firstCodes();
      await prisma.user.update({
        where: { id: user.id },
        data: { totpSecret: user.totpPendingSecret, totpPendingSecret: null, totpEnabled: true, totpLastStep: step, ...(codes ? { recoveryCodes: hashRecoveryCodes(codes) } : {}) },
      });
      return NextResponse.json({ ok: true, recoveryCodes: codes });
    }
    case 'totp-disable': {
      await prisma.user.update({
        where: { id: user.id },
        data: { totpSecret: null, totpPendingSecret: null, totpEnabled: false, totpLastStep: null, ...keepCodes() },
      });
      return NextResponse.json({ ok: true });
    }
    case 'message-send': {
      const r = await issueMessageSetupCode(user);
      if (r.error) return bad(r.error, r.status ?? 502);
      return NextResponse.json({ ok: true, sent: r.sent });
    }
    case 'message-enable': {
      const error = await checkOtp(user.id, 'message-setup', code);
      if (error) return bad(error);
      // The flags record where codes could go when it was turned on; any flag on means "on".
      // Each sign-in uses whatever destinations work at that moment.
      const available = (await codeDestinations(user)).filter((d) => d.available);
      if (!available.length) return bad(NO_DESTINATION);
      const codes = firstCodes();
      await prisma.user.update({
        where: { id: user.id },
        data: {
          ...MESSAGE_CODES_OFF,
          ...Object.fromEntries(available.map((d) => [OTP_FLAG[d.channel], true])),
          ...(codes ? { recoveryCodes: hashRecoveryCodes(codes) } : {}),
        },
      });
      return NextResponse.json({ ok: true, recoveryCodes: codes });
    }
    case 'message-disable': {
      await prisma.user.update({ where: { id: user.id }, data: { ...MESSAGE_CODES_OFF, ...keepCodes() } });
      return NextResponse.json({ ok: true });
    }
    case 'recovery': {
      if (!hasTwoFactor(user)) return bad('Turn on two-factor sign-in first.');
      const codes = newRecoveryCodes();
      await prisma.user.update({ where: { id: user.id }, data: { recoveryCodes: hashRecoveryCodes(codes) } });
      return NextResponse.json({ ok: true, recoveryCodes: codes, left: recoveryCodesLeft(hashRecoveryCodes(codes)) });
    }
    default:
      return bad('Unknown action.');
  }
}
