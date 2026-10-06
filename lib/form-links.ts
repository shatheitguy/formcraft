import crypto from 'node:crypto';
import { prisma } from './db';

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;
export const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * Pool of ports that may be handed out to forms, from FORM_PORT_RANGE (e.g. "4001-4050").
 * The same range must be published in docker-compose.yml so new forms are reachable
 * without recreating the container.
 */
export function portRange(): { from: number; to: number } | null {
  const m = /^(\d{2,5})\s*-\s*(\d{2,5})$/.exec(process.env.FORM_PORT_RANGE ?? '');
  if (!m) return null;
  const from = Number(m[1]);
  const to = Number(m[2]);
  if (from < 1024 || to > 65535 || to < from || to - from > 1000) return null;
  return { from, to };
}

export function slugify(title: string) {
  return (
    title
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/, '') || 'form'
  );
}

/** Title-based slug plus a short random suffix, guaranteed unused. */
export async function uniqueSlug(title: string) {
  const base = slugify(title);
  for (let i = 0; i < 8; i++) {
    const slug = `${base}-${crypto.randomBytes(3).toString('hex').slice(0, 5)}`;
    if (!(await prisma.form.findFirst({ where: { slug } }))) return slug;
  }
  return `${base}-${crypto.randomBytes(6).toString('hex')}`;
}

export async function nextFreePort(): Promise<number | null> {
  const range = portRange();
  if (!range) return null;
  const used = new Set(
    (await prisma.form.findMany({ where: { port: { not: null } }, select: { port: true } })).map((f) => f.port as number),
  );
  for (let p = range.from; p <= range.to; p++) if (!used.has(p)) return p;
  return null;
}

/** Link fields for a brand-new form. */
export async function newFormLinks(title: string) {
  return { slug: await uniqueSlug(title), port: await nextFreePort() };
}

/** Gives existing forms a slug (and a port, when a pool is configured). Runs on startup. */
export async function backfillLinks() {
  const missing = await prisma.form.findMany({
    where: { OR: [{ slug: null }, ...(portRange() ? [{ port: null }] : [])] },
    orderBy: { createdAt: 'asc' },
  });
  for (const f of missing) {
    await prisma.form.update({
      where: { id: f.id },
      data: { slug: f.slug ?? (await uniqueSlug(f.title)), port: f.port ?? (await nextFreePort()) },
    });
  }
}
