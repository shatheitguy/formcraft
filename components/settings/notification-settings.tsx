'use client';

import { CheckCircle2, History, Mail, Send, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PasswordInput } from '@/components/auth/password-input';
import { useT } from '@/components/i18n';
import { useToast } from '@/components/toast';
import { Button, Switch } from '@/components/ui';
import type { RedactedSettings } from '@/lib/settings';
import { cn, timeAgo } from '@/lib/utils';
import { Field, SettingsCard, ToggleField, rich, sendJson } from './settings-ui';

interface Log {
  id: string;
  channel: string;
  target: string;
  subject: string;
  status: string;
  error: string | null;
  createdAt: string;
}

const PRESETS = [
  { name: 'Gmail', host: 'smtp.gmail.com', port: 465, secure: true },
  { name: 'Outlook', host: 'smtp.office365.com', port: 587, secure: false },
  { name: 'SendGrid', host: 'smtp.sendgrid.net', port: 587, secure: false },
  { name: 'Mailgun', host: 'smtp.mailgun.org', port: 587, secure: false },
];

export function NotificationSettings({
  smtp: initialSmtp,
  telegram: initialTg,
  adminEmail,
  stats,
  logs,
}: {
  smtp: RedactedSettings['smtp'];
  telegram: RedactedSettings['telegram'];
  adminEmail: string;
  stats: { email: number; telegram: number };
  logs: Log[];
}) {
  const router = useRouter();
  const toast = useToast();
  const t = useT();

  const [smtp, setSmtp] = useState({ ...initialSmtp, pass: '' });
  const [tg, setTg] = useState({ ...initialTg, botToken: '' });
  const [testEmail, setTestEmail] = useState(adminEmail);
  const [testChat, setTestChat] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const setS = <K extends keyof typeof smtp>(k: K, v: (typeof smtp)[K]) => setSmtp((x) => ({ ...x, [k]: v }));

  async function save(section: 'smtp' | 'telegram') {
    setBusy(`save-${section}`);
    const value = section === 'smtp' ? smtp : tg;
    const r = await sendJson<RedactedSettings>('/api/admin/settings', 'PUT', { section, value });
    setBusy(null);
    if (!r.ok) return toast(t(r.error!), 'error');
    toast(section === 'smtp' ? t('Email settings saved') : t('Telegram settings saved'));
    if (section === 'smtp') setSmtp({ ...r.data.smtp, pass: '' });
    else setTg({ ...r.data.telegram, botToken: '' });
    router.refresh();
  }

  async function test(channel: 'email' | 'telegram') {
    setBusy(`test-${channel}`);
    const r = await sendJson('/api/admin/settings/test', 'POST', { channel, target: channel === 'email' ? testEmail : testChat });
    setBusy(null);
    toast(r.ok ? t('Test message sent!') : t(r.error!), r.ok ? 'success' : 'error');
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-brand-50/60 px-4 py-3 text-sm text-brand-900 ring-1 ring-inset ring-brand-100">
        {rich(t('Configure the delivery channels here. Each user then chooses where and for which forms they get alerts in {link}.'), {
          link: (
            <Link href="/settings/profile" className="font-semibold underline underline-offset-2">
              {t('My profile')}
            </Link>
          ),
        })}{' '}
        {rich(t(stats.email === 1 ? 'Currently {n} user receives email alerts.' : 'Currently {n} users receive email alerts.'), { n: <strong>{stats.email}</strong> })}{' '}
        {rich(t(stats.telegram === 1 ? '{n} user receives Telegram alerts.' : '{n} users receive Telegram alerts.'), { n: <strong>{stats.telegram}</strong> })}
      </div>

      {/* Email */}
      <SettingsCard
        title={t('Email (SMTP)')}
        description={t('Send new-response alerts through any SMTP provider.')}
        icon={<Mail />}
        aside={<Switch checked={smtp.enabled} onChange={(v) => setS('enabled', v)} label={t('Enable email')} />}
        footer={
          <Button variant="primary" onClick={() => save('smtp')} loading={busy === 'save-smtp'}>
            {t('Save email settings')}
          </Button>
        }
      >
        <div className={cn('space-y-5 transition', !smtp.enabled && 'opacity-60')}>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="me-1 text-xs text-slate-500">{t('Quick setup:')}</span>
            {PRESETS.map((p) => (
              <button key={p.name} onClick={() => setSmtp((x) => ({ ...x, host: p.host, port: p.port, secure: p.secure }))} className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200">
                {p.name}
              </button>
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-[1fr_120px]">
            <Field label={t('SMTP host')}>
              <input className="input" value={smtp.host} onChange={(e) => setS('host', e.target.value)} placeholder="smtp.example.com" dir="ltr" />
            </Field>
            <Field label={t('Port')}>
              <input className="input" type="number" value={smtp.port} onChange={(e) => setS('port', Number(e.target.value))} dir="ltr" />
            </Field>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t('Username')}>
              <input className="input" value={smtp.user} onChange={(e) => setS('user', e.target.value)} autoComplete="off" placeholder={t('apikey or you@example.com')} dir="ltr" />
            </Field>
            <Field label={t('Password')} hint={initialSmtp.hasPass ? t('A password is saved. Leave blank to keep it.') : t('For Gmail, use an App Password.')}>
              <PasswordInput value={smtp.pass} onChange={(e) => setS('pass', e.target.value)} autoComplete="new-password" placeholder={initialSmtp.hasPass ? t('••••••••  (saved)') : ''} />
            </Field>
          </div>
          <Field label={t('From address')} hint={t('e.g. {example}. Defaults to the username.', { example: '"FormCraft <forms@example.com>"' })}>
            <input className="input" value={smtp.from} onChange={(e) => setS('from', e.target.value)} placeholder="FormCraft <forms@example.com>" dir="ltr" />
          </Field>
          <ToggleField
            label={t('Use SSL/TLS (secure)')}
            description={t('Turn on for port 465. Leave off for 587 (STARTTLS is negotiated automatically).')}
            control={<Switch checked={smtp.secure} onChange={(v) => setS('secure', v)} label={t('Secure')} />}
          />
          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-slate-200 p-3">
            <Field label={t('Send a test email to')} className="min-w-[220px] flex-1">
              <input className="input" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} dir="ltr" />
            </Field>
            <Button onClick={() => test('email')} loading={busy === 'test-email'} disabled={!initialSmtp.enabled || !initialSmtp.host}>
              <Send className="h-4 w-4" /> Send test
            </Button>
            {(!initialSmtp.enabled || !initialSmtp.host) && <p className="w-full text-xs text-slate-500">{t('Save and enable the settings above to send a test.')}</p>}
          </div>
        </div>
      </SettingsCard>

      {/* Telegram */}
      <SettingsCard
        title={t('Telegram')}
        description={t('Instant alerts in a Telegram chat, group or channel via your own bot.')}
        icon={<TelegramIcon />}
        aside={<Switch checked={tg.enabled} onChange={(v) => setTg((x) => ({ ...x, enabled: v }))} label={t('Enable Telegram')} />}
        footer={
          <Button variant="primary" onClick={() => save('telegram')} loading={busy === 'save-telegram'}>
            {t('Save Telegram settings')}
          </Button>
        }
      >
        <div className={cn('grid gap-6 transition md:grid-cols-[1fr_260px]', !tg.enabled && 'opacity-60')}>
          <div className="space-y-5">
            <Field label={t('Bot token')} hint={initialTg.hasToken ? t('A token ending in {hint} is saved. Leave blank to keep it.', { hint: initialTg.tokenHint }) : t('Looks like {example}', { example: '123456789:AAH…' })}>
              <PasswordInput value={tg.botToken} onChange={(e) => setTg((x) => ({ ...x, botToken: e.target.value }))} placeholder={initialTg.hasToken ? `••••••${initialTg.tokenHint}` : '123456789:AA…'} autoComplete="off" />
            </Field>
            <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-slate-200 p-3">
              <Field label={t('Send a test message to chat ID')} className="min-w-[220px] flex-1">
                <input className="input" value={testChat} onChange={(e) => setTestChat(e.target.value)} placeholder="123456789" dir="ltr" />
              </Field>
              <Button onClick={() => test('telegram')} loading={busy === 'test-telegram'} disabled={!initialTg.enabled || !initialTg.hasToken}>
                <Send className="h-4 w-4" /> Send test
              </Button>
            </div>
          </div>
          <ol className="space-y-2.5 rounded-lg bg-slate-50 p-4 text-xs leading-relaxed text-slate-600 ring-1 ring-inset ring-slate-100">
            <li className="font-semibold text-slate-800">{t('How to set up')}</li>
            <li>
              {rich(t('1. Open {bot} in Telegram, send {command} and copy the token.'), {
                bot: <strong dir="ltr">@BotFather</strong>,
                command: (
                  <code className="rounded bg-white px-1" dir="ltr">
                    /newbot
                  </code>
                ),
              })}
            </li>
            <li>{t('2. Paste the token here, enable and save.')}</li>
            <li>
              {rich(t('3. Each user opens a chat with your bot and presses {start}.'), { start: <strong>{t('Start')}</strong> })}
            </li>
            <li>
              {rich(t('4. They get their chat ID from {bot} and add it in {profile}.'), {
                bot: <strong dir="ltr">@userinfobot</strong>,
                profile: <em>{t('My profile')}</em>,
              })}
            </li>
          </ol>
        </div>
      </SettingsCard>

      {/* Delivery log */}
      <SettingsCard title={t('Recent deliveries')} description={t('The last 25 notification attempts, kept for 30 days.')} icon={<History />}>
        {logs.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">{t('No notifications sent yet.')}</p>
        ) : (
          <div className="-mx-6 -my-5 divide-y divide-slate-100">
            {logs.map((l) => (
              <div key={l.id} className="flex items-center gap-3 px-6 py-2.5 text-sm">
                {l.status === 'sent' ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" /> : <XCircle className="h-4 w-4 shrink-0 text-rose-500" />}
                <span className="w-16 shrink-0 text-xs font-medium uppercase text-slate-500">{l.channel === 'email' ? t('Email') : l.channel === 'telegram' ? t('Telegram') : l.channel}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-slate-800">{l.subject}</div>
                  <div className={cn('truncate text-xs', l.error ? 'text-rose-600' : 'text-slate-500')} title={l.error ?? undefined}>
                    {l.error ? t(l.error) : t('to {target}', { target: l.target })}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-slate-400">{timeAgo(l.createdAt, t)}</span>
              </div>
            ))}
          </div>
        )}
      </SettingsCard>
    </div>
  );
}

export function TelegramIcon({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M21.9 4.3c.3-1.3-1-2.3-2.2-1.8L2.6 9.1c-1.3.5-1.3 2.4.1 2.8l4.3 1.3 1.7 5.2c.3 1 1.6 1.4 2.4.6l2.4-2.3 4.4 3.2c.9.7 2.2.2 2.5-.9l2.5-14.7zM9.6 14.2l8.2-7.4-6.6 8.6-.3 3-1.3-4.2z" />
    </svg>
  );
}
