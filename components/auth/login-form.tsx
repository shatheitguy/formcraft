'use client';

import { AlertCircle, ArrowRight, AtSign } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useT } from '@/components/i18n';
import { Button } from '@/components/ui';
import { AuthShell } from './auth-shell';
import { PasswordInput } from './password-input';

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const t = useT();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    }).catch(() => null);
    if (res?.ok) {
      router.replace(next);
      router.refresh();
      return;
    }
    const json = await res?.json().catch(() => ({}));
    setError(json?.error ?? 'Could not reach the server.');
    setLoading(false);
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
          <label className="label" htmlFor="password">
            {t('Password')}
          </label>
          <PasswordInput id="password" className="h-11" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" dir="ltr" />
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 ring-1 ring-rose-200" role="alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {t(error)}
          </div>
        )}

        <Button type="submit" variant="primary" size="md" className="h-11 w-full" loading={loading} disabled={!identifier || !password}>
          {t('Sign in')} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
        </Button>
      </form>
      <p className="mt-8 text-center text-xs text-slate-400">{t('Forgot your password? Ask a workspace admin to reset it.')}</p>
    </AuthShell>
  );
}
