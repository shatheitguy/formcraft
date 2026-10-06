'use client';

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { AlertCircle, ArrowLeft, Check, Eye, Inbox, Languages, Link2, Monitor, MousePointerClick, PenSquare, Rocket, Smartphone, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FormFrame, FormHeader } from '@/components/form/form-frame';
import { FormRenderer } from '@/components/form/form-renderer';
import { ShareDialog, type ShareForm } from '@/components/share-dialog';
import { useT } from '@/components/i18n';
import { useToast } from '@/components/toast';
import { Button, buttonClass, Spinner, StatusBadge } from '@/components/ui';
import { cloneField, createField, isChoice } from '@/lib/fields';
import type { FieldType, FormBranding, FormDTO, FormField, FormSchema, FormSettings, FormStatus } from '@/lib/types';
import { formLanguages } from '@/lib/form-i18n';
import { accentVars } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { CanvasField, FieldOverlay } from './canvas-field';
import { TranslationEditor } from './translation-editor';
import { FieldInspector, FormSettingsPanel, type FormMeta } from './inspector';
import { Palette, PaletteOverlay } from './palette';

interface Draft extends FormMeta {
  status: FormStatus;
  schema: FormSchema;
}

type SaveState = 'saved' | 'dirty' | 'saving' | 'error';
type ActiveDrag = { kind: 'palette'; type: FieldType } | { kind: 'field'; id: string } | null;

const CANVAS_ID = 'canvas';

/** Palette drags target whatever is under the pointer; reordering uses closest center among fields. */
const collision: CollisionDetection = (args) => {
  if (String(args.active.id).startsWith('palette:')) {
    const hits = pointerWithin(args);
    const field = hits.find((h) => h.id !== CANVAS_ID);
    return field ? [field] : hits;
  }
  return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => c.id !== CANVAS_ID) });
};

