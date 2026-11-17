import nodemailer from 'nodemailer';
import { formatAnswer } from './answers';
import { prisma } from './db';
import { parseSchema } from './forms';
import { buildReport, REPORT_MIME, reportFileName, type ReportFormat } from './reports';
import { getSettings, type SmtpSettings } from './settings';
import type { Answers } from './types';
import { safeJson } from './utils';
import { WA_ERRORS, waNumber, waSend, waStatus, type WaDocument } from './whatsapp';

export type Channel = 'email' | 'telegram' | 'whatsapp';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/* ------------------------------ transports ------------------------------ */

export async function sendEmail(smtp: SmtpSettings, to: string, subject: string, html: string, text: string) {
  if (!smtp.host) throw new Error('SMTP host is not configured.');
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: Number(smtp.port) || 587,
    secure: !!smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
  });
  await transport.sendMail({ from: smtp.from || smtp.user, to, subject, html, text });
}

export async function sendTelegram(botToken: string, chatId: string, html: string) {
  if (!botToken) throw new Error('Telegram bot token is not configured.');
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: html, parse_mode: 'HTML', disable_web_page_preview: true }),
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
  if (!res.ok || !json.ok) throw new Error(json.description || `Telegram API error (${res.status})`);
}

/** Sends over the linked WhatsApp; throws a readable error when it can't. */
export async function sendWhatsApp(phone: string, text: string, doc?: WaDocument, defaultCountry = '') {
  const num = waNumber(phone, defaultCountry);
  const r = await waSend(num, text, doc);
  if (r !== 'ok') throw new Error(WA_ERRORS[r]);
}

async function deliver(channel: Channel, target: string, subject: string, send: () => Promise<void>) {
  try {
    await send();
    await prisma.notificationLog.create({ data: { channel, target, subject, status: 'sent' } });
    return { ok: true as const };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await prisma.notificationLog.create({ data: { channel, target, subject, status: 'failed', error: clip(error, 500) } });
    return { ok: false as const, error };
  }
}

/* ------------------------------ messages ------------------------------ */

function emailLayout(appName: string, title: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
<div style="max-width:560px;margin:24px auto;background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden">
<div style="height:6px;background:linear-gradient(90deg,#b8262d,#7f151b)"></div>
<div style="padding:24px 28px"><div style="font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.04em">${esc(appName)}</div>
<h1 style="font-size:18px;margin:6px 0 16px">${title}</h1>${body}</div></div></body></html>`;
}

const CODE_COPY = {
  reset: { subject: 'Your password reset code', title: 'Reset your password', intro: 'Use this code to choose a new password.' },
  login: { subject: 'Your sign-in code', title: 'Your sign-in code', intro: 'Use this code to finish signing in.' },
  'email-setup': { subject: 'Confirm two-factor sign-in', title: 'Confirm your email', intro: 'Use this code to turn on email two-factor sign-in.' },
} as const;

/** Emails a one-time code (password reset, sign-in or two-factor setup). */
export async function sendCodeEmail(smtp: SmtpSettings, appName: string, to: string, purpose: keyof typeof CODE_COPY, code: string, minutes: number) {
  const c = CODE_COPY[purpose];
  const subject = `${c.subject} · ${appName}`;
  const html = emailLayout(
    appName,
    c.title,
    `<p style="font-size:14px;color:#334155;margin:0 0 16px">${c.intro}</p>
<div style="font-size:32px;font-weight:700;letter-spacing:.3em;font-family:ui-monospace,Menlo,Consolas,monospace;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 18px;text-align:center">${code}</div>
<p style="font-size:13px;color:#64748b;margin:16px 0 0">It expires in ${minutes} minutes. Never share it with anyone. If you didn't ask for it, you can ignore this email.</p>`,
  );
  const text = `${c.title}\n\n${c.intro}\n\n${code}\n\nIt expires in ${minutes} minutes. Never share it with anyone. If you didn't ask for it, you can ignore this email.`;
  return deliver('email', to, c.subject, () => sendEmail(smtp, to, subject, html, text));
}

