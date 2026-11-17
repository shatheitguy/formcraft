'use client';

// Crop & resize a picture before it is uploaded, like WhatsApp's photo crop: the whole picture shows behind a
// frame, the part outside the frame is darkened. Drag to move; pinch, scroll or use the slider to zoom; rotate in
// 90° steps; pick an aspect ratio (or "Free" and drag the frame's corners). Only what is inside the frame is saved,
// scaled down so its longest side is at most `maxSide`.
import { Check, RotateCcw, RotateCw, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { cn } from '@/lib/utils';
import { useT } from './i18n';
import { Button, Modal } from './ui';

export type CropRatio = number | 'original' | 'free';
export interface CropPreset {
  key: string;
  /** English label, passed through t(). */
  label: string;
  ratio: CropRatio;
}

export type CropMode = 'logo' | 'cover' | 'avatar';

export const CROP_PRESETS: Record<CropMode, { presets: CropPreset[]; initial: string; maxSide: number; round?: boolean; transparent?: boolean }> = {
  logo: {
    presets: [
      { key: 'original', label: 'Original', ratio: 'original' },
      { key: '1:1', label: 'Square 1:1', ratio: 1 },
      { key: '3:1', label: 'Wide 3:1', ratio: 3 },
      { key: 'free', label: 'Free', ratio: 'free' },
    ],
    initial: 'original',
    maxSide: 512,
    transparent: true,
  },
  // The cover renders full card width × h-36/h-44 (≈ 4:1 on desktop), so 4:1 is the default.
  cover: {
    presets: [
      { key: '4:1', label: 'Banner 4:1', ratio: 4 },
      { key: '3:1', label: '3:1', ratio: 3 },
      { key: '16:9', label: '16:9', ratio: 16 / 9 },
      { key: 'free', label: 'Free', ratio: 'free' },
    ],
    initial: '4:1',
    maxSide: 1600,
  },
  avatar: {
    presets: [{ key: '1:1', label: 'Square 1:1', ratio: 1 }],
    initial: '1:1',
    maxSide: 512,
    round: true,
  },
};

/** Types the cropper can redraw on a canvas; anything else (GIF animation, SVG) is uploaded as-is. */
export const CROPPABLE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const canCrop = (file: File) => CROPPABLE_TYPES.includes(file.type);

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ZOOM = 8;
const MIN_FRAME = 48;
const CHECKER =
  'repeating-conic-gradient(#e2e8f0 0% 25%, #ffffff 0% 50%) 50% / 16px 16px';

type Box = { w: number; h: number };

export function ImageCrop({
  file,
  mode = 'logo',
  onCancel,
  onDone,
  onSkip,
}: {
  /** The picked file; the dialog is open while this is set. */
  file: File | null;
  mode?: CropMode;
  onCancel: () => void;
  /** The cropped, resized image, ready to upload. */
  onDone: (file: File) => void;
  /** "Use original": upload the picked file untouched. */
  onSkip?: () => void;
}) {
  const t = useT();
  const cfg = CROP_PRESETS[mode];
  const [src, setSrc] = useState('');
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [preset, setPreset] = useState(cfg.initial);
  const [rot, setRot] = useState(0); // quarter turns clockwise
  const [zoom, setZoom] = useState(1); // 1 = the picture just covers the frame
  const [off, setOff] = useState({ x: 0, y: 0 }); // picture centre relative to frame centre, stage px
  const [free, setFree] = useState<Box | null>(null);
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
  const [stage, setStage] = useState<Box>({ w: 480, h: 320 });
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ ox: number; oy: number; x: number; y: number; dist: number; zoom: number } | null>(null);
  const resize = useRef<{ x: number; y: number; w: number; h: number; sx: number; sy: number } | null>(null);

  // Load the picked file.
  useEffect(() => {
    setImg(null);
    setFailed(false);
    setPreset(cfg.initial);
    setRot(0);
    setZoom(1);
    setOff({ x: 0, y: 0 });
    setFree(null);
    if (!file) return;
    const u = URL.createObjectURL(file);
    setSrc(u);
    const i = new Image();
    i.onload = () => setImg(i);
    i.onerror = () => setFailed(true);
    i.src = u;
    return () => URL.revokeObjectURL(u);
  }, [file, cfg.initial]);

  // Track the stage size (it follows the dialog width).
  useEffect(() => {
    if (!stageEl) return;
    const measure = () => {
      const w = stageEl.clientWidth || 480;
      setStage({ w, h: Math.round(Math.min(380, Math.max(220, w * 0.66))) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stageEl);
    return () => ro.disconnect();
  }, [stageEl]);

  // ---- geometry ----
  const iw = img?.naturalWidth || 1;
  const ih = img?.naturalHeight || 1;
  const rw = rot % 2 ? ih : iw; // size once rotated
  const rh = rot % 2 ? iw : ih;
  const maxW = stage.w * 0.9;
  const maxH = stage.h * 0.86;
  const fit = (r: number): Box => {
    let w = maxW;
    let h = w / r;
    if (h > maxH) {
      h = maxH;
      w = h * r;
    }
    return { w, h };
  };
  const current = cfg.presets.find((p) => p.key === preset) ?? cfg.presets[0];
  const frame: Box =
    current.ratio === 'free'
      ? free
        ? { w: Math.min(maxW, Math.max(MIN_FRAME, free.w)), h: Math.min(maxH, Math.max(MIN_FRAME, free.h)) }
        : fit(rw / rh)
      : fit(current.ratio === 'original' ? rw / rh : current.ratio);
  const cover = Math.max(frame.w / rw, frame.h / rh);
  const minZoom = Math.min(frame.w / rw, frame.h / rh) / cover; // the whole picture inside the frame
  const z = Math.min(MAX_ZOOM, Math.max(minZoom, zoom));
  const s = cover * z; // stage px per image px
  const dispW = rw * s;
  const dispH = rh * s;
  const clampOff = useCallback(
    (o: { x: number; y: number }) => {
      const mx = Math.abs(dispW - frame.w) / 2;
      const my = Math.abs(dispH - frame.h) / 2;
      return { x: Math.min(mx, Math.max(-mx, o.x)), y: Math.min(my, Math.max(-my, o.y)) };
    },
    [dispW, dispH, frame.w, frame.h],
  );
  const o = clampOff(off);
  const clampZ = (v: number) => Math.min(MAX_ZOOM, Math.max(minZoom, v));
  // Zoom about the frame centre: the point in the middle stays put.
  const zoomTo = (next: number) => {
    const nz = clampZ(next);
    setOff({ x: (o.x * nz) / z, y: (o.y * nz) / z });
    setZoom(nz);
  };

  // Output size: the frame in image pixels, never upscaled, capped at maxSide.
  const cw = frame.w / s;
  const ch = frame.h / s;
  const k = Math.min(1, cfg.maxSide / Math.max(cw, ch));
  const outW = Math.max(1, Math.round(cw * k));
  const outH = Math.max(1, Math.round(ch * k));
  const keepAlpha = !!file && (file.type === 'image/png' || file.type === 'image/webp' || !!cfg.transparent);

  // ---- gestures: one pointer drags, two pinch ----
  const startGesture = () => {
    const ps = [...pointers.current.values()];
    if (!ps.length) {
      gesture.current = null;
      setDragging(false);
      return;
    }
    const x = ps.reduce((n, p) => n + p.x, 0) / ps.length;
    const y = ps.reduce((n, p) => n + p.y, 0) / ps.length;
    const dist = ps.length > 1 ? Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) : 0;
    gesture.current = { ox: o.x, oy: o.y, x, y, dist, zoom: z };
    setDragging(true);
  };
  const onDown = (e: ReactPointerEvent) => {
    if (!img) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    startGesture();
  };
  const onMove = (e: ReactPointerEvent) => {
    const g = gesture.current;
    if (!g || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const ps = [...pointers.current.values()];
    const x = ps.reduce((n, p) => n + p.x, 0) / ps.length;
    const y = ps.reduce((n, p) => n + p.y, 0) / ps.length;
    let nz = g.zoom;
    if (ps.length > 1 && g.dist) nz = clampZ((g.zoom * Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y)) / g.dist);
    const f = nz / g.zoom;
    setZoom(nz);
    setOff({ x: g.ox * f + x - g.x, y: g.oy * f + y - g.y });
  };
  const onUp = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId);
    startGesture();
  };

  // Free frame: drag a corner, the frame grows/shrinks about its centre.
  const onHandleDown = (sx: number, sy: number) => (e: ReactPointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    resize.current = { x: e.clientX, y: e.clientY, w: frame.w, h: frame.h, sx, sy };
  };
  const onHandleMove = (e: ReactPointerEvent) => {
    const r = resize.current;
    if (!r) return;
    e.stopPropagation();
    setFree({
      w: Math.min(maxW, Math.max(MIN_FRAME, r.w + 2 * r.sx * (e.clientX - r.x))),
      h: Math.min(maxH, Math.max(MIN_FRAME, r.h + 2 * r.sy * (e.clientY - r.y))),
    });
  };
  const onHandleUp = (e: ReactPointerEvent) => {
    e.stopPropagation();
    resize.current = null;
  };

  // Mouse wheel zoom (non-passive so the dialog doesn't scroll instead).
  const wheel = useRef<(e: WheelEvent) => void>(() => {});
  wheel.current = (e: WheelEvent) => {
    e.preventDefault();
    zoomTo(z * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
  };
  useEffect(() => {
    if (!stageEl) return;
    const h = (e: WheelEvent) => wheel.current(e);
    stageEl.addEventListener('wheel', h, { passive: false });
    return () => stageEl.removeEventListener('wheel', h);
  }, [stageEl]);

  const onStageKey = (e: ReactKeyboardEvent) => {
    const step = e.shiftKey ? 40 : 10;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      e.preventDefault();
      setOff(clampOff({ x: o.x + moves[e.key][0], y: o.y + moves[e.key][1] }));
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoomTo(z * 1.2);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      zoomTo(z / 1.2);
    }
  };

  const rotate = (dir: 1 | -1) => {
    setRot((r) => (r + dir + 4) % 4);
    setZoom(1);
    setOff({ x: 0, y: 0 });
    setFree(null);
  };
  const reset = () => {
    setZoom(1);
    setOff({ x: 0, y: 0 });
    setRot(0);
    setFree(null);
  };
  const choosePreset = (key: string) => {
    if (key === 'free' && preset !== 'free') setFree(frame);
    setPreset(key);
  };

  // ---- export ----
  const draw = (type: string, quality?: number) =>
    new Promise<Blob | null>((resolve) => {
      if (!img) return resolve(null);
      const c = document.createElement('canvas');
      c.width = outW;
      c.height = outH;
      const g = c.getContext('2d');
      if (!g) return resolve(null);
      if (type === 'image/jpeg') {
        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, outW, outH);
      }
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      const m = outW / frame.w; // stage px -> output px
      g.translate(outW / 2 + o.x * m, outH / 2 + o.y * m);
      g.rotate((rot * Math.PI) / 2);
      const w = iw * s * m;
      const h = ih * s * m;
      g.drawImage(img, -w / 2, -h / 2, w, h);
      c.toBlob(resolve, type, quality);
    });

  const apply = async () => {
    if (!img || !file || busy) return;
    setBusy(true);
    try {
      const tries: [string, number | undefined][] = keepAlpha
        ? file.type === 'image/webp'
          ? [['image/webp', 0.9], ['image/png', undefined], ['image/jpeg', 0.85]]
          : [['image/png', undefined], ['image/webp', 0.9], ['image/jpeg', 0.85]]
        : [['image/jpeg', 0.9], ['image/jpeg', 0.8]];
      let blob: Blob | null = null;
      for (const [type, q] of tries) {
        blob = await draw(type, q);
        if (blob && blob.size <= MAX_BYTES) break;
      }
      if (!blob) return;
      const ext = { 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg' }[blob.type] ?? 'png';
      const base = file.name.replace(/\.[^.]+$/, '') || 'image';
      onDone(new File([blob], `${base}-cropped.${ext}`, { type: blob.type || 'image/png' }));
    } finally {
      setBusy(false);
    }
  };

  // Enter applies (unless a button / text field has focus and handles it itself).
  const applyRef = useRef(apply);
  applyRef.current = apply;
  useEffect(() => {
    if (!file) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.defaultPrevented) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'range'))) return;
      e.preventDefault();
      applyRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [file]);

  const fx = (stage.w - frame.w) / 2;
  const fy = (stage.h - frame.h) / 2;
  const round = !!cfg.round;
  const handles: [number, number][] = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ];

  return (
    <Modal
      open={!!file}
      onClose={onCancel}
      size={mode === 'cover' ? 'lg' : 'md'}
      title={t('Crop & resize')}
      description={t('Drag to move · pinch, scroll or use the slider to zoom')}
      footer={
        <>
          {onSkip && (
            <Button variant="ghost" onClick={onSkip} disabled={busy} className="me-auto !text-slate-700">
              {t('Use original')}
            </Button>
          )}
          <Button onClick={onCancel} disabled={busy}>
            {t('Cancel')}
          </Button>
          <Button variant="primary" onClick={apply} disabled={!img} loading={busy}>
            {!busy && <Check className="h-4 w-4" />} {t('Apply')}
          </Button>
        </>
      }
    >
      <div className="space-y-4 px-4 py-4 sm:px-6">
        {cfg.presets.length > 1 && (
          <div role="radiogroup" aria-label={t('Aspect ratio')} className="flex flex-wrap gap-1.5">
            {cfg.presets.map((p) => (
              <button
                key={p.key}
                type="button"
                role="radio"
                aria-checked={preset === p.key}
                onClick={() => choosePreset(p.key)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/30',
                  preset === p.key ? 'border-brand-600 bg-brand-600 text-onaccent' : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:text-slate-900',
                )}
              >
                {t(p.label)}
              </button>
            ))}
          </div>
        )}

        <div
          ref={setStageEl}
          tabIndex={0}
          role="application"
          aria-label={t('Crop area. Arrow keys move the picture, + and − zoom.')}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onKeyDown={onStageKey}
          style={{ height: stage.h }}
          className={cn(
            'relative w-full touch-none select-none overflow-hidden rounded-xl bg-slate-900 outline-none focus-visible:ring-4 focus-visible:ring-brand-500/40',
            img && (dragging ? 'cursor-grabbing' : 'cursor-grab'),
          )}
        >
          {failed ? (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm font-medium text-white">{t('This image could not be opened.')}</div>
          ) : !img ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm font-medium text-white">{t('Loading…')}</div>
          ) : (
            <>
              {/* what empty parts of the frame become: transparent (checkerboard) or white */}
              <div
                className={cn('pointer-events-none absolute', round && 'rounded-full')}
                style={{ left: fx, top: fy, width: frame.w, height: frame.h, background: keepAlpha ? CHECKER : '#ffffff' }}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt=""
                draggable={false}
                className="pointer-events-none absolute max-w-none"
                style={{
                  left: stage.w / 2 + o.x,
                  top: stage.h / 2 + o.y,
                  width: iw * s,
                  height: ih * s,
                  transform: `translate(-50%, -50%) rotate(${rot * 90}deg)`,
                }}
              />
              {/* the frame: darkened outside, thirds grid inside */}
              <div
                className={cn('pointer-events-none absolute ring-2 ring-white', round ? 'rounded-full' : 'rounded-sm')}
                style={{ left: fx, top: fy, width: frame.w, height: frame.h, boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.62)' }}
              >
                {!round && (
                  <div className={cn('absolute inset-0 transition-opacity', dragging ? 'opacity-100' : 'opacity-0')}>
                    <div className="absolute inset-y-0 left-1/3 w-px bg-white/60" />
                    <div className="absolute inset-y-0 left-2/3 w-px bg-white/60" />
                    <div className="absolute inset-x-0 top-1/3 h-px bg-white/60" />
                    <div className="absolute inset-x-0 top-2/3 h-px bg-white/60" />
                  </div>
                )}
              </div>
              {preset === 'free' &&
                handles.map(([sx, sy]) => (
                  <div
                    key={`${sx}${sy}`}
                    onPointerDown={onHandleDown(sx, sy)}
                    onPointerMove={onHandleMove}
                    onPointerUp={onHandleUp}
                    onPointerCancel={onHandleUp}
                    className={cn('absolute h-7 w-7 touch-none', sx * sy > 0 ? 'cursor-nwse-resize' : 'cursor-nesw-resize')}
                    style={{ left: stage.w / 2 + (sx * frame.w) / 2 - 14, top: stage.h / 2 + (sy * frame.h) / 2 - 14 }}
                  >
                    <span
                      className="absolute h-3.5 w-3.5 border-white"
                      style={{
                        left: sx < 0 ? 12 : 'auto',
                        right: sx > 0 ? 12 : 'auto',
                        top: sy < 0 ? 12 : 'auto',
                        bottom: sy > 0 ? 12 : 'auto',
                        borderLeftWidth: sx < 0 ? 3 : 0,
                        borderRightWidth: sx > 0 ? 3 : 0,
                        borderTopWidth: sy < 0 ? 3 : 0,
                        borderBottomWidth: sy > 0 ? 3 : 0,
                      }}
                    />
                  </div>
                ))}
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => zoomTo(z / 1.2)}
            disabled={!img}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-800 hover:bg-slate-200 disabled:opacity-50"
            aria-label={t('Zoom out')}
            title={t('Zoom out')}
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <input
            type="range"
            min={minZoom}
            max={MAX_ZOOM}
            step={0.01}
            value={z}
            disabled={!img}
            onChange={(e) => zoomTo(Number(e.target.value))}
            className="h-2 flex-1 accent-brand-600"
            aria-label={t('Zoom')}
          />
          <button
            type="button"
            onClick={() => zoomTo(z * 1.2)}
            disabled={!img}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-800 hover:bg-slate-200 disabled:opacity-50"
            aria-label={t('Zoom in')}
            title={t('Zoom in')}
          >
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1.5">
            <Button size="xs" onClick={() => rotate(-1)} disabled={!img} aria-label={t('Rotate left')} title={t('Rotate left')}>
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
            <Button size="xs" onClick={() => rotate(1)} disabled={!img} aria-label={t('Rotate right')} title={t('Rotate right')}>
              <RotateCw className="h-3.5 w-3.5" />
            </Button>
            <Button size="xs" onClick={() => zoomTo(minZoom)} disabled={!img}>
              {t('Fit')}
            </Button>
            <Button size="xs" onClick={reset} disabled={!img}>
              {t('Reset')}
            </Button>
          </div>
          {img && (
            <span className="text-xs font-medium tabular-nums text-slate-700">
              {t('Saved size: {w} × {h} px', { w: outW, h: outH })}
            </span>
          )}
        </div>
      </div>
    </Modal>
  );
}
