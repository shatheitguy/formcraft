'use client';

import { useDraggable } from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import { useT } from '@/components/i18n';
import { FIELD_ICONS } from '@/components/icons';
import { FIELD_TYPES, type FieldTypeMeta } from '@/lib/fields';
import type { FieldType } from '@/lib/types';
import { cn } from '@/lib/utils';

const GROUPS: FieldTypeMeta['group'][] = ['Text', 'Contact', 'Choice', 'Other'];

export function Palette({ onAdd }: { onAdd: (type: FieldType) => void }) {
  const t = useT();
  return (
    <div className="p-4">
      <div className="mb-1 text-sm font-semibold text-slate-900">{t('Add fields')}</div>
      <p className="mb-4 text-xs text-slate-500">{t('Drag onto the canvas, or click to add.')}</p>
      <div className="space-y-5">
        {GROUPS.map((group) => (
          <div key={group}>
            <div className="label !mb-2 !text-[10px]">{t(group)}</div>
            <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-1">
              {FIELD_TYPES.filter((f) => f.group === group).map((meta) => (
                <PaletteItem key={meta.type} meta={meta} onAdd={onAdd} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PaletteItem({ meta, onAdd }: { meta: FieldTypeMeta; onAdd: (type: FieldType) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette:${meta.type}`,
    data: { fromPalette: true, type: meta.type },
  });
  const t = useT();
  const Icon = FIELD_ICONS[meta.type];
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => onAdd(meta.type)}
      className={cn(
        'group flex w-full cursor-grab touch-none items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-start transition active:cursor-grabbing',
        'hover:border-brand-300 hover:bg-brand-50/40 hover:shadow-sm',
        isDragging && 'opacity-40',
      )}
      title={t(meta.description)}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600 transition group-hover:bg-brand-100 group-hover:text-brand-700">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-slate-700">{t(meta.label)}</span>
        <span className="hidden truncate text-[11px] text-slate-400 lg:block">{t(meta.description)}</span>
      </span>
      <Plus className="hidden h-3.5 w-3.5 text-slate-300 transition group-hover:text-brand-500 lg:block" />
    </button>
  );
}

export function PaletteOverlay({ type }: { type: FieldType }) {
  const meta = FIELD_TYPES.find((f) => f.type === type)!;
  const t = useT();
  const Icon = FIELD_ICONS[type];
  return (
    <div className="flex w-56 cursor-grabbing items-center gap-2.5 rounded-lg border border-brand-300 bg-white px-2.5 py-2 shadow-lift ring-4 ring-brand-500/10">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-100 text-brand-700">
        <Icon className="h-4 w-4" />
      </span>
      <span className="text-[13px] font-medium text-slate-800">{t(meta.label)}</span>
    </div>
  );
}
