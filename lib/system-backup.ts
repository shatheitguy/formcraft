import fs from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { dbProvider } from './database';
import { prisma } from './db';
import { clearSettingsCache } from './settings';
import { UPLOAD_DIR, UPLOAD_NAME_RE } from './uploads';

/**
 * Full system backup: every table (except sign-in sessions) plus uploaded images, as one
 * gzip-compressed JSON file. Engine-independent, so it also moves data between SQLite and
 * PostgreSQL.
 */

export const BACKUP_FORMAT = 'formcraft-system-backup';
export const BACKUP_VERSION = 1;

// Columns per table. Restores pick only these, so backups from older/newer versions still load.
const TABLES = {
  user: ['id', 'username', 'email', 'name', 'avatarUrl', 'language', 'theme', 'passwordHash', 'role', 'formScope', 'active', 'notifyEmail', 'telegramChatId', 'emailNotifications', 'telegramNotifications', 'notifyAllForms', 'notifyFormIds', 'lastLoginAt', 'totpSecret', 'totpEnabled', 'totpLastStep', 'emailOtpEnabled', 'recoveryCodes', 'createdAt', 'updatedAt'],
  form: ['id', 'title', 'description', 'category', 'tags', 'status', 'schema', 'slug', 'port', 'customDomain', 'createdById', 'createdAt', 'updatedAt'],
  formAccess: ['userId', 'formId'],
  submission: ['id', 'formId', 'data', 'score', 'maxScore', 'language', 'createdAt'],
  setting: ['key', 'value', 'updatedAt'],
  notificationLog: ['id', 'channel', 'target', 'subject', 'status', 'error', 'createdAt'],
  appMeta: ['key', 'value'],
} as const;
type Table = keyof typeof TABLES;
const DATE_FIELDS = new Set(['createdAt', 'updatedAt', 'lastLoginAt']);

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  provider: string;
  counts: Record<Table | 'uploads', number>;
  tables: Record<Table, Record<string, unknown>[]>;
  uploads: { name: string; data: string }[];
}

export async function createSystemBackup(): Promise<{ buffer: Buffer; counts: BackupFile['counts'] }> {
  const [user, form, formAccess, submission, setting, notificationLog, appMeta] = await Promise.all([
    prisma.user.findMany(),
    prisma.form.findMany(),
    prisma.formAccess.findMany(),
    prisma.submission.findMany(),
    prisma.setting.findMany(),
    prisma.notificationLog.findMany(),
    prisma.appMeta.findMany(),
  ]);

  const uploads: BackupFile['uploads'] = [];
  try {
    for (const name of await fs.readdir(UPLOAD_DIR)) {
      if (UPLOAD_NAME_RE.test(name)) uploads.push({ name, data: (await fs.readFile(path.join(UPLOAD_DIR, name))).toString('base64') });
    }
  } catch {
    // No uploads directory yet.
  }

  const tables = { user, form, formAccess, submission, setting, notificationLog, appMeta } as unknown as BackupFile['tables'];
  const counts = { ...Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])), uploads: uploads.length } as BackupFile['counts'];
  const file: BackupFile = { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: new Date().toISOString(), provider: dbProvider(), counts, tables, uploads };
  return { buffer: gzipSync(Buffer.from(JSON.stringify(file)), { level: 9 }), counts };
}

export function parseBackup(buf: Buffer): BackupFile {
  let json: unknown;
  try {
    json = JSON.parse(gunzipSync(buf).toString('utf8'));
  } catch {
    throw new Error('This is not a FormCraft backup file (could not decompress it).');
  }
  const b = json as Partial<BackupFile>;
  if (b.format !== BACKUP_FORMAT) throw new Error('This is not a FormCraft system backup.');
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) throw new Error('This backup was made by a newer FormCraft version — update FormCraft first.');
  if (!b.tables || typeof b.tables !== 'object') throw new Error('The backup is missing its data.');
  for (const t of Object.keys(TABLES) as Table[]) if (!Array.isArray(b.tables[t] ?? [])) throw new Error(`The backup's ${t} data is invalid.`);
  return b as BackupFile;
}

function clean(table: Table, row: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of TABLES[table]) {
    if (!(k in row)) continue;
    const v = row[k];
    out[k] = DATE_FIELDS.has(k) && v != null ? new Date(v as string) : v;
  }
  return out;
}

/** Where automatic pre-restore snapshots are written (next to uploads, on the data volume). */
export const SNAPSHOT_DIR = path.join(path.dirname(UPLOAD_DIR), 'backups');

/**
 * Replaces all data with the backup's contents in one transaction. A snapshot of the current
 * data is written to SNAPSHOT_DIR first so a mistaken restore can be undone.
 */
export async function restoreSystemBackup(b: BackupFile) {
  const snapshot = await createSystemBackup();
  await fs.mkdir(SNAPSHOT_DIR, { recursive: true });
  const snapshotFile = path.join(SNAPSHOT_DIR, `pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}.fcbackup`);
  await fs.writeFile(snapshotFile, snapshot.buffer);

  const rows = (t: Table) => (b.tables[t] ?? []).map((r) => clean(t, r));
  const chunks = <T,>(arr: T[], n = 500) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

  await prisma.$transaction(
    async (tx) => {
      // Children first, then parents.
      await tx.submission.deleteMany();
      await tx.formAccess.deleteMany();
      await tx.session.deleteMany();
      await tx.notificationLog.deleteMany();
      await tx.setting.deleteMany();
      await tx.appMeta.deleteMany();
      await tx.form.deleteMany();
      await tx.user.deleteMany();

      /* eslint-disable @typescript-eslint/no-explicit-any */
      for (const c of chunks(rows('user'))) await tx.user.createMany({ data: c as any });
      for (const c of chunks(rows('form'))) await tx.form.createMany({ data: c as any });
      for (const c of chunks(rows('formAccess'))) await tx.formAccess.createMany({ data: c as any });
      for (const c of chunks(rows('submission'))) await tx.submission.createMany({ data: c as any });
      for (const c of chunks(rows('setting'))) await tx.setting.createMany({ data: c as any });
      for (const c of chunks(rows('notificationLog'))) await tx.notificationLog.createMany({ data: c as any });
      for (const c of chunks(rows('appMeta'))) await tx.appMeta.createMany({ data: c as any });
      /* eslint-enable @typescript-eslint/no-explicit-any */
    },
    { timeout: 180_000, maxWait: 15_000 },
  );

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  for (const u of b.uploads ?? []) {
    if (UPLOAD_NAME_RE.test(u.name)) await fs.writeFile(path.join(UPLOAD_DIR, u.name), Buffer.from(u.data, 'base64'));
  }

  clearSettingsCache();
  return { snapshotFile, counts: b.counts };
}
