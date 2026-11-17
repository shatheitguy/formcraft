'use client';

import { Copy, Download, LifeBuoy, Mail, MessageCircle, Send, ShieldCheck, Smartphone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { CodeInput } from '@/components/auth/code-input';
import { PasswordInput } from '@/components/auth/password-input';
import { useT } from '@/components/i18n';
import { useToast } from '@/components/toast';
import { Button, Modal } from '@/components/ui';
import { cn } from '@/lib/utils';
import { Field, SettingsCard, rich, sendJson } from './settings-ui';

export interface TwoFactorStatus {
  totp: boolean;
  email: boolean;
  whatsapp?: boolean;
  telegram?: boolean;
  recoveryLeft: number;
  /** The workspace's WhatsApp is enabled and linked / Telegram bot is set up. */
  whatsappAvailable?: boolean;
  telegramAvailable?: boolean;
  /** Masked saved destinations ('' when the user hasn't saved one). */
  whatsappTo?: string;
  telegramTo?: string;
  /** An admin requires two-factor sign-in for this user. */
  required?: boolean;
}

type CodeChannel = 'email' | 'whatsapp' | 'telegram';
type PasswordAction = 'totp-disable' | 'email-disable' | 'whatsapp-disable' | 'telegram-disable' | 'recovery';

const OFF_TOAST: Record<Exclude<PasswordAction, 'recovery'>, string> = {
  'totp-disable': 'Authenticator app turned off',
  'email-disable': 'Email codes turned off',
  'whatsapp-disable': 'WhatsApp codes turned off',
  'telegram-disable': 'Telegram codes turned off',
};
const ON_TOAST: Record<CodeChannel, string> = { email: 'Email codes turned on', whatsapp: 'WhatsApp codes turned on', telegram: 'Telegram codes turned on' };

/** Scrolls to the Notifications card (right after this one), where the WhatsApp number / Telegram chat ID is saved. */
function goToNotifications() {
  const el = document.getElementById('security')?.nextElementSibling;
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Profile card: authenticator app (TOTP), email / WhatsApp / Telegram codes and recovery codes. */
export function TwoFactorCard({ status, emailAvailable, email }: { status: TwoFactorStatus; emailAvailable: boolean; email: string }) {
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const [totpSetup, setTotpSetup] = useState(false);
  const [channelSetup, setChannelSetup] = useState<CodeChannel | null>(null);
  const [confirm, setConfirm] = useState<PasswordAction | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const on = status.totp || status.email || !!status.whatsapp || !!status.telegram;

  /** Hint + availability for the WhatsApp / Telegram rows. */
  function messageRow(channel: 'whatsapp' | 'telegram') {
    const isWa = channel === 'whatsapp';
    const workspaceOk = isWa ? status.whatsappAvailable : status.telegramAvailable;
    const to = isWa ? status.whatsappTo : status.telegramTo;
    const enabled = isWa ? status.whatsapp : status.telegram;
    let text: ReactNode;
    if (enabled) text = t(isWa ? 'A 6-digit code is sent to your WhatsApp {to} each time you sign in.' : 'A 6-digit code is sent to your Telegram chat {to} each time you sign in.', { to: to || '—' });
    else if (!workspaceOk)
      text = t(isWa ? 'WhatsApp isn’t connected on this workspace. An admin can link it under Settings → Notifications.' : 'Telegram isn’t set up on this workspace. An admin can add a bot under Settings → Notifications.');
    else if (!to)
      text = (
        <>
          {t(isWa ? 'Save your WhatsApp number first.' : 'Save your Telegram chat ID first.')}{' '}
          <button type="button" onClick={goToNotifications} className="font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800">
            {t('Go to My profile → Notifications')}
          </button>
        </>
      );
    else text = t(isWa ? 'Get a 6-digit code on WhatsApp ({to}) each time you sign in.' : 'Get a 6-digit code in Telegram ({to}) each time you sign in.', { to });
    return { available: !!workspaceOk && !!to, text, enabled: !!enabled };
  }
  const wa = messageRow('whatsapp');
  const tg = messageRow('telegram');

  function enabled(recoveryCodes: string[] | null | undefined, message: string) {
    toast(t(message));
    if (recoveryCodes?.length) setCodes(recoveryCodes);
    router.refresh();
  }

  return (
    <div id="security" className="scroll-mt-24">
    <SettingsCard
      title={t('Two-factor sign-in')}
      description={t('Ask for a code after your password, so a stolen password alone can’t get into your account.')}
      icon={<ShieldCheck />}
      aside={<span className={cn('chip', on ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-500')}>{on ? t('On') : t('Off')}</span>}
    >
      {status.required && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 ring-1 ring-amber-200">
          {on ? t('Required by your admin: keep at least one method on.') : t('Required by your admin: turn on at least one method to keep using the workspace.')}
        </p>
      )}
      <div className="-my-2 divide-y divide-slate-100">
        <Method
          icon={<Smartphone className="h-4 w-4" />}
          title={t('Authenticator app')}
          text={t('Google Authenticator, Microsoft Authenticator, 1Password, Authy or any TOTP app. Works without signal.')}
          on={status.totp}
          action={
            status.totp ? (
              <Button variant="secondary" onClick={() => setConfirm('totp-disable')}>
                {t('Turn off')}
              </Button>
            ) : (
              <Button variant="primary" onClick={() => setTotpSetup(true)}>
                {t('Set up')}
              </Button>
            )
          }
        />
        <Method
          icon={<Mail className="h-4 w-4" />}
          title={t('Email codes')}
          text={emailAvailable ? t('A 6-digit code is emailed to {email} each time you sign in.', { email }) : t('Email isn’t set up on this workspace yet. An admin can add it under Settings → Notifications.')}
          on={status.email}
          action={
            status.email ? (
              <Button variant="secondary" onClick={() => setConfirm('email-disable')}>
                {t('Turn off')}
              </Button>
            ) : (
              <Button variant="primary" onClick={() => setChannelSetup('email')} disabled={!emailAvailable}>
                {t('Turn on')}
              </Button>
            )
          }
        />
        <Method
          icon={<MessageCircle className="h-4 w-4" />}
          title={t('WhatsApp codes')}
          text={wa.text}
          on={wa.enabled}
          action={
            wa.enabled ? (
              <Button variant="secondary" onClick={() => setConfirm('whatsapp-disable')}>
                {t('Turn off')}
              </Button>
            ) : (
              <Button variant="primary" onClick={() => setChannelSetup('whatsapp')} disabled={!wa.available}>
                {t('Turn on')}
              </Button>
            )
          }
        />
        <Method
          icon={<Send className="h-4 w-4" />}
          title={t('Telegram codes')}
          text={tg.text}
          on={tg.enabled}
          action={
            tg.enabled ? (
              <Button variant="secondary" onClick={() => setConfirm('telegram-disable')}>
                {t('Turn off')}
              </Button>
            ) : (
              <Button variant="primary" onClick={() => setChannelSetup('telegram')} disabled={!tg.available}>
                {t('Turn on')}
              </Button>
            )
          }
        />
        {on && (
          <Method
            icon={<LifeBuoy className="h-4 w-4" />}
            title={t('Recovery codes')}
            text={
              status.recoveryLeft === 1
                ? t('1 unused code left. Each one signs you in once if you lose your phone or email.')
                : t('{n} unused codes left. Each one signs you in once if you lose your phone or email.', { n: status.recoveryLeft })
            }
            warn={status.recoveryLeft <= 2}
            action={
              <Button variant="secondary" onClick={() => setConfirm('recovery')}>
                {t('New codes')}
              </Button>
            }
          />
        )}
      </div>

      {totpSetup && <TotpSetup onClose={() => setTotpSetup(false)} onEnabled={(c) => { setTotpSetup(false); enabled(c, 'Authenticator app turned on'); }} />}
      {channelSetup && (
        <ChannelSetup
          channel={channelSetup}
          to={channelSetup === 'email' ? email : (channelSetup === 'whatsapp' ? status.whatsappTo : status.telegramTo) ?? ''}
          onClose={() => setChannelSetup(null)}
          onEnabled={(c) => {
            const ch = channelSetup;
            setChannelSetup(null);
            enabled(c, ON_TOAST[ch]);
          }}
        />
      )}
      {confirm && (
        <PasswordPrompt
          action={confirm}
          onClose={() => setConfirm(null)}
          onDone={(c) => {
            setConfirm(null);
            if (confirm === 'recovery') setCodes(c ?? null);
            else toast(t(OFF_TOAST[confirm]));
            router.refresh();
          }}
        />
      )}
      {codes && <RecoveryCodes codes={codes} onClose={() => setCodes(null)} />}
    </SettingsCard>
    </div>
  );
}

function Method({ icon, title, text, on, warn, action }: { icon: ReactNode; title: string; text: ReactNode; on?: boolean; warn?: boolean; action: ReactNode }) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', on ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500')}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          {title}
          {on && <span className="rounded bg-emerald-50 px-1.5 text-[10px] font-semibold uppercase text-emerald-700">{t('On')}</span>}
        </div>
        <p className={cn('text-xs', warn ? 'text-amber-700' : 'text-slate-600')}>{text}</p>
      </div>
      {action}
    </div>
  );
}

