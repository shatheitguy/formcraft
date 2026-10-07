'use client';

import { Copy, Download, LifeBuoy, Mail, ShieldCheck, Smartphone } from 'lucide-react';
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
  recoveryLeft: number;
}

type PasswordAction = 'totp-disable' | 'email-disable' | 'recovery';

/** Profile card: authenticator app (TOTP), email codes and recovery codes. */
export function TwoFactorCard({ status, emailAvailable, email }: { status: TwoFactorStatus; emailAvailable: boolean; email: string }) {
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const [totpSetup, setTotpSetup] = useState(false);
  const [emailSetup, setEmailSetup] = useState(false);
  const [confirm, setConfirm] = useState<PasswordAction | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const on = status.totp || status.email;

  function enabled(recoveryCodes: string[] | null | undefined, message: string) {
    toast(t(message));
    if (recoveryCodes?.length) setCodes(recoveryCodes);
    router.refresh();
  }

  return (
    <SettingsCard
      title={t('Two-factor sign-in')}
      description={t('Ask for a code after your password, so a stolen password alone can’t get into your account.')}
      icon={<ShieldCheck />}
      aside={<span className={cn('chip', on ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-500')}>{on ? t('On') : t('Off')}</span>}
    >
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
              <Button variant="primary" onClick={() => setEmailSetup(true)} disabled={!emailAvailable}>
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
      {emailSetup && <EmailSetup email={email} onClose={() => setEmailSetup(false)} onEnabled={(c) => { setEmailSetup(false); enabled(c, 'Email codes turned on'); }} />}
      {confirm && (
        <PasswordPrompt
          action={confirm}
          onClose={() => setConfirm(null)}
          onDone={(c) => {
            setConfirm(null);
            if (confirm === 'recovery') setCodes(c ?? null);
            else toast(t(confirm === 'totp-disable' ? 'Authenticator app turned off' : 'Email codes turned off'));
            router.refresh();
          }}
        />
      )}
      {codes && <RecoveryCodes codes={codes} onClose={() => setCodes(null)} />}
    </SettingsCard>
  );
}

function Method({ icon, title, text, on, warn, action }: { icon: ReactNode; title: string; text: string; on?: boolean; warn?: boolean; action: ReactNode }) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', on ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500')}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          {title}
          {on && <span className="rounded bg-emerald-50 px-1.5 text-[10px] font-semibold uppercase text-emerald-700">{t('On')}</span>}
        </div>
        <p className={cn('text-xs', warn ? 'text-amber-600' : 'text-slate-500')}>{text}</p>
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

function EmailSetup({ email, onClose, onEnabled }: { email: string; onClose: () => void; onEnabled: (codes?: string[] | null) => void }) {
  const t = useT();
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function send() {
    setLoading(true);
    setError(null);
    const r = await sendJson('/api/me/two-factor', 'POST', { action: 'email-send' });
    setLoading(false);
    if (!r.ok) return setError(r.error!);
    setSent(true);
  }

  async function enable() {
    setLoading(true);
    setError(null);
    const r = await sendJson<{ recoveryCodes: string[] | null }>('/api/me/two-factor', 'POST', { action: 'email-enable', code });
    setLoading(false);
    if (!r.ok) return setError(r.error!);
    onEnabled(r.data.recoveryCodes);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('Turn on email codes')}
      description={rich(t('We’ll send a code to {email} to check it reaches you.'), { email: <strong className="text-slate-900">{email}</strong> })}
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
              <Mail className="h-4 w-4" /> {t('Send code')}
            </Button>
          )}
        </>
      }
    >
      {sent ? (
        <Field label={t('Code from the email')} hint={t('Didn’t get it? Check your spam folder, or wait a minute and send another.')}>
          <CodeInput value={code} onChange={setCode} autoFocus onKeyDown={(e) => e.key === 'Enter' && code.length === 6 && enable()} />
        </Field>
      ) : (
        <p className="text-sm text-slate-600">{t('Each time you sign in, you’ll get a fresh code by email after entering your password.')}</p>
      )}
      {error && <p className="mt-3 text-xs text-rose-600">{t(error)}</p>}
      {sent && (
        <button type="button" onClick={send} disabled={loading} className="mt-3 text-xs font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50">
          {t('Send a new code')}
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
