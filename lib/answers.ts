import type { AnswerValue, FormField, SubmissionDTO } from './types';
import { TERMS_AGREED } from './fields';
import { fileRefs } from './files';
import { formatDate } from './utils';
import { scaleBounds } from './validation';

/** Human-readable string for an answer cell. */
export function formatAnswer(field: FormField, value: AnswerValue | undefined, locale?: string): string {
  if (value === undefined || value === null || value === '') return '';
  if (field.type === 'file') return fileRefs(value).map((r) => r.name).join(', ');
  if (Array.isArray(value)) return value.join(', ');
  if (field.type === 'date' && typeof value === 'string') return formatDate(value, locale);
  if (field.type === 'rating' || field.type === 'scale') return `${value} / ${scaleBounds(field).max}`;
  if (field.type === 'terms') return value === TERMS_AGREED ? 'Agreed' : '';
  return String(value);
}

/** Comparable value for sorting. */
export function sortValue(field: FormField, value: AnswerValue | undefined): string | number {
  if (value === undefined) return '';
  if (field.type === 'file') return fileRefs(value).length;
  if (typeof value === 'number') return value;
  if (Array.isArray(value)) return value.join(', ').toLowerCase();
  return value.toLowerCase();
}

function csvCell(v: string) {
  // Spreadsheet formula injection: text starting with = + - @ (or tab / CR) would run as a formula
  // when the CSV is opened in Excel/Sheets, so it's prefixed with ' — plain numbers like -5 are kept.
  if (/^[=+\-@\t\r]/.test(v) && !/^[+-]?\d+(\.\d+)?$/.test(v)) v = `'${v}`;
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
        if (f.type === 'terms') return v === TERMS_AGREED ? 'Agreed' : '';
        if (f.type === 'file') return fileRefs(v).map((x) => x.name).join('; ');
        return Array.isArray(v) ? v.join('; ') : v === undefined ? '' : String(v);
      }),
    ]
      .map(csvCell)
      .join(','),
  );
  return [header.map(csvCell).join(','), ...lines].join('\r\n');
}