/** Sends new-submission alerts to every subscribed user who can see the form. Never throws. */
export async function notifySubmission({
  formId,
  answers,
  origin,
  submissionId,
  score,
  maxScore,
}: {
  formId: string;
  answers: Answers;
  origin: string;
  submissionId?: string;
  score?: number | null;
  maxScore?: number | null;
}) {
  try {
    const settings = await getSettings();
    const emailOn = settings.smtp.enabled && !!settings.smtp.host;
    const tgOn = settings.telegram.enabled && !!settings.telegram.botToken;
    const waOn = settings.whatsapp.enabled && waStatus().status === 'on';
    if (!emailOn && !tgOn && !waOn) return;

    const form = await prisma.form.findUnique({ where: { id: formId } });
    if (!form) return;

    const users = await prisma.user.findMany({
      where: { active: true, OR: [{ emailNotifications: true }, { telegramNotifications: true }, { whatsappNotifications: true }] },
      include: { formAccess: { select: { formId: true } } },
    });
    const recipients = users.filter((u) => {
      const hasAccess = u.role === 'ADMIN' || u.formScope === 'ALL' || u.formAccess.some((a) => a.formId === formId);
      const subscribed = u.notifyAllForms || safeJson<string[]>(u.notifyFormIds, []).includes(formId);
      return hasAccess && subscribed;
    });
    if (!recipients.length) return;

    const schema = parseSchema(form.schema);
    const rows = schema.fields
      .filter((f) => answers[f.id] !== undefined)
      .slice(0, 12)
      .map((f) => ({ label: f.label, value: clip(formatAnswer(f, answers[f.id]), 300) }));
    const base = (settings.app.publicUrl || origin).replace(/\/$/, '');
    const link = `${base}/forms/${form.id}/submissions`;
    const subject = `New response · ${form.title}`;

    const html = emailLayout(
      settings.app.name,
      `New response on <span style="color:#9b1b22">${esc(form.title)}</span>`,
      `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows
        .map((r) => `<tr><td style="padding:8px 0;color:#64748b;vertical-align:top;width:40%;border-bottom:1px solid #f1f5f9">${esc(r.label)}</td><td style="padding:8px 0;border-bottom:1px solid #f1f5f9">${esc(r.value)}</td></tr>`)
        .join('')}</table>
<a href="${esc(link)}" style="display:inline-block;margin-top:20px;background:#9b1b22;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:600">View submissions</a>`,
    );
    const text = `New response on ${form.title}\n\n${rows.map((r) => `${r.label}: ${r.value}`).join('\n')}\n\n${link}`;
    const wa = `📥 *New response* · ${form.title}\n\n${rows.map((r) => `*${r.label}:* ${r.value}`).join('\n')}\n\n${link}`;
    // The response as a file, built once per format that someone asked for.
    const files = new Map<ReportFormat, Promise<WaDocument | undefined>>();
    const fileFor = (format: string) => {
      if (format !== 'pdf' && format !== 'xlsx') return Promise.resolve(undefined);
      if (!files.has(format)) {
        files.set(
          format,
          buildReport(format, {
            appName: settings.app.name,
            formTitle: form.title,
            fields: schema.fields,
            quiz: !!schema.settings.quiz,
            submissions: [{ id: submissionId ?? '', data: answers, score: score ?? null, maxScore: maxScore ?? null, language: null, createdAt: new Date().toISOString() }],
          })
            .then((data) => ({ data, fileName: reportFileName(form.title, format, true), mimetype: REPORT_MIME[format] }))
            .catch((e) => {
              console.error('[formcraft] report build failed', e);
              return undefined;
            }),
        );
      }
      return files.get(format)!;
    };
    const tg = `📥 <b>New response</b> · ${esc(form.title)}\n\n${rows.map((r) => `<b>${esc(r.label)}:</b> ${esc(r.value)}`).join('\n')}\n\n<a href="${esc(link)}">View submissions</a>`;

    await Promise.all(
      recipients.flatMap((u) => {
        const jobs: Promise<unknown>[] = [];
        if (emailOn && u.emailNotifications) {
          const to = u.notifyEmail || u.email;
          jobs.push(deliver('email', to, subject, () => sendEmail(settings.smtp, to, subject, html, text)));
        }
        if (tgOn && u.telegramNotifications && u.telegramChatId) {
          jobs.push(deliver('telegram', u.telegramChatId, subject, () => sendTelegram(settings.telegram.botToken, u.telegramChatId!, tg)));
        }
        if (waOn && u.whatsappNotifications && u.whatsappNumber) {
          const to = u.whatsappNumber;
          jobs.push(
            fileFor(u.whatsappAttach).then((doc) => deliver('whatsapp', to, subject, () => sendWhatsApp(to, wa, doc, settings.whatsapp.defaultCountryCode))),
          );
        }
        return jobs;
      }),
    );

    // Keep the delivery log bounded.
    await prisma.notificationLog.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 30 * 86_400_000) } } });
  } catch (err) {
    console.error('[formcraft] notification error', err);
  }
}

/** Sends a test message through a channel, using either saved or provided settings. */
export async function sendTest(channel: Channel, target: string, overrides?: { smtp?: SmtpSettings; botToken?: string }) {
  const settings = await getSettings();
  const subject = `${settings.app.name} test notification`;
  if (channel === 'email') {
    const smtp = overrides?.smtp ?? settings.smtp;
    const html = emailLayout(settings.app.name, 'Email notifications are working ✅', '<p style="font-size:14px;color:#334155">You will receive an email like this whenever a form you follow gets a new response.</p>');
    return deliver('email', target, subject, () => sendEmail(smtp, target, subject, html, 'Email notifications are working.'));
  }
  if (channel === 'whatsapp') {
    return deliver('whatsapp', target, subject, () =>
      sendWhatsApp(target, `✅ *${settings.app.name}*\nWhatsApp notifications are working. You'll get a message here for every new response on forms you follow.`, undefined, settings.whatsapp.defaultCountryCode),
    );
  }
  const token = overrides?.botToken ?? settings.telegram.botToken;
  return deliver('telegram', target, subject, () =>
    sendTelegram(token, target, `✅ <b>${esc(settings.app.name)}</b>\nTelegram notifications are working. You'll get a message here for every new response on forms you follow.`),
  );
}

/**
 * Sends a one-time code by WhatsApp or Telegram (two-factor sign-in and its setup).
 * The code is never logged: the delivery log only records the target and a generic subject.
 */
export async function sendCodeMessage(channel: 'whatsapp' | 'telegram', target: string, appName: string, purpose: 'login' | 'setup', code: string, minutes: number) {
  const settings = await getSettings();
  const what = purpose === 'login' ? 'sign-in code' : 'code to turn on two-factor sign-in';
  const subject = purpose === 'login' ? 'Sign-in code' : 'Two-factor setup code';
  if (channel === 'whatsapp') {
    const text = `🔐 *${appName}* ${what}: ${code} — expires in ${minutes} minutes. Never share it.`;
    return deliver('whatsapp', target, subject, () => sendWhatsApp(target, text, undefined, settings.whatsapp.defaultCountryCode));
  }
  const html = `🔐 <b>${esc(appName)}</b> ${what}: <code>${code}</code>\nExpires in ${minutes} minutes. Never share it.`;
  return deliver('telegram', target, subject, () => sendTelegram(settings.telegram.botToken, target, html));
}
