import fs from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { canViewForm, forbidden, getCurrentUser, unauthorized } from '@/lib/auth';
import { cleanOriginalName } from '@/lib/files';
import { contentTypeFor, isInlineSafe, storedFilePath } from '@/lib/response-files';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string; name: string } };

/** Signed-in users who can view the form download a respondent's file. Never public. */
export async function GET(req: Request, { params }: Ctx) {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  if (!canViewForm(me, params.id)) return forbidden();

  let stored = params.name;
  try {
    stored = decodeURIComponent(stored);
  } catch {
    /* keep as is */
  }
  const p = storedFilePath(params.id, stored);
  if (!p) return new NextResponse('Not found', { status: 404 });

  const buf = await fs.readFile(p).catch(() => null);
  if (!buf) return new NextResponse('Not found', { status: 404 });

  const url = new URL(req.url);
  // The display name comes from the answer (passed by the UI); fall back to the stored name.
  const fallback = stored.slice(33);
  const asked = url.searchParams.get('name');
  const name = asked ? cleanOriginalName(asked) : fallback;
  const inline = isInlineSafe(stored) && url.searchParams.get('download') !== '1';
  const asciiName = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');

  const headers: Record<string, string> = {
    'Content-Type': contentTypeFor(stored),
    'Content-Length': String(buf.length),
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, max-age=3600',
  };
  // PDFs need the browser's viewer; everything else is sandboxed in case it is opened directly.
  if (!stored.toLowerCase().endsWith('.pdf')) headers['Content-Security-Policy'] = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox";
  return new NextResponse(buf, { headers });
}