function TotpSetup({ onClose, onEnabled }: { onClose: () => void; onEnabled: (codes?: string[] | null) => void }) {
  const t = useT();
  const toast = useToast();
  const [data, setData] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let live = true;
    void sendJson<{ secret: string; qr: string }>('/api/me/two-factor', 'POST', { action: 'totp-setup' }).then((r) => {
      if (live) r.ok ? setData(r.data) : setError(r.error!);
    });
    return () => {
      live = false;
    };
  }, []);

  async function enable() {
    setLoading(true);
    setError(null);
    const r = await sendJson<{ recoveryCodes: string[] | null }>('/api/me/two-factor', 'POST', { action: 'totp-enable', code });
    setLoading(false);
    if (!r.ok) return setError(r.error!);
    onEnabled(r.data.recoveryCodes);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('Set up an authenticator app')}
      description={t('Scan the QR code with your app, then enter the 6-digit code it shows.')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button variant="primary" onClick={enable} loading={loading} disabled={code.length !== 6 || !data}>
            {t('Turn on')}
          </Button>
        </>
      }
    >
      <div className="grid items-center gap-5 sm:grid-cols-[auto_1fr]">
        <div className="mx-auto flex h-[188px] w-[188px] items-center justify-center rounded-xl bg-white p-2 ring-1 ring-slate-200">
          {data ? <img src={data.qr} alt={t('QR code for your authenticator app')} className="h-full w-full" /> : <span className="text-xs text-slate-400">{t('Loading…')}</span>}
        </div>
        <div className="min-w-0 space-y-3">
          <div>
            <span className="label">{t('Can’t scan it? Enter this key')}</span>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-md bg-slate-50 px-2 py-1.5 font-mono text-xs text-slate-700 ring-1 ring-slate-200" dir="ltr">
                {data?.secret.replace(/(.{4})/g, '$1 ').trim() ?? '…'}
              </code>
              <Button
                variant="ghost"
                size="xs"
                disabled={!data}
                onClick={() => data && navigator.clipboard?.writeText(data.secret).then(() => toast(t('Copied')))}
                aria-label={t('Copy')}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <Field label={t('6-digit code')}>
            <CodeInput value={code} onChange={setCode} autoFocus onKeyDown={(e) => e.key === 'Enter' && code.length === 6 && enable()} />
          </Field>
          {error && <p className="text-xs text-rose-600">{t(error)}</p>}
        </div>
      </div>
    </Modal>
  );
}

