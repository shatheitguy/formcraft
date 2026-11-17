'use client';

import { AlertTriangle, ArchiveRestore, CheckCircle2, DatabaseBackup, Download, HardDrive, Play, Trash2, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useI18n } from '@/components/i18n';
import { useToast } from '@/components/toast';
import { Button, ConfirmDialog, Modal, Segmented, Switch } from '@/components/ui';
import { fmtNumber } from '@/lib/i18n';
import { cn, formatDateTime, intlLocale } from '@/lib/utils';
import { Field, SettingsCard, ToggleField, rich, sendJson } from './settings-ui';

type Frequency = 'hourly' | 'daily' | 'weekly';

interface Config {
  enabled: boolean;
  frequency: Frequency;
  time: string;
  weekday: number;
  keep: number;
  includeUploads: boolean;
}

interface Stored {
  name: string;
  size: number;
  createdAt: string;
  kind: 'auto' | 'manual' | 'snapshot';
}

interface Overview {
  backups: Stored[];
  dir: string;
  settings: Config;
  state: {
    lastSuccessAt: string | null;
    lastResult: null | { ok: boolean; at: string; size?: number; forms?: number; submissions?: number; error?: string };
  };
}

const fmtBytes = (n: number) => {
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
};

const KIND_LABELS = { auto: 'Automatic', manual: 'Manual', snapshot: 'Before restore' } as const;

