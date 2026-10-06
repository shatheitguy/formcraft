import { NextResponse } from 'next/server';
import { forbidden, getCurrentUser, unauthorized } from '@/lib/auth';
import { syncPortListeners } from '@/lib/port-router';
import { createSystemBackup, parseBackup, restoreSystemBackup } from '@/lib/system-backup';

export const dynamic = 'force-dynamic';

async function admin() {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  if (me.role !== 'ADMIN') return forbidden();
  return null;
}

/** Download a full system backup (.fcbackup = gzip JSON). */
export async function GET() {
  const denied = await admin();
  if (denied) return denied;
  const { buffer } = await createSystemBackup();
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/gzip',
      'Content-Disposition': `attachment; filename="formcraft-system-backup-${stamp}.fcbackup"`,
      'Cache-Control': 'no-store',
    },
  });
}

/** Restore: multipart `file` + `confirm=RESTORE`. Replaces ALL data; everyone is signed out. */
export async function POST(req: Request) {
  const denied = await admin();
  if (denied) return denied;
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (form?.get('confirm') !== 'RESTORE') return NextResponse.json({ error: 'Type RESTORE to confirm.' }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a backup file.' }, { status: 400 });

  let backup;
  try {
    backup = parseBackup(Buffer.from(await file.arrayBuffer()));
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
