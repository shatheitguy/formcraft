import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { extAllowed, extOf, fileLimits, fileRefs, makeFileRef, safeDiskName, STORED_NAME_RE } from './files';
import type { Answers, FormField } from './types';
import { UPLOAD_DIR } from './uploads';

/** Files attached to form responses live in UPLOAD_DIR/responses/<formId>/ (never served publicly). */
export const RESPONSES_DIR = path.join(UPLOAD_DIR, 'responses');

const FORM_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function formFilesDir(formId: string) {
  if (!FORM_ID_RE.test(formId)) throw new Error('Invalid form id');
  return path.join(RESPONSES_DIR, formId);
}

export function storedFilePath(formId: string, stored: string): string | null {
  if (!FORM_ID_RE.test(formId) || !STORED_NAME_RE.test(stored)) return null;
  return path.join(RESPONSES_DIR, formId, stored);
}

export function responseFileExists(formId: string, stored: string) {
  const p = storedFilePath(formId, stored);
  return !!p && existsSync(p);
}

/* ----------------------------- content sniffing ----------------------------- */

const startsWith = (b: Buffer, bytes: number[], offset = 0) => bytes.every((x, i) => b[offset + i] === x);
const ascii = (b: Buffer, from: number, to: number) => b.subarray(from, to).toString('latin1');

const isJpeg = (b: Buffer) => startsWith(b, [0xff, 0xd8, 0xff]);
const isPng = (b: Buffer) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const isGif = (b: Buffer) => ascii(b, 0, 4) === 'GIF8';
const isWebp = (b: Buffer) => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP';
const isHeif = (b: Buffer) => ascii(b, 4, 8) === 'ftyp' && /^(heic|heix|hevc|heim|heis|hevm|hevs|mif1|msf1|avif)$/.test(ascii(b, 8, 12));
const isPdf = (b: Buffer) => b.subarray(0, 1024).includes(Buffer.from('%PDF-'));
const isZip = (b: Buffer) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]);
const isOle2 = (b: Buffer) => startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
/** Plain text / CSV: no NUL bytes in the first 8 KB and valid-ish UTF-8 (or a UTF-16 BOM). */
const isText = (b: Buffer) => {
  if (startsWith(b, [0xff, 0xfe]) || startsWith(b, [0xfe, 0xff])) return true;
  const head = b.subarray(0, 8192);
  return !head.includes(0);
};

const SNIFF: Record<string, (b: Buffer) => boolean> = {
  jpg: isJpeg,
  jpeg: isJpeg,
  png: isPng,
  gif: isGif,
  webp: isWebp,
  heic: isHeif,
  heif: isHeif,
  pdf: isPdf,
  docx: isZip,
  xlsx: isZip,
  odt: isZip,
  doc: isOle2,
  xls: isOle2,
  txt: isText,
  csv: isText,
};

/** Checks the bytes match the extension, for the types we know. Unknown types (allowed with "Any") pass. */
export function contentMatchesExt(ext: string, buf: Buffer) {
  const check = SNIFF[ext];
  return check ? check(buf) : true;
}

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt: 'application/vnd.oasis.opendocument.text',
  txt: 'text/plain; charset=utf-8',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
};

export const contentTypeFor = (name: string) => CONTENT_TYPES[extOf(name)] ?? 'application/octet-stream';
/** Shown in the browser rather than downloaded. */
export const isInlineSafe = (name: string) => ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'].includes(extOf(name));

/* --------------------------------- storage --------------------------------- */

export async function saveResponseFile(formId: string, field: FormField, file: File): Promise<{ ref: string; size: number } | { error: string; status?: number }> {
  const { kinds, maxFileMb } = fileLimits(field);
  const original = file.name || 'file';
  const ext = extOf(original);
  if (!extAllowed(ext, kinds)) return { error: 'This type of file isn’t allowed here.', status: 415 };
  if (file.size === 0) return { error: 'The file is empty.' };
  if (file.size > maxFileMb * 1024 * 1024) return { error: `Files must be ${maxFileMb} MB or smaller.`, status: 413 };

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > maxFileMb * 1024 * 1024) return { error: `Files must be ${maxFileMb} MB or smaller.`, status: 413 };
  if (!contentMatchesExt(ext, buf)) return { error: 'The file’s contents don’t match its type.', status: 415 };

  const stored = `${crypto.randomBytes(16).toString('hex')}-${safeDiskName(original)}`;
  const dir = formFilesDir(formId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, stored), buf, { flag: 'wx' });
  return { ref: makeFileRef(stored, original), size: buf.length };
}

/** Removes the files referenced by these answers (best effort). */
export async function deleteAnswerFiles(formId: string, fields: FormField[], answers: Answers[]) {
  const fileFields = fields.filter((f) => f.type === 'file');
  if (!fileFields.length) return;
  for (const a of answers) {
    for (const f of fileFields) {
      for (const ref of fileRefs(a[f.id])) {
        const p = storedFilePath(formId, ref.stored);
        if (p) await fs.rm(p, { force: true }).catch(() => {});
      }
    }
  }
}

/** Removes a form's whole upload folder (best effort). */
export async function deleteFormFiles(formId: string) {
  try {
    await fs.rm(formFilesDir(formId), { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

/* -------------------------------- rate limit -------------------------------- */

const WINDOW_MS = 10 * 60 * 1000;
const MAX_UPLOADS = 60;
const MAX_BYTES = 300 * 1024 * 1024;
// Per form, whatever the client IP claims to be (X-Forwarded-For can be forged when the server is
// reachable directly), so one form can't be used to fill the disk.
const FORM_MAX_UPLOADS = 600;
const FORM_MAX_BYTES = 2 * 1024 * 1024 * 1024;
const g = globalThis as unknown as { __fcFileRate?: Map<string, { start: number; count: number; bytes: number }> };
const buckets = (g.__fcFileRate ??= new Map());

function take(key: string, bytes: number, maxCount: number, maxBytes: number, now: number) {
  let b = buckets.get(key);
  if (!b || now - b.start > WINDOW_MS) b = { start: now, count: 0, bytes: 0 };
  buckets.set(key, b);
  if (b.count + 1 > maxCount || b.bytes + bytes > maxBytes) return false;
  b.count += 1;
  b.bytes += bytes;
  return true;
}

/** In-memory limit per 10 minutes: 60 uploads or 300 MB per IP, and 600 uploads or 2 GB per form. */
export function uploadRateLimited(ip: string, bytes: number, formId?: string) {
  const now = Date.now();
  if (buckets.size > 5000) for (const [k, v] of buckets) if (now - v.start > WINDOW_MS) buckets.delete(k);
  const fb = formId ? buckets.get(`form:${formId}`) : undefined;
  if (fb && now - fb.start <= WINDOW_MS && (fb.count + 1 > FORM_MAX_UPLOADS || fb.bytes + bytes > FORM_MAX_BYTES)) return true;
  if (!take(`ip:${ip}`, bytes, MAX_UPLOADS, MAX_BYTES, now)) return true;
  if (formId) take(`form:${formId}`, bytes, FORM_MAX_UPLOADS, FORM_MAX_BYTES, now);
  return false;
}

export function clientIp(req: Request) {
  return (req.headers.get('x-forwarded-for')?.split(',')[0] ?? req.headers.get('x-real-ip') ?? 'local').trim() || 'local';
}
