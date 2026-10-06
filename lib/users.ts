import { passwordProblem } from './auth';
import { prisma } from './db';
import type { FormScope, Role } from './roles';
import { isValidEmail } from './validation';

export const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;

export interface UserInput {
  username?: string;
  email?: string;
  name?: string;
  password?: string;
  role?: Role;
  formScope?: FormScope;
  formIds?: string[];
  active?: boolean;
}

/** Normalizes and validates user fields present in `body`. */
export function validateUserInput(body: Record<string, unknown>, opts: { requirePassword?: boolean; partial?: boolean } = {}) {
  const data: UserInput = {};
  const need = (k: string) => !opts.partial || body[k] !== undefined;

  if (need('username')) {
    const u = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
    if (!USERNAME_RE.test(u)) return { data, error: 'Username must be 3–32 characters: letters, numbers, dot, dash or underscore.' };
    data.username = u;
  }
  if (need('email')) {
    const e = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!isValidEmail(e)) return { data, error: 'Enter a valid email address.' };
    data.email = e;
  }
  if (body.name !== undefined) data.name = String(body.name).trim().slice(0, 80);
  if (opts.requirePassword || (body.password !== undefined && body.password !== '')) {
    const p = passwordProblem(body.password);
    if (p) return { data, error: p };
    data.password = body.password as string;
  }
  if (body.role !== undefined) {
    if (!['ADMIN', 'EDITOR', 'VIEWER'].includes(body.role as string)) return { data, error: 'Invalid role.' };
    data.role = body.role as Role;
  }
  if (body.formScope !== undefined) data.formScope = body.formScope === 'SELECTED' ? 'SELECTED' : 'ALL';
  if (body.formIds !== undefined) {
    data.formIds = Array.isArray(body.formIds) ? body.formIds.filter((x): x is string => typeof x === 'string') : [];
  }
  if (body.active !== undefined) data.active = !!body.active;
  return { data, error: null };
}

/** Returns a conflict message if the username or email is taken by another user. */
export async function uniquenessProblem(username: string | undefined, email: string | undefined, exceptId?: string) {
  if (!username && !email) return null;
  const clash = await prisma.user.findFirst({
    where: {
      id: exceptId ? { not: exceptId } : undefined,
      OR: [...(username ? [{ username }] : []), ...(email ? [{ email }] : [])],
    },
  });
  if (!clash) return null;
  return clash.username === username ? 'That username is already taken.' : 'That email is already in use.';
}

export async function activeAdminCount(exceptId?: string) {
  return prisma.user.count({ where: { role: 'ADMIN', active: true, id: exceptId ? { not: exceptId } : undefined } });
}
