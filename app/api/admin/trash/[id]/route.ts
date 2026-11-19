import { NextResponse } from 'next/server';
import { forbidden, getCurrentUser, unauthorized } from '@/lib/auth';
import { syncPortListeners } from '@/lib/port-router';
import { deleteTrashItemForever, restoreTrashItem } from '@/lib/trash';

export const dynamic = 'force-dynamic';
type Ctx = { params: { id: string } };

async function admin() {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  if (me.role !== 'ADMIN') return forbidden();
  return null;
}

/** POST → restore this item (a form with its responses, or one response). */
export async function POST(_req: Request, { params }: Ctx) {
  const denied = await admin();
  if (denied) return denied;
  try {
    const result = await restoreTrashItem(params.id);
    if (result.kind === 'form') await syncPortListeners();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not restore it.' }, { status: 409 });
  }
}

/** DELETE → remove this item (and its files) for good. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const denied = await admin();
  if (denied) return denied;
  const deleted = await deleteTrashItemForever(params.id);
  if (!deleted) return NextResponse.json({ error: 'This item is no longer in the Trash.' }, { status: 404 });
  return NextResponse.json({ deleted });
}
