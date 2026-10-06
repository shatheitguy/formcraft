import http from 'node:http';
import net from 'node:net';
import { prisma } from './db';
import { portRange } from './form-links';

/**
 * Dedicated per-form ports.
 *
 * Every form with a `port` gets a tiny HTTP listener inside this process. It forwards
 * "/" to that form's public page on the main server and only allows the assets and the
 * submit endpoint the page needs — so a reverse proxy (e.g. a Cloudflare Tunnel hostname)
 * pointed at the port exposes exactly one form and nothing else.
 */

type Listener = { server: http.Server; formId: string; version: number };
// Bump when the proxy handler changes so already-running listeners (e.g. after a hot reload) restart.
const HANDLER_VERSION = 2;
// globalThis: instrumentation and route handlers are separate bundles but share the process.
const g = globalThis as unknown as { __fcPorts?: Map<number, Listener>; __fcPortErrors?: Map<number, string>; __fcPortSync?: Promise<void> };
const listeners = (g.__fcPorts ??= new Map());
/** Last bind error per port (e.g. EADDRINUSE when another program holds it). */
const bindErrors = (g.__fcPortErrors ??= new Map());

const UPSTREAM_PORT = Number(process.env.PORT) || 3000;

function allowed(method: string, path: string, formId: string) {
  if (path.startsWith('/_next/') || path.startsWith('/api/uploads/') || path === '/logo.svg' || path === '/favicon.ico') return true;
  if (method === 'POST' && path === `/api/forms/${formId}/submissions`) return true;
  return false;
}

function handler(formId: string): http.RequestListener {
  return (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    let target: string;
    if (url.pathname === '/' || url.pathname === '') target = `/f/${formId}${url.search}`;
    else if (allowed(req.method ?? 'GET', url.pathname, formId)) target = url.pathname + url.search;
    else {
      res.writeHead(404, { 'Content-Type': 'text/plain', 'x-formcraft-form': formId }).end('Not found');
      return;
    }

    const upstream = http.request(
      {
        host: '127.0.0.1',
        port: UPSTREAM_PORT,
        method: req.method,
        path: target,
        headers: {
          ...req.headers,
          'x-forwarded-host': (req.headers['x-forwarded-host'] as string) ?? req.headers.host ?? '',
          'x-forwarded-proto': (req.headers['x-forwarded-proto'] as string) ?? 'http',
          'x-formcraft-port': String(req.socket.localPort ?? ''),
        },
      },
      (up) => {
        // Identifies which form this port serves (used by the port test).
        res.writeHead(up.statusCode ?? 502, { ...up.headers, 'x-formcraft-form': formId });
        up.pipe(res);
      },
    );
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('FormCraft is starting up — try again in a moment.');
    });
    req.pipe(upstream);
  };
}

function start(port: number, formId: string) {
  const server = http.createServer(handler(formId));
  server.on('error', (err: NodeJS.ErrnoException) => {
    console.error(`[formcraft] could not listen on port ${port} for form ${formId}: ${err.code ?? err.message}`);
    bindErrors.set(port, err.code ?? err.message);
    listeners.delete(port);
  });
  server.on('listening', () => bindErrors.delete(port));
  server.listen(port, '0.0.0.0');
  listeners.set(port, { server, formId, version: HANDLER_VERSION });
}

async function sync() {
  const range = portRange();
  const forms = range ? await prisma.form.findMany({ where: { port: { not: null } }, select: { id: true, port: true } }) : [];
  const wanted = new Map(forms.filter((f) => f.port! >= range!.from && f.port! <= range!.to).map((f) => [f.port!, f.id]));

  for (const [port, l] of listeners) {
    if (wanted.get(port) !== l.formId || l.version !== HANDLER_VERSION) {
      listeners.delete(port);
      // Drop keep-alive sockets so close() finishes and the port can be re-bound right away.
      l.server.closeAllConnections?.();
      await new Promise<void>((resolve) => l.server.close(() => resolve()));
    }
  }
  for (const [port, formId] of wanted) if (!listeners.has(port)) start(port, formId);
}

/** Starts/stops listeners to match the database. Safe to call often; calls are serialized. */
export function syncPortListeners() {
  g.__fcPortSync = (g.__fcPortSync ?? Promise.resolve()).then(sync).catch((e) => console.error('[formcraft] port sync failed', e));
  return g.__fcPortSync;
}

export function activePorts() {
  return [...listeners.keys()];
}

/* ------------------------------ diagnostics ------------------------------ */

/** True if nothing on this machine is listening on `port` (checked by briefly binding it). */
export function isPortBindable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.listen(port, '0.0.0.0', () => srv.close(() => resolve(true)));
  });
}

/** Requests "/" on the port from inside the server and reports what answered. */
function fetchLocal(port: number): Promise<{ ok: boolean; status?: number; formId?: string; ms: number; error?: string }> {
  const started = Date.now();
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 4000 }, (res) => {
      res.resume();
      resolve({ ok: (res.statusCode ?? 0) < 500, status: res.statusCode, formId: res.headers['x-formcraft-form'] as string | undefined, ms: Date.now() - started });
    });
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', (e: NodeJS.ErrnoException) => resolve({ ok: false, ms: Date.now() - started, error: e.code ?? e.message }));
  });
}

export interface PortProbe {
  port: number;
  range: { from: number; to: number } | null;
  inRange: boolean;
  /** Another form already assigned this port. */
  assignedTo: { id: string; title: string } | null;
  /** This form's own listener is running on the port. */
  listening: boolean;
  /** Nothing else on the server holds the port (only meaningful when not our listener). */
  bindable: boolean | null;
  bindError: string | null;
  /** Result of an HTTP request to the port from inside the server. */
  http: { ok: boolean; status?: number; servesThisForm: boolean; ms: number; error?: string } | null;
}

export async function probePort(port: number, formId: string): Promise<PortProbe> {
  await syncPortListeners();
  const range = portRange();
  const inRange = !!range && port >= range.from && port <= range.to;
  const other = await prisma.form.findFirst({ where: { port, NOT: { id: formId } }, select: { id: true, title: true } });
  const mine = listeners.get(port);
  const listening = mine?.formId === formId;
  // Our own listeners occupy their port, so only test binding for ports FormCraft isn't serving.
  const bindable = mine ? null : await isPortBindable(port);
  const res = listening ? await fetchLocal(port) : null;
  return {
    port,
    range,
    inRange,
    assignedTo: other,
    listening,
    bindable,
    bindError: bindErrors.get(port) ?? null,
    http: res && { ok: res.ok, status: res.status, servesThisForm: res.formId === formId, ms: res.ms, error: res.error },
  };
}

/** Next port in the pool that no form uses and nothing on the server is bound to. */
export async function suggestFreePort(): Promise<number | null> {
  const range = portRange();
  if (!range) return null;
  const used = new Set((await prisma.form.findMany({ where: { port: { not: null } }, select: { port: true } })).map((f) => f.port as number));
  for (let p = range.from; p <= range.to; p++) {
    if (!used.has(p) && !listeners.has(p) && (await isPortBindable(p))) return p;
  }
  return null;
}
