import { NextResponse } from 'next/server';
import { canViewForm, getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { fileLimits } from '@/lib/files';
import { parseSchema } from '@/lib/forms';
import { clientIp, saveResponseFile, uploadRateLimited } from '@/lib/response-files';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

/**
 * Public: a respondent attaches one file to a "File upload" question.
 * multipart/form-data with `fieldId` and `file`. Returns { ref } — the value to put in the answer.
 * Only ACTIVE forms accept uploads (drafts only for signed-in users who can see the form).
 */
export async function POST(req: Request, { params }: Ctx) {
  const form = await prisma.form.findUnique({ where: { id: params.id } });
  if (!form) return NextResponse.json({ error: 'Form not found' }, { status: 404 });
  if (form.status !== 'ACTIVE') {
    const me = await getCurrentUser();
    if (!me || !canViewForm(me, form.id)) return NextResponse.json({ error: 'This form is not accepting responses right now.' }, { status: 403 });
  }

  const fieldId = new URL(req.url).searchParams.get('fieldId');
  const schema = parseSchema(form.schema);
  let field = schema.fields.find((f) => f.id === fieldId && f.type === 'file');

  // Reject oversized bodies before reading them (limit + room for the multipart envelope).
  // A length is required (browsers always send one for FormData), so a chunked body can't bypass the limit.
  const declared = Number(req.headers.get('content-length'));
  if (!Number.isFinite(declared) || declared <= 0) return NextResponse.json({ error: 'No file received.' }, { status: 411 });
  const ceiling = (field ? fileLimits(field).maxFileMb : 25) * 1024 * 1024 + 64 * 1024;
  if (declared > ceiling) return NextResponse.json({ error: 'The file is too large.' }, { status: 413 });

  if (uploadRateLimited(clientIp(req), declared, form.id)) {
    return NextResponse.json({ error: 'Too many uploads — please wait a few minutes and try again.' }, { status: 429 });
  }

  const data = await req.formData().catch(() => null);
  if (!field) {
    const id = data?.get('fieldId');
    field = schema.fields.find((f) => f.id === id && f.type === 'file');
  }
  if (!field) return NextResponse.json({ error: 'This question doesn’t accept files.' }, { status: 400 });
  const file = data?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file received.' }, { status: 400 });

  try {
    const result = await saveResponseFile(form.id, field, file);
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    console.error('[formcraft] response file upload failed', e);
    return NextResponse.json({ error: 'Could not save the file. Please try again.' }, { status: 500 });
  }
}
