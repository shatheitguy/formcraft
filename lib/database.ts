import fs from 'node:fs';
import path from 'node:path';
import { prisma } from './db';

export type Provider = 'sqlite' | 'postgresql' | 'unknown';

export function dbProvider(url = process.env.DATABASE_URL ?? ''): Provider {
  if (url.startsWith('file:')) return 'sqlite';
  if (/^postgres(ql)?:\/\//.test(url)) return 'postgresql';
  return 'unknown';
}

/** Absolute path of the SQLite file (relative URLs resolve from the prisma/ directory, like Prisma does). */
export function sqlitePath(url = process.env.DATABASE_URL ?? '') {
  const p = url.replace(/^file:/, '').split('?')[0];
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), 'prisma', p);
}

/** Connection string with credentials hidden. */
export function maskedUrl(url = process.env.DATABASE_URL ?? '') {
  if (dbProvider(url) === 'sqlite') return url;
  try {
    // Built by hand: URL#toString would percent-encode the mask characters.
    const u = new URL(url);
    const auth = u.username ? `${decodeURIComponent(u.username)}${u.password ? ':••••••' : ''}@` : '';
    return `${u.protocol}//${auth}${u.host}${u.pathname}${u.search}`;
  } catch {
    return '(invalid URL)';
  }
}

export async function databaseInfo() {
  const provider = dbProvider();
  const started = Date.now();
  let ok = true;
  let version = '';
  let error = '';
  try {
    if (provider === 'sqlite') {
      const r = await prisma.$queryRawUnsafe<{ v: string }[]>('select sqlite_version() as v');
      version = `SQLite ${r[0]?.v ?? ''}`;
    } else {
      const r = await prisma.$queryRawUnsafe<{ v: string }[]>('select version() as v');
      version = (r[0]?.v ?? '').split(' ').slice(0, 2).join(' ');
    }
  } catch (e) {
    ok = false;
    error = e instanceof Error ? e.message.split('\n').slice(-1)[0] : String(e);
  }
  const latencyMs = Date.now() - started;

  let sizeBytes: number | null = null;
  try {
    if (provider === 'sqlite') sizeBytes = fs.statSync(sqlitePath()).size;
    else if (provider === 'postgresql') {
      const r = await prisma.$queryRawUnsafe<{ s: bigint }[]>('select pg_database_size(current_database()) as s');
      sizeBytes = Number(r[0]?.s ?? 0);
    }
  } catch {}

  const [forms, submissions, users, sessions, logs] = ok
    ? await Promise.all([
        prisma.form.count(),
        prisma.submission.count(),
        prisma.user.count(),
        prisma.session.count({ where: { expiresAt: { gt: new Date() } } }),
        prisma.notificationLog.count(),
      ])
    : [0, 0, 0, 0, 0];

  return {
    provider,
    url: maskedUrl(),
    file: provider === 'sqlite' ? sqlitePath() : null,
    ok,
    error,
    version,
    latencyMs,
    sizeBytes,
    counts: { forms, submissions, users, sessions, logs },
  };
}

export type DatabaseInfo = Awaited<ReturnType<typeof databaseInfo>>;
