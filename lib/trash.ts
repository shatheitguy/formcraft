import type { Form, FormAccess, Submission } from '@prisma/client';
import { prisma } from './db';
import { backfillLinks } from './form-links';
import { parseSchema } from './forms';
import { deleteAnswerFiles, deleteFormFiles } from './response-files';
import type { SessionUser } from './roles';
import type { Answers } from './types';
import { safeJson } from './utils';

/**
 * Trash: deleted forms and responses are copied here (full JSON) before they are deleted, and kept for
 * TRASH_DAYS so an admin can restore them from Settings → Trash. Their uploaded files stay on disk until the
 * item leaves the Trash for good (emptied, deleted forever, or older than TRASH_DAYS).
 */
export const TRASH_DAYS = 30;
const DAY_MS = 86_400_000;

type Row<T> = Omit<T, 'createdAt' | 'updatedAt'> & { createdAt: string; updatedAt?: string };
interface FormSnapshot {
  form: Row<Form>;
  submissions: Row<Submission>[];
  access: FormAccess[];
}
interface SubmissionSnapshot {
  submission: Row<Submission>;
}

export interface TrashEntry {
  id: string;
  kind: 'form' | 'submission';
  formId: string;
  title: string;
  count: number;
  deletedByName: string;
  deletedAt: string;
  expiresAt: string;
  /** Response only: a short preview of its answers. */
  preview?: string;
  /** Response only: its form is no longer there (deleted or in the Trash), so it can't be restored yet. */
  formMissing?: boolean;
}

const who = (me: SessionUser) => ({ deletedById: me.id, deletedByName: me.name || me.username });

/** Moves a form (with all its responses and its access list) to the Trash. Returns the deleted form. */
export async function trashForm(formId: string, me: SessionUser) {
  const form = await prisma.form.findUnique({ where: { id: formId }, include: { submissions: true, access: true } });
  if (!form) return null;
  const { submissions, access, ...row } = form;
  await prisma.$transaction([
    prisma.trashItem.create({
      // Dates become ISO strings in the JSON copy (FormSnapshot).
      data: { kind: 'form', formId, itemId: formId, title: form.title, count: submissions.length, data: JSON.stringify({ form: row, submissions, access }), ...who(me) },
    }),
    prisma.form.delete({ where: { id: formId } }),
  ]);
  return row;
}

/** Moves responses of one form to the Trash (one Trash item each). Returns how many were deleted. */
export async function trashSubmissions(formId: string, ids: string[], me: SessionUser) {
  const [rows, form] = await Promise.all([
    prisma.submission.findMany({ where: { formId, id: { in: ids } } }),
    prisma.form.findUnique({ where: { id: formId }, select: { title: true } }),
  ]);
  if (!rows.length) return 0;
  await prisma.$transaction([
    prisma.trashItem.createMany({
      data: rows.map((s) => ({ kind: 'submission', formId, itemId: s.id, title: form?.title ?? '', count: 1, data: JSON.stringify({ submission: s }), ...who(me) })),
    }),
    prisma.submission.deleteMany({ where: { formId, id: { in: rows.map((r) => r.id) } } }),
  ]);
  return rows.length;
}

/** A few answers of a response, for the Trash list. */
function previewOf(data: string, fieldLabels: Map<string, string>) {
  const answers = safeJson<Answers>(data, {});
  const parts: string[] = [];
  for (const [id, v] of Object.entries(answers)) {
    if (v === undefined || v === null || v === '') continue;
    const text = Array.isArray(v) ? v.join(', ') : String(v);
    if (!text || text.startsWith('{')) continue;
    parts.push(fieldLabels.has(id) ? `${fieldLabels.get(id)}: ${text}` : text);
    if (parts.length >= 2) break;
  }
  return parts.join(' · ').slice(0, 140);
}

export async function listTrash(): Promise<TrashEntry[]> {
  const items = await prisma.trashItem.findMany({ orderBy: { deletedAt: 'desc' }, take: 1000 });
  const formIds = [...new Set(items.filter((i) => i.kind === 'submission').map((i) => i.formId))];
  const forms = formIds.length ? await prisma.form.findMany({ where: { id: { in: formIds } }, select: { id: true, schema: true } }) : [];
  const labels = new Map(forms.map((f) => [f.id, new Map(parseSchema(f.schema).fields.map((x) => [x.id, x.label]))]));
  return items.map((i) => {
    const entry: TrashEntry = {
      id: i.id,
      kind: i.kind === 'form' ? 'form' : 'submission',
      formId: i.formId,
      title: i.title,
      count: i.count,
      deletedByName: i.deletedByName,
      deletedAt: i.deletedAt.toISOString(),
      expiresAt: new Date(i.deletedAt.getTime() + TRASH_DAYS * DAY_MS).toISOString(),
    };
    if (entry.kind === 'submission') {
      const snap = safeJson<SubmissionSnapshot | null>(i.data, null);
      entry.preview = snap ? previewOf(snap.submission.data, labels.get(i.formId) ?? new Map()) : '';
      entry.formMissing = !labels.has(i.formId);
    }
    return entry;
  });
}

const date = (v: string | undefined) => (v ? new Date(v) : new Date());

