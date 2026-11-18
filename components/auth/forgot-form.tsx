'use client';

import { ArrowLeft, ArrowRight, AtSign, CheckCircle2, KeyRound } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, type ClipboardEvent, type FormEvent } from 'react';
import { useT } from '@/components/i18n';
import { Button, Spinner, buttonClass } from '@/components/ui';
import { cn } from '@/lib/utils';
import { AuthShell } from './auth-shell';
import { CodeInput } from './code-input';
import { ChannelButtons, ErrorNote, clock, post, type CodeChannel } from './login-form';
import { PasswordInput, StrengthMeter } from './password-input';

const SENDING = { email: 'Sending a code to your email…', whatsapp: 'Sending a code to your WhatsApp…', telegram: 'Sending a code to your Telegram…' };

/**
 * Forgot password: username or email → pick Email / WhatsApp / Telegram (only what the workspace
 * has set up) → 6-digit code → new password. Answers never reveal whether the account exists.
 */
export function ForgotForm({ channels }: { channels: CodeChannel[] }) {
  const t = useT();
  const [step, setStep] = useState<'ask' | 'code' | 'password' | 'done'>('ask');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState({ next: '', confirm: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState<CodeChannel | null>(null);
  /** The newest request: where it went and when that code expires. */
  const [sent, setSent] = useState<{ channel: CodeChannel; message: string; expiresAt: number } | null>(null);
  const [nextSendAt, setNextSendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

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
    const { ok, json } = await post('/api/auth/forgot', { identifier, channel });
    setSending(null);
    if (!ok) return setError(json.error ?? 'Could not reach the server.');
    setSent({ channel, message: String(json.message ?? ''), expiresAt: Date.now() + Number(json.expiresIn ?? 180) * 1000 });
    setNextSendAt(Date.now() + Number(json.resendSeconds ?? 60) * 1000);
  }

  async function checkCode() {
    if (loading) return;
    setError(null);
    setLoading(true);
    const { ok, json } = await post('/api/auth/reset', { identifier, code, check: true });
    setLoading(false);
    if (!ok) {
      setCode('');
      return setError(json.error ?? 'Could not reach the server.');
    }
    setStep('password');
  }

  // Six digits is a whole code: check it straight away, typed or pasted.
  useEffect(() => {
    if (step === 'code' && code.length === 6 && sent && !expired && !loading) void checkCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const digits = e.clipboardData.getData('text').replace(/\D/g, '');
    if (digits.length >= 6) {
      e.preventDefault();
      setCode(digits.slice(-6));
    }
  }

  async function reset(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw.next !== pw.confirm) return setError('Passwords don’t match.');
    setLoading(true);
    const { ok, json } = await post('/api/auth/reset', { identifier, code, password: pw.next });
    setLoading(false);
    if (!ok) return setError(json.error ?? 'Could not reach the server.');
    setStep('done');
  }

  function backTo(s: 'ask' | 'code') {
    setStep(s);
    setError(null);
    setCode('');
    if (s === 'ask') setSent(null);
  }

  const backLink = (
    <Link href="/login" className="mt-6 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700">
      <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" /> {t('Back to sign in')}
    </Link>
  );

  if (!channels.length) {
    return (
      <AuthShell title={t('Reset your password')} subtitle={t('Password reset isn’t set up on this workspace. Ask an admin to reset your password.')}>
        {backLink}
      </AuthShell>
    );
  }

  if (step === 'done') {
    return (
      <AuthShell title={t('Password changed')} subtitle={t('You can now sign in with your new password. Every other device was signed out.')}>
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-3 text-sm text-emerald-700 ring-1 ring-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> {t('Your password has been reset.')}
        </div>
        <Link href="/login" className={buttonClass('primary', 'md', 'mt-4 h-11 w-full')}>
          {t('Sign in')}
        </Link>
      </AuthShell>
    );
  }

  if (step === 'ask') {
    return (
      <AuthShell title={t('Reset your password')} subtitle={t('Enter your username or email, then choose where to get a code to set a new password.')}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (identifier.trim()) setStep('code');
          }}
          className="space-y-4"
        >
          <div>
            <label className="label" htmlFor="identifier">
              {t('Username or email')}
            </label>
            <div className="relative">
              <AtSign className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input id="identifier" className="input h-11 ps-9" dir="ltr" autoComplete="username" autoFocus value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="you@company.com" />
            </div>
          </div>
          <Button type="submit" variant="primary" size="md" className="h-11 w-full" disabled={!identifier.trim()}>
            {t('Continue')} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
          </Button>
        </form>
        {backLink}
      </AuthShell>
    );
  }

  if (step === 'password') {
    return (
      <AuthShell title={t('Choose a new password')} subtitle={t('Your code is confirmed. Every other device will be signed out.')}>
        <form onSubmit={reset} className="space-y-4">
          <div>
            <label className="label" htmlFor="new-password">
              {t('New password')}
            </label>
            <PasswordInput id="new-password" className="h-11" autoComplete="new-password" autoFocus value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} placeholder={t('At least 8 characters')} dir="ltr" disabled={loading} />
            <StrengthMeter password={pw.next} />
          </div>
          <div>
            <label className="label" htmlFor="confirm-password">
              {t('Confirm password')}
            </label>
            <PasswordInput id="confirm-password" className="h-11" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))} dir="ltr" disabled={loading} />
          </div>
          <ErrorNote error={error} />
          <Button type="submit" variant="primary" size="md" className="h-11 w-full" loading={loading} disabled={pw.next.length < 8 || !pw.confirm}>
            <KeyRound className="h-4 w-4" /> {t('Set new password')}
          </Button>
          <button type="button" onClick={() => backTo('code')} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" /> {t('Back')}
          </button>
        </form>
      </AuthShell>
    );
  }

  // step === 'code'
  return (
    <AuthShell title={t('Get a reset code')} subtitle={t('Where should we send the code for {who}?', { who: identifier.trim() })}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (code.length === 6) void checkCode();
        }}
        className="space-y-4"
      >
        <div>
          <p className="label">{t('Send the code to')}</p>
          <ChannelButtons options={channels.map((channel) => ({ channel }))} active={sending ?? sent?.channel ?? null} sending={sending} disabled={!!sending || loading || wait > 0} onPick={send} />
        </div>

        {sent && !sending && (
          <div
            className={cn(
              'space-y-1 rounded-lg px-3 py-2.5 text-sm ring-1',
              expired ? 'bg-amber-50 text-amber-900 ring-amber-200' : 'bg-emerald-50 text-emerald-800 ring-emerald-200',
            )}
            aria-live="polite"
          >
            <p>{expired ? t('Code expired — send a new one.') : t(sent.message)}</p>
            {!expired && <p className="text-xs tabular-nums">{t('Expires in {time}', { time: clock(left) })}</p>}
          </div>
        )}

        {sending ? (
          <div className="space-y-2" aria-live="polite">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Spinner className="h-4 w-4 text-brand-600" /> {t(SENDING[sending])}
            </div>
            <div className="h-14 animate-pulse rounded-lg bg-slate-100" />
          </div>
        ) : (
          sent && (
            <div>
              <label className="label" htmlFor="code">
                {t('Enter the 6-digit code')}
              </label>
              <CodeInput id="code" autoFocus value={code} onChange={setCode} onPaste={onPaste} disabled={loading || expired} className="h-14 text-2xl" />
              <p className="mt-2 text-xs text-slate-600">{t('Only the newest code works.')}</p>
            </div>
          )
        )}

        <ErrorNote error={error} />

        {sent && (
          <Button type="submit" variant="primary" size="md" className="h-11 w-full" loading={loading} disabled={code.length !== 6 || expired || !!sending}>
            {t('Continue')} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
          </Button>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <button type="button" onClick={() => backTo('ask')} className="inline-flex items-center gap-1 font-semibold text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" /> {t('Back')}
          </button>
          {sent && (
            <button type="button" onClick={() => send(sent.channel)} disabled={!!sending || loading || wait > 0} className="font-semibold text-brand-700 hover:text-brand-800 disabled:text-slate-500">
              {wait > 0 ? t('Resend in {time}', { time: clock(wait) }) : t('Resend code')}
            </button>
          )}
        </div>
      </form>
      {backLink}
    </AuthShell>
  );
}
