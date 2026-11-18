import { prisma } from './db';
import type { SessionUser } from './roles';
import { effectiveEvents, type NotifyEvent } from './notify-prefs';
import { safeJson } from './utils';

/**
 * In-app notifications (the bell in the top bar). Messages are stored as a type plus
 * data and translated when shown, so each person reads them in their own language.
 */
export type ActivityType = 'form.published' | 'form.drafted' | 'form.created' | 'form.deleted' | 'submission' | 'update.available' | 'backup.failed';

export interface ActivityData {
  form?: string;
  formId?: string;
  actor?: string;
  actorId?: string;
  count?: number;
  version?: string;
  current?: string;
  error?: string;
}

const KEEP_DAYS = 90;
const KEEP_PER_USER = 200;

/** Active users who can see a form (admins, everyone with all-forms access, and those given it). */
async function audience(formId: string) {
  const users = await prisma.user.findMany({
    where: { active: true, OR: [{ role: 'ADMIN' }, { formScope: 'ALL' }, { formAccess: { some: { formId } } }] },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

/** Of these users, the active ones who want this kind of notification (their choice or required by an admin). */
async function wanting(ids: string[], kind: NotifyEvent) {
  if (!ids.length) return [];
  const users = await prisma.user.findMany({ where: { id: { in: ids }, active: true }, select: { id: true, role: true, notifyEvents: true, forcedNotify: true } });
  return users.filter((u) => effectiveEvents(u).has(kind)).map((u) => u.id);
}

/** Email / Telegram / WhatsApp copies of a bell notification, fire-and-forget (loaded lazily: notify pulls in mail, reports, WhatsApp). */
function alertExternally(alert: import('./notify').EventAlert) {
  void import('./notify').then((m) => m.sendEventAlerts(alert)).catch((err) => console.error('[formcraft] event alert failed', err));
}

const FORM_VERB: Record<string, string> = { 'form.published': 'published', 'form.drafted': 'moved to draft', 'form.created': 'created', 'form.deleted': 'deleted' };

async function prune() {
  await prisma.notification.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - KEEP_DAYS * 86_400_000) } } });
}

/** Records a form action for everyone who can see the form, the person who did it included. Never throws. */
export async function notifyFormEvent(type: Exclude<ActivityType, 'submission' | 'update.available' | 'backup.failed'>, actor: SessionUser, form: { id: string; title: string }, audienceIds?: string[]) {
  try {
    const everyone = audienceIds ?? (await audience(form.id));
    // The person who acted sees it in the bell too (even with selected-forms access), if they follow form changes.
    const ids = await wanting([...new Set([...everyone, actor.id])], 'form');
    const who = actor.name || actor.username;
    const data: ActivityData = { form: form.title, formId: form.id, actor: who, actorId: actor.id };
    const link = type === 'form.deleted' ? '/' : `/forms/${form.id}/edit`;
    if (ids.length) await prisma.notification.createMany({ data: ids.map((userId) => ({ userId, type, data: JSON.stringify(data), link })) });
    await prune();
    // Other people's email / Telegram / WhatsApp; nobody gets a message about their own action.
    const verb = FORM_VERB[type];
    alertExternally({
      kind: 'form',
      userIds: everyone.filter((id) => id !== actor.id),
      formId: form.id,
      subject: `${form.title} was ${verb}`,
      text: `${form.title} was ${verb} by ${who}.`,
      link: type === 'form.deleted' ? undefined : link,
    });
  } catch (err) {
    console.error('[formcraft] activity notification failed', err);
  }
}

/** Ids of everyone who can see a form, read before it is deleted. */
export const formAudience = (formId: string) => audience(formId).catch(() => [] as string[]);

/**
 * New response. Unread notifications for the same form are grouped ("12 new responses")
 * instead of piling up one per submission. Never throws.
 */
export async function notifySubmissionInApp(form: { id: string; title: string }) {
  try {
    const ids = await wanting(await audience(form.id), 'submission');
    if (!ids.length) return;
    const open = await prisma.notification.findMany({ where: { userId: { in: ids }, type: 'submission', readAt: null, link: `/forms/${form.id}/submissions` } });
    const byUser = new Map(open.map((n) => [n.userId, n]));
    await prisma.$transaction(
      ids.map((userId) => {
        const prev = byUser.get(userId);
        const count = (safeJson<ActivityData>(prev?.data ?? '{}', {}).count ?? 0) + 1;
        const data = JSON.stringify({ form: form.title, formId: form.id, count } satisfies ActivityData);
        return prev
          ? prisma.notification.update({ where: { id: prev.id }, data: { data, createdAt: new Date() } })
          : prisma.notification.create({ data: { userId, type: 'submission', data, link: `/forms/${form.id}/submissions` } });
      }),
    );
  } catch (err) {
    console.error('[formcraft] submission notification failed', err);
  }
}

