'use client';

import { AlertCircle, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useT } from '@/components/i18n';
import { Button } from '@/components/ui';
import { AuthShell } from './auth-shell';
import { PasswordInput, StrengthMeter } from './password-input';

export function SetupForm() {
  const router = useRouter();
  const t = useT();
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.password !== form.confirm) return setError('Passwords don’t match.');
    setLoading(true);
    const res = await fetch('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    }).catch(() => null);
    if (res?.ok) {
      router.replace('/');
      router.refresh();
      return;
    }
    const json = await res?.json().catch(() => ({}));
    setError(json?.error ?? 'Could not reach the server.');
    setLoading(false);
  }

  return (
    <AuthShell title={t('Create your admin account')} subtitle={t('This is a fresh install. The first account gets full administrator access.')}>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-xs font-medium text-brand-800 ring-1 ring-inset ring-brand-100">
          <ShieldCheck className="h-4 w-4 shrink-0" /> {t('You can invite editors and viewers afterwards.')}
        </div>
        <div>
          <label className="label">{t('Full name')}</label>
          <input className="input h-10" value={form.name} onChange={set('name')} placeholder={t('Jane Doe')} autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t('Username')}</label>
            <input className="input h-10" value={form.username} onChange={set('username')} placeholder="admin" autoComplete="username" dir="ltr" />
          </div>
          <div>
            <label className="label">{t('Email')}</label>
            <input className="input h-10" type="email" value={form.email} onChange={set('email')} placeholder="you@company.com" dir="ltr" />
          </div>
        </div>
        <div>
          <label className="label">{t('Password')}</label>
          <PasswordInput className="h-10" value={form.password} onChange={set('password')} autoComplete="new-password" placeholder={t('At least 8 characters')} />
          <StrengthMeter password={form.password} />
        </div>
        <div>
          <label className="label">{t('Confirm password')}</label>
          <PasswordInput className="h-10" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" />
        </div>
        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 ring-1 ring-rose-200" role="alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {t(error)}
          </div>
        )}
        <Button type="submit" variant="primary" size="md" className="h-11 w-full" loading={loading}>
          {t('Create account & continue')}
        </Button>
      </form>
    </AuthShell>
  );
}