export function FormBuilder({ initial, responses, portRange }: { initial: FormDTO; responses: number; portRange: { from: number; to: number } | null }) {
  const toast = useToast();
  const t = useT();
  const [draft, setDraft] = useState<Draft>({
    title: initial.title,
    description: initial.description,
    category: initial.category,
    tags: initial.tags,
    status: initial.status,
    schema: initial.schema,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<'build' | 'translate' | 'preview'>('build');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [activeDrag, setActiveDrag] = useState<ActiveDrag>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [links, setLinks] = useState<Pick<ShareForm, 'slug' | 'port' | 'customDomain'>>({ slug: initial.slug, port: initial.port, customDomain: initial.customDomain });
  const [lastDeleted, setLastDeleted] = useState<{ field: FormField; index: number } | null>(null);

  const draftRef = useRef(draft);
  draftRef.current = draft;
  const version = useRef(0);
  // Last error returned by the API (fixed English; translated at display time).
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveErrorRef = useRef<string | null>(null);

  const fields = draft.schema.fields;
  const selected = fields.find((f) => f.id === selectedId) ?? null;

  /* ------------------------------ persistence ------------------------------ */

  const save = useCallback(async (): Promise<boolean> => {
    const v = version.current;
    setSaveState('saving');
    try {
      const res = await fetch(`/api/forms/${initial.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draftRef.current),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(typeof data?.error === 'string' ? data.error : '');
      }
      saveErrorRef.current = null;
      setSaveError(null);
      setSaveState(version.current === v ? 'saved' : 'dirty');
      return true;
    } catch (e) {
      saveErrorRef.current = e instanceof Error && e.message ? e.message : null;
      setSaveError(saveErrorRef.current);
      setSaveState('error');
      return false;
    }
  }, [initial.id]);

  // Applied synchronously against the ref so an immediate save() sees the latest draft.
  const update = useCallback((fn: (d: Draft) => Draft) => {
    const next = fn(draftRef.current);
    draftRef.current = next;
    setDraft(next);
    version.current++;
    setSaveState('dirty');
  }, []);

  // Debounced autosave.
  useEffect(() => {
    if (saveState !== 'dirty') return;
    const timer = setTimeout(save, 1000);
    return () => clearTimeout(timer);
  }, [draft, saveState, save]);

  // Ctrl/Cmd+S saves immediately; warn on leaving with unsaved changes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save().then((ok) => (ok ? toast(t('All changes saved')) : saveErrorRef.current && toast(t(saveErrorRef.current), 'error')));
      }
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (saveState === 'dirty' || saveState === 'saving') e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [save, saveState, toast, t]);

  /* ------------------------------ field ops ------------------------------ */

  const setFields = (fn: (f: FormField[]) => FormField[]) => update((d) => ({ ...d, schema: { ...d.schema, fields: fn(d.schema.fields) } }));
  const setSettings = (patch: Partial<FormSettings>) => update((d) => ({ ...d, schema: { ...d.schema, settings: { ...d.schema.settings, ...patch } } }));
  // Merged against the latest draft so quick successive branding changes don't overwrite each other.
  const setBranding = (patch: Partial<FormBranding>) =>
    update((d) => ({ ...d, schema: { ...d.schema, settings: { ...d.schema.settings, branding: { ...d.schema.settings.branding, ...patch } } } }));
  const setMeta = (patch: Partial<FormMeta>) => update((d) => ({ ...d, ...patch }));

  const scrollToField = (id: string) =>
    requestAnimationFrame(() => document.getElementById(`cf-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));

  const insertField = (type: FieldType, index?: number) => {
    const field = createField(type);
    setFields((list) => {
      const at = index ?? (selectedId ? list.findIndex((f) => f.id === selectedId) + 1 : list.length);
      const next = [...list];
      next.splice(at < 0 ? list.length : at, 0, field);
      return next;
    });
    setSelectedId(field.id);
    setMode('build');
    scrollToField(field.id);
  };

  const patchField = (id: string, patch: Partial<FormField>) => setFields((list) => list.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const duplicateField = (id: string) => {
    const idx = fields.findIndex((f) => f.id === id);
    if (idx < 0) return;
    const copy = cloneField(fields[idx]);
    setFields((list) => [...list.slice(0, idx + 1), copy, ...list.slice(idx + 1)]);
    setSelectedId(copy.id);
    scrollToField(copy.id);
  };

  const deleteField = (id: string) => {
    const index = fields.findIndex((f) => f.id === id);
    if (index < 0) return;
    setLastDeleted({ field: fields[index], index });
    setFields((list) => list.filter((f) => f.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const undoDelete = () => {
    if (!lastDeleted) return;
    setFields((list) => {
      const next = [...list];
      next.splice(Math.min(lastDeleted.index, next.length), 0, lastDeleted.field);
      return next;
    });
    setSelectedId(lastDeleted.field.id);
    setLastDeleted(null);
  };

  useEffect(() => {
    if (!lastDeleted) return;
    const timer = setTimeout(() => setLastDeleted(null), 6000);
    return () => clearTimeout(timer);
  }, [lastDeleted]);

  const moveField = (id: string, dir: -1 | 1) =>
    setFields((list) => {
      const i = list.findIndex((f) => f.id === id);
      const j = i + dir;
      return j < 0 || j >= list.length ? list : arrayMove(list, i, j);
    });

  /* ------------------------------ drag & drop ------------------------------ */

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragStart = ({ active }: DragStartEvent) => {
    const data = active.data.current as { fromPalette?: boolean; type?: FieldType } | undefined;
    setActiveDrag(data?.fromPalette ? { kind: 'palette', type: data.type! } : { kind: 'field', id: String(active.id) });
  };
  const onDragOver = ({ over }: DragOverEvent) => setOverId(over ? String(over.id) : null);
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const drag = activeDrag;
    setActiveDrag(null);
    setOverId(null);
    if (!over || !drag) return;
    if (drag.kind === 'palette') {
      const idx = over.id === CANVAS_ID ? fields.length : fields.findIndex((f) => f.id === over.id);
      insertField(drag.type, idx < 0 ? fields.length : idx);
    } else if (active.id !== over.id) {
      const from = fields.findIndex((f) => f.id === active.id);
      const to = fields.findIndex((f) => f.id === over.id);
      if (from >= 0 && to >= 0) setFields((list) => arrayMove(list, from, to));
    }
  };

  /* ------------------------------ publish & share ------------------------------ */

  const problems = fields.flatMap((f) => {
    const out: string[] = [];
    if (!f.label.trim()) out.push(t('A question is missing its label.'));
    if (isChoice(f.type)) {
      const labels = (f.options ?? []).map((o) => o.label.trim());
      if (!labels.length || labels.some((l) => !l)) out.push(t('“{label}” has empty options.', { label: f.label }));
      else if (new Set(labels).size !== labels.length) out.push(t('“{label}” has duplicate options.', { label: f.label }));
    }
    return out;
  });

  const toggleStatus = async () => {
    const next: FormStatus = draft.status === 'ACTIVE' ? 'DRAFT' : 'ACTIVE';
    if (next === 'ACTIVE') {
      if (fields.length === 0) return toast(t('Add at least one field before publishing'), 'error');
      if (problems.length) return toast(problems[0], 'error');
    }
    update((d) => ({ ...d, status: next }));
    const ok = await save();
    if (ok) toast(next === 'ACTIVE' ? t('Published! Your form is now accepting responses.') : t('Unpublished — form moved to drafts'));
    else if (saveErrorRef.current) toast(t(saveErrorRef.current), 'error');
  };


  const branding = draft.schema.settings.branding;
  const multilingual = formLanguages(draft.schema).length > 1;
  const formTheme = draft.schema.settings.theme === 'light' || draft.schema.settings.theme === 'dark' ? draft.schema.settings.theme : '';
  // Centered stacked header: center the editable title/description text too.
  const centered = branding?.logoAlign === 'center' && branding?.logoPlacement !== 'inline';

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      {/* Top bar */}
      <header className="z-30 flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 sm:gap-3 sm:px-4">
        <Link href="/" className={buttonClass('ghost', 'sm', 'px-2')} title={t('Back to dashboard')}>
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          <span className="hidden 2xl:inline">{t('Dashboard')}</span>
        </Link>
        <div className="h-6 w-px bg-slate-200" />
        <input
          value={draft.title}
          onChange={(e) => setMeta({ title: e.target.value })}
          className="min-w-0 max-w-[280px] flex-1 truncate rounded-md border border-transparent bg-transparent px-2 py-1 text-[15px] font-semibold text-slate-900 outline-none transition hover:border-slate-200 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
          aria-label={t('Form title')}
        />
        <StatusBadge status={draft.status} className="hidden sm:inline-flex" />
        <SaveIndicator state={saveState} error={saveError} onRetry={save} />

        <div className="mx-auto hidden rounded-lg bg-slate-100 p-0.5 md:inline-flex">
          {(
            [
              ['build', 'Build', PenSquare],
              ...(multilingual ? ([['translate', 'Translate', Languages]] as const) : []),
              ['preview', 'Preview', Eye],
            ] as const
          ).map(([m, label, Icon]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              title={t(label)}
              aria-label={t(label)}
              className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition xl:px-3', mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800')}
            >
              <Icon className="h-3.5 w-3.5" /> <span className={cn(mode !== m && 'hidden xl:inline')}>{t(label)}</span>
            </button>
          ))}
        </div>

        <div className="ms-auto flex items-center gap-1.5 md:ms-0">
          <button onClick={() => setMode(mode === 'build' ? 'preview' : 'build')} className={buttonClass('ghost', 'sm', 'md:hidden')} aria-label={t('Toggle preview')}>
            {mode === 'build' ? <Eye className="h-4 w-4" /> : <PenSquare className="h-4 w-4" />}
          </button>
          <Link href={`/forms/${initial.id}/submissions`} className={buttonClass('ghost', 'sm')} title={t('View submissions')}>
            <Inbox className="h-4 w-4" />
            <span className="hidden xl:inline">{t('Submissions')}</span>
            <span className="rounded bg-slate-100 px-1.5 text-[11px] tabular-nums text-slate-600">{responses}</span>
          </Link>
          <Button onClick={() => setShareOpen(true)} className="hidden sm:inline-flex">
            <Link2 className="h-4 w-4" /> <span className="hidden xl:inline">{t('Share')}</span>
          </Button>
          <Button variant={draft.status === 'ACTIVE' ? 'secondary' : 'primary'} onClick={toggleStatus}>
            <Rocket className="h-4 w-4" />
            <span className="hidden sm:inline">{draft.status === 'ACTIVE' ? t('Unpublish') : t('Publish')}</span>
          </Button>
        </div>
      </header>

      {mode === 'translate' && multilingual ? (
        <div className="bg-grid flex-1 overflow-y-auto">
          <TranslationEditor
            schema={draft.schema}
            title={draft.title}
            description={draft.description}
            onChange={(lang, tr) => update((d) => ({ ...d, schema: { ...d.schema, translations: { ...d.schema.translations, [lang]: tr } } }))}
          />
        </div>
      ) : mode === 'preview' ? (
        // The preview honours the form's forced theme (light/dark), like the published form.
        <div className={cn('bg-grid flex-1 overflow-y-auto bg-slate-50', formTheme)}>
          <div className="sticky top-0 z-10 flex justify-center py-3">
            <div className="inline-flex rounded-lg bg-white p-0.5 shadow-card ring-1 ring-slate-200">
              {(
                [
                  ['desktop', Monitor, 'Desktop preview'],
                  ['mobile', Smartphone, 'Mobile preview'],
                ] as const
              ).map(([d, Icon, label]) => (
                <button key={d} onClick={() => setDevice(d)} className={cn('rounded-md px-3 py-1.5 transition', device === d ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-700')} aria-label={t(label)} aria-pressed={device === d}>
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>
          <div className={cn('mx-auto px-4 pb-16 transition-all', device === 'mobile' ? 'max-w-[400px]' : 'max-w-2xl')}>
            <FormFrame branding={branding} category={draft.category}>
              <FormRenderer title={draft.title} description={draft.description} schema={draft.schema} mode="preview" />
            </FormFrame>
            <p className="mt-4 text-center text-xs text-slate-400">{t('Preview — responses are not saved.')}</p>
          </div>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => (setActiveDrag(null), setOverId(null))}>
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <aside className="scrollbar-thin max-h-[38vh] shrink-0 overflow-y-auto border-b border-slate-200 bg-white lg:max-h-none lg:w-64 lg:border-b-0 lg:border-e">
              <Palette onAdd={(t) => insertField(t)} />
            </aside>

            <main className="scrollbar-thin bg-grid min-w-0 flex-1 overflow-y-auto" onClick={() => setSelectedId(null)}>
              <div className="mx-auto max-w-2xl px-4 py-8" style={accentVars(branding?.accent)}>
                {/* Form header card */}
                <div onClick={(e) => e.stopPropagation()}>
                <FormFrame branding={branding} category={draft.category} className={cn('mb-4 transition', selectedId === null && 'ring-2 ring-brand-500/20')}>
                  <div className="p-6 [&>header]:mb-0">
                    <FormHeader
                      branding={branding}
                      editing
                      title={
                        <input
                          value={draft.title}
                          onChange={(e) => setMeta({ title: e.target.value })}
                          onFocus={() => setSelectedId(null)}
                          placeholder={t('Form title')}
                          className={cn('w-full bg-transparent text-2xl font-bold tracking-tight text-slate-900 outline-none placeholder:text-slate-300', centered && 'text-center')}
                        />
                      }
                      description={
                        <textarea
                          value={draft.description}
                          onChange={(e) => setMeta({ description: e.target.value })}
                          onFocus={() => setSelectedId(null)}
                          placeholder={t('Add a description for respondents…')}
                          rows={Math.max(1, Math.min(4, draft.description.split('\n').length))}
                          className={cn('mt-2 w-full resize-none bg-transparent text-slate-600 outline-none placeholder:text-slate-300', centered && 'text-center')}
                        />
                      }
                    />
                  </div>
                </FormFrame>
                </div>

                <CanvasDropZone empty={fields.length === 0} highlight={activeDrag?.kind === 'palette' && overId === CANVAS_ID}>
                  <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-3">
                      {fields.map((field, i) => (
                        <div key={field.id} onClick={(e) => e.stopPropagation()}>
                          <CanvasField
                            field={field}
                            index={i}
                            total={fields.length}
                            selected={field.id === selectedId}
                            quiz={draft.schema.settings.quiz}
                            dropIndicator={activeDrag?.kind === 'palette' && overId === field.id}
                            onSelect={() => setSelectedId(field.id)}
                            onDuplicate={() => duplicateField(field.id)}
                            onDelete={() => deleteField(field.id)}
                            onMove={(dir) => moveField(field.id, dir)}
                          />
                        </div>
                      ))}
                    </div>
                  </SortableContext>
                </CanvasDropZone>
              </div>
            </main>

            <aside className="scrollbar-thin shrink-0 overflow-y-auto border-t border-slate-200 bg-white lg:w-[340px] lg:border-s lg:border-t-0">
              {selected ? (
                <FieldInspector
                  key={selected.id}
                  field={selected}
                  quiz={draft.schema.settings.quiz}
                  onChange={(patch) => patchField(selected.id, patch)}
                  onClose={() => setSelectedId(null)}
                  onDelete={() => deleteField(selected.id)}
                />
              ) : (
                <FormSettingsPanel meta={draft} settings={draft.schema.settings} onMeta={setMeta} onSettings={setSettings} onBranding={setBranding} />
              )}
            </aside>
          </div>

          <DragOverlay dropAnimation={null}>
            {activeDrag?.kind === 'palette' && <PaletteOverlay type={activeDrag.type} />}
            {activeDrag?.kind === 'field' && fields.find((f) => f.id === activeDrag.id) && <FieldOverlay field={fields.find((f) => f.id === activeDrag.id)!} />}
          </DragOverlay>
        </DndContext>
      )}

      <ShareDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        form={{ id: initial.id, title: draft.title, status: draft.status, ...links }}
        portRange={portRange}
        canEdit
        onUpdated={(f) => setLinks({ slug: f.slug, port: f.port, customDomain: f.customDomain })}
      />

      {lastDeleted && (
        <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 animate-pop-in items-center gap-3 rounded-xl bg-slate-900 py-2 pe-2 ps-4 text-sm text-white shadow-lift">
          {t('Field deleted')}
          <button onClick={undoDelete} className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 text-xs font-semibold hover:bg-white/20">
            <Undo2 className="h-3.5 w-3.5" /> {t('Undo')}
          </button>
        </div>
      )}
    </div>
  );
}

function CanvasDropZone({ children, empty, highlight }: { children: React.ReactNode; empty: boolean; highlight: boolean }) {
  const t = useT();
  const { setNodeRef } = useDroppable({ id: CANVAS_ID });
  return (
    <div ref={setNodeRef} className="min-h-[200px] pb-24">
      {children}
      <div
        className={cn(
          'mt-3 flex flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition',
          empty ? 'py-16' : 'py-6',
          highlight ? 'border-brand-400 bg-brand-50/60 text-brand-600' : 'border-slate-200 text-slate-400',
        )}
      >
        <MousePointerClick className={cn('mb-2', empty ? 'h-7 w-7' : 'h-5 w-5')} />
        <p className="text-sm font-medium">{empty ? t('Drag fields here to start building') : t('Drop here to add at the end')}</p>
        {empty && <p className="mt-1 text-xs">{t('or click any field type in the fields panel')}</p>}
      </div>
    </div>
  );
}

function SaveIndicator({ state, error, onRetry }: { state: SaveState; error: string | null; onRetry: () => void }) {
  const t = useT();
  if (state === 'saving')
    return (
      <span className="hidden items-center gap-1.5 whitespace-nowrap text-xs text-slate-400 sm:inline-flex" title={t('Saving…')}>
        <Spinner className="h-3 w-3" /> <span className="hidden xl:inline">{t('Saving…')}</span>
      </span>
    );
  if (state === 'dirty') return <span className="hidden whitespace-nowrap text-xs text-slate-400 xl:inline">{t('Unsaved changes')}</span>;
  if (state === 'error')
    return (
      <button onClick={onRetry} title={error ? t(error) : undefined} className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 hover:underline">
        <AlertCircle className="h-3.5 w-3.5" /> {t('Save failed — retry')}
      </button>
    );
  return (
    <span className="hidden items-center gap-1 whitespace-nowrap text-xs text-slate-400 sm:inline-flex" title={t('Saved')}>
      <Check className="h-3.5 w-3.5 text-emerald-500" /> <span className="hidden xl:inline">{t('Saved')}</span>
    </span>
  );
}
