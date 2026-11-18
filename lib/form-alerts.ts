// Per-form notifications on the server: cleaning what the builder saves, the message sent to the
// person who filled the form, and the once-a-day summary for extra recipients.
import { TERMS_AGREED } from './fields';
import { prisma } from './db';
import {
  ALERT_CHANNELS,
  fillPlaceholders,
  isConditionField,
  matchesCondition,
  MAX_ALERT_RECIPIENTS,
  MAX_MESSAGE,
  MAX_SUBJECT,
  TELEGRAM_CHAT_RE,
  TIME_RE,
} from './form-alerts-shared';
import { parseSchema } from './forms';
import { deliver, emailLayout, esc, sendEmail, sendTelegram, sendWhatsApp } from './notify';
import { buildReport, REPORT_MIME, reportFileName } from './reports';
import { getSettings, type AllSettings } from './settings';
import type { AlertChannel, Answers, FormAlertRecipient, FormConfirm, FormField, FormSettings, SubmissionDTO } from './types';
import { safeJson } from './utils';
import { isValidEmail } from './validation';
import { waNumber, waStatus, type WaDocument } from './whatsapp';

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

export function workspaceChannels(settings: AllSettings): Record<AlertChannel, boolean> {
  return {
    email: settings.smtp.enabled && !!settings.smtp.host,
    telegram: settings.telegram.enabled && !!settings.telegram.botToken,
    whatsapp: settings.whatsapp.enabled && waStatus().status === 'on',
  };
}

/* ------------------------------ cleaning ------------------------------ */

/** One extra recipient, or null when it isn't valid (WhatsApp numbers are stored as +digits). */
export function cleanRecipient(v: unknown, defaultCountry: string): FormAlertRecipient | null {
  const r = obj(v);
  if (!r) return null;
  const channel = ALERT_CHANNELS.find((c) => c === r.channel);
  if (!channel) return null;
  let to = str(r.to, 200).trim();
  if (channel === 'email') {
    to = to.toLowerCase();
    if (!isValidEmail(to)) return null;
  } else if (channel === 'telegram') {
    if (!TELEGRAM_CHAT_RE.test(to)) return null;
  } else {
    const n = waNumber(to, defaultCountry);
    if (!n) return null;
    to = '+' + n;
  }
  const attach = channel !== 'telegram' && (r.attach === 'pdf' || r.attach === 'xlsx') ? r.attach : 'none';
  return { channel, to, attach };
}

/**
 * Cleans the notification parts of form settings before they are stored: unknown keys go,
 * lengths are capped, invalid recipients are dropped and question references must exist.
 */
export function sanitizeFormNotify(settings: Record<string, unknown>, fields: FormField[], defaultCountry: string): Partial<FormSettings> {
  const byId = new Map(fields.map((f) => [f.id, f]));
  const out: Partial<FormSettings> = { alerts: undefined, alertWhen: undefined, alertDelivery: undefined, confirm: undefined };

  if (Array.isArray(settings.alerts)) {
    const seen = new Set<string>();
    const list: FormAlertRecipient[] = [];
    for (const raw of settings.alerts) {
      const r = cleanRecipient(raw, defaultCountry);
      if (!r || seen.has(r.channel + r.to)) continue;
      seen.add(r.channel + r.to);
      list.push(r);
      if (list.length >= MAX_ALERT_RECIPIENTS) break;
    }
    if (list.length) out.alerts = list;
  }

  const w = obj(settings.alertWhen);
  if (w) {
    const field = byId.get(str(w.fieldId, 100));
    const value = str(w.value, 200).trim();
    if (field && isConditionField(field) && value) out.alertWhen = { fieldId: field.id, op: w.op === 'contains' ? 'contains' : 'is', value };
  }

  const d = obj(settings.alertDelivery);
  if (d?.mode === 'daily') out.alertDelivery = { mode: 'daily', time: typeof d.time === 'string' && TIME_RE.test(d.time) ? d.time : '18:00' };

  const c = obj(settings.confirm);
  if (c) {
    const confirm: FormConfirm = {};
    const wa = obj(c.whatsapp);
    if (wa) {
      const f = byId.get(str(wa.fieldId, 100));
      confirm.whatsapp = { enabled: wa.enabled === true && f?.type === 'phone', fieldId: f?.type === 'phone' ? f.id : '', message: str(wa.message, MAX_MESSAGE) };
    }
    const em = obj(c.email);
    if (em) {
      const f = byId.get(str(em.fieldId, 100));
      confirm.email = {
        enabled: em.enabled === true && f?.type === 'email',
        fieldId: f?.type === 'email' ? f.id : '',
        subject: str(em.subject, MAX_SUBJECT).replace(/[\r\n]+/g, ' '),
        message: str(em.message, MAX_MESSAGE),
      };
    }
    if (c.attachPdf === true) confirm.attachPdf = true;
    if (confirm.whatsapp || confirm.email) out.confirm = confirm;
  }
  return out;
}

