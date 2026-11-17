// How this FormCraft was installed, and the one-click update for native (git checkout) installs.
// Docker installs update by pulling a new image, which the app can't do from inside its own container,
// so for those the About page shows the exact command to run instead.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export type InstallKind = 'docker' | 'git' | 'manual';
export type Supervisor = 'docker' | 'pm2' | 'systemd' | 'none';

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'data');
export const UPDATE_STATUS_FILE = path.join(DATA_DIR, 'update-status.json');
export const UPDATE_LOG_FILE = path.join(DATA_DIR, 'update.log');

export function installKind(): InstallKind {
  if (process.env.FC_INSTALL === 'docker' || fs.existsSync('/.dockerenv')) return 'docker';
  if (fs.existsSync(path.join(ROOT, '.git'))) return 'git';
  return 'manual';
}

/** Who restarts the server after an update (pm2 / systemd restart it when it exits). */
export function supervisor(): Supervisor {
  if (installKind() === 'docker') return 'docker';
  if (process.env.pm_id !== undefined || process.env.PM2_HOME) return 'pm2';
  if (process.env.INVOCATION_ID) return 'systemd';
  return 'none';
}

function git(args: string[]) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', timeout: 20_000, windowsHide: true });
  return r.status === 0 ? r.stdout.trim() : null;
}

/** Branch, commit and whether there are local edits that would block a fast-forward update. */
export function gitInfo() {
  if (installKind() !== 'git') return null;
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const commit = git(['rev-parse', '--short', 'HEAD']);
  const dirty = git(['status', '--porcelain', '--untracked-files=no']);
  return { available: branch !== null, branch, commit, localChanges: !!dirty };
}

export interface UpdateStatus {
  state: 'idle' | 'running' | 'done' | 'restart_needed' | 'failed';
  step?: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  from?: string;
  to?: string;
}

export function readUpdateStatus(): UpdateStatus {
  try {
    const s = JSON.parse(fs.readFileSync(UPDATE_STATUS_FILE, 'utf8')) as UpdateStatus;
    // A run whose process died (server restarted mid-update) shouldn't stay "running" forever.
    if (s.state === 'running' && s.startedAt && Date.now() - Date.parse(s.startedAt) > 45 * 60_000) {
      return { ...s, state: 'failed', error: 'The update stopped without finishing. Check data/update.log.' };
    }
    return s;
  } catch {
    return { state: 'idle' };
  }
}

export function updateLogTail(lines = 60) {
  try {
    return fs.readFileSync(UPDATE_LOG_FILE, 'utf8').split('\n').slice(-lines).join('\n');
  } catch {
    return '';
  }
}

/**
 * Starts scripts/self-update.mjs as a detached process: git pull → npm ci → prisma → next build.
 * When pm2 / systemd supervises the server it then stops this server so it comes back on the new version.
 */
export function startNativeUpdate(fromVersion: string, toVersion: string | null): { ok: true } | { ok: false; error: string } {
  if (installKind() !== 'git') return { ok: false, error: 'One-click update needs FormCraft installed from a git checkout.' };
  const gi = gitInfo();
  if (!gi?.available) return { ok: false, error: 'git isn’t available on this server.' };
  if (gi.localChanges) return { ok: false, error: 'This checkout has local code changes, so it can’t update automatically. Commit or discard them first.' };
  if (readUpdateStatus().state === 'running') return { ok: false, error: 'An update is already running.' };
  const script = path.join(ROOT, 'scripts', 'self-update.mjs');
  if (!fs.existsSync(script)) return { ok: false, error: 'scripts/self-update.mjs is missing.' };

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const status: UpdateStatus = { state: 'running', step: 'Starting', startedAt: new Date().toISOString(), from: fromVersion, to: toVersion ?? undefined };
  fs.writeFileSync(UPDATE_STATUS_FILE, JSON.stringify(status));
  const out = fs.openSync(UPDATE_LOG_FILE, 'w', 0o600);
  const child = spawn(process.execPath, [script], {
    cwd: ROOT,
    detached: true,
    stdio: ['ignore', out, out],
    windowsHide: true,
    env: { ...process.env, FC_SERVER_PID: String(process.pid), FC_SUPERVISOR: supervisor(), FC_UPDATE_STATUS: UPDATE_STATUS_FILE },
  });
  child.unref();
  return { ok: true };
}
