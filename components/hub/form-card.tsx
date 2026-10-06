'use client';

import { BarChart3, Copy, ExternalLink, Inbox, Link2, MoreHorizontal, Pencil, Power, Trash2, Trophy } from 'lucide-react';
import Link from 'next/link';
import { useI18n, useT } from '@/components/i18n';
import { buttonClass, Dropdown, StatusBadge, type MenuItem } from '@/components/ui';
import { fmtNumber, type TFn } from '@/lib/i18n';
import { categoryStyle } from '@/lib/categories';
import type { HubForm } from '@/lib/types';
import { cn, formatDateTime, timeAgo } from '@/lib/utils';
import { Sparkline } from './sparkline';

export interface CardActions {
  onShare: (f: HubForm) => void;
  onDuplicate: (f: HubForm) => void;
  onToggleStatus: (f: HubForm) => void;
  onDelete: (f: HubForm) => void;
  onTagClick: (tag: string) => void;
}

function menuItems(form: HubForm, a: CardActions, t: TFn): MenuItem[] {
  const open: MenuItem = { label: t('Open public form'), icon: <ExternalLink />, onClick: () => window.open(`/f/${form.id}${form.status === 'ACTIVE' ? '' : '?preview=1'}`, '_blank') };
  if (!form.canEdit) return [open, { label: t('Share links'), icon: <Link2 />, onClick: () => a.onShare(form) }];
  return [
    open,
    { label: t('Duplicate'), icon: <Copy />, onClick: () => a.onDuplicate(form) },
    { label: form.status === 'ACTIVE' ? t('Unpublish (Draft)') : t('Publish (Active)'), icon: <Power />, onClick: () => a.onToggleStatus(form) },
    { label: t('Delete'), icon: <Trash2 />, onClick: () => a.onDelete(form), danger: true, divider: true },
  ];
}

function MoreButton() {
  const t = useT();
  return (
    <button className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label={t('More actions')}>
      <MoreHorizontal className="h-4 w-4" />
    </button>
  );
}

export function FormCard({ form, actions }: { form: HubForm; actions: CardActions }) {
  const { t, locale } = useI18n();
  const style = categoryStyle(form.category);
  const week = form.spark.slice(-7).reduce((a, b) => a + b, 0);

  return (
    <article className="group relative flex animate-fade-in flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lift">
      <div className={cn('h-1 bg-gradient-to-r', style.gradient)} />
      <div className="flex flex-1 flex-col p-5">
        <div className="mb-3 flex items-center gap-2">
          <span className={cn('chip', style.soft)}>
            <span className={cn('h-1.5 w-1.5 rounded-full', style.dot)} />
            {form.category}
          </span>
          {form.quiz && form.category.toLowerCase() !== 'quiz' && (
            <span className="chip bg-emerald-50 text-emerald-700 ring-emerald-200">
              <Trophy className="h-3 w-3" /> {t('Quiz')}
            </span>
          )}
          <div className="ms-auto flex items-center gap-1">
            <StatusBadge status={form.status} />
            <Dropdown trigger={<MoreButton />} items={menuItems(form, actions, t)} />
          </div>
        </div>

        <Link href={form.canEdit ? `/forms/${form.id}/edit` : `/forms/${form.id}/submissions`} className="group/title">
          <div className="flex items-center gap-2.5">
            {form.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.logoUrl} alt="" className="h-8 w-8 shrink-0 rounded-lg bg-white object-contain p-0.5 ring-1 ring-slate-200" />
            )}
            <h3 className="line-clamp-1 text-[15px] font-semibold text-slate-900 group-hover/title:text-brand-700">{form.title}</h3>
          </div>
          <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm leading-5 text-slate-500">{form.description || <span className="italic text-slate-400">{t('No description')}</span>}</p>
        </Link>

        {form.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {form.tags.slice(0, 4).map((t) => (
              <button key={t} onClick={() => actions.onTagClick(t)} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 transition hover:bg-slate-200">
                #{t}
              </button>
            ))}
            {form.tags.length > 4 && <span className="px-1 text-[11px] text-slate-400">+{form.tags.length - 4}</span>}
          </div>
        )}

        <div className="mt-4 flex items-end gap-4 rounded-xl bg-slate-50/80 p-3 ring-1 ring-inset ring-slate-100">
          <div>
            <div className="text-2xl font-bold leading-none tabular-nums text-slate-900">{fmtNumber(form.responses, locale)}</div>
            <div className="mt-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">{t('Responses')}</div>
          </div>
          <div className="min-w-0 flex-1">
            <Sparkline data={form.spark} barClass={style.bar} />
            <div className="mt-1 text-end text-[10px] text-slate-400">{t('+{n} this week', { n: fmtNumber(week, locale) })}</div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
          <span>{form.fieldCount === 1 ? t('1 field') : t('{n} fields', { n: form.fieldCount })}</span>
          <span title={formatDateTime(form.updatedAt, locale)}>{t('Updated {time}', { time: timeAgo(form.updatedAt, t) })}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 divide-x divide-slate-100 rtl:divide-x-reverse border-t border-slate-100">
        {form.canEdit ? (
          <Link href={`/forms/${form.id}/edit`} className="flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-brand-700">
            <Pencil className="h-3.5 w-3.5" /> {t('Edit')}
          </Link>
        ) : (
          <Link href={`/forms/${form.id}/submissions?tab=insights`} className="flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-brand-700">
            <BarChart3 className="h-3.5 w-3.5" /> {t('Report')}
          </Link>
        )}
        <Link href={`/forms/${form.id}/submissions`} className="flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-brand-700">
          <Inbox className="h-3.5 w-3.5" /> {t('Submissions')}
        </Link>
        <button onClick={() => actions.onShare(form)} className="flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-brand-700">
          <Link2 className="h-3.5 w-3.5" /> {t('Share')}
        </button>
      </div>
    </article>
  );
}

