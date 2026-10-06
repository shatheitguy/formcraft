'use client';

import { CheckCircle2, CircleDashed, Search, Stethoscope, XCircle } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { PortProbe } from '@/lib/port-router';
import { cn } from '@/lib/utils';
import type { TFn } from '@/lib/i18n';
import { useT } from './i18n';
import { Button } from './ui';

type State = 'pass' | 'fail' | 'warn' | 'skip';
interface Check {
  state: State;
  label: string;
  detail?: string;
}

/** Explains a bind error code in plain words. */
const bindHint = (t: TFn, code: string | null) =>
  code === 'EADDRINUSE' ? t('another program on the server is already using it') : code === 'EACCES' ? t('the server is not allowed to open it') : code ?? '';

/**
 * Port diagnostics for the Share dialog: server-side checks (pool, other forms, free on the
 * server, HTTP response) plus a real reachability test from the viewer's own browser.
 */
export function PortTester({
  formId,
  port,
  currentPort,
  host,
  canEdit,
  onSuggest,
}: {
  formId: string;
  port: string;
  currentPort: number | null;
  host: string;
  canEdit: boolean;
  onSuggest: (port: number) => void;
}) {
  const t = useT();
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [running, setRunning] = useState(false);
  const [finding, setFinding] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function run() {
    const n = Number(port);
    setNote(null);
    setRunning(true);
    setChecks(null);
    try {
      const res = await fetch(`/api/forms/${formId}/port-check?port=${n}`);
      const p = (await res.json()) as PortProbe & { error?: string };
      if (!res.ok) throw new Error(p.error ?? 'Port test failed');
      const isCurrent = n === currentPort;
      const out: Check[] = [];

      out.push(
        p.range
          ? {
              state: p.inRange ? 'pass' : 'fail',
              label: t('Inside the port pool'),
              detail: p.inRange
                ? `${p.range.from}–${p.range.to}`
                : t('{from}–{to} — Docker only publishes ports in this range', { from: p.range.from, to: p.range.to }),
            }
          : { state: 'fail', label: t('Dedicated ports are enabled'), detail: t('FORM_PORT_RANGE is not set on the server') },
      );
      out.push(
        p.assignedTo
          ? { state: 'fail', label: t('Not used by another form'), detail: t('already assigned to “{title}”', { title: p.assignedTo.title }) }
          : { state: 'pass', label: t('Not used by another form') },
      );

      if (p.listening) {
        out.push({ state: 'pass', label: t('FormCraft is listening on this port') });
      } else if (p.bindable === false) {
        out.push({
          state: 'fail',
          label: t('Free on the server'),
          detail: isCurrent && p.bindError ? t('FormCraft couldn’t open it — {reason}', { reason: bindHint(t, p.bindError) }) : t('another program on the server is already using it'),
        });
      } else if (p.bindable) {
        out.push({ state: 'pass', label: t('Free on the server'), detail: isCurrent ? t('but FormCraft is not serving it yet') : t('nothing else is using it') });
      }

      if (p.http) {
        out.push(
          p.http.ok && p.http.servesThisForm
            ? { state: 'pass', label: t('Serves this form'), detail: t('HTTP {status} in {ms} ms (from the server)', { status: p.http.status ?? '', ms: p.http.ms }) }
            : {
                state: 'fail',
                label: t('Serves this form'),
                detail:
                  p.http.error ??
                  (p.http.servesThisForm ? `HTTP ${p.http.status}` : t('HTTP {status} — a different form answered', { status: p.http.status ?? '' })),
              },
        );
      } else {
        out.push({ state: 'skip', label: t('Serves this form'), detail: isCurrent ? t('not listening yet') : t('save this port to start serving the form on it') });
      }

      // Real-world reachability from this browser (proves the port is published by Docker / the firewall).
      if (p.listening) {
        out.push(await browserCheck(t, host, n));
      } else {
        out.push({ state: 'skip', label: t('Reachable from your browser'), detail: t('runs once the form is served on this port') });
      }

      setChecks(out);
      const failed = out.filter((c) => c.state === 'fail').length;
      setNote(
        failed === 1 ? t('1 check failed') : failed ? t('{n} checks failed', { n: failed }) : isCurrent ? t('Port is working') : t('Port is free — save it to use it'),
      );
    } catch (e) {
      setNote(t(e instanceof Error ? e.message : 'Port test failed'));
    } finally {
      setRunning(false);
    }
  }

  async function findFree() {
    setFinding(true);
    setNote(null);
    try {
      const res = await fetch(`/api/forms/${formId}/port-check?suggest=1`);
      const { suggestion } = (await res.json()) as { suggestion: number | null };
      if (suggestion) {
        onSuggest(suggestion);
        setChecks(null);
        setNote(t('Port {port} is free — save it to use it', { port: suggestion }));
      } else setNote(t('No free ports left in the pool'));
    } finally {
      setFinding(false);
    }
  }

  const allPass = checks && checks.every((c) => c.state !== 'fail');

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" onClick={run} loading={running} disabled={!port}>
          <Stethoscope className="h-3.5 w-3.5" /> {t('Test port')}
        </Button>
        {canEdit && (
          <Button size="sm" variant="ghost" onClick={findFree} loading={finding}>
            <Search className="h-3.5 w-3.5" /> {t('Find free port')}
          </Button>
        )}
        {note && <span className={cn('text-xs font-medium', checks && !allPass ? 'text-rose-600' : 'text-emerald-700')}>{note}</span>}
      </div>
      {checks && (
        <ul className="mt-2 space-y-1 rounded-lg bg-slate-50 p-3 ring-1 ring-inset ring-slate-100">
          {checks.map((c) => (
            <Row key={c.label} check={c} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({ check }: { check: Check }) {
  const icon: Record<State, ReactNode> = {
    pass: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
    fail: <XCircle className="h-4 w-4 text-rose-500" />,
    warn: <CircleDashed className="h-4 w-4 text-amber-500" />,
    skip: <CircleDashed className="h-4 w-4 text-slate-300" />,
  };
  return (
    <li className="flex items-start gap-2 text-xs">
      <span className="mt-px shrink-0">{icon[check.state]}</span>
      <span className={cn('font-medium', check.state === 'skip' ? 'text-slate-400' : 'text-slate-800')}>{check.label}</span>
      {check.detail && <span className="text-slate-500">· {check.detail}</span>}
    </li>
  );
}

async function browserCheck(t: TFn, host: string, port: number): Promise<Check> {
  const url = `http://${host}:${port}/`;
  if (window.location.protocol === 'https:') {
    return { state: 'warn', label: t('Reachable from your browser'), detail: t('skipped — browsers block plain-http requests from an https page; open the link to check') };
  }
  const started = performance.now();
  try {
    // no-cors: we can't read the response, but a resolved promise proves the port answered.
    await fetch(url, { mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(5000) });
    return { state: 'pass', label: t('Reachable from your browser'), detail: t('{url} answered in {ms} ms', { url, ms: Math.round(performance.now() - started) }) };
  } catch {
    return { state: 'fail', label: t('Reachable from your browser'), detail: t('{url} did not answer — check the Docker port mapping and firewall', { url }) };
  }
}