/* ------------------------------ confirmations ------------------------------ */

// At most 60 confirmations per form and 3 per address in 10 minutes, so a linked WhatsApp or
// mailbox can't be used to message arbitrary people in bulk through a public form.
const g = globalThis as unknown as { __fcConfirmHits?: Map<string, number[]>; __fcDigestTimer?: ReturnType<typeof setInterval> };
function overLimit(key: string, max: number, windowMs = 10 * 60_000) {
  const hits: Map<string, number[]> = (g.__fcConfirmHits ??= new Map<string, number[]>());
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) return true;
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return false;
}

const htmlText = (s: string) => esc(s).replace(/\n/g, '<br>');

interface ConfirmInput {
  form: { id: string; title: string };
  fields: FormField[];
  quiz: boolean;
  confirm: FormConfirm | undefined;
  answers: Answers;
  submissionId?: string;
  score?: number | null;
  maxScore?: number | null;
  /** Test sends: deliver here instead of the address typed in the answers, and skip the per-form limit. */
  testTo?: { whatsapp?: string; email?: string };
}

/** Sends the confirmation(s) configured on a form. Returns what happened per channel; never throws. */
export async function sendConfirmation(input: ConfirmInput) {
  const result: { whatsapp?: { ok: boolean; error?: string }; email?: { ok: boolean; error?: string } } = {};
  try {
    const { form, fields, confirm, answers } = input;
    if (!confirm?.whatsapp?.enabled && !confirm?.email?.enabled) return result;
    const settings = await getSettings();
    const on = workspaceChannels(settings);
    const subjectLog = `Confirmation · ${form.title}`.slice(0, 190);

    let pdf: Promise<WaDocument | undefined> | null = null;
    const pdfDoc = () =>
      (pdf ??= buildReport('pdf', {
        appName: settings.app.name,
        formTitle: form.title,
        fields,
        quiz: input.quiz,
        submissions: [{ id: input.submissionId ?? '', data: answers, score: input.score ?? null, maxScore: input.maxScore ?? null, language: null, createdAt: new Date().toISOString() }],
      })
        .then((data) => ({ data, fileName: reportFileName(form.title, 'pdf', true), mimetype: REPORT_MIME.pdf }))
        .catch((e) => {
          console.error('[formcraft] confirmation pdf failed', e);
          return undefined;
        }));

    const answerOf = (fieldId: string) => {
      const v = answers[fieldId];
      return typeof v === 'string' ? v.trim() : '';
    };
    const cc = settings.whatsapp.defaultCountryCode;
    const jobs: Promise<unknown>[] = [];

    const wa = confirm.whatsapp;
    if (wa?.enabled && on.whatsapp) {
      const field = fields.find((f) => f.id === wa.fieldId && f.type === 'phone');
      const typed = input.testTo ? input.testTo.whatsapp ?? '' : field ? answerOf(field.id) : '';
      const num = waNumber(typed, cc);
      if (num && (input.testTo || (!overLimit(`form:${form.id}`, 60) && !overLimit(`wa:${num}`, 3)))) {
        const text = fillPlaceholders(wa.message.trim() || 'Thank you! We’ve received your response to {Form title}.', fields, answers, form.title);
        jobs.push(
          (input.confirm?.attachPdf ? pdfDoc() : Promise.resolve(undefined)).then(async (doc) => {
            result.whatsapp = await deliver('whatsapp', '+' + num, subjectLog, () => sendWhatsApp('+' + num, text, doc, cc));
          }),
        );
      }
    }

    const em = confirm.email;
    if (em?.enabled && on.email) {
      const field = fields.find((f) => f.id === em.fieldId && f.type === 'email');
      const to = (input.testTo ? input.testTo.email ?? '' : field ? answerOf(field.id) : '').toLowerCase();
      if (isValidEmail(to) && (input.testTo || (!overLimit(`form:${form.id}`, 60) && !overLimit(`em:${to}`, 3)))) {
        const subject = fillPlaceholders(em.subject.trim() || 'We received your response · {Form title}', fields, answers, form.title).replace(/[\r\n]+/g, ' ');
        const body = fillPlaceholders(em.message.trim() || 'Thank you! We’ve received your response to {Form title}.', fields, answers, form.title);
        const html = emailLayout(settings.app.name, esc(subject), `<p style="font-size:14px;color:#334155;margin:0;line-height:1.6">${htmlText(body)}</p>`);
        jobs.push(
          (input.confirm?.attachPdf ? pdfDoc() : Promise.resolve(undefined)).then(async (doc) => {
            result.email = await deliver('email', to, subjectLog, () => sendEmail(settings.smtp, to, subject, html, body, doc ? [doc] : undefined));
          }),
        );
      }
    }
    await Promise.all(jobs);
  } catch (err) {
    console.error('[formcraft] confirmation error', err);
  }
  return result;
}

