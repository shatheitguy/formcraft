'use client';

import { Activity, CheckCircle2, Copy, Database, Download, FileJson, HardDrive, RefreshCw, Server, Sparkles, Trash2, Wrench, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useI18n } from '@/components/i18n';
import { useToast } from '@/components/toast';
import { Button, ConfirmDialog, Segmented } from '@/components/ui';
import type { DatabaseInfo } from '@/lib/database';
import { fmtNumber } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { SettingsCard, rich, sendJson } from './settings-ui';
import { SystemBackupCard } from './system-backup-card';

const fmtBytes = (n: number | null) => {
  if (n === null) return '—';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
};

const COUNT_LABELS: Record<string, string> = {
  forms: 'Forms',
  submissions: 'Submissions',
  users: 'Users',
  sessions: 'Sessions',
  logs: 'Alert log',
};

const SNIPPETS = {
  sqlite: `# Re-run the installer and choose "Embedded SQLite":
./install.sh          # Linux / macOS
.\install.ps1        # Windows

# …or without the installer (single container):
docker compose up -d --build`,
  postgresql: `# Re-run the installer and choose one of:
#   1) Install a PostgreSQL database for me  (bundled container)
#   2) Use my own PostgreSQL server          (connection is tested first)
./install.sh          # Linux / macOS
.\install.ps1        # Windows

# The installer writes FC_DB_PROVIDER, FC_DATABASE_URL and POSTGRES_* to .env
# and rebuilds the image for the chosen engine.`,
};

