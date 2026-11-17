import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { getCurrentUser, unauthorized, verifyPassword } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import {
  checkOtp,
  codeDestination,
  emailAvailable,
  hasTwoFactor,
  hashRecoveryCodes,
  issueOtp,
  matchTotp,
  newRecoveryCodes,
  newTotpSecret,
  otpauthUri,
  recoveryCodesLeft,
  twoFactorRequired,
  workspaceChannels,
} from '@/lib/two-factor';

export const dynamic = 'force-dynamic';

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * Two-factor settings for the signed-in user. Body: { action, code?, password? }
 *   totp-setup → new secret + QR code (not active until totp-enable)
 *   totp-enable { code } · totp-disable { password }
 *   email-send → emails a confirmation code · email-enable { code } · email-disable { password }
 *   whatsapp-send · whatsapp-enable { code } · whatsapp-disable { password }  (code sent to the saved WhatsApp number)
 *   telegram-send · telegram-enable { code } · telegram-disable { password }  (code sent to the saved Telegram chat)
 *   recovery { password } → a fresh set of recovery codes
 * Enabling the first method also returns recovery codes, shown once.
 */
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
  const body = await req.json().catch(() => ({}));
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const needsPassword = ['totp-disable', 'email-disable', 'whatsapp-disable', 'telegram-disable', 'recovery'].includes(body.action);
  if (needsPassword && !(typeof body.password === 'string' && (await verifyPassword(body.password, user.passwordHash)))) {
    return bad('Your password is incorrect.');
  }

  /** Recovery codes come with the first method; returns them so they can be shown once. */
  const firstCodes = () => (hasTwoFactor(user) ? null : newRecoveryCodes());
  /** After turning `flag` off: keeps recovery codes only while another method is still on. */
  const keepCodes = (flag: 'totpEnabled' | 'emailOtpEnabled' | 'whatsappOtpEnabled' | 'telegramOtpEnabled') =>
    hasTwoFactor({ ...user, [flag]: false }) ? {} : { recoveryCodes: '[]' };

  // An admin may require two-factor sign-in: the last method can't be turned off then.
  const disabling = { 'totp-disable': 'totpEnabled', 'email-disable': 'emailOtpEnabled', 'whatsapp-disable': 'whatsappOtpEnabled', 'telegram-disable': 'telegramOtpEnabled' } as const;
  const flag = disabling[body.action as keyof typeof disabling];
  if (flag && !hasTwoFactor({ ...user, [flag]: false })) {
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
        data: { totpSecret: null, totpPendingSecret: null, totpEnabled: false, totpLastStep: null, ...keepCodes('totpEnabled') },
      });
      return NextResponse.json({ ok: true });
    }
    case 'email-send': {
      if (!(await emailAvailable())) return bad('Email is not set up on this workspace. Ask an admin.');
      const error = await issueOtp(user, 'email-setup');
      return error ? bad(error, 429) : NextResponse.json({ ok: true });
    }
    case 'email-enable': {
      const error = await checkOtp(user.id, 'email-setup', code);
      if (error) return bad(error);
      const codes = firstCodes();
      await prisma.user.update({ where: { id: user.id }, data: { emailOtpEnabled: true, ...(codes ? { recoveryCodes: hashRecoveryCodes(codes) } : {}) } });
      return NextResponse.json({ ok: true, recoveryCodes: codes });
    }
    case 'email-disable': {
      await prisma.user.update({ where: { id: user.id }, data: { emailOtpEnabled: false, ...keepCodes('emailOtpEnabled') } });
      return NextResponse.json({ ok: true });
    }
    case 'whatsapp-send':
    case 'telegram-send': {
      const channel = body.action === 'whatsapp-send' ? 'whatsapp' : 'telegram';
      const ch = await workspaceChannels();
      if (!ch[channel]) {
        return bad(channel === 'whatsapp' ? 'WhatsApp isn’t connected on this workspace. Ask an admin.' : 'Telegram isn’t set up on this workspace. Ask an admin.');
      }
      if (!(await codeDestination(user, channel))) {
        return bad(channel === 'whatsapp' ? 'Save your WhatsApp number in My profile → Notifications first.' : 'Save your Telegram chat ID in My profile → Notifications first.');
      }
      const error = await issueOtp(user, `${channel}-setup`);
      return error ? bad(error, error.startsWith('Please wait') ? 429 : 502) : NextResponse.json({ ok: true });
    }
    case 'whatsapp-enable':
    case 'telegram-enable': {
      const channel = body.action === 'whatsapp-enable' ? 'whatsapp' : 'telegram';
      const error = await checkOtp(user.id, `${channel}-setup`, code);
      if (error) return bad(error);
      const codes = firstCodes();
      await prisma.user.update({
        where: { id: user.id },
        data: { [channel === 'whatsapp' ? 'whatsappOtpEnabled' : 'telegramOtpEnabled']: true, ...(codes ? { recoveryCodes: hashRecoveryCodes(codes) } : {}) },
      });
      return NextResponse.json({ ok: true, recoveryCodes: codes });
    }
    case 'whatsapp-disable':
    case 'telegram-disable': {
      const f = body.action === 'whatsapp-disable' ? 'whatsappOtpEnabled' : 'telegramOtpEnabled';
      await prisma.user.update({ where: { id: user.id }, data: { [f]: false, ...keepCodes(f) } });
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
