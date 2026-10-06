'use client';

import { Download, QrCode } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useT } from './i18n';
import { Button } from './ui';

export interface QrLink {
  key: string;
  label: string;
  url: string;
}

/** QR code for any of the form's links, generated in the browser, downloadable as PNG or SVG. */
export function QrPanel({ links, fileName }: { links: QrLink[]; fileName: string }) {
  const t = useT();
  const [key, setKey] = useState(links[0]?.key);
  const [svg, setSvg] = useState('');
  const link = links.find((l) => l.key === key) ?? links[0];

  useEffect(() => {
    if (!links.some((l) => l.key === key)) setKey(links[0]?.key);
  }, [links, key]);

  const url = link?.url;
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0f172a', light: '#ffffff' } }).then((s) => {
      if (!cancelled) setSvg(s);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!link) return null;
  const base = `${fileName.replace(/[^\w-]+/g, '-').toLowerCase()}-qr`;

  const download = async (type: 'png' | 'svg') => {
    const a = document.createElement('a');
    if (type === 'png') {
      a.href = await QRCode.toDataURL(link.url, { width: 1024, margin: 2, errorCorrectionLevel: 'M' });
    } else {
      a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    }
    a.download = `${base}.${type}`;
    a.click();
    if (type === 'svg') setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <section className="rounded-xl border border-slate-200 p-4">
      <div className="mb-3 flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <QrCode className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-900">{t('QR code')}</div>
          <div className="text-xs text-slate-500">{t('Print it on posters, tickets or slides — scanning opens the form.')}</div>
        </div>
      </div>
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div
          className="h-40 w-40 shrink-0 overflow-hidden rounded-xl bg-white p-2 ring-1 ring-slate-200 [&>svg]:h-full [&>svg]:w-full"
          // Generated locally from our own link by the qrcode library.
          dangerouslySetInnerHTML={{ __html: svg }}
          aria-label={t('QR code for {url}', { url: link.url })}
          role="img"
        />
        <div className="w-full min-w-0 flex-1 space-y-3">
          {links.length > 1 && (
            <div>
              <div className="label">{t('Link to encode')}</div>
              <div className="flex flex-wrap gap-1.5">
                {links.map((l) => (
                  <button
                    key={l.key}
                    onClick={() => setKey(l.key)}
                    className={cn(
                      'rounded-md border px-2.5 py-1 text-xs font-medium transition',
                      l.key === link.key ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:border-slate-300',
                    )}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="break-all rounded-md bg-slate-50 px-2.5 py-1.5 font-mono text-[11px] text-slate-600 ring-1 ring-inset ring-slate-100" dir="ltr">{link.url}</p>
          <div className="flex gap-1.5">
            <Button size="sm" onClick={() => download('png')} disabled={!svg}>
              <Download className="h-3.5 w-3.5" /> PNG
            </Button>
            <Button size="sm" onClick={() => download('svg')} disabled={!svg}>
              <Download className="h-3.5 w-3.5" /> SVG
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
