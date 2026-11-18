'use client';

// Settings → Notification channel setup → WhatsApp: link the workspace's WhatsApp to this server by scanning a QR
// (like WhatsApp Web), then send response alerts and PDF / Excel reports from FormCraft.
import { AlertTriangle, CheckCircle2, Link2, Send, Unlink } from 'lucide-react';
import QRCode from 'qrcode';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/i18n';
import { useToast } from '@/components/toast';
import { Button, Spinner, Switch } from '@/components/ui';
import type { RedactedSettings } from '@/lib/settings';
import { cn } from '@/lib/utils';
import { Field, SettingsCard, sendJson } from './settings-ui';

interface WaState {
  status: 'off' | 'connecting' | 'qr' | 'on';
  qr: string | null;
  me: string | null;
  error: string | null;
}

export function WhatsAppCard({ whatsapp: initial }: { whatsapp: RedactedSettings['whatsapp'] }) {
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const [cfg, setCfg] = useState(initial);
  const [wa, setWa] = useState<WaState | null>(null);
  const [qrImg, setQrImg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [testTo, setTestTo] = useState('');

  const load = useCallback(
    () =>
      fetch('/api/admin/whatsapp', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: WaState | null) => d && setWa(d))
        .catch(() => {}),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);

  // While linking, check every 2 s: the QR changes about every 20 s and turns into "linked" once scanned.
  useEffect(() => {
    if (!wa || (wa.status !== 'qr' && wa.status !== 'connecting')) return;
    const iv = setInterval(() => document.visibilityState === 'visible' && void load(), 2000);
    return () => clearInterval(iv);
  }, [wa, load]);

  useEffect(() => {
    if (wa?.status === 'qr' && wa.qr) {
      QRCode.toDataURL(wa.qr, { width: 520, margin: 1, errorCorrectionLevel: 'L' }).then(setQrImg, () => setQrImg(null));
    } else setQrImg(null);
  }, [wa?.status, wa?.qr]);

  async function act(action: 'link' | 'unlink') {
    if (action === 'unlink' && !confirm(t('Unlink WhatsApp? FormCraft will stop sending WhatsApp messages until it is linked again.'))) return;
    setBusy(action);
    const r = await sendJson<WaState>('/api/admin/whatsapp', 'POST', { action });
    setBusy(null);
    if (!r.ok) return toast(t(r.error!), 'error');
    setWa(r.data);
  }

  async function save() {
    setBusy('save');
    const r = await sendJson<RedactedSettings>('/api/admin/settings', 'PUT', { section: 'whatsapp', value: cfg });
    setBusy(null);
    if (!r.ok) return toast(t(r.error!), 'error');
    setCfg(r.data.whatsapp);
    toast(t('WhatsApp settings saved'));
    router.refresh();
  }

  async function test() {
    setBusy('test');
    const r = await sendJson('/api/admin/settings/test', 'POST', { channel: 'whatsapp', target: testTo });
    setBusy(null);
    toast(r.ok ? t('Test message sent!') : t(r.error!), r.ok ? 'success' : 'error');
    router.refresh();
  }

  const linked = wa?.status === 'on';

  return (
    <SettingsCard
      title={t('WhatsApp')}
      description={t('Link your WhatsApp to send response alerts and PDF / Excel reports straight to WhatsApp.')}
      icon={<WhatsAppIcon />}
      aside={<Switch checked={cfg.enabled} onChange={(v) => setCfg((x) => ({ ...x, enabled: v }))} label={t('Enable WhatsApp')} />}
      footer={
        <Button variant="primary" onClick={save} loading={busy === 'save'}>
          {t('Save WhatsApp settings')}
        </Button>
      }
    >
      <div className="grid gap-6 md:grid-cols-[1fr_280px]">
        <div className="space-y-5">
          {/* Link status */}
          {!wa ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : linked ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-emerald-50 p-4 ring-1 ring-inset ring-emerald-200">
              <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-emerald-900">{t('WhatsApp is linked')}</div>
                {wa.me && (
                  <div className="font-mono text-sm text-emerald-800" dir="ltr">
                    +{wa.me}
                  </div>
                )}
              </div>
              <Button onClick={() => act('unlink')} loading={busy === 'unlink'} className="text-rose-700">
                <Unlink className="h-4 w-4" /> {t('Unlink')}
              </Button>
            </div>
          ) : wa.status === 'qr' && qrImg ? (
            <div className="flex flex-col items-center gap-3 rounded-xl bg-white p-4 text-center ring-1 ring-inset ring-slate-200">
              {/* Generated locally from WhatsApp's own pairing code. */}
              <img src={qrImg} alt={t('WhatsApp link QR code')} className="h-64 w-64 rounded-lg ring-1 ring-slate-200" />
              <p className="max-w-sm text-sm text-slate-700">{t('On your phone open WhatsApp → Settings → Linked devices → Link a device, and scan this code.')}</p>
            </div>
          ) : wa.status === 'connecting' || wa.status === 'qr' ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-700">
              <Spinner /> {t('Connecting to WhatsApp…')}
            </div>
          ) : (
            <div className="space-y-2">
              <Button variant="primary" className="w-full" onClick={() => act('link')} loading={busy === 'link'}>
                <Link2 className="h-4 w-4" /> {t('Link WhatsApp')}
              </Button>
              {wa.error === 'logged_out' && <p className="text-sm font-medium text-amber-800">{t('WhatsApp was unlinked from the phone. Link it again to keep sending.')}</p>}
              {wa.error && wa.error !== 'logged_out' && <p className="text-sm font-medium text-rose-700">{wa.error}</p>}
            </div>
          )}

          <div className={cn('space-y-5 transition', !cfg.enabled && 'opacity-60')}>
            <Field label={t('Default country code')} hint={t('Used for numbers typed without a country code, e.g. 971 for UAE, 91 for India.')}>
              <div className="flex max-w-[180px] items-center gap-1.5">
                <span className="text-sm font-semibold text-slate-700">+</span>
                <input
                  className="input"
                  inputMode="numeric"
                  value={cfg.defaultCountryCode}
                  onChange={(e) => setCfg((x) => ({ ...x, defaultCountryCode: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                  placeholder="971"
                  dir="ltr"
                />
              </div>
            </Field>
            <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-slate-300 p-3">
              <Field label={t('Send a test message to')} className="min-w-[220px] flex-1">
                <input className="input" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="+971 50 123 4567" dir="ltr" inputMode="tel" />
              </Field>
              <Button onClick={test} loading={busy === 'test'} disabled={!initial.enabled || !linked || !testTo.trim()}>
                <Send className="h-4 w-4" /> {t('Send test')}
              </Button>
              {(!initial.enabled || !linked) && <p className="w-full text-xs text-slate-600">{t('Link WhatsApp, enable it and save to send a test.')}</p>}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <ol className="space-y-2.5 rounded-lg bg-slate-50 p-4 text-sm leading-relaxed text-slate-700 ring-1 ring-inset ring-slate-200">
            <li className="font-semibold text-slate-900">{t('How it works')}</li>
            <li>{t('1. Press Link WhatsApp and scan the QR from the phone (Linked devices).')}</li>
            <li>{t('2. Turn on WhatsApp, set your country code and save.')}</li>
            <li>{t('3. Each user adds their WhatsApp number in My profile and picks whether alerts include the response as PDF or Excel.')}</li>
            <li>{t('4. On any form’s Responses page, use Send via WhatsApp to share a PDF or Excel report.')}</li>
          </ol>
          <p className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 ring-1 ring-inset ring-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t('This works like WhatsApp Web and is not an official WhatsApp API. Use a business number, and avoid sending many messages to people who did not expect them — WhatsApp may block numbers that look like spam.')}</span>
          </p>
        </div>
      </div>
    </SettingsCard>
  );
}

export function WhatsAppIcon({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.48-1.75-1.65-2.05-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.5h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.21 3.08.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35zM12.04 21.5h-.01a9.47 9.47 0 0 1-4.83-1.32l-.35-.21-3.59.94.96-3.5-.23-.36a9.45 9.45 0 0 1-1.45-5.05c0-5.23 4.26-9.49 9.5-9.49 2.54 0 4.92.99 6.71 2.79a9.43 9.43 0 0 1 2.78 6.71c0 5.24-4.26 9.49-9.49 9.49zm8.08-17.57A11.35 11.35 0 0 0 12.04.58C5.74.58.62 5.7.62 12c0 2.01.53 3.98 1.53 5.71L.53 23.62l6.05-1.59a11.4 11.4 0 0 0 5.46 1.39h.01c6.3 0 11.42-5.12 11.42-11.42 0-3.05-1.19-5.92-3.35-8.07z" />
    </svg>
  );
}
