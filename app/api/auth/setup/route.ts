import { NextResponse } from 'next/server';
import { createSession, hashPassword } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { validateUserInput } from '@/lib/users';

export const dynamic = 'force-dynamic';

/** First-run only: creates the initial administrator account. */
export async function POST(req: Request) {
  if ((await prisma.user.count()) > 0) {
    return NextResponse.json({ error: 'Setup has already been completed.' }, { status: 409 });
  }
  const body = await req.json().catch(() => ({}));
  const { data, error } = validateUserInput(body, { requirePassword: true });
  if (error) return NextResponse.json({ error }, { status: 400 });

  const user = await prisma.user.create({
    data: {
      username: data.username!,
      email: data.email!,
      name: data.name ?? '',
      passwordHash: await hashPassword(data.password!),
      role: 'ADMIN',
      formScope: 'ALL',
      lastLoginAt: new Date(),
    },
  });
  await createSession(user.id);
  return NextResponse.json({ ok: true }, { status: 201 });
}
