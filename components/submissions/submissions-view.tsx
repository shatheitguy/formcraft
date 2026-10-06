'use client';

import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Filter,
  Inbox,
  Pencil,
  Search,
  Table2,
  Trash2,
  Trophy,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AppFooter } from '@/components/app-footer';
import { AppHeader } from '@/components/app-header';
import { FIELD_ICONS } from '@/components/icons';
import { useI18n } from '@/components/i18n';
import { useToast } from '@/components/toast';
import { Button, buttonClass, ConfirmDialog, EmptyState, Segmented, StatusBadge } from '@/components/ui';
import { formatAnswer, sortValue, toCSV } from '@/lib/answers';
import { categoryStyle } from '@/lib/categories';
import { isChoice } from '@/lib/fields';
import { formLanguages } from '@/lib/form-i18n';
import { fmtNumber, isLocale, LOCALES } from '@/lib/i18n';
import type { FormDTO, FormField, SubmissionDTO } from '@/lib/types';
import { cn, formatDateTime, timeAgo } from '@/lib/utils';
import { scaleBounds } from '@/lib/validation';
import { Insights } from './insights';

type Range = 'all' | '1' | '7' | '30';
type SortState = { key: string; dir: 'asc' | 'desc' };
const PAGE_SIZE = 20;

export function SubmissionsView({ form, submissions: initial, canManage }: { form: FormDTO; submissions: SubmissionDTO[]; canManage: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const { t, locale } = useI18n();
  const fields = form.schema.fields;
  const quiz = form.schema.settings.quiz;
  const multilingual = formLanguages(form.schema).length > 1;

  const [rows, setRows] = useState(initial);
  const [tab, setTab] = useState<'table' | 'insights'>(useSearchParams().get('tab') === 'insights' ? 'insights' : 'table');
  const [query, setQuery] = useState('');
  const [range, setRange] = useState<Range>('all');
  const [filterField, setFilterField] = useState('');
  const [filterValue, setFilterValue] = useState('');
  const [sort, setSort] = useState<SortState>({ key: 'createdAt', dir: 'desc' });
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => setRows(initial), [initial]);

  const filterable = fields.filter((f) => isChoice(f.type) || f.type === 'rating' || f.type === 'scale');
  const activeFilterField = fields.find((f) => f.id === filterField);
  const filterOptions = activeFilterField
    ? isChoice(activeFilterField.type)
      ? (activeFilterField.options ?? []).map((o) => o.label)
      : (() => {
          const { min, max } = scaleBounds(activeFilterField);
          return Array.from({ length: max - min + 1 }, (_, i) => String(min + i));
        })()
    : [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const since = range === 'all' ? 0 : Date.now() - Number(range) * 86_400_000;
    let list = rows.filter((r) => {
      if (since && new Date(r.createdAt).getTime() < since) return false;
      if (activeFilterField && filterValue) {
        const v = r.data[activeFilterField.id];
        if (Array.isArray(v) ? !v.includes(filterValue) : String(v ?? '') !== filterValue) return false;
      }
      if (q) {
        const hay = Object.values(r.data)
          .map((v) => (Array.isArray(v) ? v.join(' ') : String(v)))
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q) && !r.id.includes(q)) return false;
      }
      return true;
    });

    const dir = sort.dir === 'asc' ? 1 : -1;
    const field = fields.find((f) => f.id === sort.key);
    const get = (r: SubmissionDTO): string | number =>
      sort.key === 'createdAt' ? r.createdAt : sort.key === 'score' ? r.score ?? -1 : field ? sortValue(field, r.data[field.id]) : '';
    list = [...list].sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      // Empty answers always sink to the bottom.
      if (av === '' && bv !== '') return 1;
      if (bv === '' && av !== '') return -1;
      return av < bv ? -dir : av > bv ? dir : 0;
    });
    return list;
  }, [rows, query, range, activeFilterField, filterValue, sort, fields]);

  useEffect(() => setPage(0), [query, range, filterField, filterValue, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const openIndex = openId ? filtered.findIndex((r) => r.id === openId) : -1;
  const openRow = openIndex >= 0 ? filtered[openIndex] : null;

  const stats = useMemo(() => {
    const week = rows.filter((r) => Date.now() - new Date(r.createdAt).getTime() < 7 * 86_400_000).length;
    const scored = rows.filter((r) => r.score !== null && r.maxScore);
    const avgPct = scored.length ? Math.round((scored.reduce((s, r) => s + r.score! / r.maxScore!, 0) / scored.length) * 100) : null;
    const numeric = fields.find((f) => f.type === 'scale' || f.type === 'rating');
    const nums = numeric ? rows.map((r) => Number(r.data[numeric.id])).filter((n) => !isNaN(n)) : [];
    const avgNum = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
    return { week, avgPct, numeric, avgNum, last: rows[0]?.createdAt ?? null };
  }, [rows, fields]);

  const filtersActive = !!(query || range !== 'all' || filterValue);
  const clearFilters = () => {
    setQuery('');
    setRange('all');
    setFilterField('');
    setFilterValue('');
  };

  const toggleSort = (key: string) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'createdAt' || key === 'score' ? 'desc' : 'asc' }));

  const allOnPageSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));
  const togglePage = () =>
    setSelected((s) => {
      const next = new Set(s);
      pageRows.forEach((r) => (allOnPageSelected ? next.delete(r.id) : next.add(r.id)));
      return next;
    });
  const toggleOne = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  function exportCSV() {
    const csv = toCSV(fields, filtered, quiz, multilingual);
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${form.title.replace(/[^\w-]+/g, '_').toLowerCase()}_responses.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(filtered.length === 1 ? t('Exported 1 response') : t('Exported {n} responses', { n: filtered.length }));
  }

  async function doDelete() {
    if (!confirm) return;
    setDeleting(true);
    const res = await fetch(`/api/forms/${form.id}/submissions`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: confirm }),
    });
    setDeleting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return toast(t(typeof body?.error === 'string' ? body.error : 'Could not delete responses'), 'error');
    }
    const ids = new Set(confirm);
    setRows((r) => r.filter((x) => !ids.has(x.id)));
    setSelected((s) => new Set([...s].filter((id) => !ids.has(id))));
    if (openId && ids.has(openId)) setOpenId(null);
    setConfirm(null);
    toast(ids.size === 1 ? t('Deleted 1 response') : t('Deleted {n} responses', { n: ids.size }));
    router.refresh();
  }

  const style = categoryStyle(form.category);

  return (
    <div className="min-h-screen">
      <AppHeader>
        {canManage && (
          <Link href={`/forms/${form.id}/edit`} className={buttonClass('secondary', 'sm')}>
            <Pencil className="h-4 w-4" /> <span className="hidden sm:inline">{t('Edit form')}</span>
          </Link>
        )}
        <a href={`/f/${form.id}${form.status === 'ACTIVE' ? '' : '?preview=1'}`} target="_blank" className={buttonClass('ghost', 'sm')}>
          <ExternalLink className="h-4 w-4" /> <span className="hidden sm:inline">{t('Open form')}</span>
        </a>
      </AppHeader>

      <main className="mx-auto max-w-7xl px-4 pb-20 pt-6 sm:px-6">
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500">
          <Link href="/" className="hover:text-slate-800">
            {t('Dashboard')}
          </Link>
          <ChevronRight className="h-3 w-3 rtl:rotate-180" />
          <span className="truncate text-slate-700">{form.title}</span>
        </nav>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br text-onaccent shadow-sm', style.gradient)}>
              <Inbox className="h-5 w-5" />
            </div>
            <div>
              <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                {form.title} <StatusBadge status={form.status} />
              </h1>
              <p className="text-sm text-slate-500">{t('Submissions')}</p>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label={t('Total responses')} value={fmtNumber(rows.length, locale)} />
          <Metric label={t('Last 7 days')} value={fmtNumber(stats.week, locale)} />
          {stats.avgPct !== null ? (
            <Metric label={t('Average score')} value={`${stats.avgPct}%`} icon={<Trophy className="h-4 w-4 text-emerald-500" />} />
          ) : stats.avgNum !== null && stats.numeric ? (
            <Metric label={t('Avg · {label}', { label: truncate(stats.numeric.label, 22) })} value={`${stats.avgNum.toFixed(1)} / ${scaleBounds(stats.numeric).max}`} />
          ) : (
            <Metric label={t('Questions')} value={String(fields.length)} />
          )}
          <Metric label={t('Latest response')} value={stats.last ? timeAgo(stats.last, t) : '—'} />
        </div>

        {rows.length === 0 ? (
          <div className="mt-8">
            <EmptyState
              icon={<Inbox />}
              title={t('No responses yet')}
              description={form.status === 'ACTIVE' ? t('Share your form link to start collecting responses.') : t('This form is a draft. Publish it to start accepting responses.')}
              action={
                canManage ? (
                  <Button href={`/forms/${form.id}/edit`} variant="primary">
                    <Pencil className="h-4 w-4" /> {t('Open in builder')}
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div className="mt-8 flex flex-wrap items-center gap-2">
              <Segmented
                value={tab}
                onChange={setTab}
                options={[
                  { value: 'table', label: <><Table2 className="h-3.5 w-3.5" /> {t('Responses')}</> },
                  { value: 'insights', label: <><BarChart3 className="h-3.5 w-3.5" /> {t('Insights')}</> },
                ]}
              />
              <div className="relative min-w-[200px] flex-1">
                <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Search answers…')} aria-label={t('Search answers…')} className="input h-9 ps-9" />
              </div>
              <label className="relative">
                <CalendarRange className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <select value={range} onChange={(e) => setRange(e.target.value as Range)} aria-label={t('Date range')} className="input h-9 w-auto appearance-none py-0 pe-7 ps-8 text-xs font-medium">
                  <option value="all">{t('All time')}</option>
                  <option value="1">{t('Last 24 hours')}</option>
                  <option value="7">{t('Last 7 days')}</option>
                  <option value="30">{t('Last 30 days')}</option>
                </select>
              </label>
              {filterable.length > 0 && (
                <div className="flex items-center gap-1">
                  <label className="relative">
                    <Filter className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <select
                      value={filterField}
                      onChange={(e) => {
                        setFilterField(e.target.value);
                        setFilterValue('');
                      }}
                      aria-label={t('Filter by answer…')}
                      className="input h-9 w-auto max-w-[200px] appearance-none truncate py-0 pe-7 ps-8 text-xs font-medium"
                    >
                      <option value="">{t('Filter by answer…')}</option>
                      {filterable.map((f) => (
                        <option key={f.id} value={f.id}>
                          {truncate(f.label, 40)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {activeFilterField && (
                    <select value={filterValue} onChange={(e) => setFilterValue(e.target.value)} aria-label={t('Any value')} className="input h-9 w-auto max-w-[180px] py-0 pe-7 text-xs font-medium">
                      <option value="">{t('Any value')}</option>
                      {filterOptions.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
              {filtersActive && (
                <button onClick={clearFilters} className="text-xs font-medium text-brand-600 hover:text-brand-800">
                  {t('Clear')}
                </button>
              )}
              <div className="ms-auto flex items-center gap-2">
                {canManage && selected.size > 0 && (
                  <Button variant="secondary" onClick={() => setConfirm([...selected])} className="!text-rose-600">
                    <Trash2 className="h-4 w-4" /> {t('Delete {n}', { n: selected.size })}
                  </Button>
                )}
                <Button onClick={exportCSV} disabled={!filtered.length}>
                  <Download className="h-4 w-4" /> {t('Export CSV')}
                </Button>
              </div>
            </div>

            <p className="mb-3 mt-3 text-xs text-slate-500">
              {filtersActive ? (
                <WithStrong
                  text={rows.length === 1 ? t('{shown} of 1 response match') : t('{shown} of {total} responses match', { total: fmtNumber(rows.length, locale) })}
                  token="{shown}"
                  value={fmtNumber(filtered.length, locale)}
                />
              ) : rows.length === 1 ? (
                t('1 response')
              ) : (
                t('{n} responses', { n: fmtNumber(rows.length, locale) })
              )}
            </p>

            {tab === 'insights' ? (
              <Insights fields={fields} rows={filtered} />
            ) : (
              <div className="card overflow-hidden">
                <div className="scrollbar-thin overflow-x-auto">
                  <table className="w-full min-w-max border-collapse text-start text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] uppercase tracking-wide text-slate-500">
                        <th className="sticky start-0 z-10 w-10 bg-slate-50 px-4 py-2.5">
                          {canManage && <input type="checkbox" checked={allOnPageSelected} onChange={togglePage} className="h-4 w-4 rounded border-slate-300 accent-brand-600" aria-label={t('Select page')} />}
                        </th>
                        <SortHeader label={t('Submitted')} active={sort.key === 'createdAt'} dir={sort.dir} onClick={() => toggleSort('createdAt')} sticky />
                        {multilingual && <th className="px-4 py-2.5 font-semibold">{t('Language')}</th>}
                        {quiz && <SortHeader label={t('Score')} active={sort.key === 'score'} dir={sort.dir} onClick={() => toggleSort('score')} />}
                        {fields.map((f) => (
                          <SortHeader key={f.id} label={f.label} field={f} active={sort.key === f.id} dir={sort.dir} onClick={() => toggleSort(f.id)} />
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pageRows.map((r) => (
                        <tr key={r.id} onClick={() => setOpenId(r.id)} className={cn('group cursor-pointer transition', selected.has(r.id) ? 'bg-brand-50/50' : 'hover:bg-slate-50')}>
                          <td className="sticky start-0 z-10 bg-white px-4 py-2.5 group-hover:bg-slate-50" onClick={(e) => e.stopPropagation()}>
                            {canManage && <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleOne(r.id)} className="h-4 w-4 rounded border-slate-300 accent-brand-600" aria-label={t('Select row')} />}
                          </td>
                          <td className="sticky start-10 z-10 whitespace-nowrap bg-white px-4 py-2.5 group-hover:bg-slate-50">
                            <div className="font-medium text-slate-800">{formatDateTime(r.createdAt, locale)}</div>
                            <div className="text-[11px] text-slate-400">{timeAgo(r.createdAt, t)}</div>
                          </td>
                          {multilingual && (
                            <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-600">{r.language && isLocale(r.language) ? LOCALES[r.language].native : '—'}</td>
                          )}
                          {quiz && (
                            <td className="whitespace-nowrap px-4 py-2.5">
                              {r.score !== null ? <ScorePill score={r.score} max={r.maxScore ?? 0} /> : <span className="text-slate-300">—</span>}
                            </td>
                          )}
                          {fields.map((f) => (
                            <td key={f.id} className="max-w-[280px] px-4 py-2.5 text-slate-700">
                              <Cell field={f} value={formatAnswer(f, r.data[f.id], locale)} />
                            </td>
                          ))}
                        </tr>
                      ))}
                      {pageRows.length === 0 && (
                        <tr>
                          <td colSpan={fields.length + 4} className="px-4 py-16 text-center text-sm text-slate-500">
                            {t('No responses match the current filters.')}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {pageCount > 1 && (
                  <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
                    <span>
                      {t('{from}–{to} of {total}', { from: page * PAGE_SIZE + 1, to: Math.min((page + 1) * PAGE_SIZE, filtered.length), total: filtered.length })}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button size="xs" variant="ghost" onClick={() => setPage((p) => p - 1)} disabled={page === 0}>
                        <ChevronLeft className="h-4 w-4 rtl:rotate-180" /> {t('Prev')}
                      </Button>
                      <span className="px-2 tabular-nums" dir="ltr">
                        {page + 1} / {pageCount}
                      </span>
                      <Button size="xs" variant="ghost" onClick={() => setPage((p) => p + 1)} disabled={page >= pageCount - 1}>
                        {t('Next')} <ChevronRight className="h-4 w-4 rtl:rotate-180" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
      <AppFooter />

      {openRow && (
        <Drawer
          row={openRow}
          fields={fields}
          index={openIndex}
          total={filtered.length}
          onClose={() => setOpenId(null)}
          onNav={(d) => setOpenId(filtered[openIndex + d]?.id ?? openId)}
          onDelete={canManage ? () => setConfirm([openRow.id]) : undefined}
        />
      )}

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={doDelete}
        loading={deleting}
        title={confirm && confirm.length > 1 ? t('Delete {n} responses?', { n: confirm.length }) : t('Delete response?')}
        description={t('This permanently removes the selected response data. This can’t be undone.')}
        confirmLabel={t('Delete')}
      />
    </div>
  );
}

/** Renders a translated sentence with one placeholder emphasised, without concatenating sentence fragments. */
function WithStrong({ text, token, value, className = 'text-slate-700', as = 'strong' }: { text: string; token: string; value: ReactNode; className?: string; as?: 'strong' | 'span' }) {
  const i = text.indexOf(token);
  if (i < 0) return <>{text}</>;
  const Tag = as;
  return (
    <>
      {text.slice(0, i)}
      <Tag className={className}>{value}</Tag>
      {text.slice(i + token.length)}
    </>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function Metric({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="card px-4 py-3">
      <div className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 flex items-center gap-1.5 text-xl font-bold tabular-nums text-slate-900">
        {icon}
        {value}
      </div>
    </div>
  );
}

function SortHeader({ label, active, dir, onClick, field, sticky }: { label: string; active: boolean; dir: 'asc' | 'desc'; onClick: () => void; field?: FormField; sticky?: boolean }) {
  const Icon = field ? FIELD_ICONS[field.type] : null;
  return (
    <th className={cn('px-4 py-2.5 font-semibold', sticky && 'sticky start-10 z-10 bg-slate-50')}>
      <button onClick={onClick} className={cn('inline-flex max-w-[260px] items-center gap-1.5 hover:text-slate-800', active && 'text-slate-900')} title={label}>
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0 opacity-60" />}
        <span className="truncate">{label}</span>
        {active ? dir === 'asc' ? <ArrowUp className="h-3 w-3 shrink-0" /> : <ArrowDown className="h-3 w-3 shrink-0" /> : null}
      </button>
    </th>
  );
}

function Cell({ field, value }: { field: FormField; value: string }) {
  if (!value) return <span className="text-slate-300">—</span>;
  if (isChoice(field.type)) {
    return (
      <div className="flex flex-wrap gap-1">
        {value.split(', ').map((v) => (
          <span key={v} className="whitespace-nowrap rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">
            {v}
          </span>
        ))}
      </div>
    );
  }
  if (field.type === 'email')
    return (
      <span className="whitespace-nowrap text-brand-700" onClick={(e) => e.stopPropagation()}>
        <a href={`mailto:${value}`} className="hover:underline">
          {value}
        </a>
      </span>
    );
  if (field.type === 'rating' || field.type === 'scale') return <span className="whitespace-nowrap font-medium tabular-nums">{value}</span>;
  return <span className="line-clamp-2 break-words">{value}</span>;
}

function ScorePill({ score, max }: { score: number; max: number }) {
  const pct = max ? score / max : 0;
  return (
    <span
      className={cn(
        'chip tabular-nums',
        pct >= 0.8 ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : pct >= 0.5 ? 'bg-amber-50 text-amber-700 ring-amber-200' : 'bg-rose-50 text-rose-700 ring-rose-200',
      )}
    >
      {score} / {max}
    </span>
  );
}

function Drawer({
  row,
  fields,
  index,
  total,
  onClose,
  onNav,
  onDelete,
}: {
  row: SubmissionDTO;
  fields: FormField[];
  index: number;
  total: number;
  onClose: () => void;
  onNav: (d: -1 | 1) => void;
  onDelete?: () => void;
}) {
  const { t, locale } = useI18n();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown' || e.key === 'j') onNav(1);
      if (e.key === 'ArrowUp' || e.key === 'k') onNav(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onNav]);

  return createPortal(
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 animate-fade-in bg-black/20" onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-label={t('Response details')} className="absolute inset-y-0 end-0 flex w-full max-w-md animate-slide-in flex-col rtl:animate-slide-in-rtl bg-white shadow-2xl">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-900">{t('Response details')}</div>
            <div className="text-xs text-slate-500">{formatDateTime(row.createdAt, locale)}</div>
          </div>
          <span className="me-1 text-xs tabular-nums text-slate-400" dir="ltr">
            {index + 1} / {total}
          </span>
          <button onClick={() => onNav(-1)} disabled={index <= 0} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30" title={t('Previous (↑)')} aria-label={t('Previous (↑)')}>
            <ArrowUp className="h-4 w-4" />
          </button>
          <button onClick={() => onNav(1)} disabled={index >= total - 1} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30" title={t('Next (↓)')} aria-label={t('Next (↓)')}>
            <ArrowDown className="h-4 w-4" />
          </button>
          <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label={t('Close')}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-5">
          {row.score !== null && (
            <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3 ring-1 ring-inset ring-emerald-100">
              <span className="flex items-center gap-2 text-sm font-medium text-emerald-800">
                <Trophy className="h-4 w-4" /> {t('Quiz score')}
              </span>
              <span className="text-lg font-bold tabular-nums text-emerald-700" dir="ltr">
                {row.score} / {row.maxScore}
              </span>
            </div>
          )}
          {fields.map((f) => {
            const Icon = FIELD_ICONS[f.type];
            const v = formatAnswer(f, row.data[f.id], locale);
            const correct = (f.options ?? []).filter((o) => o.correct).map((o) => o.label);
            return (
              <div key={f.id}>
                <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-500">
                  <Icon className="h-3.5 w-3.5" /> {f.label}
                </div>
                <div className={cn('whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm', v ? 'bg-slate-50 text-slate-900' : 'italic text-slate-400')}>
                  {v || t('No answer')}
                </div>
                {correct.length > 0 && row.score !== null && (
                  <div className="mt-1 text-[11px] text-slate-500">
                    <WithStrong text={t('Correct: {answers}')} token="{answers}" value={correct.join(', ')} className="font-medium text-emerald-700" as="span" />
                  </div>
                )}
              </div>
            );
          })}
          <div className="pt-2 font-mono text-[10px] text-slate-400">{t('ID {id}', { id: row.id })}</div>
        </div>
        {onDelete && (
          <div className="border-t border-slate-100 p-4">
            <Button variant="secondary" className="w-full !text-rose-600" onClick={onDelete}>
              <Trash2 className="h-4 w-4" /> {t('Delete response')}
            </Button>
          </div>
        )}
      </aside>
    </div>,
    document.body,
  );
}
