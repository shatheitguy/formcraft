'use client';

import { AlertCircle, ArrowLeft, ArrowRight, AtSign, KeyRound, LifeBuoy, Mail, MessageCircle, Send, Smartphone } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { useT } from '@/components/i18n';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { AuthShell } from './auth-shell';
import { CodeInput } from './code-input';
import { PasswordInput } from './password-input';

type CodeChannel = 'email' | 'whatsapp' | 'telegram';
type Method = 'totp' | CodeChannel | 'recovery';
const isChannel = (m: Method): m is CodeChannel => m === 'email' || m === 'whatsapp' || m === 'telegram';
/** Matches RESEND_SECONDS in lib/two-factor.ts. */
const RESEND_SECONDS = 60;
interface TwoFactor {
  methods: Method[];
  /** Masked destination per code channel, e.g. { whatsapp: '+•••4567' }. */
  sentTo?: Partial<Record<CodeChannel, string>>;
  /** Channel a code was already sent to (single-channel accounts), or null. */
  sent?: CodeChannel | null;
  sendError?: string | null;
  // Older response fields.
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

/** Second sign-in step: a code from the authenticator app, a code sent by email / WhatsApp / Telegram, or a recovery code. */
function SecondStep({ info, onDone, onRestart }: { info: TwoFactor; onDone: () => void; onRestart: (msg: string) => void }) {
  const t = useT();
  const sentTo = info.sentTo ?? (info.emailTo ? { email: info.emailTo } : {});
  const firstSent = info.sent ?? (info.emailSent ? 'email' : null);
  const [method, setMethod] = useState<Method>(firstSent ?? info.methods[0]);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(info.sendError ?? info.emailError ?? null);
  /** The channel the newest code went to (only that code works). */
  const [lastSent, setLastSent] = useState<CodeChannel | null>(firstSent);
  /** Seconds until each channel can send again. */
  const [wait, setWait] = useState<Partial<Record<CodeChannel, number>>>(firstSent ? { [firstSent]: RESEND_SECONDS } : {});
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!Object.values(wait).some((n) => n && n > 0)) return;
    const id = setTimeout(() => setWait((w) => Object.fromEntries(Object.entries(w).map(([k, n]) => [k, Math.max(0, (n ?? 0) - 1)]))), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  const channel = isChannel(method) ? method : null;

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

  async function send() {
    if (!channel) return;
    setError(null);
    setSending(true);
    const { ok, json } = await post('/api/auth/2fa', { action: 'send', channel });
    setSending(false);
    if (json.restart) return onRestart(json.error ?? 'Your sign-in timed out. Enter your password again.');
    if (ok) {
      setLastSent(channel);
      setWait((w) => ({ ...w, [channel]: RESEND_SECONDS }));
      setCode('');
    } else {
      setError(json.error ?? 'Could not reach the server.');
      if (typeof json.error === 'string' && json.error.startsWith('Please wait')) setWait((w) => ({ ...w, [channel]: w[channel] || 30 }));
    }
  }

  function choose(m: Method) {
    setMethod(m);
    setCode('');
    setError(null);
  }

  const copy = {
    totp: { title: 'Enter the code from your authenticator app', hint: 'Open Google Authenticator, Microsoft Authenticator, 1Password or similar and type the 6-digit code for this account.' },
    email: { title: 'Enter the code we emailed you', hint: 'The code expires in 10 minutes. Check your spam folder if it hasn’t arrived.' },
    whatsapp: { title: 'Enter the code we sent on WhatsApp', hint: 'The code expires in 10 minutes. Only the newest code works.' },
    telegram: { title: 'Enter the code we sent in Telegram', hint: 'The code expires in 10 minutes. Only the newest code works.' },
    recovery: { title: 'Enter a recovery code', hint: 'Use one of the codes you saved when you turned on two-factor sign-in. Each code works once.' },
  }[method];
  const icons = { totp: Smartphone, email: Mail, whatsapp: MessageCircle, telegram: Send, recovery: LifeBuoy };
  const labels = { totp: 'Authenticator app', email: 'Email code', whatsapp: 'WhatsApp code', telegram: 'Telegram code', recovery: 'Recovery code' };
  const sentNotice = { email: 'We emailed a 6-digit code to {email}.', whatsapp: 'We sent a 6-digit code to your WhatsApp {to}.', telegram: 'We sent a 6-digit code to your Telegram {to}.' };
  const sendLabel = { email: 'Email me a code', whatsapp: 'Send code on WhatsApp', telegram: 'Send code in Telegram' };
  const codeReady = !channel || lastSent === channel;
  const left = channel ? wait[channel] ?? 0 : 0;
  const ChannelIcon = channel ? icons[channel] : Mail;

  return (
    <AuthShell title={t('Two-factor sign-in')} subtitle={t('One more step to keep your account safe.')}>
      <form onSubmit={verify} className="space-y-4">
        {info.methods.length > 1 && (
          <div role="radiogroup" aria-label={t('Choose how to get your code')} className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(5.75rem, 1fr))' }}>
            {info.methods.map((m) => {
              const Icon = icons[m];
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={method === m}
                  onClick={() => choose(m)}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-lg px-2 py-2.5 text-center text-xs font-semibold ring-1 transition',
                    method === m ? 'bg-brand-50 text-brand-800 ring-2 ring-brand-500' : 'text-slate-700 ring-slate-300 hover:bg-slate-50',
                  )}
                >
                  <Icon className="h-4 w-4" /> {t(labels[m])}
                </button>
              );
            })}
          </div>
        )}

        {channel && !codeReady ? (
          <div className="space-y-3 rounded-lg bg-slate-50 px-4 py-3.5 ring-1 ring-slate-200">
            <p className="text-sm text-slate-700">
              {t(channel === 'email' ? 'We’ll email a 6-digit code to {to}.' : channel === 'whatsapp' ? 'We’ll send a 6-digit code to your WhatsApp {to}.' : 'We’ll send a 6-digit code to your Telegram {to}.', { to: sentTo[channel] ?? '' })}
            </p>
            <Button type="button" variant="primary" size="md" className="h-11 w-full" onClick={send} loading={sending} disabled={left > 0}>
              <ChannelIcon className="h-4 w-4" /> {left > 0 ? t('Send a new code in {n}s', { n: left }) : t(sendLabel[channel])}
            </Button>
          </div>
        ) : (
          <div>
            <label className="label" htmlFor="code">
              {t(copy.title)}
            </label>
            <CodeInput id="code" autoFocus value={code} onChange={setCode} recovery={method === 'recovery'} />
            <p className="mt-2 text-xs text-slate-600">{t(copy.hint)}</p>
          </div>
        )}

        {channel && codeReady && (
          <div className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800 ring-1 ring-emerald-200">
            <ChannelIcon className="mt-0.5 h-4 w-4 shrink-0" /> {t(sentNotice[channel], { email: sentTo.email ?? '', to: sentTo[channel] ?? '' })}
          </div>
        )}
        <ErrorNote error={error} />
        {error && channel && info.methods.length > 1 && (
          <p className="text-xs text-slate-600">{t('Not working? Choose another method above.')}</p>
        )}

        {codeReady && (
          <Button type="submit" variant="primary" size="md" className="h-11 w-full" loading={loading} disabled={method === 'recovery' ? code.replace(/-/g, '').length < 8 : code.length !== 6}>
            <KeyRound className="h-4 w-4" /> {t('Verify and sign in')}
          </Button>
        )}

        <div className="flex items-center justify-between gap-2 text-xs">
          <button type="button" onClick={() => onRestart('')} className="inline-flex items-center gap-1 font-semibold text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" /> {t('Back')}
          </button>
          {channel && codeReady && (
            <button type="button" onClick={send} disabled={sending || left > 0} className="font-semibold text-brand-700 hover:text-brand-800 disabled:text-slate-500">
              {sending ? t('Sending…') : left > 0 ? t('Send a new code in {n}s', { n: left }) : t('Send a new code')}
            </button>
          )}
        </div>
      </form>
    </AuthShell>
  );
}