/** Example answers for a test confirmation, using the tester's own email / number where it fits. */
export function sampleAnswers(fields: FormField[], me: { email?: string; whatsapp?: string; name?: string }): Answers {
  const out: Answers = {};
  for (const f of fields) {
    const opt = f.options?.[0]?.label;
    switch (f.type) {
      case 'text':
        out[f.id] = /name|اسم|பெயர்/i.test(f.label) ? me.name || 'Alex' : 'Sample answer';
        break;
      case 'textarea':
        out[f.id] = 'Sample answer';
        break;
      case 'email':
        out[f.id] = me.email || 'name@example.com';
        break;
      case 'phone':
        out[f.id] = me.whatsapp || '+971 50 000 0000';
        break;
      case 'radio':
      case 'select':
        if (opt) out[f.id] = opt;
        break;
      case 'checkbox':
        if (opt) out[f.id] = [opt];
        break;
      case 'date':
        out[f.id] = new Date().toISOString().slice(0, 10);
        break;
      case 'rating':
      case 'scale':
        out[f.id] = f.max ?? 5;
        break;
      case 'terms':
        out[f.id] = TERMS_AGREED;
        break;
    }
  }
  return out;
}

/* ------------------------------ daily summary ------------------------------ */

const pad = (n: number) => String(n).padStart(2, '0');
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

let running = false;
async function digestTick() {
  if (running) return;
  running = true;
  try {
    const now = new Date();
    const forms = await prisma.form.findMany({ select: { id: true, title: true, schema: true } });
    for (const form of forms) {
      if (!form.schema.includes('"daily"')) continue;
      const schema = parseSchema(form.schema);
      const { alertDelivery, alerts } = schema.settings;
      if (alertDelivery?.mode !== 'daily' || !alerts?.length) continue;
      if (localTime(now) < (alertDelivery.time || '18:00')) continue;
      const key = `alerts.daily.${form.id}`;
      const row = await prisma.appMeta.findUnique({ where: { key } });
      const prev = safeJson<{ day?: string; at?: string }>(row?.value ?? '', {});
      if (prev.day === localDay(now)) continue;
      // Mark first, so a slow send can't repeat on the next tick.
      const mark = JSON.stringify({ day: localDay(now), at: now.toISOString() });
      await prisma.appMeta.upsert({ where: { key }, create: { key, value: mark }, update: { value: mark } });
      const since = prev.at && !Number.isNaN(Date.parse(prev.at)) ? new Date(Math.max(Date.parse(prev.at), now.getTime() - 7 * 86_400_000)) : new Date(now.getTime() - 86_400_000);
      await sendDigest(form, schema.fields, schema.settings, since, now);
    }
  } catch (err) {
    console.error('[formcraft] daily alert summary', err instanceof Error ? err.message : err);
  } finally {
    running = false;
  }
}