export function DatabaseSettings({ initial }: { initial: DatabaseInfo }) {
  const router = useRouter();
  const toast = useToast();
  const { t, locale } = useI18n();
  const num = (n: number) => fmtNumber(n, locale);
  const plural = (n: number, one: string, many: string) => t(n === 1 ? one : many, { n: num(n) });
  const [info, setInfo] = useState(initial);
  const [testing, setTesting] = useState(false);
  const [days, setDays] = useState(180);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmPurge, setConfirmPurge] = useState<number | null>(null);
  const [guide, setGuide] = useState<'sqlite' | 'postgresql'>(initial.provider === 'postgresql' ? 'postgresql' : 'sqlite');

  async function testConnection() {
    setTesting(true);
    const r = await sendJson<DatabaseInfo>('/api/admin/database', 'GET');
    setTesting(false);
    if (!r.ok) return toast(t(r.error!), 'error');
    setInfo(r.data);
    toast(r.data.ok ? t('Connected · {ms} ms', { ms: r.data.latencyMs ?? 0 }) : t('Connection failed'), r.data.ok ? 'success' : 'error');
  }

  async function action(name: string, body: Record<string, unknown>, done: (d: Record<string, number>) => string) {
    setBusy(name);
    const r = await sendJson<Record<string, number>>('/api/admin/database', 'POST', body);
    setBusy(null);
    if (!r.ok) return toast(t(r.error!), 'error');
    toast(done(r.data));
    await testConnection();
    router.refresh();
  }

  async function previewPurge() {
    setBusy('preview');
    const r = await sendJson<{ count: number }>('/api/admin/database', 'POST', { action: 'purge', days, dryRun: true });
    setBusy(null);
    if (!r.ok) return toast(t(r.error!), 'error');
    if (r.data.count === 0) return toast(plural(days, 'No responses older than {n} day', 'No responses older than {n} days'), 'info');
    setConfirmPurge(r.data.count);
  }

  return (
    <div className="space-y-6">
      <SettingsCard
        title={t('Connection')}
        description={t('The database FormCraft is currently connected to.')}
        icon={<Database />}
        aside={
          <Button onClick={testConnection} loading={testing}>
            <RefreshCw className="h-4 w-4" /> {t('Test connection')}
          </Button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat icon={info.ok ? <CheckCircle2 className="text-emerald-500" /> : <XCircle className="text-rose-500" />} label={t('Status')} value={info.ok ? t('Connected') : t('Unreachable')} sub={info.ok ? t('{ms} ms round-trip', { ms: info.latencyMs ?? 0 }) : info.error} />
          <Stat icon={<Server />} label={t('Engine')} value={info.provider === 'postgresql' ? 'PostgreSQL' : info.provider === 'sqlite' ? 'SQLite' : t('Unknown')} sub={info.version} />
          <Stat icon={<HardDrive />} label={t('Size on disk')} value={fmtBytes(info.sizeBytes)} />
          <Stat icon={<Activity />} label={t('Active sessions')} value={num(info.counts.sessions)} />
        </div>
        <div className="mt-4 rounded-lg bg-slate-900 px-4 py-3 font-mono text-xs text-slate-200" dir="ltr">
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">DATABASE_URL</span>
            <button
              onClick={() => navigator.clipboard?.writeText(info.url).then(() => toast(t('Copied')))}
              className="rounded p-1 text-slate-500 hover:bg-white/10 hover:text-slate-200"
              aria-label={t('Copy')}
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-1 break-all">{info.url}</div>
          {info.file && <div className="mt-1 break-all text-slate-500">→ {info.file}</div>}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
          {Object.entries(info.counts).map(([k, n]) => (
            <div key={k} className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-inset ring-slate-100">
              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{COUNT_LABELS[k] ? t(COUNT_LABELS[k]) : k}</div>
              <div className="font-semibold tabular-nums text-slate-900">{num(n)}</div>
            </div>
          ))}
        </div>
      </SettingsCard>

      <SystemBackupCard />

      <SettingsCard title={t('Data exports')} description={t('Lighter, partial exports for analysis or archiving.')} icon={<Download />}>
        <div className="grid gap-3 md:grid-cols-2">
          <BackupOption
            icon={<FileJson />}
            title={t('JSON export')}
            text={t('Forms, responses, users (without passwords) and branding. Works with any database engine.')}
            href="/api/admin/database/backup?format=json"
          />
          <BackupOption
            icon={<HardDrive />}
            title={t('SQLite snapshot (.db)')}
            text={t('A consistent, full copy of the database file — restore by replacing {file}.', { file: 'formcraft.db' })}
            href="/api/admin/database/backup?format=sqlite"
            disabled={info.provider !== 'sqlite'}
            disabledText={t('Only available on SQLite. For PostgreSQL use {tool}.', { tool: 'pg_dump' })}
          />
        </div>
      </SettingsCard>

      <SettingsCard title={t('Maintenance')} description={t('Keep the database lean and fast.')} icon={<Wrench />}>
        <div className="divide-y divide-slate-100">
          <Row title={t('Data retention')} text={t('Permanently delete responses older than a number of days.')}>
            <div className="flex items-center gap-2">
              <input type="number" min={1} className="input h-9 w-24" value={days} onChange={(e) => setDays(Number(e.target.value))} dir="ltr" />
              <span className="text-sm text-slate-500">{t('days')}</span>
              <Button onClick={previewPurge} loading={busy === 'preview'} className="!text-rose-600">
                <Trash2 className="h-4 w-4" /> {t('Purge')}
              </Button>
            </div>
          </Row>
          <Row title={t('Optimize database')} text={info.provider === 'sqlite' ? t('Runs {cmd} to reclaim space and defragment the file.', { cmd: 'VACUUM' }) : t('Runs {cmd} to reclaim space and refresh planner statistics.', { cmd: 'VACUUM ANALYZE' })}>
            <Button onClick={() => action('optimize', { action: 'optimize' }, (d) => t('Optimized in {ms} ms', { ms: d.ms }))} loading={busy === 'optimize'}>
              <Sparkles className="h-4 w-4" /> {t('Optimize')}
            </Button>
          </Row>
          <Row title={t('Expired sessions')} text={t('Remove sign-in sessions that have already expired.')}>
            <Button onClick={() => action('sessions', { action: 'sessions' }, (d) => plural(d.count, 'Removed {n} expired session', 'Removed {n} expired sessions'))} loading={busy === 'sessions'}>
              {t('Clean up')}
            </Button>
          </Row>
          <Row title={t('Notification log')} text={t('Clear the history of sent and failed notifications.')}>
            <Button onClick={() => action('logs', { action: 'logs' }, (d) => plural(d.count, 'Cleared {n} log entry', 'Cleared {n} log entries'))} loading={busy === 'logs'}>
              {t('Clear log')}
            </Button>
          </Row>
        </div>
      </SettingsCard>

      <SettingsCard
        title={t('Database engine')}
        description={t('Chosen by the installer when FormCraft is deployed. Switching engines means re-running the installer, which rebuilds the container.')}
        icon={<Server />}
        aside={
          <Segmented
            value={guide}
            onChange={setGuide}
            options={[
              { value: 'sqlite', label: 'SQLite' },
              { value: 'postgresql', label: 'PostgreSQL' },
            ]}
          />
        }
      >
        <p className="mb-3 text-sm text-slate-600">
          {guide === 'sqlite'
            ? t('Embedded, zero-configuration option: everything runs in one container and data lives in a single file. Fine for personal use and small teams.')
            : t('The default Docker setup. The database runs in its own container with its own volume, so it can be backed up, inspected and scaled independently. Tables are created automatically on start.')}
        </p>
        <pre dir="ltr" className="scrollbar-thin overflow-x-auto rounded-lg bg-slate-900 p-4 font-mono text-xs leading-relaxed text-slate-200">{SNIPPETS[guide]}</pre>
        <p className="mt-3 text-xs text-slate-500">
          {t('Moving data between engines: download a JSON export first, then re-create forms on the new deployment. Switching engines does not migrate data automatically.')}
        </p>
      </SettingsCard>

      <ConfirmDialog
        open={confirmPurge !== null}
        onClose={() => setConfirmPurge(null)}
        loading={busy === 'purge'}
        confirmLabel={plural(confirmPurge ?? 0, 'Delete {n} response', 'Delete {n} responses')}
        title={t('Purge old responses?')}
        description={rich(
          t(
            confirmPurge === 1
              ? '{n} response older than {days} days will be permanently deleted. Consider downloading a backup first.'
              : '{n} responses older than {days} days will be permanently deleted. Consider downloading a backup first.',
            { days: num(days) },
          ),
          { n: <strong className="text-slate-900">{num(confirmPurge ?? 0)}</strong> },
        )}
        onConfirm={async () => {
          await action('purge', { action: 'purge', days }, (d) => plural(d.count, 'Deleted {n} response', 'Deleted {n} responses'));
          setConfirmPurge(null);
        }}
      />
    </div>
  );
}

