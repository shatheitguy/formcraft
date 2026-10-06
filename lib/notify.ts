import nodemailer from 'nodemailer';
import { formatAnswer } from './answers';
import { prisma } from './db';
import { parseSchema } from './forms';
import { getSettings, type SmtpSettings } from './settings';
import type { Answers } from './types';
import { safeJson } from './utils';

export type Channel = 'email' | 'telegram';

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
<div style="height:6px;background:linear-gradient(90deg,#6366f1,#8b5cf6)"></div>
<div style="padding:24px 28px"><div style="font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.04em">${esc(appName)}</div>
<h1 style="font-size:18px;margin:6px 0 16px">${title}</h1>${body}</div></div></body></html>`;
}

/** Sends new-submission alerts to every subscribed user who can see the form. Never throws. */
export async function notifySubmission({ formId, answers, origin }: { formId: string; answers: Answers; origin: string }) {
  try {
    const settings = await getSettings();
    const emailOn = settings.smtp.enabled && !!settings.smtp.host;
    const tgOn = settings.telegram.enabled && !!settings.telegram.botToken;
    if (!emailOn && !tgOn) return;

    const form = await prisma.form.findUnique({ where: { id: formId } });
    if (!form) return;

    const users = await prisma.user.findMany({
      where: { active: true, OR: [{ emailNotifications: true }, { telegramNotifications: true }] },
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
      `New response on <span style="color:#4f46e5">${esc(form.title)}</span>`,
      `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows
        .map((r) => `<tr><td style="padding:8px 0;color:#64748b;vertical-align:top;width:40%;border-bottom:1px solid #f1f5f9">${esc(r.label)}</td><td style="padding:8px 0;border-bottom:1px solid #f1f5f9">${esc(r.value)}</td></tr>`)
        .join('')}</table>
<a href="${esc(link)}" style="display:inline-block;margin-top:20px;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:600">View submissions</a>`,
    );
    const text = `New response on ${form.title}\n\n${rows.map((r) => `${r.label}: ${r.value}`).join('\n')}\n\n${link}`;
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
  const token = overrides?.botToken ?? settings.telegram.botToken;
  return deliver('telegram', target, subject, () =>
    sendTelegram(token, target, `✅ <b>${esc(settings.app.name)}</b>\nTelegram notifications are working. You'll get a message here for every new response on forms you follow.`),
  );
}
