import crypto from 'node:crypto';
import type { User } from '@prisma/client';
import { cookies, headers } from 'next/headers';
import { prisma } from './db';
import { sendCodeEmail, sendCodeMessage } from './notify';
import { getSettings, type TwoFactorPolicy } from './settings';
import { safeJson } from './utils';
import { waNumber, waStatus } from './whatsapp';

/* ------------------------------ TOTP (RFC 6238) ------------------------------ */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP = 30;

function base32Encode(buf: Buffer) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(s: string) {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const newTotpSecret = () => base32Encode(crypto.randomBytes(20));

function hotp(secret: string, counter: number) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const offset = mac[mac.length - 1] & 15;
  const bin = ((mac[offset] & 127) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(bin % 1_000_000).padStart(6, '0');
}

/** Returns the matched time step (accepting ±1 step of clock drift), or null. */
export function matchTotp(secret: string, code: string, notAfterStep?: number | null) {
  const c = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return null;
  const now = Math.floor(Date.now() / 1000 / STEP);
  for (const step of [now, now - 1, now + 1]) {
    if (notAfterStep != null && step <= notAfterStep) continue; // already used
    if (safeEqual(hotp(secret, step), c)) return step;
  }
  return null;
}

export function otpauthUri(issuer: string, account: string, secret: string) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP}`;
}

/* ------------------------------ codes ------------------------------ */

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const safeEqual = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Lifetime of password-reset and setup codes. */
export const CODE_MINUTES = 10;
/** Lifetime of a sign-in code sent by email / WhatsApp / Telegram. */
export const LOGIN_CODE_MINUTES = 3;
export const MAX_CODE_ATTEMPTS = 5;
/** Minimum gap between two codes for the same purpose / sign-in. */
export const RESEND_SECONDS = 60;
/** Most codes one sign-in attempt can ask for; after that the password has to be entered again. */
export const MAX_CHALLENGE_SENDS = 5;

export const newEmailCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
export const hashCode = (userId: string, code: string) => sha256(`${userId}:${code.replace(/\s/g, '')}`);
export const codeMatches = (userId: string, code: string, hash: string) => safeEqual(hashCode(userId, code), hash);

/** Ten single-use codes like "K7PQ-2M9X" for when the authenticator is lost. */
export function newRecoveryCodes() {
  return Array.from({ length: 10 }, () => {
    const raw = base32Encode(crypto.randomBytes(5)).slice(0, 8);
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  });
}
const normRecovery = (code: string) => code.toUpperCase().replace(/[^A-Z2-7]/g, '');
export const hashRecoveryCodes = (codes: string[]) => JSON.stringify(codes.map((c) => sha256(normRecovery(c))));

/** Consumes a recovery code; returns the updated hash list, or null if it doesn't match. */
export function consumeRecoveryCode(stored: string, code: string) {
  const hashes = safeJson<string[]>(stored, []);
  const h = sha256(normRecovery(code));
  const i = hashes.findIndex((x) => safeEqual(x, h));
  if (i < 0) return null;
  hashes.splice(i, 1);
  return JSON.stringify(hashes);
}
export const recoveryCodesLeft = (stored: string) => safeJson<string[]>(stored, []).length;

/* ------------------------------ status ------------------------------ */

type MessageFlags = Pick<User, 'emailOtpEnabled' | 'whatsappOtpEnabled' | 'telegramOtpEnabled'>;
type TwoFactorFlags = MessageFlags & Pick<User, 'totpEnabled'>;
/**
 * "Codes by message" is one method: a code goes to email, WhatsApp and Telegram at once.
 * The three per-channel flags stay in the database; any of them on means the method is on,
 * and each send uses every destination that works at that moment.
 */
export const hasMessageCodes = (u: MessageFlags) => u.emailOtpEnabled || u.whatsappOtpEnabled || u.telegramOtpEnabled;
export const hasTwoFactor = (u: TwoFactorFlags) => u.totpEnabled || hasMessageCodes(u);
/** Data that turns codes by message off. */
export const MESSAGE_CODES_OFF = { emailOtpEnabled: false, whatsappOtpEnabled: false, telegramOtpEnabled: false } as const;

/** Channels a code by message can be sent through. */
export type CodeChannel = 'email' | 'whatsapp' | 'telegram';
export const CODE_CHANNELS: CodeChannel[] = ['email', 'whatsapp', 'telegram'];
export const OTP_FLAG = { email: 'emailOtpEnabled', whatsapp: 'whatsappOtpEnabled', telegram: 'telegramOtpEnabled' } as const;

/** Whether the admin requires this user to use two-factor sign-in (workspace policy or per-user switch). */
export function twoFactorRequired(u: Pick<User, 'role' | 'require2fa'>, policy: TwoFactorPolicy) {
  return u.require2fa || policy === 'all' || (policy === 'admins' && u.role === 'ADMIN');
}

/** Which message channels the workspace can send codes through right now. */
export async function workspaceChannels() {
  const s = await getSettings();
  return {
    email: s.smtp.enabled && !!s.smtp.host,
    whatsapp: s.whatsapp.enabled && waStatus().status === 'on',
    telegram: s.telegram.enabled && !!s.telegram.botToken,
  };
}

/** Where a code for this channel goes for this user ('' when they haven't saved one). */
export async function codeDestination(u: Pick<User, 'email' | 'whatsappNumber' | 'telegramChatId'>, channel: CodeChannel) {
  if (channel === 'email') return u.email;
  if (channel === 'telegram') return (u.telegramChatId ?? '').trim();
  const { whatsapp } = await getSettings();
  return waNumber(u.whatsappNumber, whatsapp.defaultCountryCode) ? (u.whatsappNumber ?? '').trim() : '';
}

/** "+•••4567" / "•••789", so screens can say where the code went without revealing all of it. */
export function maskTarget(channel: CodeChannel, target: string) {
  if (channel === 'email') return maskEmail(target);
  const t = target.replace(/\s/g, '');
  if (t.startsWith('@')) return `@${t.slice(1, 3)}•••`;
  return `${t.startsWith('+') ? '+' : ''}•••${t.slice(-Math.min(4, Math.max(2, t.length - 4)))}`;
}

export async function emailAvailable() {
  const s = await getSettings();
  return s.smtp.enabled && !!s.smtp.host;
}

/** "j•••@example.com", so the sign-in screen can say where the code went. */
export function maskEmail(email: string) {
  const [name, domain] = email.split('@');
  if (!domain) return email;
  return `${name.slice(0, 1)}${'•'.repeat(Math.max(2, Math.min(name.length - 1, 5)))}@${domain}`;
}

/**
 * Every place a code by message could go for this user, and whether it works right now.
 * reason: 'workspace' = the workspace can't send there (no SMTP / WhatsApp not linked / no bot);
 *         'missing'   = the user hasn't saved an address there.
 */
export type CodeDestination = { channel: CodeChannel; available: boolean; to: string; reason: 'workspace' | 'missing' | null };
export async function codeDestinations(u: Pick<User, 'email' | 'whatsappNumber' | 'telegramChatId'>): Promise<CodeDestination[]> {
  const ws = await workspaceChannels();
  return Promise.all(
    CODE_CHANNELS.map(async (channel) => {
      const to = await codeDestination(u, channel);
      const reason = !ws[channel] ? ('workspace' as const) : !to ? ('missing' as const) : null;
      return { channel, available: !reason, to, reason };
    }),
  );
}

/** The same list with masked addresses, safe to show on screen ('' when nothing is saved). */
export const maskDestinations = (list: CodeDestination[]) => list.map((d) => ({ ...d, to: d.to ? maskTarget(d.channel, d.to) : '' }));

export const NO_DESTINATION =
  'There’s nowhere to send a code yet. Ask an admin to set up email, WhatsApp or Telegram, or save your WhatsApp number or Telegram chat ID in My profile → Notifications.';

export type SentTo = { channel: CodeChannel; to: string };

/** Sends a code to one available destination. Returns whether it was handed over. */
async function sendTo(d: CodeDestination, purpose: 'login' | 'setup' | 'reset', code: string, minutes: number) {
  const settings = await getSettings();
  const r =
    d.channel === 'email'
      ? await sendCodeEmail(settings.smtp, settings.app.name, d.to, purpose === 'setup' ? 'email-setup' : purpose, code, minutes)
      : await sendCodeMessage(d.channel, d.to, settings.app.name, purpose, code, minutes);
  return r.ok;
}

const SEND_FAILED: Record<CodeChannel, string> = {
  email: 'Could not send the email. Try WhatsApp or Telegram, or ask an admin to check the email settings.',
  whatsapp: 'Could not send the WhatsApp message. WhatsApp may be disconnected or the number isn’t on WhatsApp. Try another way.',
  telegram: 'Could not send the Telegram message. Make sure you started a chat with the workspace bot, or try another way.',
};
const NOT_AVAILABLE: Record<CodeChannel, string> = {
  email: 'Email isn’t available for sign-in codes right now. Try another way.',
  whatsapp: 'WhatsApp isn’t available for sign-in codes right now. Try another way.',
  telegram: 'Telegram isn’t available for sign-in codes right now. Try another way.',
};

/**
 * Sends the same code to every available destination at once (used to confirm codes by message).
 * Returns where it arrived (masked), or an error when it reached none.
 */
export async function sendCodeEverywhere(u: Pick<User, 'email' | 'whatsappNumber' | 'telegramChatId'>, purpose: 'login' | 'setup', code: string) {
  const targets = (await codeDestinations(u)).filter((d) => d.available);
  if (!targets.length) return { sent: [] as SentTo[], error: NO_DESTINATION };
  const results = await Promise.all(
    targets.map(async (d): Promise<SentTo | null> => ((await sendTo(d, purpose, code, CODE_MINUTES)) ? { channel: d.channel, to: maskTarget(d.channel, d.to) } : null)),
  );
  const sent = results.filter((r): r is SentTo => !!r);
  return {
    sent,
    error: sent.length ? null : 'Could not send the code by email, WhatsApp or Telegram. Try again in a minute.',
  };
}


/* ------------------------------ sign-in challenge ------------------------------ */

export const CHALLENGE_COOKIE = 'fc_2fa';
const CHALLENGE_MINUTES = 10;
export const MAX_CHALLENGE_ATTEMPTS = 8;

function isHttps() {
  if (process.env.COOKIE_SECURE === 'true') return true;
  if (process.env.COOKIE_SECURE === 'false') return false;
  return headers().get('x-forwarded-proto') === 'https';
}

/** Starts the second step of a sign-in: a short-lived cookie that is not yet a session. */
export async function startChallenge(userId: string) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + CHALLENGE_MINUTES * 60_000);
  await prisma.loginChallenge.deleteMany({ where: { OR: [{ userId }, { expiresAt: { lt: new Date() } }] } });
  const challenge = await prisma.loginChallenge.create({ data: { id: sha256(token), userId, expiresAt } });
  cookies().set(CHALLENGE_COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/', expires: expiresAt, secure: isHttps() });
  return challenge;
}

export async function currentChallenge() {
  const token = cookies().get(CHALLENGE_COOKIE)?.value;
  if (!token) return null;
  const challenge = await prisma.loginChallenge.findUnique({ where: { id: sha256(token) }, include: { user: true } });
  if (!challenge || challenge.expiresAt < new Date() || !challenge.user.active) return null;
  return challenge;
}

export async function endChallenge(id: string) {
  await prisma.loginChallenge.deleteMany({ where: { id } });
  cookies().delete(CHALLENGE_COOKIE);
}

type ChallengeRef = { id: string; userId: string; emailSentAt: Date | null; codeChannel: string | null };

/** Where the newest code went and how many codes this challenge has sent ("<channel>:<n>" in codeChannel). */
export function challengeSends(c: Pick<ChallengeRef, 'codeChannel' | 'emailSentAt'>) {
  const m = /^(email|whatsapp|telegram):(\d+)$/.exec(c.codeChannel ?? '');
  if (m) return { channel: m[1] as CodeChannel, count: Number(m[2]) };
  // Challenges started before this format: a bare channel name, one code sent.
  const legacy = CODE_CHANNELS.find((ch) => ch === c.codeChannel) ?? (c.emailSentAt ? 'email' : null);
  return { channel: legacy, count: c.emailSentAt ? 1 : 0 };
}

export type SendResult = { sent: SentTo[]; error: string | null; status?: number; restart?: boolean; wait?: number };

/**
 * Sends (or re-sends) the sign-in code for a challenge to one destination the user picked.
 * Only the newest code works — a new send replaces the old one. Codes are at least
 * RESEND_SECONDS apart (whichever channel) and one challenge sends at most MAX_CHALLENGE_SENDS,
 * so a stolen password can't be used to flood someone with messages.
 */
export async function sendChallengeCode(
  challenge: ChallengeRef,
  user: Pick<User, 'email' | 'whatsappNumber' | 'telegramChatId'>,
  channel: CodeChannel,
): Promise<SendResult> {
  const since = challenge.emailSentAt ? Date.now() - challenge.emailSentAt.getTime() : Infinity;
  if (since < RESEND_SECONDS * 1000) {
    const wait = Math.ceil((RESEND_SECONDS * 1000 - since) / 1000);
    return { sent: [], error: 'Please wait a minute before asking for another code.', status: 429, wait };
  }
  const { count } = challengeSends(challenge);
  if (count >= MAX_CHALLENGE_SENDS) return { sent: [], error: 'Too many codes were asked for. Sign in again.', status: 429, restart: true };
  const dest = (await codeDestinations(user)).find((d) => d.channel === channel);
  if (!dest?.available) return { sent: [], error: NOT_AVAILABLE[channel], status: 400 };
  const code = newEmailCode();
  if (!(await sendTo(dest, 'login', code, LOGIN_CODE_MINUTES))) return { sent: [], error: SEND_FAILED[channel], status: 502 };
  // A new code doesn't reset the wrong-code counter, so re-sending can't buy extra guesses.
  await prisma.loginChallenge.update({
    where: { id: challenge.id },
    data: { emailCodeHash: hashCode(challenge.userId, code), emailSentAt: new Date(), codeChannel: `${channel}:${count + 1}` },
  });
  return { sent: [{ channel, to: maskTarget(channel, dest.to) }], error: null };
}

/* ------------------------------ one-time codes (password reset, codes-by-message setup) ------------------------------ */

export type OtpPurpose = 'reset' | 'message-setup';

async function tooSoon(userId: string, purpose: OtpPurpose) {
  const last = await prisma.otpCode.findFirst({ where: { userId, purpose }, orderBy: { createdAt: 'desc' } });
  return !!last && Date.now() - last.createdAt.getTime() < RESEND_SECONDS * 1000;
}

/** Stores a fresh code for a purpose, replacing any earlier one (only the newest code works). */
async function storeOtp(userId: string, purpose: OtpPurpose, code: string, minutes = CODE_MINUTES) {
  await prisma.otpCode.deleteMany({ where: { OR: [{ userId, purpose }, { expiresAt: { lt: new Date() } }] } });
  await prisma.otpCode.create({ data: { userId, purpose, codeHash: hashCode(userId, code), expiresAt: new Date(Date.now() + minutes * 60_000) } });
}

/** Lifetime of a password-reset code. */
export const RESET_CODE_MINUTES = 3;

/**
 * Password reset: sends a code to the account's email / WhatsApp / Telegram when the account
 * exists, is active and has that destination — otherwise does nothing. Never reports which,
 * so the forgot-password page can't be used to find accounts or their phone numbers.
 * A code sent less than RESEND_SECONDS ago is not replaced. Delivery happens in the
 * background, so the response takes the same time whether or not a code was sent.
 */
export async function issueResetCode(
  user: Pick<User, 'id' | 'username' | 'email' | 'whatsappNumber' | 'telegramChatId'> | null,
  channel: CodeChannel,
) {
  if (!user) return;
  const dest = (await codeDestinations(user)).find((d) => d.channel === channel);
  if (!dest?.available || (await tooSoon(user.id, 'reset'))) return;
  const code = newEmailCode();
  await storeOtp(user.id, 'reset', code, RESET_CODE_MINUTES);
  void sendTo(dest, 'reset', code, RESET_CODE_MINUTES)
    .then((ok) => ok || console.warn(`[formcraft] password reset ${channel} message for ${user.username} could not be sent`))
    .catch(() => console.warn(`[formcraft] password reset ${channel} message for ${user.username} could not be sent`));
}

/** Sends one setup code for codes by message to every available destination at once. */
export async function issueMessageSetupCode(user: Pick<User, 'id' | 'email' | 'whatsappNumber' | 'telegramChatId'>): Promise<SendResult> {
  if (await tooSoon(user.id, 'message-setup')) return { sent: [], error: 'Please wait a minute before asking for another code.', status: 429 };
  const code = newEmailCode();
  const { sent, error } = await sendCodeEverywhere(user, 'setup', code);
  if (error) return { sent, error, status: sent.length || error !== NO_DESTINATION ? 502 : 400 };
  await storeOtp(user.id, 'message-setup', code);
  return { sent, error: null };
}

/**
 * Checks a one-time code; consumes it on success unless `keep` (used to check a reset code
 * before the new password is chosen). Wrong codes always count. Returns an error message or null.
 */
export async function checkOtp(userId: string, purpose: OtpPurpose, code: string, keep = false) {
  const otp = await prisma.otpCode.findFirst({ where: { userId, purpose }, orderBy: { createdAt: 'desc' } });
  if (!otp || otp.expiresAt < new Date()) return 'That code has expired. Ask for a new one.';
  if (otp.attempts >= MAX_CODE_ATTEMPTS) return 'Too many wrong codes. Ask for a new one.';
  if (!codeMatches(userId, code, otp.codeHash)) {
    await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    return 'That code is not right. Check it and try again.';
  }
  if (!keep) await prisma.otpCode.deleteMany({ where: { userId, purpose } });
  // A checked code stays valid a little longer, so choosing the new password can't run out the clock.
  else await prisma.otpCode.update({ where: { id: otp.id }, data: { expiresAt: new Date(Math.max(otp.expiresAt.getTime(), Date.now() + CODE_MINUTES * 60_000)) } });
  return null;
}

/* ------------------------------ profile status ------------------------------ */

/** What the profile's Two-factor card shows (also returned by GET /api/me/two-factor). */
export async function twoFactorStatus(
  user: Pick<User, 'role' | 'require2fa' | 'totpEnabled' | 'emailOtpEnabled' | 'whatsappOtpEnabled' | 'telegramOtpEnabled' | 'recoveryCodes' | 'email' | 'whatsappNumber' | 'telegramChatId'>,
) {
  const { security } = await getSettings();
  const destinations = maskDestinations(await codeDestinations(user)).map(({ channel, available, to, reason }) => ({ channel, available, to, reason }));
  return {
    totp: user.totpEnabled,
    message: hasMessageCodes(user),
    destinations,
    recoveryLeft: recoveryCodesLeft(user.recoveryCodes),
    required: twoFactorRequired(user, security.require2fa),
  };
}
export type TwoFactorStatusData = Awaited<ReturnType<typeof twoFactorStatus>>;
