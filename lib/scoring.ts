import type { Answers, FieldOption, FormField, FormSchema } from './types';

export interface ScoreResult {
  score: number;
  maxScore: number;
  correct: number;
  total: number;
}

export const optionPoints = (o: FieldOption) => o.points ?? (o.correct ? 1 : 0);

export function isScoredField(field: FormField) {
  if (!['radio', 'select', 'checkbox'].includes(field.type)) return false;
  return (field.options ?? []).some((o) => o.correct || optionPoints(o) !== 0);
}

/** Quiz scoring. Returns null when the form is not in quiz mode. */
export function computeScore(schema: FormSchema, answers: Answers): ScoreResult | null {
  if (!schema.settings.quiz) return null;
  let score = 0;
  let maxScore = 0;
  let correct = 0;
  let total = 0;

  for (const field of schema.fields) {
    if (!isScoredField(field)) continue;
    const options = field.options ?? [];
    total++;

    if (field.type === 'checkbox') {
      const selected = new Set(Array.isArray(answers[field.id]) ? (answers[field.id] as string[]) : []);
      maxScore += options.reduce((s, o) => s + Math.max(0, optionPoints(o)), 0);
      score += options.filter((o) => selected.has(o.label)).reduce((s, o) => s + optionPoints(o), 0);
      const correctSet = options.filter((o) => o.correct).map((o) => o.label);
      if (correctSet.length === selected.size && correctSet.every((l) => selected.has(l))) correct++;
    } else {
      maxScore += Math.max(0, ...options.map(optionPoints));
      const picked = options.find((o) => o.label === answers[field.id]);
      if (picked) {
        score += optionPoints(picked);
        if (picked.correct) correct++;
      }
    }
  }

  return { score: Math.max(0, score), maxScore, correct, total };
}
