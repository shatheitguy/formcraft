'use client';

import { Check, ChevronDown, Star } from 'lucide-react';
import { useState } from 'react';
import { useT } from '@/components/i18n';
import { cn } from '@/lib/utils';
import type { AnswerValue, FormField } from '@/lib/types';
import { scaleBounds } from '@/lib/validation';

interface Props {
  field: FormField;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
  error?: string;
  disabled?: boolean;
}

/** Renders the interactive control for a single field. */
export function FieldInput({ field, value, onChange, error, disabled }: Props) {
  const t = useT();
  const inputId = `in-${field.id}`;
  const errorCls = error ? 'input-error' : '';
  const str = typeof value === 'string' ? value : value === undefined ? '' : String(value);

  switch (field.type) {
    case 'text':
    case 'email':
    case 'phone':
      return (
        <input
          id={inputId}
          type={field.type === 'text' ? 'text' : field.type === 'email' ? 'email' : 'tel'}
          inputMode={field.type === 'phone' ? 'tel' : field.type === 'email' ? 'email' : undefined}
          autoComplete={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : undefined}
          className={cn('input', errorCls)}
          placeholder={field.placeholder}
          value={str}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
        />
      );

    case 'textarea':
      return (
        <textarea
          id={inputId}
          rows={4}
          className={cn('input resize-y leading-relaxed', errorCls)}
          placeholder={field.placeholder}
          value={str}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
        />
      );

    case 'date':
      return (
        <input
          id={inputId}
          type="date"
          className={cn('input max-w-[220px]', errorCls, !str && 'text-slate-400')}
          value={str}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
        />
      );

    case 'select':
      return (
        <div className="relative max-w-sm">
          <select
            id={inputId}
            className={cn('input appearance-none pe-9', errorCls, !str && 'text-slate-400')}
            value={str}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={!!error}
          >
            <option value="">{field.placeholder || t('Select an option')}</option>
            {(field.options ?? []).map((o) => (
              <option key={o.id} value={o.label} className="text-slate-900">
                {o.display ?? o.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        </div>
      );

    case 'radio':
    case 'checkbox': {
      const multi = field.type === 'checkbox';
      const selected = multi ? (Array.isArray(value) ? value : []) : [str];
      return (
        <div role={multi ? 'group' : 'radiogroup'} className="grid gap-2 sm:grid-cols-2">
          {(field.options ?? []).map((o) => {
            const on = selected.includes(o.label);
            return (
              <button
                key={o.id}
                type="button"
                role={multi ? 'checkbox' : 'radio'}
                aria-checked={on}
                disabled={disabled}
                onClick={() => {
                  if (!multi) return onChange(o.label);
                  onChange(on ? selected.filter((s) => s !== o.label) : [...selected, o.label]);
                }}
                className={cn(
                  'group flex items-center gap-3 rounded-lg border px-3 py-2.5 text-start text-sm transition',
                  on
                    ? 'border-brand-500 bg-brand-50/70 text-brand-900 ring-1 ring-brand-500'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
                  error && !on && 'border-rose-300',
                  disabled && 'cursor-default',
                )}
              >
                <span
                  className={cn(
                    'flex h-[18px] w-[18px] shrink-0 items-center justify-center border transition',
                    multi ? 'rounded-[5px]' : 'rounded-full',
                    on ? 'border-brand-600 bg-brand-600 text-onaccent' : 'border-slate-300 bg-white group-hover:border-slate-400',
                  )}
                >
                  {on && (multi ? <Check className="h-3 w-3" strokeWidth={3} /> : <span className="h-1.5 w-1.5 rounded-full bg-white" />)}
                </span>
                <span className="min-w-0 flex-1 break-words">{o.display ?? o.label}</span>
              </button>
            );
          })}
        </div>
      );
    }

    case 'rating':
      return <StarRating field={field} value={typeof value === 'number' ? value : Number(value) || 0} onChange={onChange} disabled={disabled} />;

    case 'scale': {
      const { min, max } = scaleBounds(field);
      const n = typeof value === 'number' ? value : value === undefined ? null : Number(value);
      const steps = Array.from({ length: Math.max(0, max - min + 1) }, (_, i) => min + i);
      return (
        <div>
          <div className="flex flex-wrap gap-1.5">
            {steps.map((s) => (
              <button
                key={s}
                type="button"
                disabled={disabled}
                onClick={() => onChange(s)}
                aria-pressed={n === s}
                className={cn(
                  'flex h-10 min-w-[40px] flex-1 items-center justify-center rounded-lg border text-sm font-semibold tabular-nums transition sm:max-w-[52px]',
                  n === s
                    ? 'border-brand-600 bg-brand-600 text-onaccent shadow-sm shadow-brand-600/30'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700',
                  error && n !== s && 'border-rose-300',
                  disabled && 'cursor-default',
                )}
              >
                {s}
              </button>
            ))}
          </div>
          {(field.minLabel || field.maxLabel) && (
            <div className="mt-2 flex justify-between text-xs text-slate-500" style={{ maxWidth: steps.length * 58 }}>
              <span>{field.minLabel}</span>
              <span>{field.maxLabel}</span>
            </div>
          )}
        </div>
      );
    }
  }
}

function StarRating({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FormField;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const [hover, setHover] = useState(0);
  const { max } = scaleBounds(field);
  const shown = hover || value;
  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-wrap gap-0.5" onMouseLeave={() => setHover(0)}>
        {Array.from({ length: max }, (_, i) => i + 1).map((s) => (
          <button
            key={s}
            type="button"
            disabled={disabled}
            aria-label={t('{n} of {max}', { n: s, max })}
            onMouseEnter={() => !disabled && setHover(s)}
            onClick={() => onChange(s)}
            className={cn('rounded p-0.5 transition', !disabled && 'hover:scale-110')}
          >
            <Star className={cn('h-7 w-7 transition', s <= shown ? 'fill-amber-400 text-amber-400' : 'fill-slate-100 text-slate-300')} strokeWidth={1.5} />
          </button>
        ))}
      </div>
      {value > 0 && (
        <span className="text-sm font-medium tabular-nums text-slate-500">
          {value}/{max}
        </span>
      )}
    </div>
  );
}

export function FieldLabel({ field, htmlFor }: { field: FormField; htmlFor?: string }) {
  const t = useT();
  return (
    <div className="mb-2">
      <label htmlFor={htmlFor} className="block text-[15px] font-medium leading-snug text-slate-900">
        {field.label || <span className="italic text-slate-400">{t('Untitled question')}</span>}
        {field.required && <span className="ms-0.5 text-rose-500">*</span>}
      </label>
      {field.helpText && <p className="mt-0.5 text-sm text-slate-500">{field.helpText}</p>}
    </div>
  );
}
