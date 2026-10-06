'use client';

import { AlertTriangle, Check, Copy, ExternalLink, Globe, Link2, Network, Pencil } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useApp } from './app-context';
import { useT } from './i18n';
import { PortTester } from './port-tester';
import { QrPanel } from './qr-panel';
import { useToast } from './toast';
import { Button, Modal, Switch } from './ui';
import type { FormDTO } from '@/lib/types';
import type { TFn } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export type ShareForm = Pick<FormDTO, 'id' | 'title' | 'status' | 'slug' | 'port' | 'customDomain'>;

async function patch(id: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/forms/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  return res.ok ? { ok: true as const, form: json as FormDTO } : { ok: false as const, error: (json.error as string) ?? 'Could not save' };
}

/** API errors with numbers in them, mapped to translatable templates. Other errors are fixed strings. */
const API_ERRORS: [RegExp, string, string[]][] = [
  [/^All ports (\d+)–(\d+) are in use\.$/, 'All ports {from}–{to} are in use.', ['from', 'to']],
  [/^Port must be between (\d+) and (\d+)\.$/, 'Port must be between {from} and {to}.', ['from', 'to']],
  [/^Port (\d+) is already used by another form\.$/, 'Port {port} is already used by another form.', ['port']],
];

export function translateApiError(t: TFn, msg: string) {
  for (const [re, key, names] of API_ERRORS) {
    const m = msg.match(re);
    if (m) return t(key, Object.fromEntries(names.map((n, i) => [n, m[i + 1]])));
  }
  return t(msg);
}

