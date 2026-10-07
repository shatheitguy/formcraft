'use client';

import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** One-time code field: digits only by default, large and spaced, autofills from SMS/email on phones. */
export function CodeInput({
  value,
  onChange,
  recovery,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: string; onChange: (v: string) => void; recovery?: boolean }) {
  return (
    <input
      {...props}
      className={cn('input h-12 text-center font-mono text-xl tracking-[0.4em] placeholder:tracking-[0.4em]', className)}
      dir="ltr"
      inputMode={recovery ? 'text' : 'numeric'}
      autoComplete="one-time-code"
      spellCheck={false}
      maxLength={recovery ? 12 : 6}
      placeholder={recovery ? 'XXXX-XXXX' : '000000'}
      value={value}
      onChange={(e) => onChange(recovery ? e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '') : e.target.value.replace(/\D/g, ''))}
    />
  );
}
