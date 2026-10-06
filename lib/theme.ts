export const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

export const ACCENTS = {
  indigo: ['#eef2ff', '#e0e7ff', '#c7d2fe', '#a5b4fc', '#818cf8', '#6366f1', '#4f46e5', '#4338ca', '#3730a3', '#312e81', '#1e1b4b'],
  violet: ['#f5f3ff', '#ede9fe', '#ddd6fe', '#c4b5fd', '#a78bfa', '#8b5cf6', '#7c3aed', '#6d28d9', '#5b21b6', '#4c1d95', '#2e1065'],
  blue: ['#eff6ff', '#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a', '#172554'],
  teal: ['#f0fdfa', '#ccfbf1', '#99f6e4', '#5eead4', '#2dd4bf', '#14b8a6', '#0d9488', '#0f766e', '#115e59', '#134e4a', '#042f2e'],
  emerald: ['#ecfdf5', '#d1fae5', '#a7f3d0', '#6ee7b7', '#34d399', '#10b981', '#059669', '#047857', '#065f46', '#064e3b', '#022c22'],
  rose: ['#fff1f2', '#ffe4e6', '#fecdd3', '#fda4af', '#fb7185', '#f43f5e', '#e11d48', '#be123c', '#9f1239', '#881337', '#4c0519'],
  // Custom deep burgundy (not a Tailwind palette).
  wine: ['#fdf3f3', '#fbe4e4', '#f6c7c8', '#ec9a9c', '#db5f63', '#b8262d', '#9b1b22', '#7f151b', '#661217', '#520f13', '#2d0608'],
  yellow: ['#fefce8', '#fef9c3', '#fef08a', '#fde047', '#facc15', '#eab308', '#ca8a04', '#a16207', '#854d0e', '#713f12', '#422006'],
  orange: ['#fff7ed', '#ffedd5', '#fed7aa', '#fdba74', '#fb923c', '#f97316', '#ea580c', '#c2410c', '#9a3412', '#7c2d12', '#431407'],
  slate: ['#f8fafc', '#f1f5f9', '#e2e8f0', '#cbd5e1', '#94a3b8', '#64748b', '#475569', '#334155', '#1e293b', '#0f172a', '#020617'],
} as const;

export type AccentKey = keyof typeof ACCENTS;
export const ACCENT_KEYS = Object.keys(ACCENTS) as AccentKey[];

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};

export const isAccent = (k: unknown): k is AccentKey => typeof k === 'string' && k in ACCENTS;

/**
 * Inline-style variables that re-theme every `brand-*` class inside an element.
 * Returns undefined for "use the inherited/workspace accent".
 */
export function accentVars(key: string | undefined): Record<string, string> | undefined {
  if (!isAccent(key)) return undefined;
  return Object.fromEntries(SHADES.map((s, i) => [`--brand-${s}`, rgb(ACCENTS[key][i])]));
}

/** CSS custom properties consumed by the `brand-*` Tailwind colors. */
export function accentCss(key: string) {
  const palette = ACCENTS[(key in ACCENTS ? key : 'indigo') as AccentKey];
  return `:root{${SHADES.map((s, i) => `--brand-${s}:${rgb(palette[i])};`).join('')}}`;
}
