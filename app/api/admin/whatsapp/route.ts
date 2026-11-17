import { NextResponse } from 'next/server';
import { forbidden, getCurrentUser, unauthorized } from '@/lib/auth';
import { waLogout, waStart, waStatus } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

async function admin() {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  if (me.role !== 'ADMIN') return forbidden();
  return null;
}

/** Where the WhatsApp link stands (and the QR to scan while linking). */
export async function GET() {
  const denied = await admin();
  if (denied) return denied;
  return NextResponse.json(waStatus(), { headers: { 'Cache-Control': 'no-store' } });
}

/** POST { action: 'link' | 'unlink' } */
export async function POST(req: Request) {
  const denied = await admin();
  if (denied) return denied;
  const { action } = await req.json().catch(() => ({}));
  if (action === 'link') await waStart();
  else if (action === 'unlink') await waLogout();
  else return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  return NextResponse.json(waStatus());
}
