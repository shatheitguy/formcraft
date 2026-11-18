/**
 * What each person is notified about, and what an admin requires them to receive.
 * Shared by the server (bell + email / Telegram / WhatsApp) and the settings screens, so no db imports here.
 */

/** Kinds of alerts a person can choose. "system" only applies to admins. */
export const NOTIFY_EVENTS = ['submission', 'form', 'system'] as const;
export type NotifyEvent = (typeof NOTIFY_EVENTS)[number];

export const NOTIFY_CHANNELS = ['email', 'telegram', 'whatsapp'] as const;
export type NotifyChannel = (typeof NOTIFY_CHANNELS)[number];

export interface ForcedNotify {
  channels: NotifyChannel[];
  events: NotifyEvent[];
}

export const EVENT_INFO: Record<NotifyEvent, { label: string; text: string }> = {
  submission: { label: 'New responses', text: 'When a form you follow gets a response.' },
  form: { label: 'Form changes', text: 'Forms published, moved to draft, created or deleted.' },
  system: { label: 'System alerts', text: 'A new FormCraft version, or an automatic backup that failed.' },
};

export const CHANNEL_LABEL: Record<NotifyChannel, string> = { email: 'Email', telegram: 'Telegram', whatsapp: 'WhatsApp' };

/** User column holding each channel's own on/off switch. */
export const CHANNEL_FIELD = { email: 'emailNotifications', telegram: 'telegramNotifications', whatsapp: 'whatsappNotifications' } as const;

const isEvent = (x: unknown): x is NotifyEvent => typeof x === 'string' && (NOTIFY_EVENTS as readonly string[]).includes(x);
const isChannel = (x: unknown): x is NotifyChannel => typeof x === 'string' && (NOTIFY_CHANNELS as readonly string[]).includes(x);

function parse(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Cleans a list of event kinds (array or JSON string); null when it isn't a list. */
export function normalizeEvents(input: unknown): NotifyEvent[] | null {
  const v = parse(input);
  if (!Array.isArray(v)) return null;
  return NOTIFY_EVENTS.filter((e) => v.some((x) => x === e && isEvent(x)));
}

/** The user's own choice; everything when unset or unreadable (today's behaviour). */
export const parseNotifyEvents = (raw: unknown): NotifyEvent[] => normalizeEvents(raw) ?? [...NOTIFY_EVENTS];

/** Cleans admin-required notifications (object or JSON string); empty when unreadable. */
export function normalizeForced(input: unknown): ForcedNotify {
  const v = parse(input) as Partial<Record<keyof ForcedNotify, unknown>> | undefined;
  const list = <T extends string>(x: unknown, all: readonly T[], ok: (y: unknown) => boolean) =>
    Array.isArray(x) ? all.filter((a) => x.some((y) => y === a && ok(y))) : [];
  return {
    channels: list(v?.channels, NOTIFY_CHANNELS, isChannel),
    events: list(v?.events, NOTIFY_EVENTS, isEvent),
  };
}

export const hasForced = (f: ForcedNotify) => f.channels.length > 0 || f.events.length > 0;

type PrefUser = {
  role: string;
  notifyEvents: string;
  forcedNotify: string;
  emailNotifications: boolean;
  telegramNotifications: boolean;
  whatsappNotifications: boolean;
};

/** Kinds this user receives: their own choice plus what an admin requires. System alerts are admin-only. */
export function effectiveEvents(u: Pick<PrefUser, 'role' | 'notifyEvents' | 'forcedNotify'>): Set<NotifyEvent> {
  const set = new Set<NotifyEvent>([...parseNotifyEvents(u.notifyEvents), ...normalizeForced(u.forcedNotify).events]);
  if (u.role !== 'ADMIN') set.delete('system');
  return set;
}

/** Whether a channel is on for this user: their own switch, or required by an admin. */
export const channelOn = (u: PrefUser, channel: NotifyChannel) => u[CHANNEL_FIELD[channel]] || normalizeForced(u.forcedNotify).channels.includes(channel);
