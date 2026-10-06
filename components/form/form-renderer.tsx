'use client';

import { AlertCircle, CheckCircle2, Languages, RotateCcw, Trophy } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { I18nProvider, useI18n } from '@/components/i18n';
import { Button } from '@/components/ui';
import { formLanguages, localizeForm } from '@/lib/form-i18n';
import { dirOf, isLocale, LOCALES, matchLocale } from '@/lib/i18n';
import { computeScore, type ScoreResult } from '@/lib/scoring';
import type { AnswerValue, Answers, FormSchema } from '@/lib/types';
import { cn } from '@/lib/utils';
import { validateAnswers, validateField } from '@/lib/validation';
import { FieldInput, FieldLabel } from './field-input';
import { FormHeader } from './form-frame';
import { FORM_LANG_EVENT } from './powered-by';

interface Props {
  formId?: string;
  title: string;
  description?: string;
  schema: FormSchema;
  /** In preview mode nothing is sent to the server. */
  mode: 'live' | 'preview';
  /** Language requested via ?lang= — otherwise the respondent's browser language, then the form's primary language. */
  initialLanguage?: string;
}

/**
 * Renders a form for respondents. Multilingual forms get a language switch that can be
 * changed at any time while filling in — answers are kept, because choice answers are stored
 * by their primary-language value.
 */
