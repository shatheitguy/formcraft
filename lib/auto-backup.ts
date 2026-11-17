import fs from 'node:fs/promises';
import path from 'node:path';
import { notifyBackupFailed } from './activity';
import { getSettings, type BackupSettings } from './settings';
import { BACKUP_DIR, createSystemBackup } from './system-backup';

/**
 * Automatic scheduled backups. Files use the same .fcbackup format as Settings → Database →
 * Full system backup, so they restore through the same code. They are written to BACKUP_DIR
 * (default data/backups — /app/data/backups in Docker, on the data volume).
 */

export { BACKUP_DIR };

export type BackupKind = 'auto' | 'manual' | 'snapshot';

export interface StoredBackup {
  name: string;
  size: number;
  createdAt: string;
  kind: BackupKind;
}

export interface BackupState {
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastResult: null | {
    ok: boolean;
    at: string;
    file?: string;
    size?: number;
    forms?: number;
    submissions?: number;
    error?: string;
  };
}

// Only names we write ourselves are ever listed, downloaded, restored or deleted.
const AUTO_RE = /^formcraft-auto-\d{4}-\d{2}-\d{2}_\d{6}\.fcbackup$/;
const MANUAL_RE = /^formcraft-manual-\d{4}-\d{2}-\d{2}_\d{6}\.fcbackup$/;
const SNAPSHOT_RE = /^pre-restore-[0-9TZ-]+\.fcbackup$/;
const STATE_FILE = path.join(BACKUP_DIR, 'auto-backup-state.json');
const RETRY_AFTER_FAILURE = 30 * 60_000;

const kindOf = (name: string): BackupKind | null => (AUTO_RE.test(name) ? 'auto' : MANUAL_RE.test(name) ? 'manual' : SNAPSHOT_RE.test(name) ? 'snapshot' : null);