const SETUP_COPY = {
  email: {
    title: 'Turn on email codes',
    intro: 'We’ll send a code to {to} to check it reaches you.',
    body: 'Each time you sign in, you’ll get a fresh code by email after entering your password.',
    field: 'Code from the email',
    hint: 'Didn’t get it? Check your spam folder, or wait a minute and send another.',
  },
  whatsapp: {
    title: 'Turn on WhatsApp codes',
    intro: 'We’ll send a code to your WhatsApp {to} to check it reaches you.',
    body: 'Each time you sign in, you’ll get a fresh code on WhatsApp after entering your password.',
    field: 'Code from WhatsApp',
    hint: 'Didn’t get it? Check the number in My profile → Notifications, or wait a minute and send another.',
  },
  telegram: {
    title: 'Turn on Telegram codes',
    intro: 'We’ll send a code to your Telegram chat {to} to check it reaches you.',
    body: 'Each time you sign in, you’ll get a fresh code in Telegram after entering your password.',
    field: 'Code from Telegram',
    hint: 'Didn’t get it? Make sure you started a chat with the workspace bot, or wait a minute and send another.',
  },
} as const;

/** Sends a setup code by email, WhatsApp or Telegram and turns the method on once it's entered. */
function ChannelSetup({ channel, to, onClose, onEnabled }: { channel: CodeChannel; to: string; onClose: () => void; onEnabled: (codes?: string[] | null) => void }) {
  const t = useT();
  const copy = SETUP_COPY[channel];
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  async function send() {
    setLoading(true);
    setError(null);
    const r = await sendJson('/api/me/two-factor', 'POST', { action: `${channel}-send` });
    setLoading(false);
    if (!r.ok) return setError(r.error!);
    setSent(true);
    setWait(60);
  }

  async function enable() {
    setLoading(true);
    setError(null);
    const r = await sendJson<{ recoveryCodes: string[] | null }>('/api/me/two-factor', 'POST', { action: `${channel}-enable`, code });
    setLoading(false);
    if (!r.ok) return setError(r.error!);
    onEnabled(r.data.recoveryCodes);
  }

  const Icon = channel === 'email' ? Mail : channel === 'whatsapp' ? MessageCircle : Send;
  return (
    <Modal
      open
      onClose={onClose}
      title={t(copy.title)}
      description={rich(t(copy.intro), { to: <strong className="text-slate-900" dir="ltr">{to}</strong> })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('Cancel')}
          </Button>
          {sent ? (
            <Button variant="primary" onClick={enable} loading={loading} disabled={code.length !== 6}>
              {t('Turn on')}
            </Button>
          ) : (
            <Button variant="primary" onClick={send} loading={loading}>
              <Icon className="h-4 w-4" /> {t('Send code')}
            </Button>
          )}
        </>
      }
    >
      {sent ? (
        <Field label={t(copy.field)} hint={t(copy.hint)}>
          <CodeInput value={code} onChange={setCode} autoFocus onKeyDown={(e) => e.key === 'Enter' && code.length === 6 && enable()} />
        </Field>
      ) : (
        <p className="text-sm text-slate-700">{t(copy.body)}</p>
      )}
      {error && (
        <p className="mt-3 text-sm text-rose-700" role="alert">
          {t(error)}
        </p>
      )}
      {sent && (
        <button type="button" onClick={send} disabled={loading || wait > 0} className="mt-3 text-xs font-semibold text-brand-700 hover:text-brand-800 disabled:text-slate-500">
          {wait > 0 ? t('Send a new code in {n}s', { n: wait }) : t('Send a new code')}
        </button>
      )}
    </Modal>
  );
}

