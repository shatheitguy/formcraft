'use client';

import Fuse from 'fuse.js';
import { Activity, ArrowDownWideNarrow, FileStack, Inbox, LayoutGrid, List, Plus, Radio, Search, SearchX, Tag, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useApp } from '@/components/app-context';
import { AppFooter } from '@/components/app-footer';
import { AppHeader } from '@/components/app-header';
import { useI18n } from '@/components/i18n';
import { ShareDialog } from '@/components/share-dialog';
import { useToast } from '@/components/toast';
import { Button, ConfirmDialog, EmptyState, Segmented } from '@/components/ui';
import { categoryStyle } from '@/lib/categories';
import type { HubForm } from '@/lib/types';
import { fmtNumber } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { FormCard, FormRow, type CardActions } from './form-card';
import { TemplatePicker } from './template-picker';

type StatusFilter = 'all' | 'ACTIVE' | 'DRAFT';
type SortKey = 'updated' | 'responses' | 'title' | 'recent-activity';

/** Reads the API's `error` message (fixed English, translated at render) or falls back. */
async function apiError(res: Response, fallback: string) {
  const j = await res.json().catch(() => null);
  return typeof j?.error === 'string' ? j.error : fallback;
}

const SORTS: Record<SortKey, { label: string; fn: (a: HubForm, b: HubForm) => number }> = {
  updated: { label: 'Last updated', fn: (a, b) => b.updatedAt.localeCompare(a.updatedAt) },
  'recent-activity': { label: 'Latest response', fn: (a, b) => (b.lastResponseAt ?? '').localeCompare(a.lastResponseAt ?? '') },
  responses: { label: 'Most responses', fn: (a, b) => b.responses - a.responses },
  title: { label: 'Name (A–Z)', fn: (a, b) => a.title.localeCompare(b.title) },
};

