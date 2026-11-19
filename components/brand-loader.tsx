'use client';

import { useApp } from './app-context';
import { useT } from './i18n';

/**
 * The FormCraft mark, animated: the three form-field bars fill in one after another and the cursor dot blinks,
 * like a form being typed. Fixed colours, the same as the static mark (lib/logo-svg.ts).
 */
export function AnimatedMark({ className = 'h-14 w-14' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={`fc-mark ${className}`} aria-hidden>
      <rect width="32" height="32" rx="7.7" fill="#0F172A" />
      <rect x=".5" y=".5" width="31" height="31" rx="7.2" fill="none" stroke="#fff" strokeOpacity=".1" />
      <rect className="fc-bar fc-bar-1" x="6.4" y="7.7" width="19.2" height="3.84" rx="1.92" fill="#22C55E" />
      <rect className="fc-bar fc-bar-2" x="6.4" y="14.08" width="13.44" height="3.84" rx="1.92" fill="#38BDF8" />
      <rect className="fc-bar fc-bar-3" x="6.4" y="20.48" width="7.68" height="3.84" rx="1.92" fill="#F59E0B" />
      <circle className="fc-dot" cx="23.68" cy="22.4" r="2.24" fill="#fff" />
    </svg>
  );
}

/**
 * Shown while a page loads (app/loading.tsx and friends). It fades in after a short delay, so quick page
 * changes don't flash it. A workspace with its own logo gets that logo with a soft pulse instead of the mark.
 */
export function BrandLoader({ full = true, label }: { full?: boolean; label?: string }) {
  const { app } = useApp();
  const t = useT();
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fc-loader flex flex-col items-center justify-center gap-5 px-4 ${full ? 'min-h-[100dvh] bg-grid' : 'min-h-[320px] py-16'}`}
    >
      <div className="relative">
        <span className="fc-halo absolute inset-0 rounded-[22px]" aria-hidden />
        {app.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={app.logoUrl} alt="" className="fc-logo-pulse relative h-14 w-14 rounded-2xl object-contain" />
        ) : (
          <AnimatedMark className="relative h-14 w-14 drop-shadow-lg" />
        )}
      </div>
      {full && <div className="text-base font-bold tracking-tight text-slate-900">{app.name}</div>}
      <div className="fc-track h-1 w-36 overflow-hidden rounded-full bg-slate-200" aria-hidden>
        <div className="fc-track-fill h-full w-1/3 rounded-full bg-brand-500" />
      </div>
      <span className="sr-only">{label ?? t('Loading…')}</span>
    </div>
  );
}
