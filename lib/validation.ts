import { format, type TFn } from './i18n';
import type { AnswerValue, Answers, FormField } from './types';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_CHARS_RE = /^\+?[\d\s\-().]+$/;
const MAX_TEXT = 10_000;

export function isValidEmail(v: string) {
  return EMAIL_RE.test(v.trim());
}

export function isValidPhone(v: string) {
  const trimmed = v.trim();
  const digits = trimmed.replace(/\D/g, '');
  return PHONE_CHARS_RE.test(trimmed) && digits.length >= 7 && digits.length <= 15;
}

export function isEmpty(v: AnswerValue | undefined | null) {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
}

export function scaleBounds(field: FormField) {
  const min = field.type === 'rating' ? 1 : field.min ?? 1;
  const max = field.max ?? (field.type === 'rating' ? 5 : 10);
  return { min, max };
}

/** Returns an error message, or null when the value is acceptable. `t` translates it (English by default, as the API uses). */
export function validateField(field: FormField, value: AnswerValue | undefined, t: TFn = format): string | null {
  if (isEmpty(value)) return field.required ? t('This field is required.') : null;
  const labels = new Set((field.options ?? []).map((o) => o.label));

  switch (field.type) {
    case 'text':
    case 'textarea':
      if (typeof value !== 'string') return t('Invalid answer.');
      if (value.length > MAX_TEXT) return t('Answer is too long.');
      return null;
    case 'email':
      return typeof value === 'string' && isValidEmail(value) ? null : t('Enter a valid email address.');
    case 'phone':
      return typeof value === 'string' && isValidPhone(value)
        ? null
        : t('Enter a valid phone number (7–15 digits).');
    case 'radio':
    case 'select':
      return typeof value === 'string' && labels.has(value) ? null : t('Choose one of the options.');
    case 'checkbox':
      return Array.isArray(value) && value.every((v) => labels.has(v))
        ? null
        : t('Choose from the listed options.');
    case 'date':
      return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value))
        ? null
        : t('Enter a valid date.');
    case 'rating':
    case 'scale': {
      const n = Number(value);
      const { min, max } = scaleBounds(field);
      return Number.isInteger(n) && n >= min && n <= max ? null : t('Choose a value from {min} to {max}.', { min, max });
    }
  }
}

/**
 * Validates a full submission. Returns per-field errors and a cleaned answer set
 * containing only known, non-empty fields.
 */
export function validateAnswers(fields: FormField[], answers: Answers, t: TFn = format) {
  const errors: Record<string, string> = {};
  const clean: Answers = {};
  for (const field of fields) {
    let value = answers[field.id];
    if (typeof value === 'string') value = value.trim();
    const error = validateField(field, value, t);
    if (error) errors[field.id] = error;
    else if (!isEmpty(value)) clean[field.id] = isNumericField(field) ? Number(value) : value;
  }
  return { errors, clean, valid: Object.keys(errors).length === 0 };
}

function isNumericField(f: FormField) {
  return f.type === 'rating' || f.type === 'scale';
}
