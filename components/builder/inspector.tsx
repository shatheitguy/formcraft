'use client';

import { AlertTriangle, AlignCenter, AlignLeft, ArrowDown, ArrowUp, Check, Heading, Languages, Monitor, Moon, PanelLeft, PanelTop, Palette, Plus, Settings2, Sun, Trash2, X } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { FIELD_ICONS } from '@/components/icons';
import { useT } from '@/components/i18n';
import { ImageUpload } from '@/components/image-upload';
import { Switch } from '@/components/ui';
import { SUGGESTED_CATEGORIES } from '@/lib/categories';
import { FIELD_META, isChoice, opt } from '@/lib/fields';
import { LOCALE_CODES, LOCALES } from '@/lib/i18n';
import { ACCENTS, ACCENT_KEYS } from '@/lib/theme';
import type { FieldOption, FieldType, FormBranding, FormField, FormSettings } from '@/lib/types';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/* Field inspector                                                     */
/* ------------------------------------------------------------------ */

const ACCENT_NAMES: Record<string, string> = {
  indigo: 'Indigo',
  violet: 'Violet',
  blue: 'Blue',
  teal: 'Teal',
  emerald: 'Emerald',
  rose: 'Rose',
  wine: 'Wine red',
  yellow: 'Yellow',
  orange: 'Orange',
  slate: 'Slate',
};

const COMPATIBLE: FieldType[][] = [
  ['text', 'textarea', 'email', 'phone'],
  ['radio', 'checkbox', 'select'],
  ['rating', 'scale'],
  ['date'],
];

