'use client';

import { ImagePlus, Link2, Trash2, UploadCloud } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { cn } from '@/lib/utils';
import { ImageCrop, canCrop, type CropMode } from './image-crop';
import { useT } from './i18n';
import { useToast } from './toast';
import { Spinner } from './ui';

const ACCEPT = 'image/png,image/jpeg,image/gif,image/webp';
const MAX = 2 * 1024 * 1024;
/** Larger pictures are fine when they go through the cropper, which scales them down. */
const MAX_BEFORE_CROP = 25 * 1024 * 1024;

/**
 * Drag-and-drop / click-to-browse image uploader with an optional URL fallback.
 * PNG/JPG/WebP pictures open a crop & resize dialog first (GIFs upload as-is).
 */
export function ImageUpload({
  value,
  onChange,
  variant = 'logo',
  label,
  crop,
}: {
  value: string | undefined;
  onChange: (url: string) => void;
  variant?: 'logo' | 'cover';
  label?: string;
  /** Crop presets to offer before upload; defaults to the variant ('logo' or 'cover'). `false` uploads as-is. */
  crop?: CropMode | false;
}) {
  const toast = useToast();
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [urlMode, setUrlMode] = useState(false);
  const [url, setUrl] = useState('');
  const [pending, setPending] = useState<File | null>(null);
  const cropMode: CropMode | false = crop ?? (variant === 'cover' ? 'cover' : 'logo');

  const resetInput = () => {
    if (input.current) input.current.value = '';
  };

  /** A file was picked or dropped: crop it first when we can, else upload it as-is. */
  function choose(file: File | undefined) {
    if (!file) return;
    if (!ACCEPT.split(',').includes(file.type)) {
      resetInput();
      return toast(t('Use a PNG, JPG, GIF or WebP image'), 'error');
    }
    if (cropMode && canCrop(file)) {
      if (file.size > MAX_BEFORE_CROP) {
        resetInput();
        return toast(t('Images must be 25 MB or smaller'), 'error');
      }
      return setPending(file);
    }
    upload(file);
  }

  const closeCrop = () => {
    setPending(null);
    resetInput();
  };

  async function upload(file: File | undefined) {
    if (!file) return;
    if (!ACCEPT.split(',').includes(file.type)) return toast(t('Use a PNG, JPG, GIF or WebP image'), 'error');
    if (file.size > MAX) {
      resetInput();
      return toast(t('Images must be 2 MB or smaller'), 'error');
    }
    setBusy(true);
    const body = new FormData();
    body.append('file', file);
    try {
      const res = await fetch('/api/uploads', { method: 'POST', body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Upload failed');
      onChange(json.url);
    } catch (e) {
      toast(t(e instanceof Error ? e.message : 'Upload failed'), 'error');
    } finally {
      setBusy(false);
      resetInput();
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    choose(e.dataTransfer.files?.[0]);
  };

  const applyUrl = () => {
    if (!/^https?:\/\/\S+$/.test(url.trim())) return toast(t('Enter an http(s) image URL'), 'error');
    onChange(url.trim());
    setUrl('');
    setUrlMode(false);
  };

  const cover = variant === 'cover';

  return (
    <div>
      {label && <div className="label">{label}</div>}
      <input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={(e) => choose(e.target.files?.[0])} />
      {cropMode && (
        <ImageCrop
          file={pending}
          mode={cropMode}
          onCancel={closeCrop}
          onDone={(f) => {
            closeCrop();
            upload(f);
          }}
          onSkip={() => {
            const f = pending;
            closeCrop();
            upload(f ?? undefined);
          }}
        />
      )}
      {value ? (
        <div className={cn('group relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50', cover ? 'h-28' : 'flex h-20 items-center justify-center')}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className={cover ? 'h-full w-full object-cover' : 'max-h-14 max-w-[80%] object-contain'} />
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition group-hover:opacity-100">
            <button type="button" onClick={() => input.current?.click()} className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100">
              <UploadCloud className="h-3.5 w-3.5" /> {t('Replace')}
            </button>
            <button type="button" onClick={() => onChange('')} className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50">
              <Trash2 className="h-3.5 w-3.5" /> {t('Remove')}
            </button>
          </div>
          {busy && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/70">
              <Spinner className="text-brand-600" />
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          className={cn(
            'flex w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed text-center transition',
            cover ? 'h-28' : 'h-20',
            over ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-600 hover:border-brand-300 hover:bg-brand-50/40 hover:text-brand-600',
          )}
        >
          {busy ? (
            <Spinner className="text-brand-600" />
          ) : (
            <>
              <ImagePlus className="h-5 w-5" />
              <span className="text-xs font-medium">{over ? t('Drop to upload') : cover ? t('Upload cover image') : t('Upload logo')}</span>
              <span className="text-[10px]">{cropMode ? t('PNG, JPG, GIF, WebP · crop after choosing') : cover ? t('PNG, JPG, GIF, WebP · max 2 MB · ~1200×300') : t('PNG, JPG, GIF, WebP · max 2 MB')}</span>
            </>
          )}
        </button>
      )}
      {urlMode ? (
        <div className="mt-1.5 flex gap-1.5">
          <input className="input h-8 py-1 text-xs" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/image.png" dir="ltr" onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), applyUrl())} autoFocus />
          <button type="button" onClick={applyUrl} className="rounded-md bg-slate-900 px-2.5 text-xs font-medium text-white">
            {t('Use')}
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setUrlMode(true)} className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-900">
          <Link2 className="h-3 w-3" /> {t('or use an image URL')}
        </button>
      )}
    </div>
  );
}
