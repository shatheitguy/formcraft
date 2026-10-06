'use client';

import { Star } from 'lucide-react';
import { useI18n, useT } from '@/components/i18n';
import { FIELD_ICONS } from '@/components/icons';
import { isChoice } from '@/lib/fields';
import type { FormField, SubmissionDTO } from '@/lib/types';
import { cn, formatDate, timeAgo } from '@/lib/utils';
import { scaleBounds } from '@/lib/validation';

/** Per-question summaries of the (filtered) responses. */
export function Insights({ fields, rows }: { fields: FormField[]; rows: SubmissionDTO[] }) {
  const t = useT();
  if (!rows.length) return <p className="py-16 text-center text-sm text-slate-500">{t('No responses match the current filters.')}</p>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {fields.map((field) => {
        const answered = rows.filter((r) => r.data[field.id] !== undefined);
        const Icon = FIELD_ICONS[field.type];
        return (
          <section key={field.id} className="card p-5">
            <div className="mb-4 flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-900">{field.label}</h3>
                <p className="text-xs text-slate-500">
                  {t('{answered} of {total} answered', { answered: answered.length, total: rows.length })}
                  {rows.length > 0 && ` · ${Math.round((answered.length / rows.length) * 100)}%`}
                </p>
              </div>
            </div>
            {isChoice(field.type) ? (
              <ChoiceBars field={field} rows={answered} />
            ) : field.type === 'rating' || field.type === 'scale' ? (
              <NumericSummary field={field} rows={answered} />
            ) : (
              <TextSamples field={field} rows={answered} />
            )}
          </section>
        );
      })}
    </div>
  );
}

function ChoiceBars({ field, rows }: { field: FormField; rows: SubmissionDTO[] }) {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const v = r.data[field.id];
    (Array.isArray(v) ? v : [String(v)]).forEach((l) => counts.set(l, (counts.get(l) ?? 0) + 1));
  }
  const labels = [...new Set([...(field.options ?? []).map((o) => o.label), ...counts.keys()])];
  const max = Math.max(1, ...counts.values());
  const correct = new Set((field.options ?? []).filter((o) => o.correct).map((o) => o.label));
  return (
    <div className="space-y-2.5">
      {labels.map((label) => {
        const n = counts.get(label) ?? 0;
        const pct = rows.length ? Math.round((n / rows.length) * 100) : 0;
        return (
          <div key={label}>
            <div className="mb-1 flex justify-between gap-2 text-xs">
              <span className={cn('truncate text-slate-700', correct.has(label) && 'font-semibold text-emerald-700')}>
                {label}
                {correct.has(label) && ' ✓'}
              </span>
              <span className="shrink-0 tabular-nums text-slate-500" dir="ltr">
                {n} · {pct}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className={cn('h-full rounded-full transition-all', correct.has(label) ? 'bg-emerald-500' : 'bg-brand-500')} style={{ width: `${(n / max) * 100}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function NumericSummary({ field, rows }: { field: FormField; rows: SubmissionDTO[] }) {
  const t = useT();
  const { min, max } = scaleBounds(field);
  const values = rows.map((r) => Number(r.data[field.id])).filter((n) => !isNaN(n));
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const buckets = Array.from({ length: max - min + 1 }, (_, i) => values.filter((v) => v === min + i).length);
  const peak = Math.max(1, ...buckets);

  // Standard NPS when the scale runs 0/1–10.
  const nps =
    field.type === 'scale' && max === 10 && values.length
      ? Math.round(((values.filter((v) => v >= 9).length - values.filter((v) => v <= 6).length) / values.length) * 100)
      : null;

  return (
    <div>
      <div className="mb-4 flex items-end gap-6">
        <div>
          <div className="flex items-center gap-1.5 text-3xl font-bold tabular-nums text-slate-900">
            {avg.toFixed(1)}
            {field.type === 'rating' && <Star className="h-6 w-6 fill-amber-400 text-amber-400" />}
          </div>
          <div className="text-xs text-slate-500">{t('average of {max}', { max })}</div>
        </div>
        {nps !== null && (
          <div>
            <div dir="ltr" className={cn('text-3xl font-bold tabular-nums', nps >= 30 ? 'text-emerald-600' : nps >= 0 ? 'text-amber-600' : 'text-rose-600')}>
              {nps > 0 ? '+' : ''}
              {nps}
            </div>
            <div className="text-xs text-slate-500">{t('Net Promoter Score')}</div>
          </div>
        )}
      </div>
      <div className="flex h-24 items-end gap-1" dir="ltr">
        {buckets.map((n, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-[10px] tabular-nums text-slate-400">{n || ''}</span>
            <div
              className={cn('w-full rounded-t', field.type === 'rating' ? 'bg-amber-400' : min + i >= 9 ? 'bg-emerald-500' : min + i >= 7 ? 'bg-slate-300' : 'bg-rose-400')}
              style={{ height: `${(n / peak) * 64 + 2}px` }}
            />
            <span className="text-[10px] font-medium tabular-nums text-slate-500">{min + i}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TextSamples({ field, rows }: { field: FormField; rows: SubmissionDTO[] }) {
  const { t, locale } = useI18n();
  const latest = rows.slice(0, 4);
  if (!latest.length) return <p className="text-sm italic text-slate-400">{t('No answers yet.')}</p>;
  return (
    <ul className="space-y-2">
      {latest.map((r) => {
        const v = r.data[field.id];
        return (
          <li key={r.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 ring-1 ring-inset ring-slate-100">
            <p className="line-clamp-2">{field.type === 'date' ? formatDate(String(v), locale) : String(v)}</p>
            <p className="mt-0.5 text-[11px] text-slate-400">{timeAgo(r.createdAt, t)}</p>
          </li>
        );
      })}
      {rows.length > latest.length && <li className="text-xs text-slate-400">{t('+ {n} more in the Responses table', { n: rows.length - latest.length })}</li>}
    </ul>
  );
}