/** Puts a Trash item back. Throws an Error with a message for the person when it can't. */
export async function restoreTrashItem(id: string) {
  const item = await prisma.trashItem.findUnique({ where: { id } });
  if (!item) throw new Error('This item is no longer in the Trash.');

  if (item.kind === 'submission') {
    const snap = safeJson<SubmissionSnapshot | null>(item.data, null);
    if (!snap) throw new Error('This item could not be read.');
    const form = await prisma.form.findUnique({ where: { id: item.formId }, select: { id: true } });
    if (!form) throw new Error('Its form is deleted. Restore the form first, then this response.');
    const s = snap.submission;
    await prisma.$transaction([
      prisma.submission.upsert({
        where: { id: s.id },
        update: {},
        create: { id: s.id, formId: s.formId, data: s.data, score: s.score, maxScore: s.maxScore, language: s.language, respondentId: s.respondentId, ipHash: s.ipHash, createdAt: date(s.createdAt) },
      }),
      prisma.trashItem.delete({ where: { id } }),
    ]);
    return { kind: 'submission' as const, formId: item.formId };
  }

  const snap = safeJson<FormSnapshot | null>(item.data, null);
  if (!snap) throw new Error('This item could not be read.');
  if (await prisma.form.findUnique({ where: { id: item.formId }, select: { id: true } })) throw new Error('This form already exists.');
  const f = snap.form;
  // Its public link, port or domain may have been given to another form meanwhile: then it gets new ones.
  const [slugTaken, portTaken, domainTaken] = await Promise.all([
    f.slug ? prisma.form.count({ where: { slug: f.slug } }) : 0,
    f.port ? prisma.form.count({ where: { port: f.port } }) : 0,
    f.customDomain ? prisma.form.count({ where: { customDomain: f.customDomain } }) : 0,
  ]);
  const users = new Set((await prisma.user.findMany({ where: { id: { in: snap.access.map((a) => a.userId) } }, select: { id: true } })).map((u) => u.id));
  const createdBy = f.createdById ? await prisma.user.count({ where: { id: f.createdById } }) : 0;
  await prisma.$transaction(async (tx) => {
    await tx.form.create({
      data: {
        id: f.id,
        title: f.title,
        description: f.description,
        category: f.category,
        tags: f.tags,
        status: f.status,
        schema: f.schema,
        slug: slugTaken ? null : f.slug,
        port: portTaken ? null : f.port,
        customDomain: domainTaken ? null : f.customDomain,
        createdById: createdBy ? f.createdById : null,
        createdAt: date(f.createdAt),
      },
    });
    const subs = snap.submissions;
    for (let i = 0; i < subs.length; i += 500) {
      await tx.submission.createMany({
        data: subs.slice(i, i + 500).map((s) => ({ id: s.id, formId: f.id, data: s.data, score: s.score, maxScore: s.maxScore, language: s.language, respondentId: s.respondentId, ipHash: s.ipHash, createdAt: date(s.createdAt) })),
      });
    }
    const access = snap.access.filter((a) => users.has(a.userId));
    if (access.length) await tx.formAccess.createMany({ data: access.map((a) => ({ userId: a.userId, formId: f.id })) });
    await tx.trashItem.delete({ where: { id } });
  });
  if (slugTaken || portTaken) await backfillLinks();
  return { kind: 'form' as const, formId: item.formId, changedLink: !!(slugTaken || portTaken || domainTaken) };
}

/** Removes Trash items for good, together with their uploaded files. */
async function purge(items: { id: string; kind: string; formId: string; data: string }[]) {
  if (!items.length) return 0;
  const goneForms = items.filter((i) => i.kind === 'form').map((i) => i.formId);
  for (const formId of goneForms) await deleteFormFiles(formId);
  // Responses: remove their files (only when the form still exists; otherwise its folder is gone already).
  const subs = items.filter((i) => i.kind === 'submission' && !goneForms.includes(i.formId));
  const formIds = [...new Set(subs.map((s) => s.formId))];
  const forms = formIds.length ? await prisma.form.findMany({ where: { id: { in: formIds } }, select: { id: true, schema: true } }) : [];
  for (const f of forms) {
    const answers = subs.filter((s) => s.formId === f.id).map((s) => safeJson<Answers>(safeJson<SubmissionSnapshot | null>(s.data, null)?.submission.data ?? '{}', {}));
    await deleteAnswerFiles(f.id, parseSchema(f.schema).fields, answers).catch(() => {});
  }
  const { count } = await prisma.trashItem.deleteMany({
    // A form deleted for good also takes its trashed responses with it (they can't be restored without it).
    where: { OR: [{ id: { in: items.map((i) => i.id) } }, ...(goneForms.length ? [{ kind: 'submission', formId: { in: goneForms } }] : [])] },
  });
  return count;
}

export async function deleteTrashItemForever(id: string) {
  const item = await prisma.trashItem.findUnique({ where: { id } });
  if (!item) return 0;
  return purge([item]);
}

export async function emptyTrash() {
  return purge(await prisma.trashItem.findMany());
}

/** Items older than TRASH_DAYS are removed for good. */
export async function purgeExpiredTrash() {
  const cutoff = new Date(Date.now() - TRASH_DAYS * DAY_MS);
  return purge(await prisma.trashItem.findMany({ where: { deletedAt: { lt: cutoff } } }));
}

const g = globalThis as unknown as { __fcTrashTimer?: ReturnType<typeof setInterval> };

/** Empties expired Trash items every hour (once per process; first run shortly after boot). */
export function startTrashPurge() {
  if (g.__fcTrashTimer) return;
  const run = () => void purgeExpiredTrash().catch((e) => console.error('[formcraft] trash purge:', e instanceof Error ? e.message : e));
  g.__fcTrashTimer = setInterval(run, 3_600_000);
  g.__fcTrashTimer.unref?.();
  setTimeout(run, 30_000).unref?.();
}