export function ShareDialog({
  form,
  portRange,
  canEdit,
  open,
  onClose,
  onUpdated,
}: {
  form: ShareForm;
  portRange: { from: number; to: number } | null;
  canEdit: boolean;
  open: boolean;
  onClose: () => void;
  onUpdated?: (f: ShareForm) => void;
}) {
  const { app } = useApp();
  const toast = useToast();
  const t = useT();
  const [f, setF] = useState(form);
  const [origin, setOrigin] = useState('');
  const [host, setHost] = useState('localhost');
  const [editingSlug, setEditingSlug] = useState(false);
  const [slug, setSlug] = useState(form.slug ?? '');
  const [domain, setDomain] = useState(form.customDomain ?? '');
  const [portInput, setPortInput] = useState(String(form.port ?? ''));
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => setF(form), [form]);
  useEffect(() => {
    setOrigin((app.publicUrl || window.location.origin).replace(/\/$/, ''));
    setHost(window.location.hostname);
  }, [app.publicUrl]);

  const update = async (key: string, body: Record<string, unknown>, msg: string) => {
    setBusy(key);
    const r = await patch(f.id, body);
    setBusy(null);
    if (!r.ok) {
      toast(translateApiError(t, r.error), 'error');
      return false;
    }
    const next = { ...f, slug: r.form.slug, port: r.form.port, customDomain: r.form.customDomain };
    setF(next);
    setSlug(next.slug ?? '');
    setDomain(next.customDomain ?? '');
    setPortInput(String(next.port ?? ''));
    onUpdated?.(next);
    toast(msg);
    return true;
  };

  const copy = async (text: string, label = t('Link copied')) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(label);
    } catch {
      window.prompt(t('Copy:'), text);
    }
  };

  const mainLink = `${origin}/f/${f.slug ?? f.id}`;
  const portLink = f.port ? `http://${host}:${f.port}` : null;
  const domainLink = f.customDomain ? `https://${f.customDomain}` : null;

  return (
    <Modal open={open} onClose={onClose} size="lg" title={t('Share form')}
      description={t('Links for “{title}”. Each form has its own unique link and can be served on a dedicated port.', { title: f.title })}
    >
      <div className="space-y-5 p-6">
        {f.status !== 'ACTIVE' && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {t('This form is a draft — links work, but responses are only accepted once it’s published.')}
          </div>
        )}

        {/* Unique link */}
        <Section icon={<Link2 />} title={t('Unique link')} text={t('Share this anywhere. The link name can be customized.')}>
          <LinkRow url={mainLink} onCopy={() => copy(mainLink)} />
          {canEdit &&
            (editingSlug ? (
              <div className="mt-2 flex items-center gap-1.5">
                <div dir="ltr" className="flex min-w-0 flex-1 items-center gap-1.5">
                  <span className="hidden shrink-0 text-xs text-slate-400 sm:inline">{origin}/f/</span>
                  <input className="input h-8 py-1 text-sm" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} autoFocus />
                </div>
                <Button size="sm" variant="primary" loading={busy === 'slug'} onClick={async () => (await update('slug', { slug }, t('Link updated'))) && setEditingSlug(false)}>
                  {t('Save')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => (setEditingSlug(false), setSlug(f.slug ?? ''))}>
                  {t('Cancel')}
                </Button>
              </div>
            ) : (
              <button onClick={() => setEditingSlug(true)} className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-800">
                <Pencil className="h-3 w-3" /> {t('Customize link name')}
              </button>
            ))}
        </Section>

        {/* Dedicated port */}
        <Section
          icon={<Network />}
          title={t('Dedicated port')}
          text={
            portRange
              ? t('Serves only this form at “/” — point a reverse proxy or tunnel at it. Pool: {from}–{to}.', { from: portRange.from, to: portRange.to })
              : t('Disabled. Set FORM_PORT_RANGE (and publish the same range in docker-compose.yml) to give each form its own port.')
          }
          aside={
            canEdit && portRange ? (
              <Switch checked={!!f.port} onChange={(on) => update('port', { port: on ? 'auto' : null }, on ? t('Port assigned') : t('Port released'))} label={t('Dedicated port')} />
            ) : undefined
          }
        >
          {portLink ? (
            <>
              <LinkRow url={portLink} onCopy={() => copy(portLink)} />
              {canEdit && (
                <div className="mt-2 flex items-center gap-1.5">
                  <span className="text-xs text-slate-500">{t('Port')}</span>
                  <input className="input h-8 w-24 py-1 text-sm tabular-nums" dir="ltr" inputMode="numeric" value={portInput} onChange={(e) => setPortInput(e.target.value.replace(/\D/g, ''))} />
                  {portInput !== String(f.port) && (
                    <>
                      <Button size="sm" variant="primary" loading={busy === 'portnum'} onClick={() => update('portnum', { port: Number(portInput) }, t('Moved to port {port}', { port: portInput }))}>
                        {t('Save port')}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setPortInput(String(f.port))}>
                        {t('Reset')}
                      </Button>
                    </>
                  )}
                </div>
              )}
              <PortTester formId={f.id} port={portInput || String(f.port)} currentPort={f.port} host={host} canEdit={canEdit} onSuggest={(p) => setPortInput(String(p))} />
            </>
          ) : (
            portRange && <p className="text-xs text-slate-400">{t('No port assigned.')}</p>
          )}
        </Section>

        {/* Custom domain */}
        <Section icon={<Globe />} title={t('Custom domain')} text={t('Route a hostname to this form through Cloudflare Tunnel, Nginx, Caddy or Traefik.')}>
          {canEdit ? (
            <div className="flex gap-1.5">
              <input className="input h-9" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="feedback.example.com" dir="ltr" />
              {domain !== (f.customDomain ?? '') && (
                <Button loading={busy === 'domain'} onClick={() => update('domain', { customDomain: domain }, domain ? t('Domain saved') : t('Domain removed'))}>
                  {t('Save')}
                </Button>
              )}
            </div>
          ) : (
            !domainLink && <p className="text-xs text-slate-400">{t('No custom domain.')}</p>
          )}
          {domainLink && <div className="mt-2"><LinkRow url={domainLink} onCopy={() => copy(domainLink)} /></div>}
        </Section>

        <QrPanel
          fileName={f.slug ?? f.title}
          links={[
            ...(domainLink ? [{ key: 'domain', label: t('Custom domain'), url: domainLink }] : []),
            { key: 'main', label: t('Unique link'), url: mainLink },
            ...(portLink ? [{ key: 'port', label: t('Port {port}', { port: f.port ?? '' }), url: portLink }] : []),
          ]}
        />

      </div>
    </Modal>
  );
}

function Section({ icon, title, text, aside, children }: { icon: ReactNode; title: string; text: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 p-4">
      <div className="mb-3 flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          <div className="text-xs text-slate-500">{text}</div>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function LinkRow({ url, onCopy }: { url: string; onCopy: () => void }) {
  const t = useT();
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 py-1 ps-3 pe-1 ring-1 ring-inset ring-slate-200">
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-700" title={url} dir="ltr">
        {url}
      </span>
      <button
        onClick={() => {
          onCopy();
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }}
        className={cn('inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium transition', done ? 'bg-emerald-50 text-emerald-700' : 'bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50')}
      >
        {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {done ? t('Copied') : t('Copy')}
      </button>
      <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-white hover:text-slate-700" aria-label={t('Open')} title={t('Open')}>
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}
