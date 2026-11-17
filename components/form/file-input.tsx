'use client';

import { AlertCircle, FileText, Image as ImageIcon, Loader2, Paperclip, Upload, X } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { useT } from '@/components/i18n';
import {
  acceptAttr,
  extAllowed,
  extOf,
  FILE_KINDS,
  fileLimits,
  fileRefs,
  formatBytes,
  INLINE_IMAGE_EXTS,
  makeFileRef,
  safeDiskName,
} from '@/lib/files';
import type { AnswerValue, FormField } from '@/lib/types';
import { cn } from '@/lib/utils';

interface Props {
  field: FormField;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
  error?: string;
  disabled?: boolean;
  /** Live form: files are uploaded to this form. Without it (previews) files stay in the browser. */
  formId?: string;
}

type Pending = { key: string; name: string; size: number; progress: number };

const sizeOf = new Map<string, number>();

function randomHex() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Uploads one file with progress; resolves to the answer reference. */
function upload(formId: string, fieldId: string, file: File, onProgress: (p: number) => void) {
  return new Promise<{ ref: string } | { status: number }>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/forms/${encodeURIComponent(formId)}/files?fieldId=${encodeURIComponent(fieldId)}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText);
        resolve(xhr.status === 201 && typeof json.ref === 'string' ? { ref: json.ref } : { status: xhr.status });
      } catch {
        resolve({ status: xhr.status || 500 });
      }
    };
    xhr.onerror = () => resolve({ status: 0 });
    const body = new FormData();
    body.append('fieldId', fieldId);
    body.append('file', file);
    xhr.send(body);
  });
}

