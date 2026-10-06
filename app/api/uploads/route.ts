import { NextResponse } from 'next/server';
import { canCreateForms, forbidden, getCurrentUser, unauthorized } from '@/lib/auth';
import { saveUpload } from '@/lib/uploads';

export const dynamic = 'force-dynamic';

/** multipart/form-data with a `file` field (and optional `purpose=avatar`). */
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  const form = await req.formData().catch(() => null);
  // Any signed-in user may upload their own profile photo; other images are for form builders.
  if (form?.get('purpose') !== 'avatar' && !canCreateForms(me)) return forbidden();
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file received.' }, { status: 400 });

  const result = await saveUpload(file);
  if ('error' in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result, { status: 201 });
}
