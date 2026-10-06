import type { Config } from 'tailwindcss';
import colors from 'tailwindcss/colors';
import plugin from 'tailwindcss/plugin';

/*
 * Theme system
 * ------------
 * Every palette used by the UI is a CSS variable, so dark mode is a variable swap instead of
 * `dark:` classes on every element. Themes apply at the root (system preference via
 * prefers-color-scheme, or `class="light|dark"` on <html>) and on any wrapper element
 * (`class="light"` / `class="dark"`, used for forms with a forced theme).
 */

const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
type Shade = (typeof SHADES)[number];
const CHROMA = ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose'] as const;

// Dark mode: soft tints become deep tints, saturated mid-tones stay, dark text tones become light.
const CHROMA_DARK: Record<Shade, Shade> = { 50: 950, 100: 900, 200: 800, 300: 700, 400: 400, 500: 500, 600: 500, 700: 400, 800: 300, 900: 200, 950: 100 };
const SLATE_DARK: Record<Shade, string> = {
  50: '#020617', // page background
  100: '#1e293b', // subtle fills
  200: '#273449', // borders
  300: '#3b4a61',
  400: '#64748b', // placeholders
  500: '#94a3b8', // muted text
  600: '#cbd5e1', // body text
  700: '#e2e8f0',
  800: '#f1f5f9',
  900: '#f8fafc', // headings
  950: '#ffffff',
};
const WHITE_DARK = '#0f172a'; // cards & inputs

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};
const pal = (name: string) => (colors as unknown as Record<string, Record<Shade, string>>)[name];
const varColor = (v: string) => `rgb(var(${v}) / <alpha-value>)`;

function lightVars() {
  const v: Record<string, string> = { '--c-white': '255 255 255' };
  for (const s of SHADES) v[`--c-slate-${s}`] = rgb(pal('slate')[s]);
  for (const c of CHROMA) for (const s of SHADES) v[`--c-${c}-${s}`] = rgb(pal(c)[s]);
  return v;
}
function darkVars() {
  const v: Record<string, string> = { '--c-white': rgb(WHITE_DARK) };
  for (const s of SHADES) v[`--c-slate-${s}`] = rgb(SLATE_DARK[s]);
  for (const c of CHROMA) for (const s of SHADES) v[`--c-${c}-${s}`] = rgb(pal(c)[CHROMA_DARK[s]]);
  return v;
}
// Brand (accent) shades are set at runtime as --brand-N; --b-N is what utilities use.
const brandMap = (dark: boolean) => Object.fromEntries(SHADES.map((s) => [`--b-${s}`, `var(--brand-${dark ? CHROMA_DARK[s] : s})`]));

const themes = plugin(({ addBase }) => {
  const light = { ...lightVars(), colorScheme: 'light' };
  const dark = { ...darkVars(), colorScheme: 'dark' };
  addBase({
    ':root, .light': light,
    '.dark': dark,
    // Brand mapping is re-declared per element so inline accent overrides (per-form colours)
    // resolve correctly; selector specificity makes the nearest theme wrapper win.
    '*, ::before, ::after': brandMap(false),
    '@media (prefers-color-scheme: dark)': {
      ':root:not(.light)': dark,
      ':root:not(.light), :root:not(.light) *, :root:not(.light) ::before, :root:not(.light) ::after': brandMap(true),
    },
    ':root.dark, :root.dark *, :root.dark ::before, :root.dark ::after': brandMap(true),
    ':root.light, :root.light *, :root.light ::before, :root.light ::after': brandMap(false),
    ':root .dark, :root .dark *, :root .dark ::before, :root .dark ::after': brandMap(true),
    ':root .light, :root .light *, :root .light ::before, :root .light ::after': brandMap(false),
  });
});

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        white: varColor('--c-white'),
        // Literal white for text/icons on solid accent backgrounds; never flips in dark mode.
        onaccent: '#ffffff',
        slate: Object.fromEntries(SHADES.map((s) => [s, varColor(`--c-slate-${s}`)])),
        ...Object.fromEntries(CHROMA.map((c) => [c, Object.fromEntries(SHADES.map((s) => [s, varColor(`--c-${c}-${s}`)]))])),
        // Accent palette, set at runtime from Settings → Customization (or per form).
        brand: Object.fromEntries(SHADES.map((s) => [s, varColor(`--b-${s}`)])),
        ink: colors.slate,
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          // Arabic and Tamil glyphs from fonts bundled with the OS (no external downloads).
          'Noto Sans Arabic',
          'Noto Sans Tamil',
          'Nirmala UI',
          'Tahoma',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,23,42,.04), 0 1px 3px rgba(15,23,42,.06)',
        lift: '0 10px 30px -12px rgba(15,23,42,.25), 0 4px 10px -6px rgba(15,23,42,.1)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'pop-in': {
          from: { opacity: '0', transform: 'translateY(6px) scale(.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'slide-in': { from: { transform: 'translateX(100%)' }, to: { transform: 'translateX(0)' } },
        'slide-in-rtl': { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(0)' } },
      },
      animation: {
        'fade-in': 'fade-in .15s ease-out',
        'pop-in': 'pop-in .18s ease-out',
        'slide-in': 'slide-in .22s cubic-bezier(.2,.8,.2,1)',
        'slide-in-rtl': 'slide-in-rtl .22s cubic-bezier(.2,.8,.2,1)',
      },
    },
  },
  plugins: [themes],
};

export default config;
