// "Responses per person": recognises a returning respondent without accounts, by
//   1. a long-lived anonymous cookie (fc_rid) set by the server,
//   2. the same id kept in the browser's local storage (survives a cleared cookie), and
//   3. optionally the network: an HMAC of the IP address (the IP itself is never stored).
// None of this is bullet-proof (private windows, another device, a VPN), but it stops casual repeats.
import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { prisma } from './db';
import { clientIp } from './response-files';
import type { FormSettings } from './types';

export const RESPONDENT_COOKIE = 'fc_rid';
const ID_RE = /^[a-f0-9]{32}$/;

export const cleanId = (v: unknown) => (typeof v === 'string' && ID_RE.test(v) ? v : null);
export const newRespondentId = () => crypto.randomBytes(16).toString('hex');

/** The limit for a form: 0 = unlimited, otherwise 1–1000. */
export function perPersonLimit(settings: FormSettings) {
  const n = Math.floor(Number(settings.perPersonLimit) || 0);
  return n > 0 ? Math.min(n, 1000) : 0;
}

let secretCache: string | null = null;
async function secret() {
  if (secretCache) return secretCache;
  const row = await prisma.appMeta.findUnique({ where: { key: 'respondent.secret' } });
  if (row) return (secretCache = row.value);
  const value = crypto.randomBytes(32).toString('hex');
  await prisma.appMeta.upsert({ where: { key: 'respondent.secret' }, create: { key: 'respondent.secret', value }, update: {} });
  const saved = await prisma.appMeta.findUnique({ where: { key: 'respondent.secret' } });
  return (secretCache = saved?.value ?? value);
}

export async function ipHashOf(req: Request) {
  const ip = clientIp(req);
  return crypto.createHmac('sha256', await secret()).update(ip).digest('hex').slice(0, 40);
}

/** The ids this browser is known by: the cookie and the local-storage id it sent (x-fc-rid header). */
export function respondentIds(req: Request) {
  const fromCookie = cleanId(cookies().get(RESPONDENT_COOKIE)?.value);
  const fromClient = cleanId(req.headers.get('x-fc-rid'));
  return { fromCookie, fromClient, ids: [...new Set([fromCookie, fromClient].filter((x): x is string => !!x))] };
}

/** How many responses this person already sent to the form. */
export async function countPrevious(formId: string, req: Request, settings: FormSettings) {
  const { ids } = respondentIds(req);
  const or: object[] = [];
  if (ids.length) or.push({ respondentId: { in: ids } });
  if (settings.limitByIp) or.push({ ipHash: await ipHashOf(req) });
  if (!or.length) return 0;
  return prisma.submission.count({ where: { formId, OR: or } });
}

/** Sets the anonymous cookie (2 years, HTTP-only) when the browser doesn't have one yet. */
export function rememberRespondent(res: { cookies: { set: (name: string, value: string, opts: object) => void } }, id: string, secure: boolean) {
  res.cookies.set(RESPONDENT_COOKIE, id, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 2 * 365 * 86400 });
}