async function sendDigest(form: { id: string; title: string }, fields: FormField[], fs: FormSettings, since: Date, until: Date) {
  const rows = await prisma.submission.findMany({ where: { formId: form.id, createdAt: { gt: since, lte: until } }, orderBy: { createdAt: 'asc' } });
  const subs: SubmissionDTO[] = rows
    .map((s) => ({ id: s.id, data: safeJson<Answers>(s.data, {}), score: s.score, maxScore: s.maxScore, language: s.language, createdAt: s.createdAt.toISOString() }))
    .filter((s) => matchesCondition(fs.alertWhen, fields, s.data));
  if (!subs.length) return; // nothing new: no message

  const settings = await getSettings();
  const on = workspaceChannels(settings);
  const base = (settings.app.publicUrl || '').replace(/\/$/, '');
  const link = base ? `${base}/forms/${form.id}/submissions` : '';
  const n = subs.length;
  const what = `${n} new response${n === 1 ? '' : 's'}`;
  const subject = `Daily summary · ${form.title}`;
  const text = `${what} on ${form.title} since ${since.toISOString().replace('T', ' ').slice(0, 16)} UTC.${link ? `\n\n${link}` : ''}`;
  let xlsx: Promise<WaDocument | undefined> | null = null;
  const file = () =>
    (xlsx ??= buildReport('xlsx', { appName: settings.app.name, formTitle: form.title, fields, quiz: !!fs.quiz, submissions: subs })
      .then((data) => ({ data, fileName: reportFileName(form.title, 'xlsx'), mimetype: REPORT_MIME.xlsx }))
      .catch(() => undefined));
  const html = emailLayout(
    settings.app.name,
    esc(subject),
    `<p style="font-size:14px;color:#334155;margin:0"><b>${esc(what)}</b> on ${esc(form.title)}. The responses are attached as an Excel file.</p>${
      link ? `<a href="${esc(link)}" style="display:inline-block;margin-top:20px;background:#9b1b22;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:600">View submissions</a>` : ''
    }`,
  );
  const cc = settings.whatsapp.defaultCountryCode;
  await Promise.all(
    (fs.alerts ?? []).slice(0, MAX_ALERT_RECIPIENTS).map(async (r) => {
      if (r.channel === 'email' && on.email && isValidEmail(r.to)) {
        const doc = await file();
        return deliver('email', r.to, subject, () => sendEmail(settings.smtp, r.to, subject, html, text, doc ? [doc] : undefined));
      }
      if (r.channel === 'whatsapp' && on.whatsapp && waNumber(r.to, cc)) {
        const doc = await file();
        return deliver('whatsapp', r.to, subject, () => sendWhatsApp(r.to, `📊 *${subject}*\n\n${text}`, doc, cc));
      }
      if (r.channel === 'telegram' && on.telegram && TELEGRAM_CHAT_RE.test(r.to)) {
        const tg = `📊 <b>${esc(subject)}</b>\n\n${esc(what)} on ${esc(form.title)}.${link ? `\n\n<a href="${esc(link)}">View submissions</a>` : ''}`;
        return deliver('telegram', r.to, subject, () => sendTelegram(settings.telegram.botToken, r.to, tg));
      }
    }),
  );
}

/** Checks once a minute for forms whose daily summary is due. */
export function startFormAlertDigests() {
  if (g.__fcDigestTimer) return;
  g.__fcDigestTimer = setInterval(() => void digestTick(), 60_000);
  g.__fcDigestTimer.unref?.();
}
