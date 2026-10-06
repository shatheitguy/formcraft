import { NextResponse } from 'next/server';
import { forbidden, getCurrentUser, hashPassword, unauthorized } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { uniquenessProblem, validateUserInput } from '@/lib/users';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  if (me.role !== 'ADMIN') return forbidden();

  const body = await req.json().catch(() => ({}));
  const { data, error } = validateUserInput(body, { requirePassword: true });
  if (error) return NextResponse.json({ error }, { status: 400 });
  const clash = await uniquenessProblem(data.username, data.email);
  if (clash) return NextResponse.json({ error: clash }, { status: 409 });

  const user = await prisma.user.create({
    data: {
      username: data.username!,
      email: data.email!,
      name: data.name ?? '',
      passwordHash: await hashPassword(data.password!),
      role: data.role ?? 'VIEWER',
      formScope: data.formScope ?? 'ALL',
      active: data.active ?? true,
      formAccess: data.formScope === 'SELECTED' && data.formIds?.length ? { create: data.formIds.map((formId) => ({ formId })) } : undefined,
    },
  });
  return NextResponse.json({ id: user.id }, { status: 201 });
}
