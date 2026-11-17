// "No duplicates" questions: one registration per email / phone number (or any short-text answer).
// Values are compared loosely so trivial differences don't slip through:
//   email → trimmed, lower-case;  phone → digits only, and the last 9 digits match (so "+971 50 123 4567"
//   and "050 123 4567" count as the same number);  text → trimmed, lower-case, single spaces.
import { prisma } from './db';
import type { Answers, FormField } from './types';
import { safeJson } from './utils';

export function normalizeUnique(field: FormField, value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v) return null;
  if (field.type === 'email') return v.toLowerCase();
  if (field.type === 'phone') {
    const d = v.replace(/\D/g, '').replace(/^00/, '');
    return d.length ? d : null;
  }
  return v.toLowerCase().replace(/\s+/g, ' ');
}

function same(field: FormField, a: string, b: string) {
  if (a === b) return true;
  if (field.type === 'phone' && a.length >= 9 && b.length >= 9) return a.slice(-9) === b.slice(-9);
  return false;
}

/** Field id → error message for every "No duplicates" answer that was already submitted to this form. */
export async function duplicateAnswers(formId: string, fields: FormField[], answers: Answers): Promise<Record<string, string>> {
  const checks = fields
    .filter((f) => f.unique && (f.type === 'email' || f.type === 'phone' || f.type === 'text'))
    .map((f) => ({ f, v: normalizeUnique(f, answers[f.id]) }))
    .filter((c): c is { f: FormField; v: string } => !!c.v);
  if (!checks.length) return {};

  const errors: Record<string, string> = {};
  // Streams through the form's responses in pages so big forms don't load everything at once.
  let cursor: string | undefined;
  for (;;) {
    const page = await prisma.submission.findMany({
      where: { formId },
      select: { id: true, data: true },
      orderBy: { id: 'asc' },
      take: 1000,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    for (const row of page) {
      const data = safeJson<Answers>(row.data, {});
      for (const { f, v } of checks) {
        if (errors[f.id]) continue;
        const prev = normalizeUnique(f, data[f.id]);
        if (prev && same(f, prev, v)) {
          errors[f.id] =
            f.type === 'email'
              ? 'This email address has already been used for this form.'
              : f.type === 'phone'
                ? 'This phone number has already been used for this form.'
                : 'This answer has already been used for this form.';
        }
      }
    }
    if (page.length < 1000 || Object.keys(errors).length === checks.length) break;
    cursor = page[page.length - 1].id;
  }
  return errors;
}