export function FormRenderer(props: Props) {
  const languages = formLanguages(props.schema);
  const [lang, setLang] = useState(() => (props.initialLanguage && languages.includes(props.initialLanguage) ? props.initialLanguage : languages[0]));

  // Prefer the browser's language when the link didn't ask for one.
  useEffect(() => {
    if (props.initialLanguage && languages.includes(props.initialLanguage)) return;
    const match = matchLocale(navigator.languages, languages);
    if (match && match !== lang) {
      setLang(match);
      window.dispatchEvent(new CustomEvent(FORM_LANG_EVENT, { detail: match }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeLanguage = (l: string) => {
    setLang(l);
    window.dispatchEvent(new CustomEvent(FORM_LANG_EVENT, { detail: l }));
    if (props.mode === 'live') {
      const url = new URL(window.location.href);
      url.searchParams.set('lang', l);
      window.history.replaceState(null, '', url);
    }
  };

  return (
    <I18nProvider locale={isLocale(lang) ? lang : 'en'}>
      <div dir={dirOf(lang)} lang={lang} className="text-start">
        {languages.length > 1 && <LanguagePicker languages={languages} value={lang} onChange={changeLanguage} />}
        <FormBody {...props} lang={lang} />
      </div>
    </I18nProvider>
  );
}

function LanguagePicker({ languages, value, onChange }: { languages: string[]; value: string; onChange: (l: string) => void }) {
  const { t } = useI18n();
  return (
    <div className="flex justify-end px-6 pt-5 sm:px-10">
      <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 p-1" role="radiogroup" aria-label={t('Language')}>
        <Languages className="mx-1 h-3.5 w-3.5 text-slate-400" />
        {languages.map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={l === value}
            lang={l}
            onClick={() => onChange(l)}
            className={cn('rounded-full px-3 py-1 text-xs font-semibold transition', l === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800')}
          >
            {isLocale(l) ? LOCALES[l].native : l}
          </button>
        ))}
      </div>
    </div>
  );
}

function FormBody({ formId, title, description, schema, mode, lang }: Props & { lang: string }) {
  const { t } = useI18n();
  const view = useMemo(() => localizeForm(schema, title, description ?? '', lang), [schema, title, description, lang]);
  const [answers, setAnswers] = useState<Answers>({});
  // Only *which* fields failed is stored; messages are rebuilt in the current language.
  const [invalid, setInvalid] = useState<Set<string>>(new Set());
  const [state, setState] = useState<'idle' | 'submitting' | 'done'>('idle');
  const [serverError, setServerError] = useState<string | null>(null);
  const [result, setResult] = useState<ScoreResult | null>(null);

  const messageFor = (id: string) => {
    const field = schema.fields.find((f) => f.id === id);
    const v = answers[id];
    return field ? validateField(field, typeof v === 'string' ? v.trim() : v, t) ?? t('Please check this answer.') : null;
  };

  const setValue = (id: string, v: AnswerValue) => {
    setAnswers((a) => ({ ...a, [id]: v }));
    if (invalid.has(id)) {
      const field = schema.fields.find((f) => f.id === id);
      if (field && !validateField(field, typeof v === 'string' ? v.trim() : v)) {
        setInvalid((s) => {
          const n = new Set(s);
          n.delete(id);
          return n;
        });
      }
    }
  };

  const focusFirst = (ids: string[]) => {
    const first = schema.fields.find((f) => ids.includes(f.id));
    if (first) document.getElementById(`q-${first.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    const { valid, errors, clean } = validateAnswers(schema.fields, answers);
    setInvalid(new Set(Object.keys(errors)));
    if (!valid) return focusFirst(Object.keys(errors));

    if (mode === 'preview' || !formId) {
      setResult(schema.settings.showScore ? computeScore(schema, clean) : null);
      setState('done');
      return;
    }

    setState('submitting');
    try {
      const res = await fetch(`/api/forms/${formId}/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers, language: lang }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (json.errors) {
          setInvalid(new Set(Object.keys(json.errors)));
          focusFirst(Object.keys(json.errors));
          setServerError(t('Please fix the highlighted fields.'));
        } else {
          setServerError(res.status === 403 ? t('This form is not accepting responses right now.') : t('Something went wrong. Please try again.'));
        }
        setState('idle');
        return;
      }
      setResult(json.result ?? null);
      setState('done');
    } catch {
      setServerError(t('Network error — please check your connection and try again.'));
      setState('idle');
    }
  }

  const reset = () => {
    setAnswers({});
    setInvalid(new Set());
    setResult(null);
    setState('idle');
  };

  if (state === 'done') {
    const pct = result && result.maxScore > 0 ? Math.round((result.score / result.maxScore) * 100) : null;
    return (
      <div className="animate-pop-in px-6 py-14 text-center sm:px-10">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-8 ring-emerald-50/50">
          {result ? <Trophy className="h-7 w-7" /> : <CheckCircle2 className="h-7 w-7" />}
        </div>
        <h2 className="text-xl font-semibold text-slate-900">{result ? t('Your results') : t('Response submitted')}</h2>
        <p className="mx-auto mt-2 max-w-md text-slate-600">{view.schema.settings.successMessage}</p>
        {result && (
          <div className="mx-auto mt-6 max-w-xs rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="text-4xl font-bold tabular-nums text-slate-900" dir="ltr">
              {result.score}
              <span className="text-lg font-medium text-slate-400"> / {result.maxScore}</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all rtl:bg-gradient-to-l" style={{ width: `${pct ?? 0}%` }} />
            </div>
            <p className="mt-2 text-sm text-slate-500">
              {t('{correct} of {total} correct', { correct: result.correct, total: result.total })}
              {pct !== null && ` · ${pct}%`}
            </p>
          </div>
        )}
        {mode === 'preview' && (
          <p className="mt-6 inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200">{t('Preview mode — this response was not saved')}</p>
        )}
        <div className="mt-6">
          <Button variant="ghost" onClick={reset}>
            <RotateCcw className="h-4 w-4" /> {t('Submit another response')}
          </Button>
        </div>
      </div>
    );
  }

  const count = invalid.size;
  return (
    <form onSubmit={onSubmit} noValidate className="px-6 py-8 sm:px-10">
      <FormHeader
        branding={schema.settings.branding}
        title={<h1 className="text-2xl font-bold tracking-tight text-slate-900">{view.title || t('Untitled form')}</h1>}
        description={view.description ? <p className="mt-2 whitespace-pre-line text-slate-600">{view.description}</p> : undefined}
        footer={
          schema.fields.some((f) => f.required) ? (
            <p className="mt-3 text-xs text-slate-400">
              <span className="text-rose-500">*</span> {t('Required')}
            </p>
          ) : undefined
        }
      />

      {view.schema.fields.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-400">{t('This form has no questions yet.')}</p>
      ) : (
        <div className="space-y-7">
          {view.schema.fields.map((field) => {
            const err = invalid.has(field.id) ? messageFor(field.id) : null;
            return (
              <div key={field.id} id={`q-${field.id}`} className="scroll-mt-24">
                <FieldLabel field={field} htmlFor={`in-${field.id}`} />
                <FieldInput field={field} value={answers[field.id]} onChange={(v) => setValue(field.id, v)} error={err ?? undefined} />
                {err && (
                  <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-rose-600">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {err}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {serverError && (
        <div className="mt-6 flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
          <AlertCircle className="h-4 w-4 shrink-0" /> {serverError}
        </div>
      )}

      <div className="mt-8 flex items-center justify-between gap-4 border-t border-slate-100 pt-6">
        <Button type="submit" variant="primary" size="md" loading={state === 'submitting'} disabled={schema.fields.length === 0}>
          {view.schema.settings.submitLabel || t('Submit')}
        </Button>
        {count > 0 && <span className="text-xs text-rose-600">{count === 1 ? t('1 field needs attention') : t('{n} fields need attention', { n: count })}</span>}
      </div>
    </form>
  );
}
