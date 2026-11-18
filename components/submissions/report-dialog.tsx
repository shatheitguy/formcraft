'use client';

// Response report: pick which responses and PDF or Excel, then download it or send it over WhatsApp.
import { Download, FileSpreadsheet, FileText, Send } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useT } from '@/components/i18n';
import { WhatsAppIcon } from '@/components/settings/whatsapp-card';
import { useToast } from '@/components/toast';
import { Button, Modal } from '@/components/ui';
import { cn } from '@/lib/utils';

export interface ReportScope {
  key: string;
  label: string;
  /** null = every response of the form */
  ids: string[] | null;
  count: number;
}

export interface WhatsAppInfo {
  /** Linked and turned on by an admin. */
  enabled: boolean;
  /** The signed-in user's own saved number, used as the default recipient. */
  myNumber: string;
  isAdmin: boolean;
}

export function ReportDialog({
  open,
  onClose,
  formId,
  scopes,
  whatsapp,
  initialMode = 'download',
}: {
  open: boolean;
  onClose: () => void;
  formId: string;
  scopes: ReportScope[];
  whatsapp: WhatsAppInfo;
  initialMode?: 'download' | 'whatsapp';
}) {
  const t = useT();
  const toast = useToast();
  const [scopeKey, setScopeKey] = useState(scopes[0]?.key ?? '');
  const [format, setFormat] = useState<'pdf' | 'xlsx'>('pdf');
  const [mode, setMode] = useState(initialMode);
  const [to, setTo] = useState(whatsapp.myNumber);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setScopeKey(scopes[0]?.key ?? '');
      setMode(initialMode);
      setTo((x) => x || whatsapp.myNumber);
    }
    // Reset only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const scope = scopes.find((s) => s.key === scopeKey) ?? scopes[0];
  const tooManyForPdf = format === 'pdf' && (scope?.count ?? 0) > 500;

  async function run() {
    if (!scope) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/forms/${formId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format, ids: scope.ids ?? undefined, action: mode, to, note }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(typeof j.error === 'string' ? j.error : `Request failed (${res.status})`);
      }
      if (mode === 'download') {
        const blob = await res.blob();
        const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? `responses.${format}`;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        toast(t('Report downloaded'));
      } else {
        const j = await res.json();
        toast(t('Report sent to {to} on WhatsApp', { to: j.to }));
      }
      onClose();
    } catch (e) {
      toast(t(e instanceof Error ? e.message : 'Something went wrong'), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('Share a report')}
      description={t('Make a PDF or Excel file of the responses, then download it or send it on WhatsApp.')}
      footer={
        <>
          <Button onClick={onClose}>{t('Cancel')}</Button>
          <Button variant="primary" onClick={run} loading={busy} disabled={!scope || tooManyForPdf || (mode === 'whatsapp' && (!whatsapp.enabled || !to.trim()))}>
            {mode === 'download' ? (
              <>
                <Download className="h-4 w-4" /> {t('Download')}
              </>
            ) : (
              <>
                <Send className="h-4 w-4" /> {t('Send on WhatsApp')}
              </>
            )}
          </Button>
        </>
      }
    >
      <div className="space-y-5 p-5">
        {/* Which responses */}
        {scopes.length > 1 && (
          <div>
            <div className="label">{t('Responses to include')}</div>
            <div className="flex flex-wrap gap-2">
              {scopes.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setScopeKey(s.key)}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm font-medium ring-1 ring-inset transition',
                    s.key === scope?.key ? 'bg-brand-600 text-onaccent ring-brand-600' : 'bg-white text-slate-800 ring-slate-300 hover:bg-slate-50',
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {scopes.length === 1 && scope && <p className="text-sm font-medium text-slate-800">{scope.label}</p>}

        {/* Format */}
        <div>
          <div className="label">{t('File type')}</div>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                { v: 'pdf', icon: FileText, title: 'PDF', hint: t('Easy to read and print') },
                { v: 'xlsx', icon: FileSpreadsheet, title: t('Excel'), hint: t('Every response as a row') },
              ] as const
            ).map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setFormat(o.v)}
                className={cn(
                  'flex items-center gap-3 rounded-xl p-3 text-start ring-1 ring-inset transition',
                  format === o.v ? 'bg-brand-50 ring-2 ring-brand-500' : 'bg-white ring-slate-300 hover:bg-slate-50',
                )}
              >
                <o.icon className={cn('h-6 w-6 shrink-0', o.v === 'pdf' ? 'text-rose-600' : 'text-emerald-600')} />
                <span>
                  <span className="block text-sm font-semibold text-slate-900">{o.title}</span>
                  <span className="block text-xs text-slate-600">{o.hint}</span>
                </span>
              </button>
            ))}
          </div>
          {tooManyForPdf && <p className="mt-2 text-sm font-medium text-rose-700">{t('PDF reports are limited to 500 responses. Filter the list or use Excel.')}</p>}
          {format === 'pdf' && <p className="mt-2 text-xs text-slate-600">{t('PDF shows Latin text; for Arabic or Tamil answers choose Excel.')}</p>}
        </div>

        {/* Download or WhatsApp */}
        <div>
          <div className="label">{t('Then')}</div>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setMode('download')}
              className={cn('flex items-center justify-center gap-2 rounded-xl p-3 text-sm font-semibold ring-1 ring-inset transition', mode === 'download' ? 'bg-brand-50 text-brand-800 ring-2 ring-brand-500' : 'bg-white text-slate-800 ring-slate-300 hover:bg-slate-50')}
            >
              <Download className="h-4 w-4" /> {t('Download')}
            </button>
            <button
              type="button"
              onClick={() => setMode('whatsapp')}
              className={cn('flex items-center justify-center gap-2 rounded-xl p-3 text-sm font-semibold ring-1 ring-inset transition', mode === 'whatsapp' ? 'bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500' : 'bg-white text-slate-800 ring-slate-300 hover:bg-slate-50')}
            >
              <WhatsAppIcon className="h-4 w-4 text-emerald-600" /> {t('Send on WhatsApp')}
            </button>
          </div>
        </div>

        {mode === 'whatsapp' &&
          (whatsapp.enabled ? (
            <div className="space-y-4 rounded-xl bg-emerald-50/50 p-4 ring-1 ring-inset ring-emerald-200">
              <div>
                <label className="label" htmlFor="wa-to">
                  {t('WhatsApp number')}
                </label>
                <input id="wa-to" className="input" value={to} onChange={(e) => setTo(e.target.value)} placeholder="+971 50 123 4567" dir="ltr" inputMode="tel" />
                <p className="mt-1.5 text-xs text-slate-600">{t('With country code. The file arrives from the workspace’s linked WhatsApp.')}</p>
              </div>
              <div>
                <label className="label" htmlFor="wa-note">
                  {t('Message (optional)')}
                </label>
                <textarea id="wa-note" className="input min-h-[72px]" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder={t('e.g. Today’s registrations attached.')} />
              </div>
            </div>
          ) : (
            <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
              {t('WhatsApp isn’t linked for this workspace yet.')}{' '}
              {whatsapp.isAdmin ? (
                <Link href="/settings/notifications" className="font-semibold underline">
                  {t('Link it in Settings → Notification channel setup')}
                </Link>
              ) : (
                t('Ask an admin to link it in Settings → Notification channel setup.')
              )}
            </p>
          ))}
      </div>
    </Modal>
  );
}