export function FileInput({ field, value, onChange, error, disabled, formId }: Props) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [over, setOver] = useState(false);
  const { kinds, maxFiles, maxFileMb } = fileLimits(field);
  const refs = fileRefs(value);
  // Latest value for async completions (several uploads can finish in any order).
  const latest = useRef<string[]>([]);
  latest.current = Array.isArray(value) ? value : [];

  const kindNames = kinds.includes('any') ? t('Any file type') : FILE_KINDS.filter((k) => kinds.includes(k.kind)).map((k) => t(k.label)).join(', ');
  const room = maxFiles - refs.length - pending.length;
  const full = room <= 0;

  const statusMessage = (status: number, name: string) =>
    status === 413
      ? t('“{name}” is larger than {mb} MB.', { name, mb: maxFileMb })
      : status === 415
        ? t('“{name}” isn’t an allowed file type.', { name })
        : status === 429
          ? t('Too many uploads — please wait a few minutes and try again.')
          : status === 403
            ? t('This form is not accepting responses right now.')
            : t('“{name}” could not be uploaded. Please try again.', { name });

  async function addFiles(list: FileList | File[]) {
    const files = Array.from(list);
    const errs: string[] = [];
    const accepted: File[] = [];
    for (const f of files) {
      if (!extAllowed(extOf(f.name), kinds)) errs.push(t('“{name}” isn’t an allowed file type.', { name: f.name }));
      else if (f.size > maxFileMb * 1024 * 1024) errs.push(t('“{name}” is larger than {mb} MB.', { name: f.name, mb: maxFileMb }));
      else if (f.size === 0) errs.push(t('“{name}” is empty.', { name: f.name }));
      else if (accepted.length >= room) {
        errs.push(maxFiles === 1 ? t('You can attach only one file.') : t('You can attach up to {n} files.', { n: maxFiles }));
        break;
      } else accepted.push(f);
    }
    setProblems(errs);
    if (!accepted.length) return;

    // Previews: nothing is sent; a look-alike reference keeps validation and counts working.
    if (!formId) {
      const next = [...latest.current];
      for (const f of accepted) {
        const ref = makeFileRef(`${randomHex()}-${safeDiskName(f.name)}`, f.name);
        sizeOf.set(ref, f.size);
        next.push(ref);
      }
      onChange(next);
      return;
    }

    const items = accepted.map((f) => ({ file: f, key: randomHex(), name: f.name, size: f.size, progress: 0 }));
    setPending((p) => [...p, ...items.map(({ key, name, size }) => ({ key, name, size, progress: 0 }))]);
    await Promise.all(
      items.map(async (it) => {
        const res = await upload(formId, field.id, it.file, (progress) => setPending((p) => p.map((x) => (x.key === it.key ? { ...x, progress } : x))));
        setPending((p) => p.filter((x) => x.key !== it.key));
        if ('ref' in res) {
          sizeOf.set(res.ref, it.size);
          const next = [...latest.current, res.ref];
          latest.current = next;
          onChange(next);
        } else {
          setProblems((p) => [...p, statusMessage(res.status, it.name)]);
        }
      }),
    );
  }

  const remove = (ref: string) => {
    onChange(latest.current.filter((r) => r !== ref));
    setProblems([]);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (disabled || full) return;
    if (e.dataTransfer.files?.length) void addFiles(e.dataTransfer.files);
  };

  return (
    <div className="w-full space-y-2" data-uploading={pending.length > 0 ? '' : undefined}>
      <div
        onDragOver={(e) => {
          if (disabled || full) return;
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn(
          'flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-5 text-center transition',
          over ? 'border-brand-500 bg-brand-50/60' : error ? 'border-rose-300 bg-white' : 'border-slate-300 bg-slate-50/60',
          (disabled || full) && 'opacity-80',
        )}
      >
        <Upload className="h-6 w-6 text-slate-500" />
        <button
          id={`in-${field.id}`}
          type="button"
          disabled={disabled || full}
          aria-invalid={!!error}
          onClick={() => inputRef.current?.click()}
          className={cn(
            'inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition sm:w-auto',
            !disabled && !full && 'hover:border-brand-400 hover:text-brand-700',
            (disabled || full) && 'cursor-default',
          )}
        >
          <Paperclip className="h-4 w-4" />
          {maxFiles === 1 ? t('Choose a file') : t('Choose files')}
        </button>
        <p className="hidden text-sm text-slate-700 sm:block">{t('or drag and drop here')}</p>
        <p className="text-xs text-slate-700">
          {kindNames} · {t('max {mb} MB each', { mb: maxFileMb })}
          {maxFiles > 1 && <> · {t('up to {n} files', { n: maxFiles })}</>}
        </p>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          tabIndex={-1}
          accept={acceptAttr(kinds)}
          multiple={maxFiles > 1}
          disabled={disabled || full}
          onChange={(e) => {
            if (e.target.files?.length) void addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {(refs.length > 0 || pending.length > 0) && (
        <ul className="space-y-1.5">
          {refs.map((r) => {
            const raw = (Array.isArray(value) ? value : []).find((v) => v.startsWith(r.stored + '|')) ?? '';
            const size = sizeOf.get(raw);
            const Icon = INLINE_IMAGE_EXTS.has(extOf(r.name)) ? ImageIcon : FileText;
            return (
              <li key={r.stored} className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                <Icon className="h-4 w-4 shrink-0 text-slate-500" />
                <span className="min-w-0 flex-1 truncate font-medium text-slate-900" title={r.name}>
                  {r.name}
                </span>
                {size !== undefined && <span className="shrink-0 text-xs tabular-nums text-slate-700">{formatBytes(size)}</span>}
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => remove(raw)}
                    className="shrink-0 rounded-md p-1.5 text-slate-600 hover:bg-slate-100 hover:text-rose-600"
                    aria-label={t('Remove {name}', { name: r.name })}
                    title={t('Remove')}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </li>
            );
          })}
          {pending.map((p) => (
            <li key={p.key} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              <div className="flex items-center gap-2.5">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-600" />
                <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{p.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-slate-700">
                  {t('Uploading…')} {Math.round(p.progress * 100)}%
                </span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${Math.round(p.progress * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {problems.map((p, i) => (
        <p key={i} className="flex items-start gap-1 text-xs font-medium text-rose-700">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" /> {p}
        </p>
      ))}
    </div>
  );
}