function Stat({ icon, label, value, sub }: { icon: ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-100">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400 [&>svg]:h-3.5 [&>svg]:w-3.5">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-base font-semibold text-slate-900">{value}</div>
      {sub && (
        <div className="truncate text-xs text-slate-500" title={sub}>
          {sub}
        </div>
      )}
    </div>
  );
}

function Row({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-[200px] flex-1">
        <div className="text-sm font-medium text-slate-800">{title}</div>
        <div className="text-xs text-slate-500">{text}</div>
      </div>
      {children}
    </div>
  );
}

function BackupOption({ icon, title, text, href, disabled, disabledText }: { icon: ReactNode; title: string; text: string; href: string; disabled?: boolean; disabledText?: string }) {
  const { t } = useI18n();
  return (
    <div className={cn('flex flex-col rounded-xl border border-slate-200 p-4', disabled && 'opacity-60')}>
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 [&>svg]:h-4 [&>svg]:w-4 [&>svg]:text-brand-600">
        {icon}
        {title}
      </div>
      <p className="mt-1 flex-1 text-xs text-slate-500">{disabled ? disabledText : text}</p>
      {disabled ? (
        <Button className="mt-3 self-start" disabled>
          <Download className="h-4 w-4" /> {t('Download')}
        </Button>
      ) : (
        <a href={href} className="mt-3 inline-flex h-8 items-center gap-1.5 self-start rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
          <Download className="h-4 w-4" /> {t('Download')}
        </a>
      )}
    </div>
  );
}