function PasswordPrompt({ action, onClose, onDone }: { action: PasswordAction; onClose: () => void; onDone: (codes?: string[]) => void }) {
  const t = useT();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const copy = {
    'totp-disable': { title: 'Turn off the authenticator app?', button: 'Turn off' },
    'email-disable': { title: 'Turn off email codes?', button: 'Turn off' },
    'whatsapp-disable': { title: 'Turn off WhatsApp codes?', button: 'Turn off' },
    'telegram-disable': { title: 'Turn off Telegram codes?', button: 'Turn off' },
    recovery: { title: 'Create new recovery codes?', button: 'Create new codes' },
  }[action];

  async function submit() {
    setLoading(true);
    setError(null);
    const r = await sendJson<{ recoveryCodes?: string[] }>('/api/me/two-factor', 'POST', { action, password });
    setLoading(false);
    if (!r.ok) return setError(r.error!);
    onDone(r.data.recoveryCodes);
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t(copy.title)}
      description={action === 'recovery' ? t('Your old recovery codes stop working.') : t('Enter your password to confirm.')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button variant={action === 'recovery' ? 'primary' : 'danger'} onClick={submit} loading={loading} disabled={!password}>
            {t(copy.button)}
          </Button>
        </>
      }
    >
      <Field label={t('Password')}>
        <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus onKeyDown={(e) => e.key === 'Enter' && password && submit()} />
      </Field>
      {error && <p className="mt-2 text-xs text-rose-600">{t(error)}</p>}
    </Modal>
  );
}

function RecoveryCodes({ codes, onClose }: { codes: string[]; onClose: () => void }) {
  const t = useT();
  const toast = useToast();
  const text = codes.join('\n');

  function download() {
    const url = URL.createObjectURL(new Blob([`${t('FormCraft recovery codes')}\n\n${text}\n`], { type: 'text/plain' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'formcraft-recovery-codes.txt' });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('Save your recovery codes')}
      description={t('If you lose your phone or can’t get email, each code signs you in once. They are shown only now — keep them somewhere safe, like a password manager.')}
      footer={
        <>
          <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(text).then(() => toast(t('Copied')))}>
            <Copy className="h-4 w-4" /> {t('Copy')}
          </Button>
          <Button variant="secondary" onClick={download}>
            <Download className="h-4 w-4" /> {t('Download')}
          </Button>
          <Button variant="primary" onClick={onClose}>
            {t('I’ve saved them')}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200" dir="ltr">
        {codes.map((c) => (
          <code key={c} className="rounded-md bg-white px-2 py-1.5 text-center font-mono text-sm font-semibold tracking-wider text-slate-800 ring-1 ring-slate-200">
            {c}
          </code>
        ))}
      </div>
    </Modal>
  );
}
