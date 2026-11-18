/**
 * Per-form notifications (extra recipients, "only when" condition, daily summary, respondent
 * confirmations). Shared by the builder UI and the server, so no db / WhatsApp imports here.
 */
import { formatAnswer } from './answers';
import { isValidEmail } from './validation';
import type { AlertChannel, Answers, FormAlertCondition, FormField } from './types';

export const MAX_ALERT_RECIPIENTS = 10;
export const ALERT_CHANNELS: AlertChannel[] = ['email', 'whatsapp', 'telegram'];
/** Telegram chat: a numeric id (groups are negative) or a public @channel. */
export const TELEGRAM_CHAT_RE = /^(-?\d{3,20}|@[A-Za-z0-9_]{4,64})$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
/** Question types an "only when" condition can test. */
export const CONDITION_TYPES = ['radio', 'select', 'checkbox', 'text', 'email', 'phone'] as const;
export const MAX_MESSAGE = 1000;
export const MAX_SUBJECT = 150;

export const isConditionField = (f: FormField) => (CONDITION_TYPES as readonly string[]).includes(f.type);

/** Placeholders always available in confirmation messages, besides one per question label. */
export const FIXED_PLACEHOLDERS = ['Form title', 'Date'] as const;

/** Light check usable in the browser; the server also normalizes WhatsApp numbers with the country code. */
export function recipientLooksValid(channel: AlertChannel, to: string) {
  const v = to.trim();
  if (!v) return false;
  if (channel === 'email') return isValidEmail(v);
  if (channel === 'telegram') return TELEGRAM_CHAT_RE.test(v);
  const digits = v.replace(/\D/g, '');
  return /^\+?[\d\s\-().]+$/.test(v) && digits.length >= 7 && digits.length <= 15;
}

/** Whether a response passes the form's "only when" condition (no condition = always). */
export function matchesCondition(cond: FormAlertCondition | undefined, fields: FormField[], answers: Answers) {
  if (!cond?.fieldId || !cond.value?.trim()) return true;
  const field = fields.find((f) => f.id === cond.fieldId);
  if (!field) return true;
  const want = cond.value.trim().toLowerCase();
  const raw = answers[field.id];
  if (raw === undefined || raw === null || raw === '') return false;
  const values = Array.isArray(raw) ? raw.map((x) => String(x).trim().toLowerCase()) : [String(raw).trim().toLowerCase()];
  if (cond.op === 'contains') return values.some((v) => v.includes(want)) || formatAnswer(field, raw).toLowerCase().includes(want);
  return values.some((v) => v === want);
}

/**
 * Fills {Question label}, {Form title} and {Date} (case-insensitive). Unanswered questions become
 * empty; anything in braces that isn't a known placeholder is left as typed.
 */
export function fillPlaceholders(template: string, fields: FormField[], answers: Answers, formTitle: string, date = new Date()) {
  const map = new Map<string, string>();
  for (const f of fields) {
    const key = f.label.trim().toLowerCase();
    if (key && !map.has(key)) map.set(key, formatAnswer(f, answers[f.id]));
  }
  map.set('form title', formTitle);
  map.set('date', date.toISOString().slice(0, 10));
  return template
    .replace(/\{([^{}\n]{1,120})\}/g, (m, k: string) => {
      const v = map.get(k.trim().toLowerCase());
      return v === undefined ? m : v;
    })
    .replace(/[ \t]+([!?.,])/g, '$1');
}

/** A question whose answer makes a good greeting: one labelled "name", else the first short-text one. */
export function greetingField(fields: FormField[]) {
  const text = fields.filter((f) => f.type === 'text' && f.label.trim() && !/[{}]/.test(f.label));
  return text.find((f) => /name|اسم|பெயர்/i.test(f.label)) ?? text[0];
}
