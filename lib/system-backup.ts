import fs from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { dbProvider } from './database';
import { prisma } from './db';
import { STORED_NAME_RE } from './files';
import { RESPONSES_DIR, storedFilePath } from './response-files';
import { clearSettingsCache } from './settings';
import { UPLOAD_DIR, UPLOAD_NAME_RE } from './uploads';

/**
 * Full system backup: every table (except sign-in sessions) plus uploaded images and files
 * attached to responses (UPLOAD_DIR/responses/<formId>/<storedName>), as one
 * gzip-compressed JSON file. Engine-independent, so it also moves data between SQLite and
 * PostgreSQL.
 */

export const BACKUP_FORMAT = 'formcraft-system-backup';
export const BACKUP_VERSION = 1;

// Columns per table. Restores pick only these, so backups from older/newer versions still load.
const TABLES = {
  user: ['id', 'username', 'email', 'name', 'avatarUrl', 'language', 'theme', 'passwordHash', 'role', 'formScope', 'active', 'notifyEmail', 'telegramChatId', 'emailNotifications', 'telegramNotifications', 'notifyAllForms', 'notifyFormIds', 'notifyEvents', 'forcedNotify', 'lastLoginAt', 'totpSecret', 'totpEnabled', 'totpLastStep', 'emailOtpEnabled', 'recoveryCodes', 'whatsappNumber', 'whatsappNotifications', 'whatsappAttach', 'whatsappOtpEnabled', 'telegramOtpEnabled', 'require2fa', 'createdAt', 'updatedAt'],
  form: ['id', 'title', 'description', 'category', 'tags', 'status', 'schema', 'slug', 'port', 'customDomain', 'createdById', 'createdAt', 'updatedAt'],
  formAccess: ['userId', 'formId'],
  submission: ['id', 'formId', 'data', 'score', 'maxScore', 'language', 'respondentId', 'ipHash', 'createdAt'],
  setting: ['key', 'value', 'updatedAt'],
  notificationLog: ['id', 'channel', 'target', 'subject', 'status', 'error', 'createdAt'],
  appMeta: ['key', 'value'],
  trashItem: ['id', 'kind', 'formId', 'itemId', 'title', 'count', 'data', 'deletedById', 'deletedByName', 'deletedAt'],
} as const;
type Table = keyof typeof TABLES;
const DATE_FIELDS = new Set(['createdAt', 'updatedAt', 'lastLoginAt', 'deletedAt']);

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  provider: string;
  counts: Record<Table | 'uploads', number> & { responseFiles?: number };
  tables: Record<Table, Record<string, unknown>[]>;
  uploads: { name: string; data: string }[];
  /** Files attached to responses. Optional: backups made before file-upload fields don't have it. */
  responseFiles?: { formId: string; name: string; data: string }[];
}

const FORM_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

async function readResponseFiles(): Promise<NonNullable<BackupFile['responseFiles']>> {
  const out: NonNullable<BackupFile['responseFiles']> = [];
  let formIds: string[] = [];
  try {
    formIds = await fs.readdir(RESPONSES_DIR);
  } catch {
    return out; // No response files yet.
  }
  for (const formId of formIds) {
    if (!FORM_ID_RE.test(formId)) continue;
    let names: string[] = [];
    try {
      names = await fs.readdir(path.join(RESPONSES_DIR, formId));
    } catch {
      continue; // Not a directory.
    }
    for (const name of names) {
      const file = storedFilePath(formId, name);
      if (!file) continue;
      const data = await fs.readFile(file).catch(() => null);
      if (data) out.push({ formId, name, data: data.toString('base64') });
    }
  }
  return out;
}

export async function createSystemBackup({ includeUploads = true }: { includeUploads?: boolean } = {}): Promise<{ buffer: Buffer; counts: BackupFile['counts'] }> {
  const [user, form, formAccess, submission, setting, notificationLog, appMeta, trashItem] = await Promise.all([
    prisma.user.findMany(),
    prisma.form.findMany(),
    prisma.formAccess.findMany(),
    prisma.submission.findMany(),
    prisma.setting.findMany(),
    prisma.notificationLog.findMany(),
    prisma.appMeta.findMany(),
    prisma.trashItem.findMany(),
  ]);

  const uploads: BackupFile['uploads'] = [];
  try {
    for (const name of includeUploads ? await fs.readdir(UPLOAD_DIR) : []) {
      if (UPLOAD_NAME_RE.test(name)) uploads.push({ name, data: (await fs.readFile(path.join(UPLOAD_DIR, name))).toString('base64') });
    }
  } catch {
    // No uploads directory yet.
  }

  const responseFiles = includeUploads ? await readResponseFiles() : [];

  const tables = { user, form, formAccess, submission, setting, notificationLog, appMeta, trashItem } as unknown as BackupFile['tables'];
  const counts = { ...Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])), uploads: uploads.length, responseFiles: responseFiles.length } as BackupFile['counts'];
  const file: BackupFile = { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: new Date().toISOString(), provider: dbProvider(), counts, tables, uploads, responseFiles };
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

/** Where backups live on the server (next to uploads, on the data volume). BACKUP_DIR overrides it. */
export const BACKUP_DIR = process.env.BACKUP_DIR || path.join(path.dirname(UPLOAD_DIR), 'backups');
/** Where automatic pre-restore snapshots are written. */
export const SNAPSHOT_DIR = BACKUP_DIR;

/**
 * Replaces all data with the backup's contents in one transaction. A snapshot of the current
 * data is written to SNAPSHOT_DIR first so a mistaken restore can be undone.
 */
export async function restoreSystemBackup(b: BackupFile) {
  const snapshot = await createSystemBackup();
  await fs.mkdir(SNAPSHOT_DIR, { recursive: true, mode: 0o700 });
  const snapshotFile = path.join(SNAPSHOT_DIR, `pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}.fcbackup`);
  await fs.writeFile(snapshotFile, snapshot.buffer, { mode: 0o600 });

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
      await tx.trashItem.deleteMany();
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
      for (const c of chunks(rows('trashItem'))) await tx.trashItem.createMany({ data: c as any });
      /* eslint-enable @typescript-eslint/no-explicit-any */
    },
    { timeout: 180_000, maxWait: 15_000 },
  );

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  for (const u of b.uploads ?? []) {
    if (UPLOAD_NAME_RE.test(u.name)) await fs.writeFile(path.join(UPLOAD_DIR, u.name), Buffer.from(u.data, 'base64'));
  }
  // Response attachments: only well-formed <formId>/<storedName> pairs, never anything that could escape the folder.
  for (const f of Array.isArray(b.responseFiles) ? b.responseFiles : []) {
    if (typeof f?.formId !== 'string' || typeof f.name !== 'string' || typeof f.data !== 'string') continue;
    if (!FORM_ID_RE.test(f.formId) || !STORED_NAME_RE.test(f.name)) continue;
    const file = storedFilePath(f.formId, f.name);
    if (!file || path.dirname(path.dirname(file)) !== RESPONSES_DIR) continue;
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, Buffer.from(f.data, 'base64'));
  }

  clearSettingsCache();
  return { snapshotFile, counts: b.counts };
}