export function HubClient({ forms, canCreate, portRange }: { forms: HubForm[]; canCreate: boolean; portRange: { from: number; to: number } | null }) {
  const router = useRouter();
  const toast = useToast();
  const { app } = useApp();
  const { t, locale } = useI18n();
  const searchRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [category, setCategory] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [sort, setSort] = useState<SortKey>('updated');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [toDelete, setToDelete] = useState<HubForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState<HubForm | null>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem('fc:view');
      if (v === 'grid' || v === 'list') setView(v);
    } catch {}
  }, []);
  const changeView = (v: 'grid' | 'list') => {
    setView(v);
    try {
      localStorage.setItem('fc:view', v);
    } catch {}
  };

  // Keyboard shortcuts: "/" focuses search, "n" opens the template picker.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest?.('input, textarea, select, [contenteditable], [role=dialog]') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key.toLowerCase() === 'n' && canCreate) {
        e.preventDefault();
        setPickerOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canCreate]);

  const fuse = useMemo(
    () =>
      new Fuse(forms, {
        keys: [
          { name: 'title', weight: 0.5 },
          { name: 'description', weight: 0.2 },
          { name: 'category', weight: 0.15 },
          { name: 'tags', weight: 0.15 },
        ],
        threshold: 0.4,
        ignoreLocation: true,
        includeScore: true,
      }),
    [forms],
  );

  const categories = useMemo(() => {
    const m = new Map<string, number>();
    forms.forEach((f) => m.set(f.category, (m.get(f.category) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [forms]);

  const allTags = useMemo(() => {
    const m = new Map<string, number>();
    forms.forEach((f) => f.tags.forEach((tag) => m.set(tag, (m.get(tag) ?? 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [forms]);

  const results = useMemo(() => {
    const q = query.trim();
    let list = q ? fuse.search(q).map((r) => r.item) : [...forms];
    list = list.filter(
      (f) =>
        (status === 'all' || f.status === status) &&
        (!category || f.category === category) &&
        tags.every((tag) => f.tags.includes(tag)),
    );
    // Keep relevance order while searching; otherwise apply the chosen sort.
    return q ? list : list.sort(SORTS[sort].fn);
  }, [forms, fuse, query, status, category, tags, sort]);

  const stats = useMemo(() => {
    const total = forms.reduce((s, f) => s + f.responses, 0);
    const last7 = forms.reduce((s, f) => s + f.spark.slice(-7).reduce((a, b) => a + b, 0), 0);
    const prev7 = forms.reduce((s, f) => s + f.spark.slice(0, 7).reduce((a, b) => a + b, 0), 0);
    return {
      forms: forms.length,
      active: forms.filter((f) => f.status === 'ACTIVE').length,
      total,
      last7,
      trend: prev7 === 0 ? (last7 > 0 ? 100 : 0) : Math.round(((last7 - prev7) / prev7) * 100),
    };
  }, [forms]);

  const filtersActive = query || status !== 'all' || category || tags.length;
  const clearFilters = () => {
    setQuery('');
    setStatus('all');
    setCategory(null);
    setTags([]);
  };
  const toggleTag = useCallback((tag: string) => setTags((cur) => (cur.includes(tag) ? cur.filter((x) => x !== tag) : [...cur, tag])), []);

  const actions: CardActions = {
    onShare: (f) => setSharing(f),
    onDuplicate: async (f) => {
      const res = await fetch(`/api/forms/${f.id}/duplicate`, { method: 'POST' });
      if (res.ok) {
        toast(t('Duplicated “{title}”', { title: f.title }));
        router.refresh();
      } else toast(t(await apiError(res, 'Could not duplicate form')), 'error');
    },
    onToggleStatus: async (f) => {
      const next = f.status === 'ACTIVE' ? 'DRAFT' : 'ACTIVE';
      const res = await fetch(`/api/forms/${f.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (res.ok) {
        toast(next === 'ACTIVE' ? t('Form published — now accepting responses') : t('Form moved to drafts'));
        router.refresh();
      } else toast(t(await apiError(res, 'Could not update status')), 'error');
    },
    onDelete: (f) => setToDelete(f),
    onTagClick: toggleTag,
  };

  async function confirmDelete() {
    if (!toDelete) return;
    setBusy(true);
    const res = await fetch(`/api/forms/${toDelete.id}`, { method: 'DELETE' });
    setBusy(false);
    setToDelete(null);
    if (res.ok) {
      toast(t('Form deleted'));
      router.refresh();
    } else toast(t(await apiError(res, 'Could not delete form')), 'error');
  }

  return (
    <div className="min-h-screen">
      <AppHeader>
        {canCreate && (
          <Button variant="primary" onClick={() => setPickerOpen(true)}>
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">{t('New form')}</span>
          </Button>
        )}
      </AppHeader>

      <main className="mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-6">
        {/* Heading + stats */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{t('{name} Dashboard', { name: app.name })}</h1>
            <p className="mt-1 text-sm text-slate-500">{t('Organize, manage, and search every form in your workspace.')}</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile icon={<FileStack />} label={t('Total forms')} value={stats.forms} locale={locale} tone="bg-brand-50 text-brand-600" />
          <StatTile icon={<Radio />} label={t('Active forms')} value={stats.active} locale={locale} sub={stats.forms - stats.active === 1 ? t('1 draft') : t('{n} drafts', { n: fmtNumber(stats.forms - stats.active, locale) })} tone="bg-emerald-50 text-emerald-600" />
          <StatTile icon={<Inbox />} label={t('Total responses')} value={stats.total} locale={locale} tone="bg-sky-50 text-sky-600" />
          <StatTile
            icon={<Activity />}
            label={t('Responses · 7 days')}
            value={stats.last7}
            locale={locale}
            tone="bg-amber-50 text-amber-600"
            sub={
              <span className={cn('font-semibold', stats.trend >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                {stats.trend >= 0 ? t('▲ {n}% vs prior week', { n: Math.abs(stats.trend) }) : t('▼ {n}% vs prior week', { n: Math.abs(stats.trend) })}
              </span>
            }
          />
        </div>

        {/* Toolbar */}
        <div className="sticky top-14 z-20 -mx-4 mt-8 border-b border-transparent bg-slate-50/90 px-4 py-3 backdrop-blur-lg sm:-mx-6 sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && (setQuery(''), e.currentTarget.blur())}
                placeholder={t('Fuzzy search forms by name, description, category, or tag…')}
                className="input h-10 pe-16 ps-9"
              />
              {query ? (
                <button onClick={() => setQuery('')} className="absolute end-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label={t('Clear search')}>
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : (
                <span className="kbd absolute end-3 top-1/2 -translate-y-1/2">/</span>
              )}
            </div>
            <Segmented
              value={status}
              onChange={setStatus}
              options={[
                { value: 'all', label: t('All'), count: forms.length },
                { value: 'ACTIVE', label: t('Active'), count: stats.active },
                { value: 'DRAFT', label: t('Draft'), count: stats.forms - stats.active },
              ]}
            />
            <label className="relative">
              <ArrowDownWideNarrow className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="input h-9 w-auto appearance-none py-0 pe-8 ps-8 text-xs font-medium" disabled={!!query.trim()} title={query.trim() ? t('Sorted by relevance while searching') : undefined}>
                {Object.entries(SORTS).map(([k, s]) => (
                  <option key={k} value={k}>
                    {query.trim() ? t('Relevance') : t(s.label)}
                  </option>
                ))}
              </select>
            </label>
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
              {(['grid', 'list'] as const).map((v) => (
                <button key={v} onClick={() => changeView(v)} aria-label={v === 'grid' ? t('Grid view') : t('List view')} className={cn('rounded-md p-1.5 transition', view === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-700')}>
                  {v === 'grid' ? <LayoutGrid className="h-4 w-4" /> : <List className="h-4 w-4" />}
                </button>
              ))}
            </div>
          </div>

          {/* Category + tag filters */}
          <div className="scrollbar-thin mt-3 flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <FilterChip active={!category} onClick={() => setCategory(null)}>
              {t('All categories')}
            </FilterChip>
            {categories.map(([c, n]) => (
              <FilterChip key={c} active={category === c} onClick={() => setCategory(category === c ? null : c)}>
                <span className={cn('h-1.5 w-1.5 rounded-full', categoryStyle(c).dot)} />
                {c}
                <span className="tabular-nums opacity-60">{n}</span>
              </FilterChip>
            ))}
            {allTags.length > 0 && <span className="mx-1.5 h-5 w-px shrink-0 bg-slate-200" />}
            {allTags.slice(0, 14).map(([tag]) => (
              <FilterChip key={tag} active={tags.includes(tag)} onClick={() => toggleTag(tag)} subtle>
                <Tag className="h-3 w-3" />
                {tag}
              </FilterChip>
            ))}
            {filtersActive ? (
              <button onClick={clearFilters} className="ms-1 shrink-0 text-xs font-medium text-brand-600 hover:text-brand-800">
                {t('Clear filters')}
              </button>
            ) : null}
          </div>
        </div>

        <div className="mb-3 mt-4 text-xs text-slate-500">
          {filtersActive ? (
            <>{t('Showing {shown} of {total} forms', { shown: fmtNumber(results.length, locale), total: fmtNumber(forms.length, locale) })}</>
          ) : (
            <>{forms.length === 1 ? t('1 form') : t('{n} forms', { n: fmtNumber(forms.length, locale) })}</>
          )}
        </div>

        {/* Results */}
        {forms.length === 0 ? (
          <EmptyState
            icon={<FileStack />}
            title={canCreate ? t('No forms yet') : t('No forms shared with you yet')}
            description={canCreate ? t('Create your first form from one of the pre-built templates, or start from a blank canvas.') : t('An administrator can give you access to forms from Settings → Users & roles.')}
            action={
              canCreate ? (
                <Button variant="primary" onClick={() => setPickerOpen(true)}>
                  <Plus className="h-4 w-4" /> {t('Create a form')}
                </Button>
              ) : undefined
            }
          />
        ) : results.length === 0 ? (
          <EmptyState
            icon={<SearchX />}
            title={t('No forms match your filters')}
            description={query ? t('Nothing found for “{query}”. Try a different term or clear filters.', { query }) : t('Try clearing some filters.')}
            action={<Button onClick={clearFilters}>{t('Clear filters')}</Button>}
          />
        ) : view === 'grid' ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((f) => (
              <FormCard key={f.id} form={f} actions={actions} />
            ))}
            {canCreate && <button
              onClick={() => setPickerOpen(true)}
              className="group flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 transition hover:border-brand-300 hover:bg-brand-50/40 hover:text-brand-600"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 transition group-hover:bg-brand-100">
                <Plus className="h-5 w-5" />
              </span>
              <span className="text-sm font-medium">{t('Create new form')}</span>
              <span className="text-xs">
                {(() => {
                  // One translatable sentence; the key hint is spliced in where the language puts it.
                  const [before, after = ''] = t('or press {key}').split('{key}');
                  return (
                    <>
                      {before}
                      <span className="kbd">N</span>
                      {after}
                    </>
                  );
                })()}
              </span>
            </button>}
          </div>
        ) : (
          <div className="card divide-y divide-slate-100 overflow-visible">
            {results.map((f) => (
              <FormRow key={f.id} form={f} actions={actions} />
            ))}
          </div>
        )}
      </main>
      <AppFooter />

      {canCreate && <TemplatePicker open={pickerOpen} onClose={() => setPickerOpen(false)} />}
      {sharing && (
        <ShareDialog
          open
          onClose={() => {
            setSharing(null);
            router.refresh();
          }}
          form={sharing}
          portRange={portRange}
          canEdit={sharing.canEdit}
        />
      )}
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        loading={busy}
        title={t('Delete form?')}
        description={
          <>
            <strong className="text-slate-900">{toDelete?.title}</strong>
            {' — '}
            {toDelete?.responses === 1
              ? t('This form and its 1 response will be permanently deleted. This can’t be undone.')
              : t('This form and all of its {n} responses will be permanently deleted. This can’t be undone.', { n: fmtNumber(toDelete?.responses ?? 0, locale) })}
          </>
        }
      />
    </div>
  );
}

function StatTile({ icon, label, value, sub, tone, locale }: { icon: ReactNode; label: string; value: number; sub?: ReactNode; tone: string; locale: string }) {
  return (
    <div className="card flex items-start gap-3 p-4">
      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl [&>svg]:h-[18px] [&>svg]:w-[18px]', tone)}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
        <div className="mt-0.5 text-2xl font-bold tabular-nums leading-tight text-slate-900">{fmtNumber(value, locale)}</div>
        {sub && <div className="mt-0.5 truncate text-xs text-slate-500">{sub}</div>}
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, children, subtle }: { active: boolean; onClick: () => void; children: ReactNode; subtle?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition',
        active
          ? 'bg-slate-900 text-white shadow-sm'
          : subtle
            ? 'text-slate-500 hover:bg-white hover:text-slate-800 hover:shadow-sm'
            : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-300',
      )}
    >
      {children}
    </button>
  );
}
