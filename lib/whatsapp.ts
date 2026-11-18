// WhatsApp linked to this server (Settings → Notification channel setup → WhatsApp): an admin scans a QR with the
// workspace's WhatsApp (Linked devices), then FormCraft can send response alerts and PDF / Excel reports.
// It works like WhatsApp Web (the Baileys library). WhatsApp does not officially allow this: a number that
// sends a lot can get blocked, so messages go out one at a time, a few seconds apart.
import fs from 'node:fs';
import path from 'node:path';

type Status = 'off' | 'connecting' | 'qr' | 'on';
interface WaState {
  sock: any;
  status: Status;
  qr: string | null;
  me: string | null;
  error: string | null;
  want: boolean;
  tries: number;
  queue: Promise<unknown>;
}

export type WaResult = 'ok' | 'not_linked' | 'not_on_whatsapp' | 'bad_number' | 'failed';

// In Docker the working dir is /app, so this lands on the /app/data volume next to the database.
const DIR = process.env.WHATSAPP_DIR || path.join(process.cwd(), 'data', 'whatsapp');
const g = globalThis as any;
const st: WaState = g.__fcWa ?? (g.__fcWa = { sock: null, status: 'off', qr: null, me: null, error: null, want: false, tries: 0, queue: Promise.resolve() });

/** Where the link stands, for the settings card. */
export function waStatus() {
  return { status: st.status, qr: st.status === 'qr' ? st.qr : null, me: st.me, error: st.error };
}

const linked = () => fs.existsSync(path.join(DIR, 'creds.json'));

/** Connects (a QR to scan when not linked yet). */
export async function waStart() {
  st.want = true;
  if (st.sock && st.status !== 'off') return;
  st.status = 'connecting';
  st.error = null;
  try {
    const B: any = await import('@whiskeysockets/baileys');
    const makeWASocket = B.makeWASocket || B.default;
    fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
    // The session keys let anyone send as this WhatsApp: owner-only, also for a folder made earlier.
    try {
      fs.chmodSync(DIR, 0o700);
    } catch {
      /* not supported (e.g. Windows) */
    }
    const { state, saveCreds: save } = await B.useMultiFileAuthState(DIR);
    const saveCreds = async () => {
      await save();
      try {
        fs.chmodSync(path.join(DIR, 'creds.json'), 0o600);
      } catch {
        /* not supported */
      }
    };
    const pino = (await import('pino')).default;
    let version: number[] | undefined;
    try {
      version = (await B.fetchLatestBaileysVersion()).version;
    } catch {
      /* use the built-in version */
    }
    const sock = makeWASocket({
      auth: state,
      version,
      printQRInTerminal: false,
      browser: B.Browsers.windows('Desktop'),
      logger: pino({ level: 'silent' }),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      generateHighQualityLinkPreview: false,
    });
    st.sock = sock;
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (u: any) => {
      if (u.qr) {
        st.status = 'qr';
        st.qr = u.qr;
      }
      if (u.connection === 'open') {
        st.status = 'on';
        st.qr = null;
        st.tries = 0;
        st.error = null;
        st.me = String(sock.user?.id || '').split(':')[0].split('@')[0] || null;
        console.log('[formcraft] whatsapp linked', st.me ? `+${st.me}` : '');
      }
      if (u.connection === 'close') {
        const code = Number(u.lastDisconnect?.error?.output?.statusCode) || 0;
        st.sock = null;
        st.status = 'off';
        st.qr = null;
        if (code === B.DisconnectReason.loggedOut) {
          // Unlinked from the phone: start again from a new QR.
          wipe();
          st.me = null;
          st.want = false;
          st.error = 'logged_out';
          console.log('[formcraft] whatsapp unlinked from the phone');
          return;
        }
        // A dropped connection reconnects (slower each time); an unscanned QR gives up after a while.
        if (st.want && st.tries < 8 && (linked() || st.tries < 3)) {
          st.tries++;
          setTimeout(() => void waStart(), Math.min(60_000, 3000 * st.tries));
        } else st.want = false;
      }
    });
  } catch (e: any) {
    st.sock = null;
    st.status = 'off';
    st.error = String(e?.message || e).slice(0, 200);
    console.error('[formcraft] whatsapp', st.error);
  }
}

function wipe() {
  try {
    fs.rmSync(DIR, { recursive: true, force: true });
  } catch {
    /* already gone */
  }
}

/** Unlinks: this server stops sending and is removed from the phone's Linked devices. */
export async function waLogout() {
  st.want = false;
  try {
    await st.sock?.logout();
  } catch {
    /* already gone */
  }
  try {
    st.sock?.end?.(undefined);
  } catch {
    /* closed */
  }
  st.sock = null;
  st.status = 'off';
  st.qr = null;
  st.me = null;
  st.error = null;
  wipe();
}

/** At server start: reconnect if it was linked before. */
export function waResume() {
  if (linked()) void waStart();
}

/**
 * A phone number in WhatsApp's format (digits with country code).
 * "+971 50 123 4567", "00971501234567" → 971501234567; a local "050 123 4567" uses the default country code.
 */
export function waNumber(phone: string | null | undefined, defaultCountry = '') {
  const raw = String(phone || '').trim();
  let d = raw.replace(/\D/g, '');
  if (!d) return '';
  if (raw.startsWith('+')) return d.length >= 8 && d.length <= 15 ? d : '';
  if (d.startsWith('00')) d = d.slice(2);
  else if (defaultCountry && (d.startsWith('0') || d.length <= 10)) d = defaultCountry + d.replace(/^0+/, '');
  return d.length >= 8 && d.length <= 15 ? d : '';
}

export interface WaDocument {
  data: Buffer;
  fileName: string;
  mimetype: string;
}

/** Sends a text (optionally with a document) to one number. One message at a time, 3 s apart. */
export function waSend(num: string, text: string, doc?: WaDocument): Promise<WaResult> {
  if (!num) return Promise.resolve('bad_number');
  if (st.status !== 'on' || !st.sock) return Promise.resolve('not_linked');
  const job = st.queue.then(async (): Promise<WaResult> => {
    try {
      const [r] = (await st.sock.onWhatsApp(num)) || [];
      if (!r?.exists) return 'not_on_whatsapp';
      const caption = text.slice(0, 3000);
      if (doc) await st.sock.sendMessage(r.jid, { document: doc.data, fileName: doc.fileName, mimetype: doc.mimetype, caption });
      else await st.sock.sendMessage(r.jid, { text: caption });
      await new Promise((res) => setTimeout(res, 3000));
      return 'ok';
    } catch (e: any) {
      console.error('[formcraft] whatsapp send', e?.message || e);
      return 'failed';
    }
  });
  st.queue = job.catch(() => {});
  return job;
}

export const WA_ERRORS: Record<Exclude<WaResult, 'ok'>, string> = {
  not_linked: 'WhatsApp isn’t linked. An admin can link it in Settings → Notification channel setup.',
  not_on_whatsapp: 'That number isn’t on WhatsApp.',
  bad_number: 'Enter the WhatsApp number with its country code, e.g. +971 50 123 4567.',
  failed: 'WhatsApp couldn’t send the message. Try again in a minute.',
};
