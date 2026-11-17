'use client';

import { ArrowRight, CheckCircle2, Circle, Copy, Languages, ListFilter } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useT } from '@/components/i18n';
import { FIELD_ICONS } from '@/components/icons';
import { formLanguages, getTranslation, setTranslation, translatableKeys } from '@/lib/form-i18n';
import { dirOf, isLocale, LOCALES } from '@/lib/i18n';
import type { FormSchema, FormTranslation } from '@/lib/types';
import { cn } from '@/lib/utils';

const langName = (l: string) => (isLocale(l) ? LOCALES[l].native : l);

/**
 * Side-by-side translation of every text in a form. Empty entries fall back to the primary
 * language on the published form, so partial translations are safe.
 */
export function TranslationEditor({
  schema,
  title,
  description,
  onChange,
}: {
  schema: FormSchema;
  title: string;
  description: string;
  onChange: (lang: string, tr: FormTranslation) => void;
}) {
  const t = useT();
  const langs = formLanguages(schema);
  const primary = langs[0];
  const targets = langs.slice(1);
  const [lang, setLang] = useState(targets[0]);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const active = targets.includes(lang) ? lang : targets[0];
  const keys = useMemo(() => translatableKeys(schema).filter((k) => k.path !== 'description' || description), [schema, description]);
  const sourceOf = (path: string, fallback: string) => (path === 'title' ? title : path === 'description' ? description : fallback);

  const progress = (l: string) => {
    const tr = schema.translations?.[l];
    const done = keys.filter((k) => getTranslation(tr, k.path).trim()).length;
    return { done, total: keys.length };
  };

  if (!active) return null;
  const tr = schema.translations?.[active];
  const p = progress(active);
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
  const isDone = (path: string) => !!getTranslation(tr, path).trim();

  // Group keys: form header, one block per field, then buttons & messages.
  const header = keys.filter((k) => k.path === 'title' || k.path === 'description');
  const footer = keys.filter((k) => k.path === 'submitLabel' || k.path === 'successMessage');

  const propLabel = (prop: string) =>
    prop === 'label'
      ? t('Question')
      : prop === 'helpText'
        ? t('Help text')
        : prop === 'placeholder'
          ? t('Placeholder')
          : prop === 'minLabel'
            ? t('Low label')
            : prop === 'maxLabel'
              ? t('High label')
              : prop === 'terms'
                ? t('Terms text')
                : prop === 'agreeLabel'
                  ? t('Checkbox text')
                  : t('Option');

  const row = (path: string, source: string, label: string, multiline?: boolean) => {
    const value = getTranslation(tr, path);
    const done = !!value.trim();
    if (onlyMissing && done) return null;
    const Input = multiline ? 'textarea' : 'input';
    return (
      <div key={path} className={cn('my-2 rounded-xl border p-3 transition sm:p-4', done ? 'border-slate-200 bg-white' : 'border-amber-300 bg-amber-50/40')}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-slate-900">{label}</span>
          {done ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
              <CheckCircle2 className="h-3 w-3" /> {t('Translated')}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-300">
              <Circle className="h-3 w-3" /> {t('Not translated yet')}
            </span>
          )}
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-start">
          <div className="min-w-0">
            <div className="mb-1 text-xs font-semibold text-slate-600">{t('Original ({lang})', { lang: langName(primary) })}</div>
            <div dir={dirOf(primary)} className="min-h-[38px] whitespace-pre-line break-words rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-900">
              {source || <span className="italic text-slate-500">{t('(empty)')}</span>}
            </div>
          </div>
          <ArrowRight className="mx-auto hidden h-4 w-4 self-center text-slate-400 md:block rtl:rotate-180" />
          <div className="min-w-0">
            <div className="mb-1 flex items-center justify-between gap-2 text-xs font-semibold text-slate-600">
              <span>{t('Translation ({lang})', { lang: langName(active) })}</span>
              {!done && source && (
                <button
                  type="button"
                  onClick={() => onChange(active, setTranslation(tr, path, source))}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-brand-700 hover:bg-brand-50"
                  title={t('Use the original text as it is (for names, brands, numbers)')}
                >
                  <Copy className="h-3 w-3" /> {t('Copy original')}
                </button>
              )}
            </div>
            <Input
              dir={dirOf(active)}
              lang={active}
              rows={multiline ? 3 : undefined}
              className={cn('input', multiline && 'resize-y', !done && 'border-amber-300')}
              value={value}
              placeholder={`${langName(active)}…`}
              onChange={(e) => onChange(active, setTranslation(tr, path, e.target.value))}
            />
          </div>
        </div>
      </div>
    );
  };

  const sectionTitle = (icon: React.ReactNode, text: React.ReactNode, sub?: string) => (
    <h3 className="flex min-w-0 items-center gap-2 pt-4 text-sm font-bold text-slate-900">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-700 [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
      <span className="shrink-0">{text}</span>
      {sub && <span className="truncate font-normal text-slate-600">· {sub}</span>}
    </h3>
  );

  const fieldSections = schema.fields
    .map((f, i) => {
      const fk = keys.filter((k) => k.path.startsWith(`fields.${f.id}.`));
      const rows = fk.map((k) => row(k.path, k.source, propLabel(k.path.split('.')[2]), k.multiline)).filter(Boolean);
      if (!rows.length) return null;
      const Icon = FIELD_ICONS[f.type];
      return (
        <section key={f.id} className="py-2">
          {sectionTitle(<Icon />, t('Question {n}', { n: i + 1 }), f.label)}
          {rows}
        </section>
      );
    })
    .filter(Boolean);
  const headerRows = header.map((k) => row(k.path, sourceOf(k.path, k.source), k.path === 'title' ? t('Form title') : t('Form description'), k.multiline)).filter(Boolean);
  const footerRows = footer.map((k) => row(k.path, k.source, k.path === 'submitLabel' ? t('Submit button text') : t('Message after submitting'), k.multiline)).filter(Boolean);
  const nothingLeft = onlyMissing && !headerRows.length && !fieldSections.length && !footerRows.length;

  return (
    <div className="mx-auto max-w-4xl px-3 py-6 sm:px-4 sm:py-8">
      <div className="card mb-4 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
            <Languages className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-slate-900">{t('Translate your form')}</h2>
            <p className="mt-0.5 text-sm text-slate-700">{t('People choose their language at the top of the form. Here you write what they will see.')}</p>
          </div>
        </div>

        <ol className="mt-4 grid gap-2 text-sm text-slate-800 sm:grid-cols-3">
          {[
            t('Pick the language to translate into.'),
            t('Type the translation under each original text.'),
            t('Anything left empty shows in {lang}. Changes save with the form.', { lang: langName(primary) }),
          ].map((s, i) => (
            <li key={i} className="flex gap-2 rounded-lg bg-slate-50 p-2.5 ring-1 ring-inset ring-slate-200">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-onaccent">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>

        <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-600">{t('Translate into')}</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {targets.map((l) => {
            const pr = progress(l);
            const lp = pr.total ? Math.round((pr.done / pr.total) * 100) : 0;
            return (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={cn(
                  'min-w-[150px] flex-1 rounded-xl border px-3 py-2 text-start transition sm:flex-none',
                  l === active ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500' : 'border-slate-300 bg-white hover:border-slate-400',
                )}
              >
                <div className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-900">
                  <span lang={l}>{langName(l)}</span>
                  <span className="text-xs tabular-nums text-slate-700">{t('{done}/{total} done', { done: pr.done, total: pr.total })}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
                  <div className={cn('h-full rounded-full', lp === 100 ? 'bg-emerald-500' : 'bg-brand-500')} style={{ width: `${lp}%` }} />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sticky summary + filter */}
      <div className="sticky top-0 z-10 -mx-3 mb-3 flex flex-wrap items-center gap-2 bg-slate-50/95 px-3 py-2 backdrop-blur sm:mx-0 sm:rounded-xl sm:px-4">
        <span className={cn('text-sm font-semibold', pct === 100 ? 'text-emerald-700' : 'text-slate-800')}>
          {pct === 100 ? t('All texts translated') : t('{n} still to translate', { n: p.total - p.done })}
        </span>
        <button
          type="button"
          onClick={() => setOnlyMissing((x) => !x)}
          aria-pressed={onlyMissing}
          className={cn(
            'ms-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition',
            onlyMissing ? 'bg-amber-100 text-amber-900 ring-amber-300' : 'bg-white text-slate-800 ring-slate-300 hover:bg-slate-50',
          )}
        >
          <ListFilter className="h-4 w-4" /> {t('Show only missing')}
        </button>
      </div>

      <div className="card px-3 pb-3 sm:px-5">
        {headerRows.length > 0 && (
          <section className="py-2">
            {sectionTitle(<Languages />, t('Form title & description'))}
            {headerRows}
          </section>
        )}
        {fieldSections}
        {footerRows.length > 0 && (
          <section className="py-2">
            {sectionTitle(<CheckCircle2 />, t('Button & messages'))}
            {footerRows}
          </section>
        )}
        {nothingLeft && (
          <p className="flex items-center justify-center gap-2 py-10 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="h-5 w-5" /> {t('Everything is translated into {lang}.', { lang: langName(active) })}
          </p>
        )}
      </div>
    </div>
  );
}
