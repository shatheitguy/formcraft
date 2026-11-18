'use client';

import { AlertTriangle, CheckCircle2, Copy, Download, ExternalLink, Info, Loader2, RefreshCw, Server, Terminal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/i18n';
import { Logo } from '@/components/icons';
import { useToast } from '@/components/toast';
import { Button } from '@/components/ui';
import type { AboutInfo } from '@/lib/about';
import { cn, formatDateTime } from '@/lib/utils';
import { SettingsCard, sendJson } from './settings-ui';

const REPO = 'https://github.com/shatheitguy/formcraft';
const RAW = 'https://raw.githubusercontent.com/shatheitguy/formcraft/main';

const fmtBytes = (n: number | null) => (n == null ? '—' : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);
function fmtUptime(s: number) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

export function AboutSettings({ initial }: { initial: AboutInfo }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [info, setInfo] = useState(initial);
  const [busy, setBusy] = useState<'check' | 'update' | null>(null);
  const [log, setLog] = useState('');
  const running = info.update.state === 'running';

  const refresh = useCallback(async () => {
    const r = await fetch('/api/admin/about?log=1', { cache: 'no-store' }).catch(() => null);
    if (!r?.ok) return; // the server may be restarting
    const d = await r.json();
    setLog(d.log);
    setInfo((x) => ({ ...x, update: d.status }));
    if (d.status.state === 'done') {
      // pm2 / systemd restart the server; reload once it answers on the new version.
      setTimeout(() => window.location.reload(), 8000);
    }
  }, []);

  useEffect(() => {
    if (!running) return;
    const iv = setInterval(refresh, 3000);
    return () => clearInterval(iv);
  }, [running, refresh]);

  async function check() {
    setBusy('check');
    const r = await sendJson<AboutInfo>('/api/admin/about', 'POST', { action: 'check' });
    setBusy(null);
    if (!r.ok) return toast(t(r.error!), 'error');
    setInfo(r.data);
    toast(r.data.updateAvailable ? t('Version {v} is available', { v: r.data.latest ?? '' }) : t('You’re on the latest version'));
  }

  async function update() {
    if (!confirm(t('Update FormCraft to version {v} now? The site may be unavailable for a minute while it rebuilds and restarts.', { v: info.latest ?? '' }))) return;
    setBusy('update');
    const r = await sendJson<{ status: AboutInfo['update'] }>('/api/admin/about', 'POST', { action: 'update' });
    setBusy(null);
    if (!r.ok) return toast(t(r.error!), 'error');
    setInfo((x) => ({ ...x, update: r.data.status }));
    router.refresh();
  }

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(
      () => toast(t('Copied')),
      () => toast(t('Copy failed'), 'error'),
    );
  };

  const kindLabel = info.install === 'docker' ? t('Docker') : info.install === 'git' ? t('Native (git checkout)') : t('Native (manual)');
  const rows: [string, React.ReactNode][] = [
    [t('Version'), <span key="v" className="font-mono">{info.version}</span>],
    [t('Installed with'), kindLabel],
    ...(info.git?.branch ? ([[t('Code'), <span key="g" className="font-mono">{`${info.git.branch} @ ${info.git.commit}`}</span>]] as [string, React.ReactNode][]) : []),
    [t('Database'), `${info.database.provider === 'postgresql' ? 'PostgreSQL' : info.database.provider === 'sqlite' ? 'SQLite' : '—'} · ${info.database.version || '—'} · ${fmtBytes(info.database.sizeBytes)}`],
    [t('Forms'), t('{n} forms · {a} active', { n: info.counts.forms, a: info.counts.activeForms })],
    [t('Responses'), String(info.counts.submissions)],
    [t('Users'), String(info.counts.users)],
    [t('WhatsApp'), info.whatsapp === 'on' ? t('Linked') : t('Not linked')],
    [t('Last automatic backup'), info.backup?.lastSuccess ? formatDateTime(info.backup.lastSuccess, locale) : t('None yet')],
    [t('Server'), `${info.runtime.platform} · Node ${info.runtime.node}`],
    [t('Running for'), `${fmtUptime(info.runtime.uptimeSec)} · ${info.runtime.memoryMb} MB`],
  ];

  const dockerCmd = 'docker compose pull && docker compose up -d';
  const linuxCmd = `curl -fsSL ${RAW}/install.sh | bash`;
  const winCmd = `irm ${RAW}/install.ps1 | iex`;
  const gitCmd = 'git pull --ff-only && npm ci && npx prisma db push && npm run build';

  return (
    <div className="space-y-6">
      {/* Identity */}
      <div className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <Logo className="h-14 w-14 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-xl font-bold text-slate-900">FormCraft</div>
          <div className="text-sm text-slate-700">{t('The developer-first, self-hosted form builder.')}</div>
          <div className="mt-1 text-sm text-slate-600">
            {t('Version')} <span className="font-mono font-semibold text-slate-900">{info.version}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:shrink-0">
          <a href={REPO} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            <ExternalLink className="h-4 w-4" /> GitHub
          </a>
          <a href={`${REPO}/commits/main`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            <ExternalLink className="h-4 w-4" /> {t('What’s new')}
          </a>
        </div>
      </div>

      {/* Updates */}
      <SettingsCard
        title={t('Updates')}
        description={info.checkedAt ? t('Last checked {when}', { when: formatDateTime(info.checkedAt, locale) }) : t('FormCraft checks GitHub for a new version every 6 hours.')}
        icon={<RefreshCw />}
        aside={
          <Button onClick={check} loading={busy === 'check'} disabled={running} className="hidden sm:inline-flex">
            <RefreshCw className="h-4 w-4" /> {t('Check for updates')}
          </Button>
        }
      >
        <div className="space-y-4">
          {/* Phones: the button gets its own row so the header text isn't squeezed */}
          <Button onClick={check} loading={busy === 'check'} disabled={running} className="w-full sm:hidden">
            <RefreshCw className="h-4 w-4" /> {t('Check for updates')}
          </Button>
          {info.updateAvailable ? (
            <div className="flex items-start gap-3 rounded-xl bg-amber-50 p-4 ring-1 ring-inset ring-amber-300">
              <Download className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <div className="text-sm text-amber-950">
                <div className="font-semibold">{t('Version {v} is available', { v: info.latest ?? '' })}</div>
                <div>{t('You have {v}.', { v: info.version })}</div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-900 ring-1 ring-inset ring-emerald-200">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
              {info.latest ? t('You’re on the latest version') : t('Not checked yet — press Check for updates.')}
            </div>
          )}

          {/* Native git install: one click */}
          {info.install === 'git' && (
            <div className="space-y-3 rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Server className="h-4 w-4 text-slate-600" /> {t('Update from this page')}
              </div>
              <p className="text-sm text-slate-700">
                {info.supervisor === 'none'
                  ? t('FormCraft downloads and builds the new version, then you restart it (it isn’t running under pm2 or systemd, so it can’t restart itself).')
                  : t('FormCraft downloads and builds the new version, then restarts itself ({by}).', { by: info.supervisor })}
              </p>
              {info.git?.localChanges && (
                <p className="flex gap-2 text-sm font-medium text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {t('This checkout has local code changes, so it can’t update automatically. Commit or discard them first.')}
                </p>
              )}
              <Button variant="primary" onClick={update} loading={busy === 'update'} disabled={running || !info.updateAvailable || !!info.git?.localChanges}>
                <Download className="h-4 w-4" /> {info.updateAvailable ? t('Update to {v}', { v: info.latest ?? '' }) : t('Update now')}
              </Button>

              {info.update.state !== 'idle' && (
                <div
                  className={cn(
                    'rounded-lg p-3 text-sm ring-1 ring-inset',
                    info.update.state === 'failed' ? 'bg-rose-50 text-rose-900 ring-rose-200' : info.update.state === 'running' ? 'bg-sky-50 text-sky-950 ring-sky-200' : 'bg-emerald-50 text-emerald-900 ring-emerald-200',
                  )}
                >
                  <div className="flex items-center gap-2 font-semibold">
                    {info.update.state === 'running' ? <Loader2 className="h-4 w-4 animate-spin" /> : info.update.state === 'failed' ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                    {info.update.state === 'running'
                      ? t(info.update.step ?? 'Updating…')
                      : info.update.state === 'failed'
                        ? t('The update failed')
                        : info.update.state === 'restart_needed'
                          ? t('Built. Restart FormCraft to finish the update.')
                          : t('Updated. Restarting…')}
                  </div>
                  {info.update.error && <div className="mt-1">{t(info.update.error)}</div>}
                  {log && <pre className="scrollbar-thin mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-[#0f172a] p-2 font-mono text-[11px] leading-relaxed text-[#f1f5f9]" dir="ltr">{log}</pre>}
                  {!log && info.update.state !== 'running' && (
                    <button onClick={refresh} className="mt-2 text-xs font-semibold underline">
                      {t('Show the update log')}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Docker / other installs: the command to run */}
          <div className="space-y-3 rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Terminal className="h-4 w-4 text-slate-600" />
              {info.install === 'docker' ? t('Update with Docker') : t('Update from the command line')}
            </div>
            {info.install === 'docker' && <p className="text-sm text-slate-700">{t('FormCraft runs in Docker, so it updates by pulling the new image. Run this in the folder with your docker-compose.yml (your data stays in its volume):')}</p>}
            {info.install !== 'docker' && <p className="text-sm text-slate-700">{t('Or update by hand in the FormCraft folder, then restart it:')}</p>}
            <Cmd text={info.install === 'docker' ? dockerCmd : gitCmd} onCopy={copy} />
            {info.install === 'docker' && (
              <>
                <p className="text-sm text-slate-700">{t('Or re-run the one-line installer — it keeps your settings and data:')}</p>
                <div className="grid min-w-0 gap-2">
                  <Cmd label="Linux / macOS" text={linuxCmd} onCopy={copy} />
                  <Cmd label="Windows PowerShell" text={winCmd} onCopy={copy} />
                </div>
                <p className="flex gap-2 text-xs text-slate-600">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {t('On Unraid: Docker tab → FormCraft → Update (or “Check for updates” at the bottom of the Docker tab).')}
                </p>
              </>
            )}
          </div>
        </div>
      </SettingsCard>

      {/* Details */}
      <SettingsCard title={t('System details')} icon={<Info />}>
        <dl className="-mx-6 -my-5 divide-y divide-slate-100">
          {rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[minmax(0,40%)_1fr] gap-3 px-6 py-2.5 text-sm">
              <dt className="font-medium text-slate-600">{k}</dt>
              <dd className="min-w-0 break-words text-slate-900">{v}</dd>
            </div>
          ))}
        </dl>
      </SettingsCard>
    </div>
  );
}

function Cmd({ text, label, onCopy }: { text: string; label?: string; onCopy: (s: string) => void }) {
  const { t } = useI18n();
  return (
    <div className="min-w-0">
      {label && <div className="mb-1 text-xs font-semibold text-slate-600">{label}</div>}
      <div className="flex min-w-0 max-w-full items-stretch overflow-hidden rounded-lg bg-[#0f172a] ring-1 ring-[#1e293b]" dir="ltr">
        <code className="scrollbar-thin min-w-0 flex-1 overflow-x-auto whitespace-nowrap px-3 py-2 font-mono text-[12.5px] text-[#f1f5f9]">{text}</code>
        <button onClick={() => onCopy(text)} className="flex shrink-0 items-center gap-1 border-s border-white/10 px-3 text-xs font-semibold text-[#e2e8f0] hover:bg-white/10" aria-label={t('Copy')}>
          <Copy className="h-3.5 w-3.5" /> {t('Copy')}
        </button>
      </div>
    </div>
  );
}
