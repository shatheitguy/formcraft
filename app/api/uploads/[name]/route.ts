import fs from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { CONTENT_TYPES, UPLOAD_DIR, UPLOAD_NAME_RE } from '@/lib/uploads';

export const dynamic = 'force-dynamic';

/** Public: serves uploaded images (logos and covers appear on public forms). */
export async function GET(_req: Request, { params }: { params: { name: string } }) {
  if (!UPLOAD_NAME_RE.test(params.name)) return new NextResponse('Not found', { status: 404 });
  try {
    const buf = await fs.readFile(path.join(UPLOAD_DIR, params.name));
    return new NextResponse(buf, {
      headers: {
        'Content-Type': CONTENT_TYPES[params.name.split('.').pop()!],
        // Names are random and content never changes.
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
