import fs from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { forbidden, getCurrentUser, unauthorized } from '@/lib/auth';
import { BACKUP_DIR, backupPath, deleteBackup, listBackups, readState, runBackup } from '@/lib/auto-backup';
import { syncPortListeners } from '@/lib/port-router';
import { getSettings } from '@/lib/settings';
import { parseBackup, restoreSystemBackup } from '@/lib/system-backup';

export const dynamic = 'force-dynamic';

async function admin() {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  if (me.role !== 'ADMIN') return forbidden();
  return null;
}

async function overview() {
  const [backups, state, settings] = await Promise.all([listBackups(), readState(), getSettings()]);
  return { backups, state, settings: settings.backup, dir: BACKUP_DIR };
}

/** GET → stored backups, last run and settings. GET ?download=<name> → that file. */
export async function GET(req: Request) {
  const denied = await admin();
  if (denied) return denied;
  const name = new URL(req.url).searchParams.get('download');
  if (name === null) return NextResponse.json(await overview());

  const file = await backupPath(name);
  if (!file) return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
  const buf = await fs.readFile(file);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/gzip',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
    },
  });
}

/** POST { action: 'run' } backs up now; { action: 'restore', name, confirm: 'RESTORE' } restores a stored backup. */
export async function POST(req: Request) {
  const denied = await admin();
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));

  if (body.action === 'run') {
    const result = await runBackup('manual');
    if (!result?.ok) return NextResponse.json({ error: `Backup failed: ${result?.error ?? 'unknown error'}` }, { status: 500 });
    return NextResponse.json({ ok: true, result, ...(await overview()) });
  }

  if (body.action === 'restore') {
    if (body.confirm !== 'RESTORE') return NextResponse.json({ error: 'Type RESTORE to confirm.' }, { status: 400 });
    const file = await backupPath(body.name);
    if (!file) return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
    let backup;
    try {
      backup = parseBackup(await fs.readFile(file));
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Invalid backup' }, { status: 400 });
    }
    if (!backup.tables.user?.some((u) => u.role === 'ADMIN' && u.active !== false)) {
      return NextResponse.json({ error: 'This backup has no active admin account — restoring it would lock everyone out.' }, { status: 400 });
    }
    try {
      const result = await restoreSystemBackup(backup);
      await syncPortListeners();
      return NextResponse.json({ ok: true, ...result });
    } catch (e) {
      console.error('[formcraft] restore failed', e);
      return NextResponse.json({ error: `Restore failed and was rolled back: ${e instanceof Error ? e.message.split('\n').slice(-1)[0] : e}` }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

/** DELETE ?name=<file> removes one stored backup. */
export async function DELETE(req: Request) {
  const denied = await admin();
  if (denied) return denied;
  const ok = await deleteBackup(new URL(req.url).searchParams.get('name')).catch(() => false);
  if (!ok) return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
  return NextResponse.json({ ok: true, ...(await overview()) });
}
