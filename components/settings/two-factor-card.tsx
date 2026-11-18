'use client';

import { Copy, Download, LifeBuoy, Mail, MessageCircle, MessagesSquare, Send, ShieldCheck, Smartphone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { CodeInput } from '@/components/auth/code-input';
import { PasswordInput } from '@/components/auth/password-input';
import { useT } from '@/components/i18n';
import { useToast } from '@/components/toast';
import { Button, Modal } from '@/components/ui';
import { cn } from '@/lib/utils';
import { Field, SettingsCard, sendJson } from './settings-ui';

type CodeChannel = 'email' | 'whatsapp' | 'telegram';

/** One place a code by message can go, as the profile shows it (address already masked). */
export interface CodeDestination {
  channel: CodeChannel;
  available: boolean;
  to: string;
  /** Why it can't be used: the workspace can't send there, or the user hasn't saved an address. */
  reason: 'workspace' | 'missing' | null;
}

export interface TwoFactorStatus {
  totp: boolean;
  /** Codes by message (email / WhatsApp / Telegram) are on. */
  message: boolean;
  destinations: CodeDestination[];
  recoveryLeft: number;
  /** An admin requires two-factor sign-in for this user. */
  required?: boolean;
}

type PasswordAction = 'totp-disable' | 'message-disable' | 'recovery';

const OFF_TOAST: Record<Exclude<PasswordAction, 'recovery'>, string> = {
  'totp-disable': 'Authenticator app turned off',
  'message-disable': 'Codes by message turned off',
};

const CHANNEL_ICON = { email: Mail, whatsapp: MessageCircle, telegram: Send };
const CHANNEL_LABEL = { email: 'Email', whatsapp: 'WhatsApp', telegram: 'Telegram' };
const UNAVAILABLE: Record<CodeChannel, Record<'workspace' | 'missing', string>> = {
  email: { workspace: 'Not set up on this workspace', missing: 'No email on your account' },
  whatsapp: { workspace: 'Not linked on this workspace', missing: 'Add your number' },
  telegram: { workspace: 'No bot on this workspace', missing: 'Add your chat ID' },
};

/** Scrolls to the Notifications card (right after this one), where the WhatsApp number / Telegram chat ID is saved. */
function goToNotifications() {
  const el = document.getElementById('security')?.nextElementSibling;
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Small chip per destination: where codes go, or why that one can't be used yet. */
function DestinationChips({ list }: { list: CodeDestination[] }) {
  const t = useT();
  return (
    <div className="-mt-1 flex flex-wrap gap-1.5">
      {list.map((d) => {
        const Icon = CHANNEL_ICON[d.channel];
        const body = (
          <>
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="font-semibold">{t(CHANNEL_LABEL[d.channel])}</span>
            <span className={cn('min-w-0 break-words', d.available ? 'text-emerald-700' : 'text-slate-500')} dir={d.available ? 'ltr' : undefined}>
              {d.available ? d.to : t(UNAVAILABLE[d.channel][d.reason ?? 'workspace'])}
            </span>
          </>
        );
        const cls = cn(
          'inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] ring-1',
          d.available ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-slate-50 text-slate-600 ring-slate-200',
        );
        // A missing number / chat ID links to the Notifications card where it's saved.
        return d.reason === 'missing' && d.channel !== 'email' ? (
          <button key={d.channel} type="button" onClick={goToNotifications} className={cn(cls, 'underline-offset-2 hover:bg-slate-100 hover:underline')}>
            {body}
          </button>
        ) : (
          <span key={d.channel} className={cls}>
            {body}
          </span>
        );
      })}
    </div>
  );
}

/** Profile card: authenticator app (TOTP), codes by message (email + WhatsApp + Telegram) and recovery codes. */
export function TwoFactorCard({ status }: { status: TwoFactorStatus }) {
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const [totpSetup, setTotpSetup] = useState(false);
  const [messageSetup, setMessageSetup] = useState(false);
  const [confirm, setConfirm] = useState<PasswordAction | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const on = status.totp || status.message;
  const reachable = status.destinations.filter((d) => d.available);

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
          icon={<MessagesSquare className="h-4 w-4" />}
          title={t('Codes by message')}
          text={
            status.message && !reachable.length
              ? t('None of these can receive a code right now, so you’d need your authenticator app or a recovery code to sign in.')
              : t('When you sign in, a 6-digit code is sent to your email — or to WhatsApp or Telegram if you choose.')
          }
          warn={status.message && !reachable.length}
          on={status.message}
          extra={<DestinationChips list={status.destinations} />}
          action={
            status.message ? (
              <Button variant="secondary" onClick={() => setConfirm('message-disable')}>
                {t('Turn off')}
              </Button>
            ) : (
              <Button variant="primary" onClick={() => setMessageSetup(true)} disabled={!reachable.length}>
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
      {messageSetup && (
        <MessageSetup
          destinations={reachable}
          onClose={() => setMessageSetup(false)}
          onEnabled={(c) => {
            setMessageSetup(false);
            enabled(c, 'Codes by message turned on');
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

function Method({ icon, title, text, on, warn, extra, action }: { icon: ReactNode; title: string; text: ReactNode; on?: boolean; warn?: boolean; extra?: ReactNode; action: ReactNode }) {
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
      {extra && <div className="w-full ps-[3.25rem]">{extra}</div>}
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
      <div className="grid items-start gap-5 px-5 py-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:px-6">
        {/* Always white so the code scans, also in dark mode. */}
        <div className="mx-auto flex h-[188px] w-[188px] shrink-0 items-center justify-center rounded-xl p-2.5 ring-1 ring-slate-200" style={{ background: '#fff' }}>
          {data ? <img src={data.qr} alt={t('QR code for your authenticator app')} className="h-full w-full" /> : <span className="text-xs" style={{ color: '#64748b' }}>{t('Loading…')}</span>}
        </div>
        <div className="min-w-0 space-y-4">
          <div className="min-w-0">
            <span className="label">{t('Can’t scan it? Enter this key')}</span>
            <div className="flex min-w-0 items-start gap-2">
              <code className="min-w-0 flex-1 break-all rounded-md bg-slate-50 px-2 py-1.5 font-mono text-xs leading-relaxed text-slate-700 ring-1 ring-slate-200" dir="ltr">
                {data?.secret.replace(/(.{4})/g, '$1 ').trim() ?? '…'}
              </code>
              <Button
                variant="ghost"
                size="xs"
                className="shrink-0"
                disabled={!data}
                onClick={() => data && navigator.clipboard?.writeText(data.secret).then(() => toast(t('Copied')))}
                aria-label={t('Copy')}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <Field label={t('6-digit code')} className="min-w-0">
            <CodeInput className="w-full min-w-0 box-border" value={code} onChange={setCode} autoFocus onKeyDown={(e) => e.key === 'Enter' && code.length === 6 && enable()} />
          </Field>
          {error && <p className="text-xs text-rose-600">{t(error)}</p>}
        </div>
      </div>
    </Modal>
  );
}

/** Sends one setup code to every available destination at once and turns codes by message on once it's entered. */
function MessageSetup({ destinations, onClose, onEnabled }: { destinations: CodeDestination[]; onClose: () => void; onEnabled: (codes?: string[] | null) => void }) {
  const t = useT();
  const [sentTo, setSentTo] = useState<CodeDestination[] | null>(null);
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
    const r = await sendJson<{ sent: { channel: CodeChannel; to: string }[] }>('/api/me/two-factor', 'POST', { action: 'message-send' });
    setLoading(false);
    if (!r.ok) return setError(r.error!);
    setSentTo(r.data.sent.map((s) => ({ ...s, available: true, reason: null })));
    setWait(60);
  }

  async function enable() {
    setLoading(true);
    setError(null);
    const r = await sendJson<{ recoveryCodes: string[] | null }>('/api/me/two-factor', 'POST', { action: 'message-enable', code });
    setLoading(false);
    if (!r.ok) return setError(r.error!);
    onEnabled(r.data.recoveryCodes);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('Turn on codes by message')}
      description={t('We’ll send one code to all of these at once to check it reaches you.')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('Cancel')}
          </Button>
          {sentTo ? (
            <Button variant="primary" onClick={enable} loading={loading} disabled={code.length !== 6}>
              {t('Turn on')}
            </Button>
          ) : (
            <Button variant="primary" onClick={send} loading={loading}>
              <Send className="h-4 w-4" /> {t('Send code')}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4 px-5 py-5 sm:px-6">
        <div>
          <p className="text-sm text-slate-700">{sentTo ? t('Code sent to:') : t('Each time you sign in, you’ll get a fresh code — by email unless you pick WhatsApp or Telegram.')}</p>
          <div className="mt-3">
            <DestinationChips list={sentTo ?? destinations} />
          </div>
        </div>
        {sentTo && (
          <Field label={t('Code you received')} hint={t('Use whichever message arrives first. Didn’t get it? Check your spam folder, or wait a minute and send another.')} className="min-w-0">
            <CodeInput className="w-full min-w-0" value={code} onChange={setCode} autoFocus onKeyDown={(e) => e.key === 'Enter' && code.length === 6 && enable()} />
          </Field>
        )}
        {error && (
          <p className="text-sm text-rose-700" role="alert">
            {t(error)}
          </p>
        )}
        {sentTo && (
          <button type="button" onClick={send} disabled={loading || wait > 0} className="text-xs font-semibold text-brand-700 hover:text-brand-800 disabled:text-slate-500">
            {wait > 0 ? t('Send a new code in {n}s', { n: wait }) : t('Send a new code')}
          </button>
        )}
      </div>
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
    'message-disable': { title: 'Turn off codes by message?', button: 'Turn off' },
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
      <div className="px-5 py-5 sm:px-6">
        <Field label={t('Password')}>
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus onKeyDown={(e) => e.key === 'Enter' && password && submit()} />
        </Field>
        {error && <p className="mt-2 text-xs text-rose-600">{t(error)}</p>}
      </div>
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
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(text).then(() => toast(t('Copied')))}>
            <Copy className="h-4 w-4" /> {t('Copy')}
          </Button>
          <Button variant="secondary" onClick={download}>
            <Download className="h-4 w-4" /> {t('Download')}
          </Button>
          <Button variant="primary" onClick={onClose}>
            {t('I’ve saved them')}
          </Button>
        </div>
      }
    >
      <div className="px-5 py-5 sm:px-6">
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200 sm:p-4" dir="ltr">
          {codes.map((c) => (
            <code key={c} className="rounded-md bg-white px-2 py-1.5 text-center font-mono text-sm font-semibold tracking-wider text-slate-800 ring-1 ring-slate-200">
              {c}
            </code>
          ))}
        </div>
      </div>
    </Modal>
  );
}
