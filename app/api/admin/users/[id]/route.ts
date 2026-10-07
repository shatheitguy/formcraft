import { NextResponse } from 'next/server';
import { forbidden, getCurrentUser, hashPassword, unauthorized } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { activeAdminCount, uniquenessProblem, validateUserInput } from '@/lib/users';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export async function PATCH(req: Request, { params }: Ctx) {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  if (me.role !== 'ADMIN') return forbidden();

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));

  // Lost phone or inbox: turn off every second factor so the user can sign in with the password.
  if (body.resetTwoFactor === true) {
    await prisma.user.update({
      where: { id: target.id },
      data: { totpEnabled: false, totpSecret: null, totpPendingSecret: null, totpLastStep: null, emailOtpEnabled: false, recoveryCodes: '[]' },
    });
    await prisma.loginChallenge.deleteMany({ where: { userId: target.id } });
    return NextResponse.json({ ok: true });
  }

  const { data, error } = validateUserInput(body, { partial: true });
  if (error) return NextResponse.json({ error }, { status: 400 });
  const clash = await uniquenessProblem(data.username, data.email, target.id);
  if (clash) return NextResponse.json({ error: clash }, { status: 409 });

  // Never leave the workspace without an active administrator.
  const losingAdmin = target.role === 'ADMIN' && ((data.role && data.role !== 'ADMIN') || data.active === false);
  if (losingAdmin && (await activeAdminCount(target.id)) === 0) {
    return NextResponse.json({ error: 'You can’t remove the last active admin.' }, { status: 400 });
  }

  const { password, formIds, ...rest } = data;
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: target.id },
      data: { ...rest, ...(password ? { passwordHash: await hashPassword(password) } : {}) },
    });
    if (formIds !== undefined) {
      await tx.formAccess.deleteMany({ where: { userId: target.id } });
      if (formIds.length) await tx.formAccess.createMany({ data: formIds.map((formId) => ({ userId: target.id, formId })) });
    }
    // Password reset or deactivation signs the user out everywhere.
    if (password || data.active === false) await tx.session.deleteMany({ where: { userId: target.id } });
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  if (me.role !== 'ADMIN') return forbidden();
  if (params.id === me.id) return NextResponse.json({ error: 'You can’t delete your own account.' }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (target.role === 'ADMIN' && (await activeAdminCount(target.id)) === 0) {
    return NextResponse.json({ error: 'You can’t delete the last active admin.' }, { status: 400 });
  }
  await prisma.user.delete({ where: { id: target.id } });
  return NextResponse.json({ ok: true });
}