export function FieldInspector({
  field,
  quiz,
  onChange,
  onClose,
  onDelete,
}: {
  field: FormField;
  quiz: boolean;
  onChange: (patch: Partial<FormField>) => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const Icon = FIELD_ICONS[field.type];
  const siblings = COMPATIBLE.find((g) => g.includes(field.type)) ?? [field.type];
  const hasPlaceholder = ['text', 'textarea', 'email', 'phone', 'select'].includes(field.type);

  const changeType = (type: FieldType) => {
    const patch: Partial<FormField> = { type };
    if (type === 'rating') Object.assign(patch, { min: 1, max: field.max && field.max <= 5 ? 5 : 10 });
    if (type === 'scale') Object.assign(patch, { min: field.min ?? 1, max: field.max ?? 10 });
    onChange(patch);
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-900">{t(FIELD_META[field.type].label)}</div>
          <div className="text-[11px] text-slate-400">{t('Field properties')}</div>
        </div>
        <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title={t('Back to form settings')} aria-label={t('Back to form settings')}>
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-5 p-4">
        <Section label={t('Question')}>
          <textarea
            className="input min-h-[60px] resize-none"
            rows={2}
            value={field.label}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder={t('Type your question')}
            autoFocus
          />
        </Section>

        <Section label={t('Help text')} hint={t('Optional')}>
          <input className="input" value={field.helpText ?? ''} onChange={(e) => onChange({ helpText: e.target.value })} placeholder={t('Add a short description')} />
        </Section>

        {hasPlaceholder && (
          <Section label={t('Placeholder')}>
            <input className="input" value={field.placeholder ?? ''} onChange={(e) => onChange({ placeholder: e.target.value })} />
          </Section>
        )}

        {siblings.length > 1 && (
          <Section label={t('Field type')}>
            <div className="grid grid-cols-2 gap-1.5">
              {siblings.map((ft) => {
                const TIcon = FIELD_ICONS[ft];
                return (
                  <button
                    key={ft}
                    onClick={() => changeType(ft)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition',
                      ft === field.type ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                    )}
                  >
                    <TIcon className="h-3.5 w-3.5" /> {t(FIELD_META[ft].label)}
                  </button>
                );
              })}
            </div>
          </Section>
        )}

        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5 ring-1 ring-inset ring-slate-100">
          <div>
            <div className="text-sm font-medium text-slate-800">{t('Required')}</div>
            <div className="text-xs text-slate-500">{t('Respondents must answer')}</div>
          </div>
          <Switch checked={field.required} onChange={(required) => onChange({ required })} label={t('Required')} />
        </div>

        {isChoice(field.type) && <OptionsEditor field={field} quiz={quiz} onChange={(options) => onChange({ options })} />}

        {field.type === 'rating' && (
          <Section label={t('Number of stars')}>
            <div className="grid grid-cols-2 gap-1.5">
              {[5, 10].map((n) => (
                <button
                  key={n}
                  onClick={() => onChange({ min: 1, max: n })}
                  className={cn('rounded-lg border py-1.5 text-sm font-medium', field.max === n ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}
                >
                  1 – {n}
                </button>
              ))}
            </div>
          </Section>
        )}

        {field.type === 'scale' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Section label={t('From')}>
                <select className="input" value={field.min ?? 1} onChange={(e) => onChange({ min: Number(e.target.value) })}>
                  {[0, 1].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </Section>
              <Section label={t('To')}>
                <select className="input" value={field.max ?? 10} onChange={(e) => onChange({ max: Number(e.target.value) })}>
                  {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </Section>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Section label={t('Low label')}>
                <input className="input" value={field.minLabel ?? ''} onChange={(e) => onChange({ minLabel: e.target.value })} placeholder={t('e.g. Poor')} />
              </Section>
              <Section label={t('High label')}>
                <input className="input" value={field.maxLabel ?? ''} onChange={(e) => onChange({ maxLabel: e.target.value })} placeholder={t('e.g. Great')} />
              </Section>
            </div>
          </>
        )}

        {(field.type === 'email' || field.type === 'phone') && (
          <p className="flex gap-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800 ring-1 ring-inset ring-sky-100">
            <Check className="h-4 w-4 shrink-0" />
            {field.type === 'email' ? t('Answers are validated as email addresses.') : t('Answers are validated as phone numbers (7–15 digits, +, spaces, dashes, and parentheses allowed).')}
          </p>
        )}

        <button onClick={onDelete} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-rose-200 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50">
          <Trash2 className="h-4 w-4" /> {t('Delete field')}
        </button>
      </div>
    </div>
  );
}

function OptionsEditor({ field, quiz, onChange }: { field: FormField; quiz: boolean; onChange: (o: FieldOption[]) => void }) {
  const t = useT();
  const options = field.options ?? [];
  const listRef = useRef<HTMLDivElement>(null);
  const counts = new Map<string, number>();
  options.forEach((o) => counts.set(o.label.trim(), (counts.get(o.label.trim()) ?? 0) + 1));
  const hasDupes = [...counts.values()].some((n) => n > 1);
  const hasEmpty = options.some((o) => !o.label.trim());
  const single = field.type !== 'checkbox';

  const update = (id: string, patch: Partial<FieldOption>) => onChange(options.map((o) => (o.id === id ? { ...o, ...patch } : o)));

  const toggleCorrect = (o: FieldOption) => {
    const correct = !o.correct;
    onChange(
      options.map((x) => {
        if (x.id === o.id) return { ...x, correct, points: correct ? Math.max(x.points ?? 0, 1) : 0 };
        // Radio/select questions have exactly one correct answer.
        if (single && correct && x.correct) return { ...x, correct: false, points: 0 };
        return x;
      }),
    );
  };

  const addAfter = (index: number) => {
    const next = [...options];
    next.splice(index + 1, 0, opt(`Option ${options.length + 1}`));
    onChange(next);
    requestAnimationFrame(() => {
      const inputs = listRef.current?.querySelectorAll<HTMLInputElement>('input[data-option]');
      inputs?.[index + 1]?.select();
    });
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= options.length) return;
    const next = [...options];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <Section label={t('Options')} hint={quiz ? t('Mark correct answers & points') : options.length === 1 ? t('1 option') : t('{n} options', { n: options.length })}>
      <div ref={listRef} className="space-y-1.5">
        {options.map((o, i) => {
          const dupe = (counts.get(o.label.trim()) ?? 0) > 1;
          return (
            <div key={o.id} className="group flex items-center gap-1.5">
              {quiz ? (
                <button
                  onClick={() => toggleCorrect(o)}
                  title={o.correct ? t('Correct answer') : t('Mark as correct')}
                  aria-label={o.correct ? t('Correct answer') : t('Mark as correct')}
                  aria-pressed={!!o.correct}
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition',
                    o.correct ? 'border-emerald-500 bg-emerald-500 text-onaccent' : 'border-slate-300 text-transparent hover:border-emerald-400 hover:text-emerald-400',
                  )}
                >
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </button>
              ) : (
                <span className={cn('h-3.5 w-3.5 shrink-0 border border-slate-300', field.type === 'checkbox' ? 'rounded' : 'rounded-full')} />
              )}
              <input
                data-option
                className={cn('input h-8 py-1', (dupe || !o.label.trim()) && 'input-error')}
                value={o.label}
                aria-label={t('Option')}
                onChange={(e) => update(o.id, { label: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addAfter(i);
                  }
                }}
              />
              {quiz && (
                <input
                  type="number"
                  title={t('Points')}
                  aria-label={t('Points')}
                  className="input h-8 w-14 px-1.5 py-1 text-center tabular-nums"
                  value={o.points ?? 0}
                  onChange={(e) => update(o.id, { points: Number(e.target.value) || 0 })}
                />
              )}
              <div className="flex opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100">
                <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30" title={t('Move up')} aria-label={t('Move up')}>
                  <ArrowUp className="h-3 w-3" />
                </button>
                <button onClick={() => move(i, 1)} disabled={i === options.length - 1} className="rounded p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30" title={t('Move down')} aria-label={t('Move down')}>
                  <ArrowDown className="h-3 w-3" />
                </button>
                <button onClick={() => onChange(options.filter((x) => x.id !== o.id))} disabled={options.length <= 1} className="rounded p-1 text-slate-400 hover:text-rose-600 disabled:opacity-30" title={t('Remove')} aria-label={t('Remove')}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {quiz && <div className="mt-1 flex justify-end pe-[68px] text-[10px] font-medium uppercase tracking-wide text-slate-400">{t('pts')}</div>}
      <button onClick={() => addAfter(options.length - 1)} className="mt-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50">
        <Plus className="h-3.5 w-3.5" /> {t('Add option')}
      </button>
      {(hasDupes || hasEmpty) && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5" /> {hasDupes ? t('Option labels must be unique.') : t('Options cannot be empty.')}
        </p>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Form settings                                                       */
/* ------------------------------------------------------------------ */

export interface FormMeta {
  title: string;
  description: string;
  category: string;
  tags: string[];
}

export function FormSettingsPanel({
  meta,
  settings,
  onMeta,
  onSettings,
  onBranding,
}: {
  meta: FormMeta;
  settings: FormSettings;
  onMeta: (patch: Partial<FormMeta>) => void;
  onSettings: (patch: Partial<FormSettings>) => void;
  onBranding: (patch: Partial<FormBranding>) => void;
}) {
  const t = useT();
  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
          <Settings2 className="h-4 w-4" />
        </span>
        <div>
          <div className="text-sm font-semibold text-slate-900">{t('Form settings')}</div>
          <div className="text-[11px] text-slate-400">{t('Select a field to edit its properties')}</div>
        </div>
      </div>
      <div className="space-y-5 p-4">
        <Section label={t('Title')}>
          <input className="input" value={meta.title} onChange={(e) => onMeta({ title: e.target.value })} />
        </Section>
        <Section label={t('Description')}>
          <textarea className="input resize-none" rows={3} value={meta.description} onChange={(e) => onMeta({ description: e.target.value })} placeholder={t('Shown below the title')} />
        </Section>

        <HeaderSection branding={settings.branding ?? {}} onChange={onBranding} />

        <div className="h-px bg-slate-100" />
        <Section label={t('Category')}>
          <input className="input" list="fc-categories" value={meta.category} onChange={(e) => onMeta({ category: e.target.value })} />
          <datalist id="fc-categories">
            {SUGGESTED_CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Section>
        <Section label={t('Tags')} hint={t('Enter or comma to add')}>
          <TagInput tags={meta.tags} onChange={(tags) => onMeta({ tags })} />
        </Section>

        <div className="h-px bg-slate-100" />

        <Section label={t('Submit button text')}>
          <input className="input" value={settings.submitLabel} onChange={(e) => onSettings({ submitLabel: e.target.value })} />
        </Section>
        <Section label={t('Confirmation message')}>
          <textarea className="input resize-none" rows={2} value={settings.successMessage} onChange={(e) => onSettings({ successMessage: e.target.value })} />
        </Section>

        <BrandingSection branding={settings.branding ?? {}} onChange={onBranding} />

        <div className="h-px bg-slate-100" />

        <LanguagesSection settings={settings} onSettings={onSettings} />

        <PillRow
          label={t('Form theme')}
          value={settings.theme ?? 'auto'}
          onChange={(theme) => onSettings({ theme })}
          options={[
            { value: 'auto', label: t('Auto'), icon: <Monitor className="h-3.5 w-3.5" /> },
            { value: 'light', label: t('Light only'), icon: <Sun className="h-3.5 w-3.5" /> },
            { value: 'dark', label: t('Dark only'), icon: <Moon className="h-3.5 w-3.5" /> },
          ]}
        />
        <p className="-mt-2 text-xs text-slate-500">{t('Auto follows each respondent’s device setting.')}</p>

        <div className="h-px bg-slate-100" />

        <div className="space-y-2 rounded-xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-100">
          <ToggleRow label={t('Quiz mode')} description={t('Track correct answers & points on choice fields')} checked={settings.quiz} onChange={(quiz) => onSettings({ quiz })} />
          {settings.quiz && (
            <ToggleRow label={t('Show score after submit')} description={t('Respondents see their result')} checked={settings.showScore} onChange={(showScore) => onSettings({ showScore })} />
          )}
        </div>
      </div>
    </div>
  );
}

/** Which languages the form is offered in; the first is the language it's written in. */
function LanguagesSection({ settings, onSettings }: { settings: FormSettings; onSettings: (patch: Partial<FormSettings>) => void }) {
  const t = useT();
  const langs = settings.languages?.length ? settings.languages : ['en'];
  const primary = langs[0];
  const setPrimary = (l: string) => onSettings({ languages: [l, ...langs.filter((x) => x !== l)] });
  const toggle = (l: string) => onSettings({ languages: langs.includes(l) ? langs.filter((x) => x !== l) : [...langs, l] });
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Languages className="h-4 w-4 text-brand-600" /> {t('Languages')}
      </div>
      <div>
        <div className="mb-1.5 text-xs text-slate-500">{t('Form is written in')}</div>
        <select className="input" value={primary} onChange={(e) => setPrimary(e.target.value)}>
          {LOCALE_CODES.map((l) => (
            <option key={l} value={l}>
              {LOCALES[l].native}
            </option>
          ))}
        </select>
      </div>
      <div>
        <div className="mb-1.5 text-xs text-slate-500">{t('Also available in')}</div>
        <div className="flex flex-wrap gap-1.5">
          {LOCALE_CODES.filter((l) => l !== primary).map((l) => {
            const on = langs.includes(l);
            return (
              <button
                key={l}
                type="button"
                onClick={() => toggle(l)}
                aria-pressed={on}
                className={cn('inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition', on ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:border-slate-300')}
              >
                {on && <Check className="h-3.5 w-3.5" />}
                <span lang={l}>{LOCALES[l].native}</span>
              </button>
            );
          })}
        </div>
      </div>
      {langs.length > 1 && <p className="text-xs text-slate-500">{t('Respondents can switch language on the form. Translate the texts in the Translate tab.')}</p>}
    </div>
  );
}

/** Logo + title layout: show/hide title, logo upload, size, placement and alignment. */
function HeaderSection({ branding, onChange }: { branding: FormBranding; onChange: (patch: Partial<FormBranding>) => void }) {
  const t = useT();
  const hasLogo = !!branding.logoUrl;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Heading className="h-4 w-4 text-brand-600" /> {t('Logo & title')}
      </div>
      <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5 ring-1 ring-inset ring-slate-100">
        <div>
          <div className="text-sm font-medium text-slate-800">{t('Show form title')}</div>
          <div className="text-xs text-slate-500">{t('Turn off if your logo already shows the name')}</div>
        </div>
        <Switch checked={!branding.hideTitle} onChange={(v) => onChange({ hideTitle: !v })} label={t('Show form title')} />
      </div>
      <ImageUpload label={t('Form logo')} value={branding.logoUrl} onChange={(logoUrl) => onChange({ logoUrl })} />
      {hasLogo && (
        <>
          <PillRow
            label={t('Logo size')}
            value={branding.logoSize ?? 'md'}
            onChange={(logoSize) => onChange({ logoSize })}
            options={[
              { value: 'sm', label: t('Small') },
              { value: 'md', label: t('Medium') },
              { value: 'lg', label: t('Large') },
            ]}
          />
          <PillRow
            label={t('Logo placement')}
            value={branding.logoPlacement ?? 'above'}
            onChange={(logoPlacement) => onChange({ logoPlacement })}
            options={[
              { value: 'above', label: t('Above title'), icon: <PanelTop className="h-3.5 w-3.5" /> },
              { value: 'inline', label: t('Beside title'), icon: <PanelLeft className="h-3.5 w-3.5 rtl:-scale-x-100" /> },
            ]}
          />
        </>
      )}
      <PillRow
        label={t('Alignment')}
        value={branding.logoAlign ?? 'left'}
        onChange={(logoAlign) => onChange({ logoAlign })}
        options={[
          { value: 'left', label: t('Left'), icon: <AlignLeft className="h-3.5 w-3.5 rtl:-scale-x-100" /> },
          { value: 'center', label: t('Center'), icon: <AlignCenter className="h-3.5 w-3.5" /> },
        ]}
      />
    </div>
  );
}

function PillRow<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string; icon?: React.ReactNode }[] }) {
  return (
    <div>
      <div className="mb-1.5 text-xs text-slate-500">{label}</div>
      <div className="grid gap-1 rounded-lg bg-slate-100 p-0.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cn('flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition', value === o.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800')}
          >
            {o.icon}
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function BrandingSection({ branding, onChange }: { branding: FormBranding; onChange: (patch: Partial<FormBranding>) => void }) {
  const t = useT();
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Palette className="h-4 w-4 text-brand-600" /> {t('Branding')}
      </div>
      <ImageUpload label={t('Cover image')} variant="cover" value={branding.coverUrl} onChange={(coverUrl) => onChange({ coverUrl })} />
      <div>
        <div className="label">{t('Form color')}</div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => onChange({ accent: undefined })}
            title={t('Workspace default')}
            className={cn(
              'flex h-7 items-center rounded-md border px-2 text-[11px] font-medium transition',
              !branding.accent ? 'border-slate-900 text-slate-900' : 'border-slate-200 text-slate-500 hover:border-slate-300',
            )}
          >
            {t('Default')}
          </button>
          {ACCENT_KEYS.map((k) => (
            <button
              key={k}
              onClick={() => onChange({ accent: k })}
              title={t(ACCENT_NAMES[k] ?? k)}
              aria-label={t(ACCENT_NAMES[k] ?? k)}
              aria-pressed={branding.accent === k}
              className={cn('flex h-7 w-7 items-center justify-center rounded-md text-onaccent ring-offset-2 transition', branding.accent === k && 'ring-2 ring-slate-900')}
              style={{ background: `linear-gradient(135deg, ${ACCENTS[k][5]}, ${ACCENTS[k][7]})` }}
            >
              {branding.accent === k && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="text-sm font-medium text-slate-800">{label}</div>
        <div className="text-xs text-slate-500">{description}</div>
      </div>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

function TagInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const t = useT();
  const [value, setValue] = useState('');
  const commit = () => {
    const parts = value
      .split(',')
      .map((s) => s.trim().toLowerCase().replace(/\s+/g, '-'))
      .filter(Boolean);
    if (parts.length) onChange([...new Set([...tags, ...parts])].slice(0, 12));
    setValue('');
  };
  return (
    <div className="input flex min-h-[40px] flex-wrap items-center gap-1 !py-1.5">
      {tags.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-0.5 rounded-md bg-slate-100 py-0.5 pe-0.5 ps-1.5 text-xs font-medium text-slate-700">
          #{tag}
          <button onClick={() => onChange(tags.filter((x) => x !== tag))} className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700" aria-label={t('Remove {tag}', { tag })}>
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        className="min-w-[80px] flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
        value={value}
        placeholder={tags.length ? '' : t('e.g. onboarding')}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Backspace' && !value && tags.length) {
            onChange(tags.slice(0, -1));
          }
        }}
      />
    </div>
  );
}

function Section({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="label !mb-0">{label}</span>
        {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
