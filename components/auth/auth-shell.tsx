'use client';

import { BarChart3, Lock, MousePointerClick, Send } from 'lucide-react';
import type { ReactNode } from 'react';
import { useApp } from '@/components/app-context';
import { AppFooter } from '@/components/app-footer';
import { Logo } from '@/components/icons';
import { useT } from '@/components/i18n';
import { LanguageSwitch, ThemeSwitch } from '@/components/preferences';

const POINTS = [
  { icon: MousePointerClick, title: 'Drag-and-drop builder', text: 'Ten field types, templates, quizzes with scoring.' },
  { icon: BarChart3, title: 'Built-in reporting', text: 'Filter, chart and export every response.' },
  { icon: Send, title: 'Instant alerts', text: 'Email and Telegram notifications per form.' },
  { icon: Lock, title: 'Your data, your server', text: 'Self-hosted with role-based access.' },
];

/** Split-screen frame shared by the login and first-run setup pages. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const { app } = useApp();
  const t = useT();
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-[linear-gradient(135deg,rgb(var(--brand-600)),rgb(var(--brand-800))_55%,rgb(var(--brand-950)))] p-12 text-onaccent lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -end-24 -top-24 h-96 w-96 rounded-full bg-onaccent/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -start-20 h-[28rem] w-[28rem] rounded-full bg-brand-400/20 blur-3xl" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '22px 22px' }}
        />

        <div className="relative flex items-center gap-3">
          <span className="rounded-xl bg-onaccent/15 p-1.5 ring-1 ring-onaccent/20 backdrop-blur">
            <Logo className="h-8 w-8" src={app.logoUrl || undefined} />
          </span>
          <span className="text-lg font-bold tracking-tight">{app.name}</span>
        </div>

        <div className="relative mt-auto max-w-md">
          <h2 className="text-3xl font-bold leading-tight tracking-tight xl:text-4xl">{app.tagline || t('Build forms. Collect answers. Own your data.')}</h2>
          <ul className="mt-10 space-y-5">
            {POINTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-onaccent/10 ring-1 ring-onaccent/15">
                  <Icon className="h-4 w-4" />
                </span>
                <div>
                  <div className="text-sm font-semibold">{t(title)}</div>
                  <div className="text-sm text-onaccent/70">{t(text)}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative mt-12 text-xs text-onaccent/50">{t('© {year} {name} · Self-hosted', { year: new Date().getFullYear(), name: app.name })}</p>
      </section>

      <section className="bg-grid relative flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="absolute end-4 top-4 flex items-center gap-2">
          <ThemeSwitch className="[&>button>span]:hidden" />
          <LanguageSwitch />
        </div>
        <div className="w-full max-w-sm animate-pop-in">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <Logo className="h-9 w-9" src={app.logoUrl || undefined} />
            <span className="text-lg font-bold tracking-tight text-slate-900">{app.name}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <div className="mt-6">
            <AppFooter />
          </div>
        </div>
      </section>
    </main>
  );
}
