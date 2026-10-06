export interface CategoryStyle {
  gradient: string;
  soft: string;
  dot: string;
  bar: string;
  text: string;
}

// Full class strings so Tailwind can detect them.
const STYLES: Record<string, CategoryStyle> = {
  indigo: {
    gradient: 'from-indigo-500 via-indigo-500 to-violet-500',
    soft: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
    dot: 'bg-indigo-500',
    bar: 'bg-indigo-400',
    text: 'text-indigo-600',
  },
  sky: {
    gradient: 'from-sky-500 via-sky-500 to-cyan-400',
    soft: 'bg-sky-50 text-sky-700 ring-sky-200',
    dot: 'bg-sky-500',
    bar: 'bg-sky-400',
    text: 'text-sky-600',
  },
  rose: {
    gradient: 'from-rose-500 via-rose-500 to-pink-400',
    soft: 'bg-rose-50 text-rose-700 ring-rose-200',
    dot: 'bg-rose-500',
    bar: 'bg-rose-400',
    text: 'text-rose-600',
  },
  amber: {
    gradient: 'from-amber-500 via-amber-500 to-orange-400',
    soft: 'bg-amber-50 text-amber-700 ring-amber-200',
    dot: 'bg-amber-500',
    bar: 'bg-amber-400',
    text: 'text-amber-600',
  },
  emerald: {
    gradient: 'from-emerald-500 via-emerald-500 to-teal-400',
    soft: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    dot: 'bg-emerald-500',
    bar: 'bg-emerald-400',
    text: 'text-emerald-600',
  },
  fuchsia: {
    gradient: 'from-fuchsia-500 via-fuchsia-500 to-purple-500',
    soft: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200',
    dot: 'bg-fuchsia-500',
    bar: 'bg-fuchsia-400',
    text: 'text-fuchsia-600',
  },
  slate: {
    gradient: 'from-slate-600 via-slate-600 to-slate-400',
    soft: 'bg-slate-100 text-slate-700 ring-slate-200',
    dot: 'bg-slate-500',
    bar: 'bg-slate-400',
    text: 'text-slate-600',
  },
};

const KNOWN: Record<string, keyof typeof STYLES> = {
  support: 'sky',
  feedback: 'rose',
  events: 'amber',
  quiz: 'emerald',
  general: 'indigo',
  hr: 'fuchsia',
  internal: 'slate',
};

const ROTATION = ['indigo', 'sky', 'rose', 'amber', 'emerald', 'fuchsia'];

export function categoryStyle(category: string): CategoryStyle {
  const key = category.trim().toLowerCase();
  if (KNOWN[key]) return STYLES[KNOWN[key]];
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return STYLES[ROTATION[hash % ROTATION.length]];
}

export const SUGGESTED_CATEGORIES = ['General', 'Support', 'Feedback', 'Events', 'Quiz', 'HR', 'Internal'];
