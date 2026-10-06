import { isLocale } from './i18n';
import type { FormField, FormSchema, FormTranslation } from './types';

/** Languages a form is available in; the first is the primary language. */
export function formLanguages(schema: FormSchema): string[] {
  const langs = (schema.settings.languages ?? []).filter(isLocale);
  return langs.length ? [...new Set(langs)] : ['en'];
}

export const primaryLanguage = (schema: FormSchema) => formLanguages(schema)[0];

const pick = (tr: string | undefined, fallback: string | undefined) => (tr && tr.trim() ? tr : fallback);

/**
 * Returns the form's text in `lang`, falling back to the primary language for anything that
 * isn't translated. Option `label`s stay in the primary language (they are the stored answer
 * values); the translated text goes into `display`.
 */
export function localizeForm(schema: FormSchema, title: string, description: string, lang: string) {
  const primary = primaryLanguage(schema);
  const tr: FormTranslation | undefined = lang === primary ? undefined : schema.translations?.[lang];
  if (!tr) return { title, description, schema };

  const fields: FormField[] = schema.fields.map((f) => {
    const ft = tr.fields?.[f.id];
    if (!ft) return f;
    return {
      ...f,
      label: pick(ft.label, f.label)!,
      placeholder: pick(ft.placeholder, f.placeholder),
      helpText: pick(ft.helpText, f.helpText),
      minLabel: pick(ft.minLabel, f.minLabel),
      maxLabel: pick(ft.maxLabel, f.maxLabel),
      options: f.options?.map((o) => ({ ...o, display: pick(ft.options?.[o.id], undefined) })),
    };
  });

  return {
    title: pick(tr.title, title)!,
    description: pick(tr.description, description) ?? '',
    schema: {
      ...schema,
      fields,
      settings: { ...schema.settings, submitLabel: pick(tr.submitLabel, schema.settings.submitLabel)!, successMessage: pick(tr.successMessage, schema.settings.successMessage)! },
    },
  };
}

/** Every translatable string of a form, for the translation editor and progress counts. */
export function translatableKeys(schema: FormSchema) {
  const keys: { path: string; source: string; multiline?: boolean }[] = [
    { path: 'title', source: '' },
    { path: 'description', source: '', multiline: true },
  ];
  for (const f of schema.fields) {
    keys.push({ path: `fields.${f.id}.label`, source: f.label });
    if (f.helpText) keys.push({ path: `fields.${f.id}.helpText`, source: f.helpText });
    if (f.placeholder) keys.push({ path: `fields.${f.id}.placeholder`, source: f.placeholder });
    if (f.minLabel) keys.push({ path: `fields.${f.id}.minLabel`, source: f.minLabel });
    if (f.maxLabel) keys.push({ path: `fields.${f.id}.maxLabel`, source: f.maxLabel });
    for (const o of f.options ?? []) keys.push({ path: `fields.${f.id}.options.${o.id}`, source: o.label });
  }
  keys.push({ path: 'submitLabel', source: schema.settings.submitLabel }, { path: 'successMessage', source: schema.settings.successMessage, multiline: true });
  return keys;
}

export function getTranslation(tr: FormTranslation | undefined, path: string): string {
  if (!tr) return '';
  const [head, id, prop, optId] = path.split('.');
  if (head !== 'fields') return ((tr as Record<string, unknown>)[head] as string) ?? '';
  const ft = tr.fields?.[id];
  if (!ft) return '';
  return prop === 'options' ? ft.options?.[optId] ?? '' : ((ft as Record<string, unknown>)[prop] as string) ?? '';
}

export function setTranslation(tr: FormTranslation | undefined, path: string, value: string): FormTranslation {
  const next: FormTranslation = { ...(tr ?? {}), fields: { ...(tr?.fields ?? {}) } };
  const [head, id, prop, optId] = path.split('.');
  if (head !== 'fields') {
    (next as Record<string, unknown>)[head] = value;
    return next;
  }
  const ft = { ...(next.fields![id] ?? {}) };
  if (prop === 'options') ft.options = { ...(ft.options ?? {}), [optId]: value };
  else (ft as Record<string, unknown>)[prop] = value;
  next.fields![id] = ft;
  return next;
}
