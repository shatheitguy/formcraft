'use client';

import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Languages, RotateCcw, Trophy } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { I18nProvider, useI18n } from '@/components/i18n';
import { Button } from '@/components/ui';
import { formLayout } from '@/lib/form-layout';
import { formLanguages, localizeForm } from '@/lib/form-i18n';
import { dirOf, isLocale, LOCALES, matchLocale } from '@/lib/i18n';
import { computeScore, type ScoreResult } from '@/lib/scoring';
import type { AnswerValue, Answers, FormBranding, FormLayout, FormSchema } from '@/lib/types';
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
  /** Builder's phone preview: always use the stacked (phone) arrangement of the Split look. */
  narrow?: boolean;
}

/**
 * Renders a form for respondents. Multilingual forms get a language switch that can be
 * changed at any time while filling in — answers are kept, because choice answers are stored
 * by their primary-language value.
 *
 * The form's look (settings.layout) decides the arrangement: classic / minimal list every
 * question, steps shows one question per screen, split puts the cover and title beside the questions.
 */
export function FormRenderer(props: Props) {
  const languages = formLanguages(props.schema);
  // Language order: the link's ?lang=, then the form's "Opens in" choice, then the visitor's browser, then the primary language.
  const openLanguage = props.schema.settings.openLanguage && languages.includes(props.schema.settings.openLanguage) ? props.schema.settings.openLanguage : null;
  const [lang, setLang] = useState(() => (props.initialLanguage && languages.includes(props.initialLanguage) ? props.initialLanguage : openLanguage ?? languages[0]));
  const layout = formLayout(props.schema.settings);

  // Prefer the browser's language when neither the link nor the form chose one.
  useEffect(() => {
    if (props.initialLanguage && languages.includes(props.initialLanguage)) return;
    if (openLanguage) {
      if (openLanguage !== lang) setLang(openLanguage);
      window.dispatchEvent(new CustomEvent(FORM_LANG_EVENT, { detail: openLanguage }));
      return;
    }
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

  // The picker floats on the cover image when there is one above the form (split draws its cover in the side panel).
  const hasCover = !!props.schema.settings.branding?.coverUrl;
  const cover: PickerCover = layout === 'split' || !hasCover ? null : layout === 'minimal' ? 'hero' : 'card';
  const picker = languages.length > 1 ? <LanguagePicker languages={languages} value={lang} onChange={changeLanguage} cover={cover} /> : null;

  return (
    <I18nProvider locale={isLocale(lang) ? lang : 'en'}>
      <div dir={dirOf(lang)} lang={lang} className="relative text-start">
        <FormBody {...props} lang={lang} layout={layout} picker={picker} />
      </div>
    </I18nProvider>
  );
}

type PickerCover = 'card' | 'hero' | null;

// Offsets lift the picker onto the cover image: cover heights are h-36 / sm:h-44 (card) and h-44 / sm:h-64 (minimal hero) in FormFrame.
const PICKER_POS: Record<'card' | 'hero', string> = {
  card: 'absolute end-3 -top-[8.25rem] z-10 sm:-top-[10.25rem]',
  hero: 'absolute end-3 -top-[10.25rem] z-10 sm:-top-[15.25rem]',
};

function LanguagePicker({ languages, value, onChange, cover }: { languages: string[]; value: string; onChange: (l: string) => void; cover: PickerCover }) {
  const { t } = useI18n();
  return (
    // With a cover image the picker floats on the image's top corner, so a logo that overlaps
    // the image never covers it.
    <div className={cn('flex justify-end', cover ? PICKER_POS[cover] : 'px-4 pt-4 sm:px-10 sm:pt-5')}>
      <div
        className={cn('inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full p-1', cover ? 'bg-white/95 shadow-lift ring-1 ring-black/5 backdrop-blur' : 'bg-slate-100')}
        role="radiogroup"
        aria-label={t('Language')}
      >
        <Languages className="mx-1 h-3.5 w-3.5 shrink-0 text-slate-500" />
        {languages.map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={l === value}
            lang={l}
            onClick={() => onChange(l)}
            className={cn('shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition', l === value ? 'bg-brand-600 text-onaccent shadow-sm' : 'text-slate-700 hover:text-slate-900')}
          >
            {isLocale(l) ? LOCALES[l].native : l}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Split look: cover (or accent gradient), logo, title and description in a side panel; a banner on phones. */
function SplitPanel({ branding, title, description, narrow }: { branding?: FormBranding; title: string; description: string; narrow?: boolean }) {
  const b = branding ?? {};
  const center = b.logoAlign === 'center';
  return (
    <aside
      className="relative isolate overflow-hidden"
      // Raw --brand-N values (not the theme-mapped brand-* utilities) keep the panel deep in dark mode too.
      style={{ backgroundImage: 'linear-gradient(135deg, rgb(var(--brand-600)), rgb(var(--brand-900)))', color: '#fff' }}
    >
      {b.coverUrl && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={b.coverUrl} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover" />
          <div className="absolute inset-0 -z-10" style={{ background: 'linear-gradient(to top, rgba(0,0,0,.75), rgba(0,0,0,.35) 60%, rgba(0,0,0,.2))' }} />
        </>
      )}
      <div
        className={cn(
          'flex flex-col justify-end gap-6 p-6 sm:p-8',
          b.coverUrl ? 'min-h-[13rem]' : 'min-h-[9rem]',
          !narrow && 'lg:sticky lg:top-0 lg:min-h-[32rem] lg:p-10',
          center && 'items-center text-center',
        )}
      >
        {b.logoUrl && (
          <div className="mb-auto">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={b.logoUrl}
              alt=""
              className={cn('rounded-xl p-2 shadow-lift', b.logoSize === 'sm' ? 'max-h-12 max-w-[140px]' : b.logoSize === 'lg' ? 'max-h-24 max-w-[240px]' : 'max-h-16 max-w-[180px]')}
              style={{ backgroundColor: '#fff' }}
            />
          </div>
        )}
        {(!b.hideTitle || description) && (
          <div className="min-w-0">
            {!b.hideTitle && <h1 className={cn('break-words text-2xl font-bold leading-tight tracking-tight sm:text-3xl', !narrow && 'lg:text-4xl')}>{title}</h1>}
            {description && <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed" style={{ opacity: 0.88 }}>{description}</p>}
          </div>
        )}
      </div>
    </aside>
  );
}

function FormBody({ formId, title, description, schema, mode, lang, layout, picker, narrow }: Props & { lang: string; layout: FormLayout; picker: ReactNode }) {
  const { t } = useI18n();
  const view = useMemo(() => localizeForm(schema, title, description ?? '', lang), [schema, title, description, lang]);
  const [answers, setAnswers] = useState<Answers>({});
  // Only *which* fields failed is stored; messages are rebuilt in the current language.
  const [invalid, setInvalid] = useState<Set<string>>(new Set());
  const [state, setState] = useState<'idle' | 'submitting' | 'done'>('idle');
  const [serverError, setServerError] = useState<string | null>(null);
  // Field errors only the server can know (e.g. "this phone number was already used").
  const [serverFieldErrors, setServerFieldErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ScoreResult | null>(null);
  // Responses per person: null = no limit / not known yet.
  const limited = mode === 'live' && !!formId && (Number(schema.settings.perPersonLimit) || 0) > 0;
  const [blocked, setBlocked] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);

  // Steps look: which question is on screen. `moved` = the respondent navigated, so focus follows.
  const steps = layout === 'steps';
  const [step, setStep] = useState(0);
  const moved = useRef(false);
  const stepRef = useRef<HTMLDivElement>(null);
  const fields = view.schema.fields;
  const last = Math.max(fields.length - 1, 0);
  const at = Math.min(step, last);

  useEffect(() => {
    if (!limited) return;
    let gone = false;
    fetch(`/api/forms/${formId}/respondent`, { headers: ridHeader(), cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (gone || !d) return;
        saveRid(d.respondentId);
        setRemaining(d.remaining);
        if (d.allowed === false) setBlocked(true);
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [limited, formId]);

  // Steps: after Next / Back, move focus to the new question (its first control with a mouse/keyboard,
  // the question itself on touch screens so the keyboard doesn't pop up) and bring it into view.
  useEffect(() => {
    if (!steps || !moved.current) return;
    const box = stepRef.current;
    if (!box) return;
    const fine = window.matchMedia('(pointer: fine)').matches;
    const control = fine ? box.querySelector<HTMLElement>('input:not([type=hidden]):not([type=file]), textarea, select, button') : null;
    (control ?? box).focus({ preventScroll: true });
    const top = box.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight * 0.6) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [at, steps]);

  const messageFor = (id: string) => {
    if (serverFieldErrors[id]) return t(serverFieldErrors[id]);
    const field = schema.fields.find((f) => f.id === id);
    const v = answers[id];
    return field ? validateField(field, typeof v === 'string' ? v.trim() : v, t) ?? t('Please check this answer.') : null;
  };

  const setValue = (id: string, v: AnswerValue) => {
    setAnswers((a) => ({ ...a, [id]: v }));
    if (serverFieldErrors[id]) {
      setServerFieldErrors(({ [id]: _gone, ...rest }) => rest);
      setInvalid((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
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
    if (!first) return;
    if (steps) {
      moved.current = true;
      setStep(schema.fields.indexOf(first));
      return;
    }
    document.getElementById(`q-${first.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  /** Steps: check the current question, then show the next one. */
  const goNext = () => {
    const field = schema.fields.find((f) => f.id === fields[at]?.id);
    if (!field) return;
    if (document.querySelector('[data-uploading]')) {
      setServerError(t('Please wait for your files to finish uploading.'));
      return;
    }
    setServerError(null);
    const v = answers[field.id];
    if (serverFieldErrors[field.id] || validateField(field, typeof v === 'string' ? v.trim() : v)) {
      setInvalid((s) => new Set(s).add(field.id));
      return;
    }
    moved.current = true;
    setStep(at + 1);
  };

  const goBack = () => {
    setServerError(null);
    moved.current = true;
    setStep(Math.max(0, at - 1));
  };

  /** Steps: Enter moves on (Ctrl/⌘+Enter in a long answer); Enter on a chosen option moves on too. */
  const onStepKey = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.altKey || e.nativeEvent.isComposing) return;
    const el = e.target as HTMLElement;
    const mod = e.ctrlKey || e.metaKey;
    if (el.tagName === 'A') return;
    if (el.tagName === 'TEXTAREA' && !mod) return;
    if (el.tagName === 'BUTTON') {
      if (el.getAttribute('type') === 'submit') return;
      const chosen = (el.getAttribute('role') === 'radio' && el.getAttribute('aria-checked') === 'true') || el.getAttribute('aria-pressed') === 'true';
      if (!chosen && !mod) return;
    }
    e.preventDefault();
    e.currentTarget.requestSubmit();
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (steps && at < last) return goNext();
    setServerError(null);
    if (document.querySelector('[data-uploading]')) {
      setServerError(t('Please wait for your files to finish uploading.'));
      return;
    }
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
        headers: { 'Content-Type': 'application/json', ...ridHeader() },
        body: JSON.stringify({ answers, language: lang }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409 && json.error === 'limit') {
          setBlocked(true);
          setState('idle');
          return;
        }
        if (json.errors) {
          if (json.error === 'duplicate') setServerFieldErrors(json.errors);
          setInvalid(new Set(Object.keys(json.errors)));
          focusFirst(Object.keys(json.errors));
          setServerError(t('Please fix the highlighted fields.'));
        } else {
          setServerError(res.status === 403 ? t('This form is not accepting responses right now.') : t('Something went wrong. Please try again.'));
        }
        setState('idle');
        return;
      }
      saveRid(json.respondentId);
      if (typeof json.remaining === 'number') setRemaining(json.remaining);
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
    setStep(0);
    moved.current = false;
    setState('idle');
  };

  const minimal = layout === 'minimal';
  const split = layout === 'split';
  const formTitle = view.title || t('Untitled form');

  /** Wraps any screen (questions, success, "already responded") in the look's arrangement. */
  const shell = (content: ReactNode) =>
    split ? (
      <div className={cn(!narrow && 'lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]')}>
        <SplitPanel branding={schema.settings.branding} title={formTitle} description={view.description} narrow={narrow} />
        <div className="min-w-0">
          {picker}
          {content}
        </div>
      </div>
    ) : (
      <>
        {picker}
        {content}
      </>
    );

  const screenPad = cn('animate-pop-in px-6 text-center sm:px-10', minimal ? 'py-16 sm:py-20' : 'py-14', split && !narrow && 'lg:py-24');

  if (blocked && state !== 'done') {
    return shell(
      <div className={screenPad}>
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600 ring-8 ring-brand-50/50">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h2 className="text-xl font-semibold text-slate-900">{t('You’ve already responded')}</h2>
        <p className="mx-auto mt-2 max-w-md whitespace-pre-line text-slate-700">
          {schema.settings.limitMessage?.trim() || t('This form accepts a limited number of responses per person, and you’ve reached it. Thank you!')}
        </p>
      </div>,
    );
  }

  if (state === 'done') {
    const pct = result && result.maxScore > 0 ? Math.round((result.score / result.maxScore) * 100) : null;
    return shell(
      <div className={screenPad}>
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
        {remaining !== 0 && (
          <div className="mt-6">
            <Button variant="ghost" onClick={reset}>
              <RotateCcw className="h-4 w-4" /> {t('Submit another response')}
            </Button>
          </div>
        )}
      </div>,
    );
  }

  const requiredNote = schema.fields.some((f) => f.required) ? (
    <p className={cn('text-xs text-slate-500', split ? 'mb-6' : 'mt-3')}>
      <span className="text-rose-500">*</span> {t('Required')}
    </p>
  ) : undefined;

  const header = (
    <FormHeader
      branding={schema.settings.branding}
      title={<h1 className={cn('font-bold tracking-tight text-slate-900', minimal ? 'text-3xl sm:text-4xl' : 'text-2xl')}>{formTitle}</h1>}
      description={view.description ? <p className={cn('whitespace-pre-line text-slate-600', minimal ? 'mt-3 text-lg' : 'mt-2')}>{view.description}</p> : undefined}
      footer={requiredNote}
    />
  );

  const empty = <p className="rounded-xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-400">{t('This form has no questions yet.')}</p>;

  const errorLine = (err: string) => (
    <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-rose-600" role={steps ? 'alert' : undefined}>
      <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {err}
    </p>
  );

  const serverErrorBox = serverError && (
    <div className="mt-6 flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
      <AlertCircle className="h-4 w-4 shrink-0" /> {serverError}
    </div>
  );

  if (steps) {
    const field = fields[at];
    const err = field && invalid.has(field.id) ? messageFor(field.id) : null;
    const lastStep = at >= last;
    const total = fields.length;
    const progress = total > 0 && (
      <div className="mb-7">
        <div className="mb-2 flex items-center justify-between gap-3 text-xs font-medium text-slate-500">
          {/* Later screens keep the branding visible: a small logo and the title next to the counter. */}
          <span className="flex min-w-0 items-center gap-2">
            {at > 0 && schema.settings.branding?.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={schema.settings.branding.logoUrl} alt="" className="h-6 max-w-[80px] shrink-0 object-contain" />
            )}
            <span className="min-w-0 truncate">{at > 0 && !schema.settings.branding?.hideTitle ? formTitle : ''}</span>
          </span>
          <span className="shrink-0 tabular-nums" aria-live="polite">
            {t('{n} of {total}', { n: at + 1, total })}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={t('Form progress')}
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={at + 1}
          className="h-1.5 overflow-hidden rounded-full bg-slate-100"
        >
          <div className="h-full rounded-full bg-brand-600 transition-[width] duration-300" style={{ width: `${((at + 1) / total) * 100}%` }} />
        </div>
      </div>
    );
    return shell(
      <form onSubmit={onSubmit} onKeyDown={onStepKey} noValidate className="px-5 pt-6 sm:px-10 sm:py-8">
        {/* First screen: title & logo first (the logo may overlap the cover), then the progress bar. */}
        {at === 0 && header}
        {progress}
        {!field ? (
          empty
        ) : (
          <div key={field.id} ref={stepRef} id={`q-${field.id}`} tabIndex={-1} className="min-h-[9rem] scroll-mt-24 animate-fade-in outline-none">
            <FieldLabel field={field} htmlFor={`in-${field.id}`} size="lg" />
            <FieldInput field={field} value={answers[field.id]} onChange={(v) => setValue(field.id, v)} error={err ?? undefined} formId={mode === 'live' ? formId : undefined} />
            {err && errorLine(err)}
          </div>
        )}
        {serverErrorBox}
        {/* Phones: the buttons stay at the bottom of the screen while scrolling a long question. */}
        <div className="sticky bottom-0 z-10 -mx-5 mt-8 flex items-center gap-3 border-t border-slate-100 bg-white/95 px-5 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
          {at > 0 && (
            <Button type="button" variant="ghost" size="md" onClick={goBack}>
              <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t('Back')}
            </Button>
          )}
          <span className="ms-auto" />
          {field && field.type !== 'textarea' && <span className="hidden text-xs text-slate-400 sm:inline">{t('press Enter ↵')}</span>}
          <Button type="submit" variant="primary" size="md" className="min-w-[7rem]" loading={state === 'submitting'} disabled={total === 0}>
            {lastStep ? (
              view.schema.settings.submitLabel || t('Submit')
            ) : (
              <>
                {t('Next')} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
              </>
            )}
          </Button>
        </div>
      </form>,
    );
  }

  const count = invalid.size;
  return shell(
    <form onSubmit={onSubmit} noValidate className={minimal ? 'px-5 pb-10 pt-8 sm:px-8 sm:pb-14 sm:pt-12' : 'px-5 py-7 sm:px-10 sm:py-8'}>
      {split ? requiredNote : header}

      {fields.length === 0 ? (
        empty
      ) : (
        <div className={minimal ? 'divide-y divide-slate-200 border-t border-slate-200' : 'space-y-7'}>
          {fields.map((field) => {
            const err = invalid.has(field.id) ? messageFor(field.id) : null;
            return (
              <div key={field.id} id={`q-${field.id}`} className={cn('scroll-mt-24', minimal && 'py-8')}>
                <FieldLabel field={field} htmlFor={`in-${field.id}`} />
                <FieldInput field={field} value={answers[field.id]} onChange={(v) => setValue(field.id, v)} error={err ?? undefined} formId={mode === 'live' ? formId : undefined} />
                {err && errorLine(err)}
              </div>
            );
          })}
        </div>
      )}

      {serverErrorBox}

      <div
        className={cn(
          'flex flex-col-reverse items-stretch gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between sm:gap-4',
          minimal ? 'border-slate-200' : 'mt-8 border-slate-100',
        )}
      >
        <Button type="submit" variant="primary" size="md" className="w-full sm:w-auto" loading={state === 'submitting'} disabled={schema.fields.length === 0}>
          {view.schema.settings.submitLabel || t('Submit')}
        </Button>
        {count > 0 && <span className="text-xs text-rose-600">{count === 1 ? t('1 field needs attention') : t('{n} fields need attention', { n: count })}</span>}
      </div>
    </form>,
  );
}

/* Anonymous respondent id kept in local storage, sent with each request (see lib/respondent.ts). */
const RID_KEY = 'fc_rid';
function ridHeader(): Record<string, string> {
  try {
    const v = localStorage.getItem(RID_KEY);
    return v && /^[a-f0-9]{32}$/.test(v) ? { 'x-fc-rid': v } : {};
  } catch {
    return {};
  }
}
function saveRid(id: unknown) {
  try {
    if (typeof id === 'string' && /^[a-f0-9]{32}$/.test(id) && !localStorage.getItem(RID_KEY)) localStorage.setItem(RID_KEY, id);
  } catch {
    /* storage blocked: the cookie still works */
  }
}
