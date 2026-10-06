'use client';

import { ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useT } from '@/components/i18n';
import { FIELD_ICONS, TEMPLATE_ICONS } from '@/components/icons';
import { useToast } from '@/components/toast';
import { Button, Modal, Spinner } from '@/components/ui';
import { categoryStyle } from '@/lib/categories';
import { FIELD_META } from '@/lib/fields';
import { TEMPLATES, type TemplateId } from '@/lib/templates';
import { cn } from '@/lib/utils';

export function TemplatePicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const [selected, setSelected] = useState<TemplateId>('contact');
  const [creating, setCreating] = useState<TemplateId | null>(null);
  // Build each template once so the preview shows its exact fields.
  const previews = useMemo(() => Object.fromEntries(TEMPLATES.map((t) => [t.id, t.build()])), []);
  const current = TEMPLATES.find((t) => t.id === selected)!;
  const schema = previews[selected];

  async function create(id: TemplateId) {
    setCreating(id);
    try {
      const res = await fetch('/api/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: id }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(typeof j?.error === 'string' ? j.error : 'Could not create form');
      }
      const form = await res.json();
      router.push(`/forms/${form.id}/edit`);
    } catch (e) {
      toast(t(e instanceof Error && e.message ? e.message : 'Could not create form'), 'error');
      setCreating(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="xl" title={t('Create a new form')} description={t('Start from a pre-built template or a blank canvas. You can customize everything afterwards.')}>
      <div className="grid gap-0 md:grid-cols-[1fr_320px]">
        <div className="grid gap-3 p-5 sm:grid-cols-2">
          {TEMPLATES.map((tpl) => {
            const Icon = TEMPLATE_ICONS[tpl.id];
            const style = categoryStyle(tpl.category);
            const active = selected === tpl.id;
            const count = previews[tpl.id].fields.length;
            return (
              <button
                key={tpl.id}
                onClick={() => setSelected(tpl.id)}
                onDoubleClick={() => create(tpl.id)}
                className={cn(
                  'group relative flex flex-col overflow-hidden rounded-xl border bg-white text-start transition',
                  active ? 'border-brand-500 ring-2 ring-brand-500/30' : 'border-slate-200 hover:border-slate-300 hover:shadow-card',
                  tpl.id === 'blank' && 'sm:col-span-2',
                )}
              >
                <div className={cn('flex items-center gap-3 p-4', tpl.id !== 'blank' && 'pb-3')}>
                  <div
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-onaccent shadow-sm',
                      tpl.id === 'blank' ? 'bg-slate-800' : cn('bg-gradient-to-br', style.gradient),
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900">{t(tpl.name)}</div>
                    <div className="truncate text-xs text-slate-500">{t(tpl.tagline)}</div>
                  </div>
                  {creating === tpl.id && <Spinner className="ms-auto text-brand-600" />}
                </div>
                {tpl.id !== 'blank' && (
                  <div className="flex items-center gap-1 border-t border-slate-100 bg-slate-50/70 px-4 py-2">
                    {previews[tpl.id].fields.slice(0, 6).map((f) => {
                      const FIcon = FIELD_ICONS[f.type];
                      return (
                        <span key={f.id} title={t(FIELD_META[f.type].label)} className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-slate-500 ring-1 ring-slate-200">
                          <FIcon className="h-3.5 w-3.5" />
                        </span>
                      );
                    })}
                    <span className="ms-auto text-[11px] font-medium text-slate-400">{count === 1 ? t('1 field') : t('{n} fields', { n: count })}</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <aside className="flex flex-col border-t border-slate-100 bg-slate-50/60 md:border-s md:border-t-0">
          <div className="flex-1 p-5">
            <div className="label">{t('Preview')}</div>
            <h3 className="text-base font-semibold text-slate-900">{current.title}</h3>
            {current.description && <p className="mt-1 text-sm text-slate-500">{current.description}</p>}
            {schema.settings.quiz && (
              <span className="chip mt-2 bg-emerald-50 text-emerald-700 ring-emerald-200">{t('Auto-scored quiz')}</span>
            )}
            <ol className="mt-4 space-y-1.5">
              {schema.fields.length === 0 && <li className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-400">{t('Empty canvas — add fields in the builder.')}</li>}
              {schema.fields.map((f, i) => {
                const FIcon = FIELD_ICONS[f.type];
                return (
                  <li key={f.id} className="flex items-center gap-2.5 rounded-lg bg-white px-2.5 py-2 text-sm ring-1 ring-slate-200">
                    <span className="w-4 text-end text-[11px] tabular-nums text-slate-400">{i + 1}</span>
                    <FIcon className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="min-w-0 flex-1 truncate text-slate-700">{f.label}</span>
                    {f.required && <span className="text-xs text-rose-500">*</span>}
                  </li>
                );
              })}
            </ol>
          </div>
          <div className="border-t border-slate-100 p-4">
            <Button variant="primary" size="md" className="w-full" onClick={() => create(selected)} loading={creating === selected} disabled={!!creating}>
              {current.id === 'blank' ? t('Use blank form') : t('Use this template')} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </Button>
          </div>
        </aside>
      </div>
    </Modal>
  );
}
