'use client';

import { AlertTriangle, ArchiveRestore, Download, FileArchive, ShieldCheck, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useI18n } from '@/components/i18n';
import { useToast } from '@/components/toast';
import { Button, Modal } from '@/components/ui';
import { fmtNumber } from '@/lib/i18n';
import { formatDateTime } from '@/lib/utils';
import { SettingsCard, rich } from './settings-ui';

interface Preview {
  createdAt: string;
  provider: string;
  counts: Record<string, number>;
}

const LABELS: Record<string, string> = {
  form: 'Forms',
  submission: 'Responses',
  user: 'Users',
  formAccess: 'Form access rules',
  setting: 'Settings',
  notificationLog: 'Alert log entries',
  uploads: 'Uploaded images',
};

/** Reads just the summary of a .fcbackup file in the browser before anything is uploaded. */
async function readPreview(file: File): Promise<Preview> {
  const stream = file.stream().pipeThrough(new DecompressionStream('gzip'));
  const json = JSON.parse(await new Response(stream).text());
  if (json?.format !== 'formcraft-system-backup') throw new Error('This is not a FormCraft system backup.');
  return { createdAt: json.createdAt, provider: json.provider, counts: json.counts ?? {} };
}

export function SystemBackupCard() {
  const toast = useToast();
  const { t, locale } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirm, setConfirm] = useState('');
  const [restoring, setRestoring] = useState(false);

  async function pick(f: File | undefined) {
    if (input.current) input.current.value = '';
    if (!f) return;
    try {
      setPreview(await readPreview(f));
      setFile(f);
      setConfirm('');
    } catch (e) {
      toast(e instanceof Error && e.message.includes('FormCraft') ? t(e.message) : t('Could not read that file — choose a .fcbackup file.'), 'error');
    }
  }

  async function restore() {
    if (!file) return;
    setRestoring(true);
    const body = new FormData();
    body.append('file', file);
    body.append('confirm', confirm);
    const res = await fetch('/api/admin/backup', { method: 'POST', body }).catch(() => null);
    const json = await res?.json().catch(() => ({}));
    setRestoring(false);
    if (!res?.ok) return toast(t(json?.error ?? 'Restore failed'), 'error');
    toast(t('Restore complete — sign in with an account from the backup'));
    setTimeout(() => (window.location.href = '/login'), 1200);
  }

  const close = () => {
    setFile(null);
    setPreview(null);
  };

  return (
    <>
      <SettingsCard title={t('Full system backup')} description={t('Everything needed to rebuild this FormCraft instance, in one file.')} icon={<FileArchive />}>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-col rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Download className="h-4 w-4 text-brand-600" /> {t('Download backup')}
            </div>
            <p className="mt-1 flex-1 text-xs text-slate-500">
              {t('Users and roles, forms, responses, branding, notification settings and all uploaded images. Works with SQLite and PostgreSQL, and can move data between them.')}
            </p>
            <a
              href="/api/admin/backup"
              className="mt-3 inline-flex h-8 items-center gap-1.5 self-start rounded-lg bg-brand-600 px-3 text-sm font-medium text-onaccent shadow-sm hover:bg-brand-700"
            >
              <Download className="h-4 w-4" /> {t('Download {ext}', { ext: '.fcbackup' })}
            </a>
          </div>
          <div className="flex flex-col rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <ArchiveRestore className="h-4 w-4 text-brand-600" /> {t('Restore from backup')}
            </div>
            <p className="mt-1 flex-1 text-xs text-slate-500">{t('Replaces all current data with the backup. A safety snapshot of the current data is saved on the server first.')}</p>
            <input ref={input} type="file" accept=".fcbackup,application/gzip" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
            <Button className="mt-3 self-start" onClick={() => input.current?.click()}>
              <Upload className="h-4 w-4" /> {t('Choose backup file…')}
            </Button>
          </div>
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-700">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t('Backups contain password hashes and your SMTP / Telegram credentials. Store them somewhere private.')}
        </p>
      </SettingsCard>

      <Modal
        open={!!preview}
        onClose={close}
        size="sm"
        title={t('Restore this backup?')}
        description={file?.name}
        footer={
          <>
            <Button onClick={close}>{t('Cancel')}</Button>
            <Button variant="danger" onClick={restore} loading={restoring} disabled={confirm !== 'RESTORE'}>
              {t('Restore & replace everything')}
            </Button>
          </>
        }
      >
        {preview && (
          <div className="space-y-4 px-6 py-5 text-sm">
            <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-inset ring-slate-100">
              <div className="text-xs text-slate-500">
                {t('Created {date} · from {engine}', {
                  date: formatDateTime(preview.createdAt, locale),
                  engine: preview.provider === 'postgresql' ? 'PostgreSQL' : 'SQLite',
                })}
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                {Object.entries(LABELS).map(([k, label]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <dt className="text-slate-500">{t(label)}</dt>
                    <dd className="font-semibold tabular-nums text-slate-900">{fmtNumber(preview.counts[k] ?? 0, locale)}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <p className="flex gap-2 rounded-lg bg-rose-50 p-3 text-xs text-rose-800 ring-1 ring-inset ring-rose-200">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {t('All current forms, responses, users and settings will be replaced. Everyone, including you, will be signed out and must sign in with an account from this backup.')}
            </p>
            <div>
              <label className="label">
                {rich(t('Type {word} to confirm'), {
                  word: (
                    <span className="font-mono text-rose-600" dir="ltr">
                      RESTORE
                    </span>
                  ),
                })}
              </label>
              <input className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" dir="ltr" />
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
