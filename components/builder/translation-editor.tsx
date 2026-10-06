'use client';

import { CheckCircle2, Languages } from 'lucide-react';
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

  // Group keys: form header, one block per field, then buttons & messages.
  const header = keys.filter((k) => k.path === 'title' || k.path === 'description');
  const footer = keys.filter((k) => k.path === 'submitLabel' || k.path === 'successMessage');

  const row = (path: string, source: string, label: string, multiline?: boolean) => {
    const value = getTranslation(tr, path);
    const Input = multiline ? 'textarea' : 'input';
    return (
      <div key={path} className="grid gap-2 py-3 md:grid-cols-2 md:gap-4">
        <div className="min-w-0">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
            {label} · {langName(primary)}
          </div>
          <div dir={dirOf(primary)} className="whitespace-pre-line break-words rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 ring-1 ring-inset ring-slate-100">
            {source || <span className="italic text-slate-400">{t('(empty)')}</span>}
          </div>
        </div>
        <div className="min-w-0">
          <div className="mb-1 flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-slate-400">
            <span>{langName(active)}</span>
            {value.trim() && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
          </div>
          <Input
            dir={dirOf(active)}
            lang={active}
            rows={multiline ? 2 : undefined}
            className={cn('input', multiline && 'resize-y')}
            value={value}
            placeholder={source}
            onChange={(e) => onChange(active, setTranslation(tr, path, e.target.value))}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="card mb-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <Languages className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold text-slate-900">{t('Translations')}</h2>
            <p className="text-sm text-slate-500">{t('Written in {lang}. Anything left empty is shown in {lang} instead.', { lang: langName(primary) })}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {targets.map((l) => {
            const pr = progress(l);
            const pct = pr.total ? Math.round((pr.done / pr.total) * 100) : 0;
            return (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={cn('min-w-[150px] rounded-xl border px-3 py-2 text-start transition', l === active ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500' : 'border-slate-200 hover:border-slate-300')}
              >
                <div className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-900">
                  <span lang={l}>{langName(l)}</span>
                  <span className="text-xs tabular-nums text-slate-500">{pct}%</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
                  <div className={cn('h-full rounded-full', pct === 100 ? 'bg-emerald-500' : 'bg-brand-500')} style={{ width: `${pct}%` }} />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="card divide-y divide-slate-100 px-5">
        <section className="py-2">
          <h3 className="pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('Form')}</h3>
          {header.map((k) => row(k.path, sourceOf(k.path, k.source), k.path === 'title' ? t('Title') : t('Description'), k.multiline))}
        </section>

        {schema.fields.map((f, i) => {
          const fk = keys.filter((k) => k.path.startsWith(`fields.${f.id}.`));
          const Icon = FIELD_ICONS[f.type];
          return (
            <section key={f.id} className="py-2">
              <h3 className="flex items-center gap-1.5 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Icon className="h-3.5 w-3.5" /> {t('Question {n}', { n: i + 1 })}
              </h3>
              {fk.map((k) => {
                const prop = k.path.split('.')[2];
                const label =
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
                            : t('Option');
                return row(k.path, k.source, label);
              })}
            </section>
          );
        })}

        <section className="py-2">
          <h3 className="pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('Button & messages')}</h3>
          {footer.map((k) => row(k.path, k.source, k.path === 'submitLabel' ? t('Submit button text') : t('Confirmation message'), k.multiline))}
        </section>
      </div>
      <p className="mt-3 text-center text-xs text-slate-400">
        {t('{done} of {total} texts translated', { done: p.done, total: p.total })}
      </p>
    </div>
  );
}
