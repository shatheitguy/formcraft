'use client';

import { AlertCircle, ArrowLeft, ArrowRight, AtSign, KeyRound, LifeBuoy, Mail, Smartphone } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useT } from '@/components/i18n';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { AuthShell } from './auth-shell';
import { CodeInput } from './code-input';
import { PasswordInput } from './password-input';

type Method = 'totp' | 'email' | 'recovery';
interface TwoFactor {
  methods: Method[];
  emailTo: string | null;
  emailSent: boolean;
  emailError: string | null;
}

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  const json = (await res?.json().catch(() => ({}))) ?? {};
  return { ok: !!res?.ok, json: json as Record<string, unknown> & { error?: string } };
}

export function LoginForm({ next, resetByEmail }: { next: string; resetByEmail: boolean }) {
  const router = useRouter();
  const t = useT();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [twoFactor, setTwoFactor] = useState<TwoFactor | null>(null);

  function done() {
    router.replace(next);
    router.refresh();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { ok, json } = await post('/api/auth/login', { identifier, password });
    if (ok && json.twoFactor) {
      setTwoFactor(json.twoFactor as TwoFactor);
      setLoading(false);
      return;
    }
    if (ok) return done();
    setError(json.error ?? 'Could not reach the server.');
    setLoading(false);
  }

  if (twoFactor) {
    return (
      <SecondStep
        info={twoFactor}
        onDone={done}
        onRestart={(msg) => {
          setTwoFactor(null);
          setPassword('');
          setError(msg);
        }}
      />
    );
  }

  return (
    <AuthShell title={t('Welcome back')} subtitle={t('Sign in to manage your forms and responses.')}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="identifier">
            {t('Username or email')}
          </label>
          <div className="relative">
            <AtSign className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="identifier"
              className="input h-11 ps-9"
              dir="ltr"
              autoComplete="username"
              autoFocus
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="you@company.com"
            />
          </div>
        </div>
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <label className="label" htmlFor="password">
              {t('Password')}
            </label>
            {resetByEmail && (
              <Link href="/forgot" className="text-xs font-medium text-brand-600 hover:text-brand-700">
                {t('Forgot password?')}
              </Link>
            )}
          </div>
          <PasswordInput id="password" className="h-11" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" dir="ltr" />
        </div>

        <ErrorNote error={error} />

        <Button type="submit" variant="primary" size="md" className="h-11 w-full" loading={loading} disabled={!identifier || !password}>
          {t('Sign in')} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
        </Button>
      </form>
      {!resetByEmail && <p className="mt-8 text-center text-xs text-slate-400">{t('Forgot your password? Ask a workspace admin to reset it.')}</p>}
    </AuthShell>
  );
}

export function ErrorNote({ error }: { error: string | null }) {
  const t = useT();
  if (!error) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 ring-1 ring-rose-200" role="alert">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {t(error)}
    </div>
  );
}

/** Second sign-in step: a code from the authenticator app, an emailed code, or a recovery code. */
function SecondStep({ info, onDone, onRestart }: { info: TwoFactor; onDone: () => void; onRestart: (msg: string) => void }) {
  const t = useT();
  const [method, setMethod] = useState<Method>(info.methods[0]);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(info.emailError);
  const [notice, setNotice] = useState<string | null>(info.emailSent ? 'We emailed a 6-digit code to {email}.' : null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  async function verify(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { ok, json } = await post('/api/auth/2fa', { action: 'verify', method, code });
    if (ok) return onDone();
    setLoading(false);
    if (json.restart) return onRestart(json.error ?? 'Your sign-in timed out. Enter your password again.');
    setError(json.error ?? 'Could not reach the server.');
    setCode('');
  }

  async function sendEmail() {
    setError(null);
    setSending(true);
    const { ok, json } = await post('/api/auth/2fa', { action: 'send' });
    setSending(false);
    if (json.restart) return onRestart(json.error ?? 'Your sign-in timed out. Enter your password again.');
    if (ok) setNotice('We emailed a 6-digit code to {email}.');
    else setError(json.error ?? 'Could not reach the server.');
  }

  function choose(m: Method) {
    setMethod(m);
    setCode('');
    setError(null);
    if (m === 'email' && !notice) void sendEmail();
  }

  const copy = {
    totp: { title: 'Enter the code from your authenticator app', hint: 'Open Google Authenticator, Microsoft Authenticator, 1Password or similar and type the 6-digit code for this account.' },
    email: { title: 'Enter the code we emailed you', hint: 'The code expires in 10 minutes. Check your spam folder if it hasn’t arrived.' },
    recovery: { title: 'Enter a recovery code', hint: 'Use one of the codes you saved when you turned on two-factor sign-in. Each code works once.' },
  }[method];
  const icons = { totp: Smartphone, email: Mail, recovery: LifeBuoy };
  const labels = { totp: 'Authenticator app', email: 'Email code', recovery: 'Recovery code' };

  return (
    <AuthShell title={t('Two-factor sign-in')} subtitle={t('One more step to keep your account safe.')}>
      <form onSubmit={verify} className="space-y-4">
        {info.methods.length > 1 && (
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${info.methods.length}, minmax(0, 1fr))` }}>
            {info.methods.map((m) => {
              const Icon = icons[m];
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => choose(m)}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-lg px-2 py-2.5 text-xs font-medium ring-1 transition',
                    method === m ? 'bg-brand-50 text-brand-700 ring-brand-300' : 'text-slate-600 ring-slate-200 hover:bg-slate-50',
                  )}
                >
                  <Icon className="h-4 w-4" /> {t(labels[m])}
                </button>
              );
            })}
          </div>
        )}

        <div>
          <label className="label" htmlFor="code">
            {t(copy.title)}
          </label>
          <CodeInput id="code" autoFocus value={code} onChange={setCode} recovery={method === 'recovery'} />
          <p className="mt-2 text-xs text-slate-500">{t(copy.hint)}</p>
        </div>

        {method === 'email' && notice && (
          <div className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700 ring-1 ring-emerald-200">
            <Mail className="mt-0.5 h-4 w-4 shrink-0" /> {t(notice, { email: info.emailTo ?? '' })}
          </div>
        )}
        <ErrorNote error={error} />

        <Button type="submit" variant="primary" size="md" className="h-11 w-full" loading={loading} disabled={method === 'recovery' ? code.replace(/-/g, '').length < 8 : code.length !== 6}>
          <KeyRound className="h-4 w-4" /> {t('Verify and sign in')}
        </Button>

        <div className="flex items-center justify-between gap-2 text-xs">
          <button type="button" onClick={() => onRestart('')} className="inline-flex items-center gap-1 font-medium text-slate-500 hover:text-slate-700">
            <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" /> {t('Back')}
          </button>
          {method === 'email' && (
            <button type="button" onClick={sendEmail} disabled={sending} className="font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50">
              {sending ? t('Sending…') : t('Send a new code')}
            </button>
          )}
        </div>
      </form>
    </AuthShell>
  );
}
