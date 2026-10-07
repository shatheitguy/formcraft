'use client';

import { ArrowLeft, AtSign, CheckCircle2, KeyRound, Mail } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useT } from '@/components/i18n';
import { Button, buttonClass } from '@/components/ui';
import { AuthShell } from './auth-shell';
import { CodeInput } from './code-input';
import { ErrorNote } from './login-form';
import { PasswordInput, StrengthMeter } from './password-input';

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  const json = ((await res?.json().catch(() => ({}))) ?? {}) as { error?: string };
  return { ok: !!res?.ok, error: res ? json.error : 'Could not reach the server.' };
}

/** Forgot password: email a 6-digit code, then set a new password with it. */
export function ForgotForm({ available }: { available: boolean }) {
  const t = useT();
  const [step, setStep] = useState<'ask' | 'reset' | 'done'>('ask');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState({ next: '', confirm: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);

  async function requestCode(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    setLoading(true);
    const r = await post('/api/auth/forgot', { identifier });
    setLoading(false);
    if (!r.ok) return setError(r.error ?? 'Could not reach the server.');
    if (step === 'reset') setResent(true);
    setStep('reset');
  }

  async function reset(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw.next !== pw.confirm) return setError('Passwords don’t match.');
    setLoading(true);
    const r = await post('/api/auth/reset', { identifier, code, password: pw.next });
    setLoading(false);
    if (!r.ok) return setError(r.error ?? 'Could not reach the server.');
    setStep('done');
  }

  const back = (
    <Link href="/login" className="mt-6 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700">
      <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" /> {t('Back to sign in')}
    </Link>
  );

  if (!available) {
    return (
      <AuthShell title={t('Reset your password')} subtitle={t('Password reset by email isn’t set up on this workspace. Ask an admin to reset your password.')}>
        {back}
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
      <AuthShell title={t('Reset your password')} subtitle={t('Enter your username or email and we’ll email you a code to choose a new password.')}>
        <form onSubmit={requestCode} className="space-y-4">
          <div>
            <label className="label" htmlFor="identifier">
              {t('Username or email')}
            </label>
            <div className="relative">
              <AtSign className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input id="identifier" className="input h-11 ps-9" dir="ltr" autoComplete="username" autoFocus value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="you@company.com" />
            </div>
          </div>
          <ErrorNote error={error} />
          <Button type="submit" variant="primary" size="md" className="h-11 w-full" loading={loading} disabled={!identifier.trim()}>
            <Mail className="h-4 w-4" /> {t('Email me a code')}
          </Button>
        </form>
        {back}
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t('Check your email')} subtitle={t('If an account matches {who}, we’ve sent it a 6-digit code. It expires in 10 minutes.', { who: identifier })}>
      <form onSubmit={reset} className="space-y-4">
        <div>
          <label className="label" htmlFor="code">
            {t('Code from the email')}
          </label>
          <CodeInput id="code" autoFocus value={code} onChange={setCode} />
        </div>
        <div>
          <label className="label" htmlFor="new-password">
            {t('New password')}
          </label>
          <PasswordInput id="new-password" className="h-11" autoComplete="new-password" value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} placeholder={t('At least 8 characters')} dir="ltr" />
          <StrengthMeter password={pw.next} />
        </div>
        <div>
          <label className="label" htmlFor="confirm-password">
            {t('Confirm password')}
          </label>
          <PasswordInput id="confirm-password" className="h-11" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))} dir="ltr" />
        </div>
        {resent && !error && <p className="text-xs text-emerald-600">{t('A new code is on its way.')}</p>}
        <ErrorNote error={error} />
        <Button type="submit" variant="primary" size="md" className="h-11 w-full" loading={loading} disabled={code.length !== 6 || pw.next.length < 8 || !pw.confirm}>
          <KeyRound className="h-4 w-4" /> {t('Set new password')}
        </Button>
        <div className="flex items-center justify-between gap-2 text-xs">
          <button type="button" onClick={() => { setStep('ask'); setError(null); setCode(''); }} className="inline-flex items-center gap-1 font-medium text-slate-500 hover:text-slate-700">
            <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" /> {t('Back')}
          </button>
          <button type="button" onClick={() => requestCode()} disabled={loading} className="font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50">
            {t('Send a new code')}
          </button>
        </div>
      </form>
    </AuthShell>
  );
}