/** Settings → Database: scheduled backups of every form and response, kept on the server. */
export function AutoBackupCard() {
  const toast = useToast();
  const { t, locale } = useI18n();
  const num = (n: number) => fmtNumber(n, locale);
  const [data, setData] = useState<Overview | null>(null);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toRestore, setToRestore] = useState<string | null>(null);
  const [confirm, setConfirm] = useState('');
  const [restoring, setRestoring] = useState(false);

  async function load() {
    const r = await sendJson<Overview>('/api/admin/backups', 'GET');
    if (!r.ok) return toast(t(r.error!), 'error');
    setData(r.data);
    setCfg((c) => c ?? r.data.settings);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = <K extends keyof Config>(k: K, v: Config[K]) => setCfg((c) => (c ? { ...c, [k]: v } : c));

  async function save() {
    if (!cfg) return;
    setSaving(true);
    const r = await sendJson('/api/admin/settings', 'PUT', { section: 'backup', value: cfg });
    setSaving(false);
    if (!r.ok) return toast(t(r.error!), 'error');
    toast(t('Backup schedule saved'));
    void load();
  }

  async function runNow() {
    setRunning(true);
    const r = await sendJson<Overview>('/api/admin/backups', 'POST', { action: 'run' });
    setRunning(false);
    if (!r.ok) {
      toast(r.error!, 'error');
      return load();
    }
    setData(r.data);
    toast(t('Backup created'));
  }

  async function remove() {
    if (!toDelete) return;
    setDeleting(true);
    const r = await sendJson<Overview>(`/api/admin/backups?name=${encodeURIComponent(toDelete)}`, 'DELETE');
    setDeleting(false);
    setToDelete(null);
    if (!r.ok) return toast(t(r.error!), 'error');
    setData(r.data);
    toast(t('Backup deleted'));
  }

  async function restore() {
    if (!toRestore) return;
    setRestoring(true);
    const r = await sendJson('/api/admin/backups', 'POST', { action: 'restore', name: toRestore, confirm });
    setRestoring(false);
    if (!r.ok) return toast(t(r.error!), 'error');
    toast(t('Restore complete — sign in with an account from the backup'));
    setTimeout(() => (window.location.href = '/login'), 1200);
  }

  const last = data?.state.lastResult;
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 7 + i).toLocaleDateString(intlLocale(locale), { weekday: 'long' }));

  return (
    <>
      <SettingsCard
        title={t('Automatic backups')}
        description={t('Scheduled full backups of every form (published and draft), all responses, users and settings, kept on the server.')}
        icon={<DatabaseBackup />}
        aside={
          <Button onClick={runNow} loading={running} disabled={!data}>
            <Play className="h-4 w-4" /> {t('Back up now')}
          </Button>
        }
        footer={
          <Button variant="primary" onClick={save} loading={saving} disabled={!cfg}>
            {t('Save changes')}
          </Button>
        }
      >
        {!cfg || !data ? (
          <p className="text-sm text-slate-700">{t('Loading…')}</p>
        ) : (
          <div className="space-y-5">
            {/* Last run */}
            <div
              className={cn(
                'flex items-start gap-2 rounded-lg p-3 text-sm ring-1 ring-inset',
                !last ? 'bg-slate-50 text-slate-700 ring-slate-200' : last.ok ? 'bg-emerald-50 text-emerald-900 ring-emerald-200' : 'bg-rose-50 text-rose-800 ring-rose-200',
              )}
            >
              {last && !last.ok ? <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className={cn('mt-0.5 h-4 w-4 shrink-0', !last && 'text-slate-500')} />}
              <div className="min-w-0">
                {!last ? (
                  t('No backup has run yet.')
                ) : last.ok ? (
                  t('Last backup {date} · {size} · {forms} forms / {responses} responses', {
                    date: formatDateTime(last.at, locale),
                    size: fmtBytes(last.size ?? 0),
                    forms: num(last.forms ?? 0),
                    responses: num(last.submissions ?? 0),
                  })
                ) : (
                  <>
                    <div className="font-medium">{t('Last backup failed {date}', { date: formatDateTime(last.at, locale) })}</div>
                    <div className="break-words text-xs">{last.error}</div>
                    {data.state.lastSuccessAt && <div className="text-xs">{t('Last successful backup: {date}', { date: formatDateTime(data.state.lastSuccessAt, locale) })}</div>}
                  </>
                )}
              </div>
            </div>

            {/* Schedule */}
            <ToggleField
              label={t('Back up automatically')}
              description={t('Runs in the background on the server. Missed backups run as soon as the server is back up.')}
              control={<Switch checked={cfg.enabled} onChange={(v) => set('enabled', v)} label={t('Back up automatically')} />}
            />
            <div className={cn('grid gap-4 sm:grid-cols-2', !cfg.enabled && 'opacity-60')}>
              <Field label={t('How often')} className="sm:col-span-2">
                <Segmented<Frequency>
                  value={cfg.frequency}
                  onChange={(v) => set('frequency', v)}
                  options={[
                    { value: 'hourly', label: t('Hourly') },
                    { value: 'daily', label: t('Daily') },
                    { value: 'weekly', label: t('Weekly') },
                  ]}
                />
              </Field>
              {cfg.frequency === 'weekly' && (
                <Field label={t('Day')}>
                  <select className="input" value={cfg.weekday} onChange={(e) => set('weekday', Number(e.target.value))}>
                    {weekdays.map((d, i) => (
                      <option key={i} value={i}>
                        {d}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label={cfg.frequency === 'hourly' ? t('Minute past the hour') : t('Time (server time)')}>
                {cfg.frequency === 'hourly' ? (
                  <input
                    type="number"
                    min={0}
                    max={59}
                    className="input"
                    dir="ltr"
                    value={Number(cfg.time.slice(3))}
                    onChange={(e) => set('time', `${cfg.time.slice(0, 2)}:${String(Math.min(59, Math.max(0, Math.floor(Number(e.target.value) || 0)))).padStart(2, '0')}`)}
                  />
                ) : (
                  <input type="time" className="input" dir="ltr" value={cfg.time} onChange={(e) => e.target.value && set('time', e.target.value)} />
                )}
              </Field>
              <Field label={t('Backups to keep')} hint={t('Older automatic backups are deleted. Manual backups are kept until you delete them.')}>
                <input type="number" min={1} max={365} className="input" dir="ltr" value={cfg.keep} onChange={(e) => set('keep', Math.floor(Number(e.target.value)))} />
              </Field>
            </div>
            <ToggleField
              label={t('Include uploaded files')}
              description={t('Logos, cover images and files attached to responses. Turn off to keep backup files small.')}
              control={<Switch checked={cfg.includeUploads} onChange={(v) => set('includeUploads', v)} label={t('Include uploaded files')} />}
            />

            {/* Stored backups */}
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">{t('Stored backups')}</h3>
              {data.backups.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-700">{t('No backups stored yet.')}</p>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {data.backups.map((b) => (
                    <li key={b.name} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
                      <div className="min-w-0 flex-1 basis-56">
                        <div className="text-sm font-medium text-slate-900">{formatDateTime(b.createdAt, locale)}</div>
                        <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-700">
                          <span className={cn('rounded px-1.5 py-0.5 font-medium', b.kind === 'auto' ? 'bg-brand-50 text-brand-700' : b.kind === 'manual' ? 'bg-slate-100 text-slate-800' : 'bg-amber-50 text-amber-800')}>
                            {t(KIND_LABELS[b.kind])}
                          </span>
                          <span>{fmtBytes(b.size)}</span>
                          <span className="truncate font-mono text-[11px]" dir="ltr" title={b.name}>
                            {b.name}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <a
                          href={`/api/admin/backups?download=${encodeURIComponent(b.name)}`}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                          title={t('Download')}
                        >
                          <Download className="h-4 w-4" /> <span className="hidden sm:inline">{t('Download')}</span>
                        </a>
                        <Button
                          onClick={() => {
                            setConfirm('');
                            setToRestore(b.name);
                          }}
                          title={t('Restore')}
                        >
                          <ArchiveRestore className="h-4 w-4" /> <span className="hidden sm:inline">{t('Restore')}</span>
                        </Button>
                        <Button onClick={() => setToDelete(b.name)} className="!text-rose-600" title={t('Delete')} aria-label={t('Delete')}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p className="flex items-start gap-1.5 text-xs text-slate-700">
              <HardDrive className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {rich(t('Stored on the server in {dir} (in Docker: {docker}, inside the data volume). Copy them somewhere else too — a backup on the same disk won’t survive losing the server.'), {
                  dir: (
                    <code className="break-all font-mono text-slate-900" dir="ltr">
                      {data.dir}
                    </code>
                  ),
                  docker: (
                    <code className="font-mono text-slate-900" dir="ltr">
                      /app/data/backups
                    </code>
                  ),
                })}
              </span>
            </p>
          </div>
        )}
      </SettingsCard>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        loading={deleting}
        title={t('Delete this backup?')}
        description={
          <>
            <span className="break-all font-mono text-xs text-slate-900" dir="ltr">
              {toDelete}
            </span>
            <p className="mt-2">{t('The file is permanently removed from the server.')}</p>
          </>
        }
        onConfirm={remove}
      />

      <Modal
        open={!!toRestore}
        onClose={() => setToRestore(null)}
        size="sm"
        title={t('Restore this backup?')}
        description={toRestore ?? undefined}
        footer={
          <>
            <Button onClick={() => setToRestore(null)}>{t('Cancel')}</Button>
            <Button variant="danger" onClick={restore} loading={restoring} disabled={confirm !== 'RESTORE'}>
              {t('Restore & replace everything')}
            </Button>
          </>
        }
      >
        <div className="space-y-4 px-6 py-5 text-sm">
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
      </Modal>
    </>
  );
}
