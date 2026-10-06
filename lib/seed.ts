import { prisma } from './db';
import { newFormLinks } from './form-links';
import { syncPortListeners } from './port-router';
import { computeScore } from './scoring';
import { TEMPLATES } from './templates';
import type { Answers, FormField, FormSchema } from './types';

const SEED_KEY = 'demo_seeded';
let seeding: Promise<void> | null = null;

/**
 * Seeds the database once with the four templates plus realistic sample responses,
 * so a fresh install has something to look at. Disable with SEED_DEMO_DATA=false.
 */
export function ensureSeeded(): Promise<void> {
  if (process.env.SEED_DEMO_DATA === 'false') return Promise.resolve();
  seeding ??= seed().catch((err) => {
    console.error('[formcraft] demo seed failed', err);
    seeding = null;
  });
  return seeding;
}

async function seed() {
  const marker = await prisma.appMeta.findUnique({ where: { key: SEED_KEY } });
  if (marker) return;
  if ((await prisma.form.count()) > 0) {
    await prisma.appMeta.create({ data: { key: SEED_KEY, value: new Date().toISOString() } });
    return;
  }

  const plan: Record<string, { status: 'ACTIVE' | 'DRAFT'; responses: number; ageDays: number }> = {
    contact: { status: 'ACTIVE', responses: 46, ageDays: 40 },
    feedback: { status: 'ACTIVE', responses: 128, ageDays: 30 },
    event: { status: 'ACTIVE', responses: 63, ageDays: 21 },
    quiz: { status: 'DRAFT', responses: 18, ageDays: 9 },
  };

  for (const template of TEMPLATES) {
    const p = plan[template.id];
    if (!p) continue;
    const schema = template.build();
    const created = new Date(Date.now() - p.ageDays * 86_400_000);
    const form = await prisma.form.create({
      data: {
        title: template.title,
        ...(await newFormLinks(template.title)),
        description: template.description,
        category: template.category,
        tags: JSON.stringify(template.tags),
        status: p.status,
        schema: JSON.stringify(schema),
        createdAt: created,
      },
    });
    await prisma.submission.createMany({
      data: Array.from({ length: p.responses }, () => {
        const answers = fakeAnswers(schema);
        const result = computeScore(schema, answers);
        // Skew timestamps toward recent days so sparklines look alive.
        const ago = Math.pow(Math.random(), 1.6) * p.ageDays * 86_400_000;
        return {
          formId: form.id,
          data: JSON.stringify(answers),
          score: result?.score ?? null,
          maxScore: result?.maxScore ?? null,
          createdAt: new Date(Date.now() - ago),
        };
      }),
    });
  }

  await prisma.appMeta.create({ data: { key: SEED_KEY, value: new Date().toISOString() } });
  await syncPortListeners();
  console.log('[formcraft] seeded demo forms');
}

const FIRST = ['Ava', 'Liam', 'Noah', 'Mia', 'Omar', 'Sofia', 'Yuki', 'Lucas', 'Zara', 'Ethan', 'Layla', 'Mateo', 'Priya', 'Hana', 'Diego', 'Fatima', 'Leo', 'Chloe'];
const LAST = ['Johnson', 'Khan', 'Garcia', 'Tanaka', 'Müller', 'Rossi', 'Nguyen', 'Silva', 'Haddad', 'Smith', 'Kowalski', 'Patel', 'Brown', 'Okafor'];
const COMPANIES = ['Acme Inc.', 'Globex', 'Initech', 'Umbrella Labs', 'Stark Industries', 'Wayne Enterprises', 'Hooli', 'Pied Piper', ''];
const MESSAGES = [
  "I can't reset my password — the email never arrives.",
  'How do I export my data to CSV?',
  'The dashboard is loading slowly since yesterday.',
  'Can I upgrade my plan mid-cycle and get prorated billing?',
  'Getting a 500 error when saving a form with many fields.',
  'Is there an API for creating forms programmatically?',
  'Love the product! Just wondering if dark mode is planned.',
  'Our team needs SSO — is that on the roadmap?',
];
const FEEDBACK = [
  'Onboarding was smooth, but I wish there were more templates.',
  'Pricing is fair. Support response time could be faster.',
  'The mobile experience needs some love.',
  'Absolutely love how fast everything is!',
  'Search could be smarter — it misses typos.',
  'Would be great to have Slack notifications.',
  '',
  '',
];

const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const weighted = <T,>(arr: T[], weights: number[]) => {
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < arr.length; i++) if ((r -= weights[i]) <= 0) return arr[i];
  return arr[arr.length - 1];
};

function fakeAnswers(schema: FormSchema): Answers {
  const first = pick(FIRST);
  const last = pick(LAST);
  const out: Answers = {};
  for (const field of schema.fields) {
    const v = fakeValue(field, first, last, schema.settings.quiz);
    if (v !== undefined && v !== '') out[field.id] = v;
  }
  return out;
}

function fakeValue(field: FormField, first: string, last: string, quiz: boolean): Answers[string] | undefined {
  const opts = field.options ?? [];
  const label = field.label.toLowerCase();
  switch (field.type) {
    case 'text':
      if (label.includes('company')) return pick(COMPANIES);
      return label.includes('your name') ? first : `${first} ${last}`;
    case 'email':
      return `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, '') + '@' + pick(['gmail.com', 'outlook.com', 'company.io', 'proton.me']);
    case 'phone':
      return Math.random() < 0.6 ? `+1 ${200 + Math.floor(Math.random() * 700)} 555 ${1000 + Math.floor(Math.random() * 8999)}` : undefined;
    case 'textarea':
      return label.includes('message') ? pick(MESSAGES) : pick(FEEDBACK);
    case 'select':
    case 'radio': {
      if (quiz && opts.some((o) => o.correct)) {
        return Math.random() < 0.68 ? opts.find((o) => o.correct)!.label : pick(opts).label;
      }
      const weights = opts.map((_, i) => (field.type === 'select' ? [3, 6, 3, 1][i] ?? 1 : [5, 6, 3, 1, 0.5][i] ?? 1));
      return weighted(opts, weights).label;
    }
    case 'checkbox': {
      const chosen = opts.filter(() => Math.random() < 0.28).map((o) => o.label);
      return chosen.length ? chosen.filter((l) => l !== 'No preference' || chosen.length === 1) : [opts[opts.length - 1].label];
    }
    case 'date': {
      const d = new Date(Date.now() + (7 + Math.floor(Math.random() * 3) * 7) * 86_400_000);
      return d.toISOString().slice(0, 10);
    }
    case 'rating':
      return weighted([1, 2, 3, 4, 5], [1, 1, 3, 6, 5]);
    case 'scale': {
      const values = Array.from({ length: (field.max ?? 10) - (field.min ?? 1) + 1 }, (_, i) => (field.min ?? 1) + i);
      return weighted(values, values.map((v) => (v >= 9 ? 7 : v >= 7 ? 4 : 1)));
    }
  }
}
