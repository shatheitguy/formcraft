'use client';

import { useT } from '@/components/i18n';
import type { TFn } from '@/lib/i18n';
import { cn } from '@/lib/utils';

function sparkTitle(t: TFn, v: number, daysAgo: number) {
  const count = v === 1 ? t('1 response') : t('{n} responses', { n: v });
  const when = daysAgo === 0 ? t('today') : t('{n}d ago', { n: daysAgo });
  return t('{count} · {when}', { count, when });
}

/** Tiny bar chart of daily counts. */
export function Sparkline({ data, barClass, className }: { data: number[]; barClass: string; className?: string }) {
  const max = Math.max(1, ...data);
  const t = useT();
  const total = data.reduce((a, b) => a + b, 0);
  return (
    // Always chronological left → right, even in right-to-left languages.
    <div dir="ltr" className={cn('flex h-8 items-end gap-[3px]', className)} aria-label={t('{total} responses in the last {days} days', { total, days: data.length })} role="img">
      {data.map((v, i) => (
        <div
          key={i}
          title={sparkTitle(t, v, data.length - 1 - i)}
          className={cn('w-full min-w-[3px] rounded-[2px] transition-all', v ? barClass : 'bg-slate-100')}
          style={{ height: `${v ? Math.max(14, (v / max) * 100) : 10}%`, opacity: v ? 0.45 + (0.55 * v) / max : 1 }}
        />
      ))}
    </div>
  );
}