/** All stored backups, newest first. */
export async function listBackups(): Promise<StoredBackup[]> {
  let names: string[] = [];
  try {
    names = await fs.readdir(BACKUP_DIR);
  } catch {
    return [];
  }
  const out: StoredBackup[] = [];
  for (const name of names) {
    const kind = kindOf(name);
    if (!kind) continue;
    const st = await fs.stat(path.join(BACKUP_DIR, name)).catch(() => null);
    if (st?.isFile()) out.push({ name, size: st.size, createdAt: st.mtime.toISOString(), kind });
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Full path of a stored backup, or null if the name isn't one of the listed files. */
export async function backupPath(name: unknown): Promise<string | null> {
  if (typeof name !== 'string' || !kindOf(name)) return null;
  const found = (await listBackups()).some((b) => b.name === name);
  return found ? path.join(BACKUP_DIR, name) : null;
}

export async function deleteBackup(name: unknown) {
  const file = await backupPath(name);
  if (!file) return false;
  await fs.unlink(file);
  return true;
}

export async function readState(): Promise<BackupState> {
  try {
    return { lastAttemptAt: null, lastSuccessAt: null, lastResult: null, ...JSON.parse(await fs.readFile(STATE_FILE, 'utf8')) };
  } catch {
    return { lastAttemptAt: null, lastSuccessAt: null, lastResult: null };
  }
}

async function writeState(state: BackupState) {
  await fs.mkdir(BACKUP_DIR, { recursive: true, mode: 0o700 });
  const tmp = `${STATE_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2));
  await fs.rename(tmp, STATE_FILE);
}

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

/** Deletes the oldest automatic backups beyond `keep`. Manual backups and restore snapshots are never touched. */
async function prune(keep: number) {
  const auto = (await listBackups()).filter((b) => b.kind === 'auto');
  for (const b of auto.slice(Math.max(1, keep))) await fs.unlink(path.join(BACKUP_DIR, b.name)).catch(() => {});
}

const g = globalThis as unknown as { __fcBackupRunning?: Promise<BackupState['lastResult']>; __fcBackupTimer?: NodeJS.Timeout };

/**
 * Writes one backup now (atomically: temp file, then rename). Concurrent calls share the
 * running backup instead of starting another. Never throws: the result says what happened.
 */
export function runBackup(kind: 'auto' | 'manual' = 'auto'): Promise<BackupState['lastResult']> {
  if (g.__fcBackupRunning) return g.__fcBackupRunning;
  g.__fcBackupRunning = (async () => {
    const started = new Date();
    const state = await readState();
    let result: NonNullable<BackupState['lastResult']>;
    try {
      const cfg = (await getSettings()).backup;
      const { buffer, counts } = await createSystemBackup({ includeUploads: cfg.includeUploads });
      await fs.mkdir(BACKUP_DIR, { recursive: true, mode: 0o700 });
      const name = `formcraft-${kind}-${stamp(started)}.fcbackup`;
      const tmp = path.join(BACKUP_DIR, `.${name}.tmp`);
      // Backups hold password hashes and two-factor secrets: readable by the server's user only.
      await fs.writeFile(tmp, buffer, { mode: 0o600 });
      await fs.rename(tmp, path.join(BACKUP_DIR, name));
      result = { ok: true, at: started.toISOString(), file: name, size: buffer.length, forms: counts.form, submissions: counts.submission };
      if (kind === 'auto') await prune(cfg.keep);
      console.log(`[formcraft] backup written: ${name} (${counts.form} forms, ${counts.submission} responses)`);
    } catch (e) {
      const error = e instanceof Error ? e.message.split('\n').slice(-1)[0] : String(e);
      result = { ok: false, at: started.toISOString(), error };
      console.error('[formcraft] backup failed:', e);
      // One notice per failure streak, not one per retry.
      if (state.lastResult?.ok !== false) await notifyBackupFailed(error);
    }
    try {
      await writeState({
        lastAttemptAt: kind === 'auto' ? started.toISOString() : state.lastAttemptAt,
        lastSuccessAt: result.ok ? started.toISOString() : state.lastSuccessAt,
        lastResult: result,
      });
    } catch (e) {
      console.error('[formcraft] could not save backup state:', e);
    }
    return result;
  })().finally(() => {
    g.__fcBackupRunning = undefined;
  });
  return g.__fcBackupRunning;
}

/** The most recent scheduled time at or before `now` (server local time). */
export function lastSlot(cfg: BackupSettings, now = new Date()) {
  const [h, m] = cfg.time.split(':').map((n) => parseInt(n, 10) || 0);
  const slot = new Date(now);
  slot.setSeconds(0, 0);
  if (cfg.frequency === 'hourly') {
    slot.setMinutes(m);
    if (slot > now) slot.setHours(slot.getHours() - 1);
    return slot;
  }
  slot.setHours(h, m);
  if (cfg.frequency === 'daily') {
    if (slot > now) slot.setDate(slot.getDate() - 1);
    return slot;
  }
  slot.setDate(slot.getDate() - ((slot.getDay() - cfg.weekday + 7) % 7));
  if (slot > now) slot.setDate(slot.getDate() - 7);
  return slot;
}

/** Due when the latest scheduled time has passed without a successful backup (also catches up after downtime). */
function isDue(cfg: BackupSettings, state: BackupState, now = new Date()) {
  if (!cfg.enabled) return false;
  const slot = lastSlot(cfg, now).getTime();
  const success = state.lastSuccessAt ? Date.parse(state.lastSuccessAt) : 0;
  if (success >= slot) return false;
  const attempt = state.lastAttemptAt ? Date.parse(state.lastAttemptAt) : 0;
  if (attempt < slot) return true;
  // Already tried for this slot and failed: retry now and then.
  return now.getTime() - attempt >= RETRY_AFTER_FAILURE;
}

async function tick() {
  try {
    if (g.__fcBackupRunning) return;
    const [settings, state] = await Promise.all([getSettings(), readState()]);
    if (isDue(settings.backup, state)) await runBackup('auto');
  } catch (e) {
    console.error('[formcraft] backup scheduler:', e instanceof Error ? e.message : e);
  }
}

/** Checks once a minute whether a backup is due (once per process; first check shortly after boot). */
export function startAutoBackups() {
  if (g.__fcBackupTimer) return;
  g.__fcBackupTimer = setInterval(() => void tick(), 60_000);
  g.__fcBackupTimer.unref?.();
  setTimeout(() => void tick(), 15_000).unref?.();
}
