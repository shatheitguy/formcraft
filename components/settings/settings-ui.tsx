'use client';

import { Fragment, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function SettingsCard({
  title,
  description,
  icon,
  children,
  footer,
  aside,
  className,
}: {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('card', className)}>
      <header className="flex items-start gap-3 border-b border-slate-100 px-6 py-4">
        {icon && <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 [&>svg]:h-[18px] [&>svg]:w-[18px]">{icon}</span>}
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
        </div>
        {aside}
      </header>
      <div className="px-6 py-5">{children}</div>
      {footer && <footer className="flex flex-wrap items-center justify-end gap-2 rounded-b-2xl border-t border-slate-100 bg-slate-50/60 px-6 py-3">{footer}</footer>}
    </section>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function ToggleField({ label, description, control }: { label: string; description?: ReactNode; control: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg bg-slate-50 px-4 py-3 ring-1 ring-inset ring-slate-100">
      <div>
        <div className="text-sm font-medium text-slate-800">{label}</div>
        {description && <div className="text-xs text-slate-500">{description}</div>}
      </div>
      {control}
    </div>
  );
}

/** POST/PUT/PATCH JSON helper returning parsed body and an error string. */
export async function sendJson<T = Record<string, unknown>>(url: string, method: string, body?: unknown): Promise<{ ok: boolean; data: T; error?: string }> {
  try {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    return { ok: res.ok, data, error: res.ok ? undefined : data.error ?? `Request failed (${res.status})` };
  } catch {
    return { ok: false, data: {} as T, error: 'Network error — is the server running?' };
  }
}

/**
 * Renders a translated string, swapping `{name}` placeholders for React nodes
 * (links, <strong>, <code>) so sentences stay whole for translators.
 */
export function rich(text: string, nodes: Record<string, ReactNode>): ReactNode {
  return text.split(/(\{\w+\})/g).map((part, i) => {
    const m = /^\{(\w+)\}$/.exec(part);
    return m && m[1] in nodes ? <Fragment key={i}>{nodes[m[1]]}</Fragment> : part;
  });
}
