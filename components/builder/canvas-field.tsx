'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, Copy, GripVertical, Trash2, Trophy } from 'lucide-react';
import { FieldInput, FieldLabel } from '@/components/form/field-input';
import { useT } from '@/components/i18n';
import { FIELD_ICONS } from '@/components/icons';
import { FIELD_META } from '@/lib/fields';
import { isScoredField, optionPoints } from '@/lib/scoring';
import type { FormField } from '@/lib/types';
import { cn } from '@/lib/utils';

interface Props {
  field: FormField;
  index: number;
  total: number;
  selected: boolean;
  quiz: boolean;
  dropIndicator: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
}

export function CanvasField({ field, index, total, selected, quiz, dropIndicator, onSelect, onDuplicate, onDelete, onMove }: Props) {
  const t = useT();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id });
  const Icon = FIELD_ICONS[field.type];
  const correct = quiz && isScoredField(field) ? (field.options ?? []).filter((o) => o.correct) : null;

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className="relative" id={`cf-${field.id}`}>
      {dropIndicator && <div className="absolute -top-[9px] end-2 start-2 z-10 h-1 rounded-full bg-brand-500 shadow-[0_0_0_3px_rgba(99,102,241,.2)]" />}
      <div
        {...attributes}
        {...listeners}
        onClick={onSelect}
        className={cn(
          'group relative cursor-pointer rounded-xl border bg-white p-5 ps-9 transition',
          selected ? 'border-brand-500 shadow-lift ring-4 ring-brand-500/10' : 'border-slate-200 shadow-card hover:border-slate-300',
          isDragging && 'z-20 opacity-50 shadow-lift',
        )}
      >
        <div className={cn('absolute start-2 top-1/2 -translate-y-1/2 cursor-grab text-slate-300 transition active:cursor-grabbing', selected ? 'text-brand-400' : 'group-hover:text-slate-400')}>
          <GripVertical className="h-4 w-4" />
        </div>

        <div className="mb-3 flex items-center gap-2">
          <span className="text-[11px] font-semibold tabular-nums text-slate-400">{String(index + 1).padStart(2, '0')}</span>
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
            <Icon className="h-3 w-3" /> {t(FIELD_META[field.type].label)}
          </span>
          {field.required && <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-rose-600">{t('Required')}</span>}

          <div
            className={cn('ms-auto flex items-center gap-0.5 transition', selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <ToolButton label={t('Move up')} disabled={index === 0} onClick={() => onMove(-1)}>
              <ArrowUp />
            </ToolButton>
            <ToolButton label={t('Move down')} disabled={index === total - 1} onClick={() => onMove(1)}>
              <ArrowDown />
            </ToolButton>
            <ToolButton label={t('Duplicate')} onClick={onDuplicate}>
              <Copy />
            </ToolButton>
            <ToolButton label={t('Delete')} onClick={onDelete} danger>
              <Trash2 />
            </ToolButton>
          </div>
        </div>

        <div className="pointer-events-none select-none">
          <FieldLabel field={field} />
          <FieldInput field={field} value={undefined} onChange={() => {}} disabled />
        </div>

        {correct && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
            <Trophy className="h-3.5 w-3.5 text-emerald-500" />
            {correct.length ? (
              correct.map((o) => (
                <span key={o.id} className="rounded-md bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                  {o.label} · {optionPoints(o) === 1 ? t('1 pt') : t('{n} pts', { n: optionPoints(o) })}
                </span>
              ))
            ) : (
              <span className="text-amber-600">{t('No correct answer marked')}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolButton({ children, label, onClick, disabled, danger }: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        'rounded-md p-1.5 text-slate-400 transition disabled:opacity-30 [&>svg]:h-3.5 [&>svg]:w-3.5',
        danger ? 'hover:bg-rose-50 hover:text-rose-600' : 'hover:bg-slate-100 hover:text-slate-700',
      )}
    >
      {children}
    </button>
  );
}

export function FieldOverlay({ field }: { field: FormField }) {
  const Icon = FIELD_ICONS[field.type];
  return (
    <div className="flex cursor-grabbing items-center gap-3 rounded-xl border border-brand-400 bg-white px-4 py-3 shadow-lift ring-4 ring-brand-500/10">
      <GripVertical className="h-4 w-4 text-brand-400" />
      <Icon className="h-4 w-4 text-slate-500" />
      <span className="truncate text-sm font-medium text-slate-800">{field.label}</span>
    </div>
  );
}
