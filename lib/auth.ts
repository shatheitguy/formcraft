import crypto from 'node:crypto';
import { promisify } from 'node:util';
import type { User } from '@prisma/client';
import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { prisma } from './db';
import type { Role, SessionUser } from './roles';
import { getSettings } from './settings';
import { safeJson } from './utils';

export * from './roles';

export const SESSION_COOKIE = 'fc_session';
const SESSION_DAYS = 30;
const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

/* ------------------------------ passwords ------------------------------ */

export async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algo, saltB64, hashB64] = stored.split('$');
  if (algo !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

export function passwordProblem(pw: unknown): string | null {
  if (typeof pw !== 'string' || pw.length < 8) return 'Password must be at least 8 characters.';
  if (pw.length > 200) return 'Password is too long.';
  return null;
}

/* ------------------------------ sessions ------------------------------ */

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

function isHttps() {
  if (process.env.COOKIE_SECURE === 'true') return true;
  if (process.env.COOKIE_SECURE === 'false') return false;
  return headers().get('x-forwarded-proto') === 'https';
}

/** Creates a session and sets the cookie. Route handlers only. */
export async function createSession(userId: string) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await prisma.session.create({
    data: { id: hashToken(token), userId, expiresAt, userAgent: headers().get('user-agent')?.slice(0, 200) },
  });
  cookies().set(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/', expires: expiresAt, secure: isHttps() });
  // Opportunistic cleanup of expired sessions.
  prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {});
}

export async function destroySession() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { id: hashToken(token) } });
  cookies().delete(SESSION_COOKIE);
}

/** Session id of the current request, used to keep it alive when revoking others. */
export function currentSessionId() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  return token ? hashToken(token) : null;
}

export function toSessionUser(u: User & { formAccess: { formId: string }[] }): SessionUser {
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    email: u.email,
    avatarUrl: u.avatarUrl,
    role: (['ADMIN', 'EDITOR', 'VIEWER'].includes(u.role) ? u.role : 'VIEWER') as Role,
    formScope: u.formScope === 'SELECTED' ? 'SELECTED' : 'ALL',
    formIds: u.formAccess.map((a) => a.formId),
  };
}

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { id: hashToken(token) },
    include: { user: { include: { formAccess: { select: { formId: true } } } } },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;
  // An admin requires two-factor sign-in but this user hasn't set it up yet: only their profile
  // (where they turn it on) and the APIs it needs work until they do.
  if (await mustSetUpTwoFactor(session.user)) {
    const path = headers().get('x-fc-path') ?? '';
    if (!SETUP_2FA_ALLOWED.some((r) => r.test(path))) {
      if (!path || path.startsWith('/api/')) return null;
      redirect(SETUP_2FA_PATH);
    }
  }
  return toSessionUser(session.user);
});

/* ------------------------------ required two-factor ------------------------------ */

/** Where users who must set up two-factor sign-in are sent. */
export const SETUP_2FA_PATH = '/settings/profile#security';
/** Pages and APIs that stay open while two-factor setup is pending (set by middleware in x-fc-path). */
const SETUP_2FA_ALLOWED = [
  /^\/settings\/profile\/?$/,
  /^\/(login|forgot|setup)\/?$/,
  /^\/f\//,
  /^\/api\/me(\/.*)?$/,
  /^\/api\/auth\//,
  /^\/api\/uploads\/?$/,
];

type TwoFactorFields = Pick<User, 'role' | 'require2fa' | 'totpEnabled' | 'emailOtpEnabled' | 'whatsappOtpEnabled' | 'telegramOtpEnabled'>;

/** True when the admin requires two-factor sign-in for this user and no method is on yet. */
export async function mustSetUpTwoFactor(u: TwoFactorFields) {
  if (u.totpEnabled || u.emailOtpEnabled || u.whatsappOtpEnabled || u.telegramOtpEnabled) return false;
  if (u.require2fa) return true;
  const policy = (await getSettings()).security.require2fa;
  return policy === 'all' || (policy === 'admins' && u.role === 'ADMIN');
}

/* ------------------------------ guards ------------------------------ */

/** For server components: redirects to /login (or /setup on a fresh install). */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect((await prisma.user.count()) === 0 ? '/setup' : '/login');
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== 'ADMIN') redirect('/settings/profile');
  return user;
}

export const unauthorized = () => NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
export const forbidden = () => NextResponse.json({ error: "You don't have permission to do that." }, { status: 403 });

export function notifyFormIds(u: Pick<User, 'notifyFormIds'>) {
  return safeJson<string[]>(u.notifyFormIds, []);
}

/* ------------------------------ login throttling ------------------------------ */

const attempts = new Map<string, { count: number; until: number }>();
const WINDOW = 15 * 60_000;
const MAX_ATTEMPTS = 8;

export function loginBlocked(key: string) {
  const a = attempts.get(key);
  return !!a && a.count >= MAX_ATTEMPTS && a.until > Date.now();
}

export function recordLoginFailure(key: string) {
  const a = attempts.get(key);
  if (!a || a.until < Date.now()) attempts.set(key, { count: 1, until: Date.now() + WINDOW });
  else a.count++;
}

export const clearLoginFailures = (key: string) => attempts.delete(key);