/** Latest notifications for one user, plus how many are unread. Trims the oldest beyond the cap. */
export async function listNotifications(userId: string, take = 30) {
  const [items, unread, total] = await Promise.all([
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take }),
    prisma.notification.count({ where: { userId, readAt: null } }),
    prisma.notification.count({ where: { userId } }),
  ]);
  if (total > KEEP_PER_USER) {
    const cutoff = await prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, skip: KEEP_PER_USER, take: 1, select: { createdAt: true } });
    if (cutoff[0]) await prisma.notification.deleteMany({ where: { userId, createdAt: { lte: cutoff[0].createdAt } } });
  }
  return {
    unread,
    items: items.map((n) => ({ id: n.id, type: n.type as ActivityType, data: safeJson<ActivityData>(n.data, {}), link: n.link, read: !!n.readAt, createdAt: n.createdAt.toISOString() })),
  };
}

/* ------------------------------ software updates ------------------------------ */

export const CURRENT_VERSION = process.env.FC_VERSION || '0.0.0';
const VERSION_URL = process.env.FC_UPDATE_URL || 'https://raw.githubusercontent.com/shatheitguy/formcraft/main/VERSION';
const CHECK_EVERY = 6 * 3600_000;

/** a > b for dotted numeric versions ("1.10.0" > "1.9.3"). */
export function newerVersion(a: string, b: string) {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  }
  return false;
}

/** Asks GitHub for the newest version; tells every admin once per new version. FC_UPDATE_CHECK=false turns it off. */
export async function checkForUpdate(force = false) {
  if (process.env.FC_UPDATE_CHECK === 'false' && !force) return null;
  try {
    const res = await fetch(VERSION_URL, { signal: AbortSignal.timeout(10_000), cache: 'no-store' });
    if (!res.ok) return null;
    const latest = (await res.text()).trim();
    if (!/^\d+(\.\d+){1,3}$/.test(latest)) return null;
    await prisma.appMeta.upsert({ where: { key: 'update.latest' }, create: { key: 'update.latest', value: latest }, update: { value: latest } });
    if (!newerVersion(latest, CURRENT_VERSION)) return latest;

    const told = await prisma.appMeta.findUnique({ where: { key: 'update.notified' } });
    if (told?.value === latest) return latest;
    const admins = await systemAdmins();
    const data = JSON.stringify({ version: latest, current: CURRENT_VERSION } satisfies ActivityData);
    const link = 'https://github.com/shatheitguy/formcraft/commits/main';
    if (admins.length) await prisma.notification.createMany({ data: admins.map((userId) => ({ userId, type: 'update.available', data, link })) });
    alertExternally({ kind: 'system', userIds: admins, subject: `FormCraft ${latest} is available`, text: `FormCraft ${latest} is available (you have ${CURRENT_VERSION}).`, link });
    await prisma.appMeta.upsert({ where: { key: 'update.notified' }, create: { key: 'update.notified', value: latest }, update: { value: latest } });
    return latest;
  } catch {
    return null; // offline or GitHub unreachable: try again next time
  }
}

/** Starts the periodic update check (once per process). */
export function startUpdateChecks() {
  const g = globalThis as unknown as { __fcUpdateTimer?: NodeJS.Timeout };
  if (g.__fcUpdateTimer) return;
  void checkForUpdate();
  g.__fcUpdateTimer = setInterval(() => void checkForUpdate(), CHECK_EVERY);
  g.__fcUpdateTimer.unref?.();
}

export async function latestKnownVersion() {
  const row = await prisma.appMeta.findUnique({ where: { key: 'update.latest' } }).catch(() => null);
  return row?.value ?? null;
}

/** Active admins who get system alerts (their choice or required). */
async function systemAdmins() {
  const admins = await prisma.user.findMany({ where: { active: true, role: 'ADMIN' }, select: { id: true } });
  return wanting(admins.map((a) => a.id), 'system');
}

/** Tells every active admin who gets system alerts that an automatic backup failed. Never throws. */
export async function notifyBackupFailed(error: string) {
  try {
    const admins = await systemAdmins();
    const data = JSON.stringify({ error: error.slice(0, 300) } satisfies ActivityData);
    if (admins.length) await prisma.notification.createMany({ data: admins.map((userId) => ({ userId, type: 'backup.failed', data, link: '/settings/database' })) });
    alertExternally({ kind: 'system', userIds: admins, subject: 'Automatic backup failed', text: `Automatic backup failed: ${error.slice(0, 300)}`, link: '/settings/database' });
  } catch (err) {
    console.error('[formcraft] backup failure notification failed', err);
  }
}
