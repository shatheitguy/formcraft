import type { AnswerValue, FormField, SubmissionDTO } from './types';
import { formatDate } from './utils';
import { scaleBounds } from './validation';

/** Human-readable string for an answer cell. */
export function formatAnswer(field: FormField, value: AnswerValue | undefined, locale?: string): string {
  if (value === undefined || value === null || value === '') return '';
  if (Array.isArray(value)) return value.join(', ');
  if (field.type === 'date' && typeof value === 'string') return formatDate(value, locale);
  if (field.type === 'rating' || field.type === 'scale') return `${value} / ${scaleBounds(field).max}`;
  return String(value);
}

/** Comparable value for sorting. */
export function sortValue(field: FormField, value: AnswerValue | undefined): string | number {
  if (value === undefined) return '';
  if (typeof value === 'number') return value;
  if (Array.isArray(value)) return value.join(', ').toLowerCase();
  return value.toLowerCase();
}

function csvCell(v: string) {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toCSV(fields: FormField[], rows: SubmissionDTO[], quiz: boolean, withLanguage = false) {
  const header = ['Submission ID', 'Submitted at', ...(withLanguage ? ['Language'] : []), ...(quiz ? ['Score', 'Max score'] : []), ...fields.map((f) => f.label)];
  const lines = rows.map((r) =>
    [
      r.id,
      new Date(r.createdAt).toISOString(),
      ...(withLanguage ? [r.language ?? ''] : []),
      ...(quiz ? [String(r.score ?? ''), String(r.maxScore ?? '')] : []),
      ...fields.map((f) => {
        const v = r.data[f.id];
        return Array.isArray(v) ? v.join('; ') : v === undefined ? '' : String(v);
      }),
    ]
      .map(csvCell)
      .join(','),
  );
  return [header.map(csvCell).join(','), ...lines].join('\r\n');
}