export function FormRow({ form, actions }: { form: HubForm; actions: CardActions }) {
  const { t, locale } = useI18n();
  const style = categoryStyle(form.category);
  return (
    <div className="group flex animate-fade-in items-center gap-4 px-4 py-3 transition hover:bg-slate-50/70">
      <div className={cn('h-9 w-1 shrink-0 rounded-full bg-gradient-to-b', style.gradient)} />
      <Link href={form.canEdit ? `/forms/${form.id}/edit` : `/forms/${form.id}/submissions`} className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-slate-900 group-hover:text-brand-700">{form.title}</span>
          {form.quiz && <Trophy className="h-3.5 w-3.5 shrink-0 text-emerald-500" />}
        </div>
        <div className="mt-0.5 flex items-center gap-2 truncate text-xs text-slate-500">
          <span className={style.text}>{form.category}</span>
          <span className="text-slate-300">•</span>
          <span>{form.fieldCount === 1 ? t('1 field') : t('{n} fields', { n: form.fieldCount })}</span>
          {form.tags.slice(0, 3).map((t) => (
            <span key={t} className="hidden text-slate-400 md:inline">
              #{t}
            </span>
          ))}
        </div>
      </Link>
      <Sparkline data={form.spark} barClass={style.bar} className="hidden h-6 w-28 lg:flex" />
      <div className="w-20 text-end">
        <div className="text-sm font-semibold tabular-nums text-slate-900">{fmtNumber(form.responses, locale)}</div>
        <div className="text-[10px] uppercase tracking-wide text-slate-400">{t('Responses')}</div>
      </div>
      <StatusBadge status={form.status} className="hidden sm:inline-flex" />
      <span className="hidden w-28 text-end text-xs text-slate-400 xl:block" title={formatDateTime(form.updatedAt, locale)}>{timeAgo(form.updatedAt, t)}</span>
      <div className="flex items-center gap-1">
        <Link href={`/forms/${form.id}/submissions`} className={buttonClass('ghost', 'xs', 'hidden md:inline-flex')} title={t('Submissions')}>
          <Inbox className="h-3.5 w-3.5" />
        </Link>
        <button onClick={() => actions.onShare(form)} className={buttonClass('ghost', 'xs', 'hidden md:inline-flex')} title={t('Copy share link')}>
          <Link2 className="h-3.5 w-3.5" />
        </button>
        <Dropdown trigger={<MoreButton />} items={menuItems(form, actions, t)} />
      </div>
    </div>
  );
}
