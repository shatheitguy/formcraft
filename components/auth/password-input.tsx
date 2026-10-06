'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useState, type InputHTMLAttributes } from 'react';
import { useT } from '@/components/i18n';
import { cn } from '@/lib/utils';

export function PasswordInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  const t = useT();
  return (
    <div className="relative">
      <input {...props} type={show ? 'text' : 'password'} className={cn('input pe-10', className)} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
        aria-label={show ? t('Hide password') : t('Show password')}
        tabIndex={-1}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

/** 0–4 heuristic strength score. */
export function passwordStrength(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  return pw ? Math.max(1, s) : 0;
}

export function StrengthMeter({ password }: { password: string }) {
  const t = useT();
  const s = passwordStrength(password);
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  const colors = ['bg-slate-200', 'bg-rose-500', 'bg-amber-500', 'bg-sky-500', 'bg-emerald-500'];
  if (!password) return null;
  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="flex flex-1 gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={cn('h-1 flex-1 rounded-full transition', i <= s ? colors[s] : 'bg-slate-200')} />
        ))}
      </div>
      <span className="min-w-[3rem] text-end text-[11px] font-medium text-slate-500">{labels[s] && t(labels[s])}</span>
    </div>
  );
}
