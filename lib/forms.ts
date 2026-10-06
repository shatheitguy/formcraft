import type { Form, Submission } from '@prisma/client';
import { DEFAULT_SETTINGS } from './fields';
import { isAccent } from './theme';
import type { Answers, FormBranding, FormDTO, FormSchema, FormStatus, SubmissionDTO } from './types';
import { safeImageUrl } from './uploads';
import { safeJson } from './utils';

export function parseSchema(raw: string): FormSchema {
  const parsed = safeJson<Partial<FormSchema>>(raw, {});
  return {
    fields: Array.isArray(parsed.fields) ? parsed.fields : [],
    settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
    translations: parsed.translations && typeof parsed.translations === 'object' ? parsed.translations : undefined,
  };
}

export function toFormDTO(form: Form): FormDTO {
  return {
    id: form.id,
    title: form.title,
    description: form.description,
    category: form.category,
    tags: safeJson<string[]>(form.tags, []),
    status: (form.status === 'ACTIVE' ? 'ACTIVE' : 'DRAFT') as FormStatus,
    schema: parseSchema(form.schema),
    slug: form.slug,
    port: form.port,
    customDomain: form.customDomain,
    createdAt: form.createdAt.toISOString(),
    updatedAt: form.updatedAt.toISOString(),
  };
}

export function toSubmissionDTO(s: Submission): SubmissionDTO {
  return {
    id: s.id,
    data: safeJson<Answers>(s.data, {}),
    score: s.score,
    maxScore: s.maxScore,
    language: s.language,
    createdAt: s.createdAt.toISOString(),
  };
}

export function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  for (const t of input) {
    if (typeof t !== 'string') continue;
    const tag = t.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 32);
    if (tag) seen.add(tag);
  }
  return [...seen].slice(0, 12);
}

/** Strips anything unexpected from per-form branding before it is stored. */
export function sanitizeBranding(b: unknown): FormBranding | undefined {
  if (!b || typeof b !== 'object') return undefined;
  const v = b as Record<string, unknown>;
  const out: FormBranding = {
    logoUrl: safeImageUrl(v.logoUrl) || undefined,
    coverUrl: safeImageUrl(v.coverUrl) || undefined,
    logoAlign: v.logoAlign === 'center' ? 'center' : 'left',
    logoPlacement: v.logoPlacement === 'inline' ? 'inline' : 'above',
    logoSize: v.logoSize === 'sm' || v.logoSize === 'lg' ? v.logoSize : 'md',
    hideTitle: v.hideTitle === true,
    accent: isAccent(v.accent) ? v.accent : undefined,
  };
  const customized = out.logoUrl || out.coverUrl || out.accent || out.hideTitle || out.logoAlign === 'center';
  return customized ? out : undefined;
}

/** Minimal structural check for schemas coming from the client. */
export function isValidSchema(s: unknown): s is FormSchema {
  if (!s || typeof s !== 'object') return false;
  const schema = s as FormSchema;
  return (
    Array.isArray(schema.fields) &&
    schema.fields.every((f) => f && typeof f.id === 'string' && typeof f.type === 'string' && typeof f.label === 'string') &&
    typeof schema.settings === 'object'
  );
}
