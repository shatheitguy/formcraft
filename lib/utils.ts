export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

/** Short random id. Avoids crypto.randomUUID, which is unavailable on plain-HTTP LAN origins. */
export function uid(prefix = '') {
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);
}

type Translate = (key: string, vars?: Record<string, string | number>) => string;
const english: Translate = (k, v) => (v ? k.replace(/\{(\w+)\}/g, (_, x) => String(v[x] ?? '')) : k);

/** "3 hours ago". Pass `t` from useT()/getServerT() to translate it. */
export function timeAgo(input: string | Date, t: Translate = english) {
  const date = typeof input === 'string' ? new Date(input) : input;
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 45) return t('just now');
  const units: [number, string][] = [
    [60, 'minute'],
    [3600, 'hour'],
    [86400, 'day'],
    [604800, 'week'],
    [2629800, 'month'],
    [31557600, 'year'],
  ];
  let unit = units[0];
  for (const u of units) if (seconds >= u[0]) unit = u;
  const n = Math.max(1, Math.round(seconds / unit[0]));
  return n === 1 ? t(`1 ${unit[1]} ago`) : t(`{n} ${unit[1]}s ago`, { n });
}

/** Intl locale for dates: the UI language (Latin digits for Arabic, so tables stay aligned). */
export const intlLocale = (locale?: string) => (locale === 'ar' ? 'ar-u-nu-latn' : locale === 'ta' ? 'ta-IN' : locale === 'en' ? 'en-US' : undefined);

export function formatDateTime(input: string | Date, locale?: string) {
  const date = typeof input === 'string' ? new Date(input) : input;
  return date.toLocaleString(intlLocale(locale), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDate(input: string, locale?: string) {
  // Date-only strings (YYYY-MM-DD) are rendered without timezone shifting.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  const date = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(input);
  if (isNaN(date.getTime())) return input;
  return date.toLocaleDateString(intlLocale(locale), { month: 'short', day: 'numeric', year: 'numeric' });
}

export function pluralize(n: number, word: string, plural = word + 's') {
  return `${n.toLocaleString()} ${n === 1 ? word : plural}`;
}

export function safeJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
