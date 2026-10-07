import crypto from 'node:crypto';
import type { User } from '@prisma/client';
import { cookies, headers } from 'next/headers';
import { prisma } from './db';
import { sendCodeEmail } from './notify';
import { getSettings } from './settings';
import { safeJson } from './utils';

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

export const CODE_MINUTES = 10;
export const MAX_CODE_ATTEMPTS = 5;
/** Minimum gap between two emailed codes for the same purpose. */
export const RESEND_SECONDS = 60;

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

export const hasTwoFactor = (u: Pick<User, 'totpEnabled' | 'emailOtpEnabled'>) => u.totpEnabled || u.emailOtpEnabled;

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

/** Sends a code by email, honouring the resend gap. Returns an error message or null. */
export async function emailCode(to: string, purpose: 'reset' | 'login' | 'email-setup', code: string) {
  const settings = await getSettings();
  if (!(settings.smtp.enabled && settings.smtp.host)) return 'Email is not set up on this workspace. Ask an admin.';
  const r = await sendCodeEmail(settings.smtp, settings.app.name, to, purpose, code, CODE_MINUTES);
  return r.ok ? null : 'Could not send the email. Try again, or ask an admin to check the email settings.';
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

/** Sends (or re-sends) the sign-in code for a challenge. Returns an error message or null. */
export async function sendChallengeEmail(challenge: { id: string; userId: string; emailSentAt: Date | null }, email: string) {
  if (challenge.emailSentAt && Date.now() - challenge.emailSentAt.getTime() < RESEND_SECONDS * 1000) {
    return 'Please wait a minute before asking for another code.';
  }
  const code = newEmailCode();
  const error = await emailCode(email, 'login', code);
  if (error) return error;
  await prisma.loginChallenge.update({
    where: { id: challenge.id },
    data: { emailCodeHash: hashCode(challenge.userId, code), emailSentAt: new Date(), attempts: 0 },
  });
  return null;
}

/* ------------------------------ emailed one-time codes ------------------------------ */

/** Creates and emails a code for a purpose, replacing any earlier one. Returns an error or null. */
export async function issueOtp(user: Pick<User, 'id' | 'email'>, purpose: 'reset' | 'email-setup') {
  const last = await prisma.otpCode.findFirst({ where: { userId: user.id, purpose }, orderBy: { createdAt: 'desc' } });
  if (last && Date.now() - last.createdAt.getTime() < RESEND_SECONDS * 1000) {
    return 'Please wait a minute before asking for another code.';
  }
  const code = newEmailCode();
  const error = await emailCode(user.email, purpose, code);
  if (error) return error;
  await prisma.otpCode.deleteMany({ where: { OR: [{ userId: user.id, purpose }, { expiresAt: { lt: new Date() } }] } });
  await prisma.otpCode.create({
    data: { userId: user.id, purpose, codeHash: hashCode(user.id, code), expiresAt: new Date(Date.now() + CODE_MINUTES * 60_000) },
  });
  return null;
}

/** Checks an emailed code; consumes it on success. Returns an error message or null. */
export async function checkOtp(userId: string, purpose: 'reset' | 'email-setup', code: string) {
  const otp = await prisma.otpCode.findFirst({ where: { userId, purpose }, orderBy: { createdAt: 'desc' } });
  if (!otp || otp.expiresAt < new Date()) return 'That code has expired. Ask for a new one.';
  if (otp.attempts >= MAX_CODE_ATTEMPTS) return 'Too many wrong codes. Ask for a new one.';
  if (!codeMatches(userId, code, otp.codeHash)) {
    await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    return 'That code is not right. Check it and try again.';
  }
  await prisma.otpCode.deleteMany({ where: { userId, purpose } });
  return null;
}
