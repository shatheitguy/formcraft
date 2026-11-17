import type { FieldType, FormField, FormSettings } from './types';
import { uid } from './utils';

export interface FieldTypeMeta {
  type: FieldType;
  label: string;
  description: string;
  group: 'Text' | 'Contact' | 'Choice' | 'Other';
}

export const FIELD_TYPES: FieldTypeMeta[] = [
  { type: 'text', label: 'Short text', description: 'Single-line answer', group: 'Text' },
  { type: 'textarea', label: 'Paragraph', description: 'Multi-line answer', group: 'Text' },
  { type: 'email', label: 'Email', description: 'Validated email address', group: 'Contact' },
  { type: 'phone', label: 'Phone', description: 'Validated phone number', group: 'Contact' },
  { type: 'radio', label: 'Multiple choice', description: 'Pick one option', group: 'Choice' },
  { type: 'checkbox', label: 'Checkboxes', description: 'Pick any options', group: 'Choice' },
  { type: 'select', label: 'Dropdown', description: 'Pick one from a menu', group: 'Choice' },
  { type: 'date', label: 'Date', description: 'Calendar date picker', group: 'Other' },
  { type: 'rating', label: 'Rating', description: 'Star rating (1–5 / 1–10)', group: 'Other' },
  { type: 'scale', label: 'Linear scale', description: 'Numbered scale, e.g. NPS', group: 'Other' },
  { type: 'terms', label: 'Terms & conditions', description: 'Agreement checkbox with terms text', group: 'Other' },
  { type: 'file', label: 'File upload', description: 'Let people attach files', group: 'Other' },
];

export const FIELD_META: Record<FieldType, FieldTypeMeta> = Object.fromEntries(
  FIELD_TYPES.map((f) => [f.type, f]),
) as Record<FieldType, FieldTypeMeta>;

export const CHOICE_TYPES: FieldType[] = ['radio', 'checkbox', 'select'];
export const NUMERIC_TYPES: FieldType[] = ['rating', 'scale'];
export const TEXT_INPUT_TYPES: FieldType[] = ['text', 'textarea', 'email', 'phone'];

export const isChoice = (t: FieldType) => CHOICE_TYPES.includes(t);
export const isNumeric = (t: FieldType) => NUMERIC_TYPES.includes(t);

export function opt(label: string, extra: { correct?: boolean; points?: number } = {}) {
  return { id: uid('o_'), label, ...extra };
}

/** Answer value stored when a respondent ticks a terms & conditions checkbox. */
export const TERMS_AGREED = 'Agreed';
export const DEFAULT_AGREE_LABEL = 'I have read and agree to the terms and conditions';
export const DEFAULT_TERMS_TEXT =
  'By submitting this form you confirm that the information you provide is accurate and complete. ' +
  'We use your details only to process this request and will not share them with third parties without your consent, unless required by law.';

/** Only http(s) links are allowed for the "Read full terms" link. */
export function safeTermsUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

export function createField(type: FieldType): FormField {
  const base: FormField = { id: uid('f_'), type, label: FIELD_META[type].label, required: false };
  switch (type) {
    case 'text':
      return { ...base, label: 'Untitled question', placeholder: 'Your answer' };
    case 'textarea':
      return { ...base, label: 'Tell us more', placeholder: 'Type your answer…' };
    case 'email':
      return { ...base, label: 'Email address', placeholder: 'name@example.com' };
    case 'phone':
      return { ...base, label: 'Phone number', placeholder: '+1 555 123 4567' };
    case 'radio':
    case 'checkbox':
    case 'select':
      return {
        ...base,
        label: type === 'checkbox' ? 'Select all that apply' : 'Choose an option',
        options: [opt('Option 1'), opt('Option 2'), opt('Option 3')],
      };
    case 'date':
      return { ...base, label: 'Pick a date' };
    case 'rating':
      return { ...base, label: 'How would you rate it?', min: 1, max: 5 };
    case 'scale':
      return {
        ...base,
        label: 'How likely are you to recommend us?',
        min: 1,
        max: 10,
        minLabel: 'Not likely',
        maxLabel: 'Very likely',
      };
    case 'terms':
      return {
        ...base,
        label: 'Terms & conditions',
        required: true,
        terms: DEFAULT_TERMS_TEXT,
        agreeLabel: DEFAULT_AGREE_LABEL,
      };
    case 'file':
      return { ...base, label: 'Upload a file', fileKinds: ['image', 'pdf'], maxFiles: 1, maxFileMb: 10 };
  }
}

export function cloneField(field: FormField): FormField {
  return {
    ...field,
    id: uid('f_'),
    label: field.label + ' (copy)',
    options: field.options?.map((o) => ({ ...o, id: uid('o_') })),
  };
}

export const DEFAULT_SETTINGS: FormSettings = {
  submitLabel: 'Submit',
  successMessage: 'Thanks! Your response has been recorded.',
  quiz: false,
  showScore: true,
};
