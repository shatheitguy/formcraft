import { NextResponse } from 'next/server';
import { forbidden, getCurrentUser, unauthorized } from '@/lib/auth';
import { emptyTrash, listTrash, TRASH_DAYS } from '@/lib/trash';

export const dynamic = 'force-dynamic';

async function admin() {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  if (me.role !== 'ADMIN') return forbidden();
  return null;
}

/** GET → everything in the Trash (newest first). */
export async function GET() {
  const denied = await admin();
  if (denied) return denied;
  return NextResponse.json({ items: await listTrash(), days: TRASH_DAYS });
}

/** DELETE → empty the Trash: removes every item and its files for good. */
export async function DELETE() {
  const denied = await admin();
  if (denied) return denied;
  return NextResponse.json({ deleted: await emptyTrash() });
}
