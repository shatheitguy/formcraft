'use client';

import { AlertCircle, ArrowLeft, ArrowRight, AtSign, KeyRound, LifeBuoy, Mail, MessageCircle, MessagesSquare, Send, Smartphone } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, useEffect, useState, type ClipboardEvent, type FormEvent, type ReactNode } from 'react';
import { useT } from '@/components/i18n';
import { Button, Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';
import { AuthShell } from './auth-shell';
import { CodeInput } from './code-input';
import { PasswordInput } from './password-input';

export type CodeChannel = 'email' | 'whatsapp' | 'telegram';
type Method = 'totp' | 'message' | 'recovery';
interface TwoFactor {
  methods: Method[];
  /** Places a code by message can go right now, with masked addresses. */
  destinations?: { channel: CodeChannel; to: string }[];
  /** Lifetime of a sign-in code, and the gap between two codes. */
  codeMinutes?: number;
  resendSeconds?: number;
}

export async function post(url: string, body: unknown) {
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


/** "2:59" */
export const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

const CHANNEL_ICON = { email: Mail, whatsapp: MessageCircle, telegram: Send };
const CHANNEL_LABEL = { email: 'Email', whatsapp: 'WhatsApp', telegram: 'Telegram' };
const METHOD_ICON = { totp: Smartphone, message: MessagesSquare, recovery: LifeBuoy };
const SENDING = { email: 'Sending a code to your email…', whatsapp: 'Sending a code to your WhatsApp…', telegram: 'Sending a code to your Telegram…' };
const SENT = { email: 'Code sent to your email {to}.', whatsapp: 'Code sent to your WhatsApp {to}.', telegram: 'Code sent to your Telegram {to}.' };
const OTHER_LABEL = { totp: 'Use your authenticator app instead', message: 'Get a code by email or message instead', recovery: 'Use a recovery code' };

/** Row of Email · WhatsApp · Telegram buttons; tapping one sends a code there. */
export function ChannelButtons({
  options,
  active,
  sending,
  disabled,
  onPick,
}: {
  options: { channel: CodeChannel; to?: string }[];
  active: CodeChannel | null;
  sending: CodeChannel | null;
  disabled?: boolean;
  onPick: (c: CodeChannel) => void;
}) {
  const t = useT();
  return (
    <div role="radiogroup" aria-label={t('Send the code to')} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((d) => {
        const Icon = CHANNEL_ICON[d.channel];
        const on = active === d.channel;
        return (
          <button
            key={d.channel}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onPick(d.channel)}
            disabled={disabled}
            className={cn(
              'flex min-w-0 flex-col items-center gap-0.5 rounded-lg px-1.5 py-2.5 text-center ring-1 transition disabled:cursor-not-allowed',
              on ? 'bg-brand-50 text-brand-800 ring-2 ring-brand-500' : 'text-slate-700 ring-slate-300 hover:bg-slate-50 disabled:opacity-60',
            )}
          >
            {sending === d.channel ? <Spinner className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
            <span className="text-xs font-semibold">{t(CHANNEL_LABEL[d.channel])}</span>
            {d.to !== undefined && (
              <span className="w-full truncate text-[11px] font-normal text-slate-500" dir="ltr">
                {d.to}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Swaps `{name}` placeholders in a translated sentence for React nodes. */
function rich(text: string, nodes: Record<string, ReactNode>): ReactNode {
  return text.split(/(\{\w+\})/g).map((part, i) => {
    const m = /^\{(\w+)\}$/.exec(part);
    return m && m[1] in nodes ? <Fragment key={i}>{nodes[m[1]]}</Fragment> : part;
  });
}

/**
 * Second sign-in step: a code sent by email / WhatsApp / Telegram (the user picks where; email by
 * default, sent straight away), a code from the authenticator app, or a recovery code.
 */
function SecondStep({ info, onDone, onRestart }: { info: TwoFactor; onDone: () => void; onRestart: (msg: string) => void }) {
  const t = useT();
  const destinations = info.destinations ?? [];
  const codeSeconds = (info.codeMinutes ?? 3) * 60;
  const resendSeconds = info.resendSeconds ?? 60;
  const [method, setMethod] = useState<Method>(info.methods[0]);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  /** Where a code is being sent right now. */
  const [sending, setSending] = useState<CodeChannel | null>(null);
  /** The newest code: where it went and when it expires (only that code works). */
  const [sent, setSent] = useState<{ channel: CodeChannel; to: string; expiresAt: number } | null>(null);
  /** When the next code can be asked for. */
  const [nextSendAt, setNextSendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [autoSent, setAutoSent] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const wait = Math.max(0, Math.ceil((nextSendAt - now) / 1000));
  const left = sent ? Math.max(0, Math.ceil((sent.expiresAt - now) / 1000)) : 0;
  const expired = !!sent && left === 0;

  async function send(channel: CodeChannel) {
    setError(null);
    setSending(channel);
    setCode('');
    const { ok, json } = await post('/api/auth/2fa', { action: 'send', channel });
    setSending(null);
    if (json.restart) return onRestart(json.error ?? 'Your sign-in timed out. Enter your password again.');
    if (ok) {
      const s = json.sent as { channel: CodeChannel; to: string } | undefined;
      setSent({ channel, to: s?.to ?? '', expiresAt: Date.now() + Number(json.expiresIn ?? codeSeconds) * 1000 });
      setNextSendAt(Date.now() + resendSeconds * 1000);
      return;
    }
    setError(json.error ?? 'Could not reach the server.');
    if (typeof json.wait === 'number') setNextSendAt(Date.now() + json.wait * 1000);
  }

  // Codes by message: the code goes to email (or the first place available) as soon as this shows.
  useEffect(() => {
    if (method !== 'message' || autoSent || !destinations.length) return;
    setAutoSent(true);
    void send((destinations.find((d) => d.channel === 'email') ?? destinations[0]).channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method]);

  async function verify(e?: FormEvent) {
    e?.preventDefault();
    if (verifying) return;
    setError(null);
    setVerifying(true);
    const { ok, json } = await post('/api/auth/2fa', { action: 'verify', method, code });
    if (ok) return onDone();
    setVerifying(false);
    if (json.restart) return onRestart(json.error ?? 'Your sign-in timed out. Enter your password again.');
    const n = typeof json.attemptsLeft === 'number' ? json.attemptsLeft : null;
    const msg = json.error ?? 'Could not reach the server.';
    setError(n != null && n <= 3 ? `${t(msg)} ${n === 1 ? t('1 try left.') : t('{n} tries left.', { n })}` : msg);
    setCode('');
  }

  const canType = method !== 'message' || (!!sent && !expired && !sending);

  // Six digits is a whole code: check it straight away, typed or pasted.
  useEffect(() => {
    if (method !== 'recovery' && code.length === 6 && canType && !verifying) void verify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  function choose(m: Method) {
    setMethod(m);
    setCode('');
    setError(null);
  }

  /** Accepts a pasted code like "123 456" or "Your code: 123456". */
  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    if (method === 'recovery') return;
    const digits = e.clipboardData.getData('text').replace(/\D/g, '');
    if (digits.length >= 6) {
      e.preventDefault();
      setCode(digits.slice(-6));
    }
  }

  const copy = {
    totp: { title: 'Enter the code from your authenticator app', hint: 'Open Google Authenticator, Microsoft Authenticator, 1Password or similar and type the 6-digit code for this account.' },
    message: { title: 'Enter the 6-digit code', hint: 'Only the newest code works.' },
    recovery: { title: 'Enter a recovery code', hint: 'Use one of the codes you saved when you turned on two-factor sign-in. Each code works once.' },
  }[method];
  const others = info.methods.filter((m) => m !== method);

  return (
    <AuthShell title={t('Two-factor sign-in')} subtitle={t('One more step to keep your account safe.')}>
      <form onSubmit={verify} className="space-y-4">
        {method === 'message' && (
          <div>
            <p className="label">{t('Send the code to')}</p>
            {destinations.length ? (
              <ChannelButtons
                options={destinations}
                active={sending ?? sent?.channel ?? null}
                sending={sending}
                disabled={!!sending || verifying || wait > 0}
                onPick={send}
              />
            ) : (
              <ErrorNote error="Email, WhatsApp and Telegram aren’t available for your account right now. Use another way below, or ask an admin." />
            )}
          </div>
        )}

        {method === 'message' && sent && !sending && (
          <div
            className={cn(
              'flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg px-3 py-2.5 text-sm ring-1',
              expired ? 'bg-amber-50 text-amber-900 ring-amber-200' : 'bg-emerald-50 text-emerald-800 ring-emerald-200',
            )}
            aria-live="polite"
          >
            <span className="min-w-0">{expired ? t('Code expired — send a new one.') : rich(t(SENT[sent.channel]), { to: <strong dir="ltr">{sent.to}</strong> })}</span>
            {!expired && <span className="shrink-0 text-xs tabular-nums">{t('Expires in {time}', { time: clock(left) })}</span>}
          </div>
        )}

        {method === 'message' && sending ? (
          <div className="space-y-2" aria-live="polite">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Spinner className="h-4 w-4 text-brand-600" /> {t(SENDING[sending])}
            </div>
            <div className="h-14 animate-pulse rounded-lg bg-slate-100" />
          </div>
        ) : (
          (method !== 'message' || sent) && (
            <div>
              <label className="label" htmlFor="code">
                {t(copy.title)}
              </label>
              <CodeInput
                id="code"
                autoFocus
                value={code}
                onChange={setCode}
                onPaste={onPaste}
                recovery={method === 'recovery'}
                disabled={verifying || !canType}
                className="h-14 text-2xl"
              />
              <p className="mt-2 text-xs text-slate-600">{t(copy.hint)}</p>
            </div>
          )
        )}

        <ErrorNote error={error} />

        {(method !== 'message' || sent) && (
          <Button
            type="submit"
            variant="primary"
            size="md"
            className="h-11 w-full"
            loading={verifying}
            disabled={!canType || (method === 'recovery' ? code.replace(/-/g, '').length < 8 : code.length !== 6)}
          >
            <KeyRound className="h-4 w-4" /> {t('Verify and sign in')}
          </Button>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <button type="button" onClick={() => onRestart('')} className="inline-flex items-center gap-1 font-semibold text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" /> {t('Back')}
          </button>
          {method === 'message' && sent && (
            <button
              type="button"
              onClick={() => send(sent.channel)}
              disabled={!!sending || verifying || wait > 0}
              className="font-semibold text-brand-700 hover:text-brand-800 disabled:text-slate-500"
            >
              {wait > 0 ? t('Resend in {time}', { time: clock(wait) }) : t('Resend code')}
            </button>
          )}
        </div>

        {others.length > 0 && (
          <div className="space-y-2 border-t border-slate-100 pt-4">
            {others.map((m) => {
              const Icon = METHOD_ICON[m];
              return (
                <button key={m} type="button" onClick={() => choose(m)} className="flex w-full items-center justify-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-800">
                  <Icon className="h-3.5 w-3.5" /> {t(OTHER_LABEL[m])}
                </button>
              );
            })}
          </div>
        )}
      </form>
    </AuthShell>
  );
}
