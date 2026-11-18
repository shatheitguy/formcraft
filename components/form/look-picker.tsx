'use client';

import { useId } from 'react';
import { useT } from '@/components/i18n';
import { FORM_LAYOUTS } from '@/lib/form-layout';
import type { FormLayout } from '@/lib/types';
import { cn } from '@/lib/utils';

export const LOOK_LABELS: Record<FormLayout, { label: string; hint: string }> = {
  classic: { label: 'Classic', hint: 'A card on a dotted background, cover banner on top.' },
  minimal: { label: 'Minimal', hint: 'A clean full-width page with a large title. Great for embedding.' },
  steps: { label: 'Steps', hint: 'One question per screen with a progress bar and Next / Back buttons.' },
  split: { label: 'Split', hint: 'Cover, logo and title on the left, questions on the right. Stacks on phones.' },
};

/** Small schematic of each look (80×56), drawn with theme colours so it follows light/dark and the accent. */
function Schematic({ layout }: { layout: FormLayout }) {
  const line = 'fill-slate-300';
  const field = 'fill-white stroke-slate-300';
  switch (layout) {
    case 'classic':
      return (
        <>
          <rect width="80" height="56" className="fill-slate-100" />
          {[8, 20, 32, 44, 56, 68].map((x) => [10, 26, 42].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="0.8" className="fill-slate-300" />))}
          <rect x="18" y="6" width="44" height="54" rx="3" className="fill-white stroke-slate-300" strokeWidth="0.75" />
          <rect x="18.4" y="6.4" width="43.2" height="7" rx="2.6" className="fill-brand-500" />
          <rect x="23" y="17" width="22" height="3" rx="1.5" className="fill-slate-500" />
          <rect x="23" y="25" width="34" height="5" rx="1.2" className={field} strokeWidth="0.6" />
          <rect x="23" y="34" width="34" height="5" rx="1.2" className={field} strokeWidth="0.6" />
          <rect x="23" y="43" width="14" height="5" rx="1.5" className="fill-brand-600" />
        </>
      );
    case 'minimal':
      return (
        <>
          <rect width="80" height="56" className="fill-white" />
          <rect width="80" height="12" className="fill-brand-500" />
          <rect x="14" y="17" width="32" height="4" rx="2" className="fill-slate-600" />
          <rect x="14" y="24" width="44" height="2" rx="1" className={line} />
          <rect x="14" y="31" width="52" height="0.6" className="fill-slate-200" />
          <rect x="14" y="35" width="52" height="5" rx="1.2" className={field} strokeWidth="0.6" />
          <rect x="14" y="44" width="52" height="0.6" className="fill-slate-200" />
          <rect x="14" y="48" width="52" height="5" rx="1.2" className={field} strokeWidth="0.6" />
        </>
      );
    case 'steps':
      return (
        <>
          <rect width="80" height="56" className="fill-slate-100" />
          <rect x="12" y="6" width="56" height="54" rx="3" className="fill-white stroke-slate-300" strokeWidth="0.75" />
          <rect x="18" y="12" width="44" height="2" rx="1" className="fill-slate-200" />
          <rect x="18" y="12" width="18" height="2" rx="1" className="fill-brand-500" />
          <rect x="18" y="20" width="36" height="4" rx="2" className="fill-slate-600" />
          <rect x="18" y="29" width="44" height="7" rx="1.5" className={field} strokeWidth="0.6" />
          <rect x="18" y="43" width="12" height="6" rx="1.5" className="fill-slate-200" />
          <rect x="46" y="43" width="16" height="6" rx="1.5" className="fill-brand-600" />
        </>
      );
    case 'split':
      return (
        <>
          <rect width="80" height="56" className="fill-slate-100" />
          <rect x="6" y="6" width="68" height="44" rx="3" className="fill-white stroke-slate-300" strokeWidth="0.75" />
          <path d="M9 6h20v44H9a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3z" className="fill-brand-600" />
          <rect x="10" y="30" width="14" height="3" rx="1.5" fill="#fff" />
          <rect x="10" y="36" width="10" height="1.6" rx="0.8" fill="#fff" opacity=".7" />
          <rect x="34" y="12" width="34" height="5" rx="1.2" className={field} strokeWidth="0.6" />
          <rect x="34" y="21" width="34" height="5" rx="1.2" className={field} strokeWidth="0.6" />
          <rect x="34" y="30" width="34" height="5" rx="1.2" className={field} strokeWidth="0.6" />
          <rect x="34" y="40" width="13" height="5" rx="1.5" className="fill-brand-600" />
        </>
      );
  }
}

/**
 * "Form look" chooser: one tile per layout with a schematic preview. Used in the builder's
 * form settings and in the "Create a new form" dialog.
 */
export function LookPicker({ value, onChange, label, className }: { value: FormLayout; onChange: (v: FormLayout) => void; label?: string; className?: string }) {
  const t = useT();
  const name = label ?? t('Form look');
  const id = useId();
  return (
    <div className={className}>
      <div className="mb-1.5 text-xs text-slate-500" id={id}>
        {name}
      </div>
      <div role="radiogroup" aria-labelledby={id} className="grid grid-cols-4 gap-2">
        {FORM_LAYOUTS.map((l) => {
          const on = value === l;
          return (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={on}
              title={t(LOOK_LABELS[l].hint)}
              onClick={() => onChange(l)}
              className="group flex min-w-0 flex-col items-center gap-1 rounded-lg p-0.5 text-center outline-none"
            >
              <span
                className={cn(
                  'block w-full overflow-hidden rounded-md ring-1 transition group-focus-visible:ring-2 group-focus-visible:ring-brand-500',
                  on ? 'ring-2 ring-brand-500 ring-offset-1 ring-offset-white' : 'ring-slate-200 group-hover:ring-slate-300',
                )}
              >
                <svg viewBox="0 0 80 56" className="block h-auto w-full rtl:-scale-x-100" aria-hidden="true">
                  <Schematic layout={l} />
                </svg>
              </span>
              <span className={cn('w-full truncate text-[11px] font-medium leading-tight', on ? 'text-brand-700' : 'text-slate-600')}>{t(LOOK_LABELS[l].label)}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-slate-500">{t(LOOK_LABELS[value].hint)}</p>
    </div>
  );
}
