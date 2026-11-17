import type { AnswerValue, FormField } from './types';

/**
 * File-upload fields: shared (client + server) helpers.
 *
 * An answer is a string[] of file references, each `"<storedName>|<originalName>"`:
 *  - storedName: `<32 hex>-<ascii-safe-name>.<ext>`, the file name on disk under
 *    UPLOAD_DIR/responses/<formId>/
 *  - originalName: the name the respondent's file had (display only, sanitised).
 */

export type FileKind = 'image' | 'pdf' | 'document' | 'spreadsheet' | 'any';

export const FILE_KINDS: { kind: FileKind; label: string; exts: string[] }[] = [
  { kind: 'image', label: 'Images', exts: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'] },
  { kind: 'pdf', label: 'PDF', exts: ['pdf'] },
  { kind: 'document', label: 'Documents', exts: ['doc', 'docx', 'odt', 'txt'] },
  { kind: 'spreadsheet', label: 'Spreadsheets', exts: ['xls', 'xlsx', 'csv'] },
  { kind: 'any', label: 'Any', exts: [] },
];

/** Never accepted, even with "Any": programs and scripts, and pages that would run on our origin. */
export const BLOCKED_EXTS = new Set([
  'exe', 'msi', 'bat', 'cmd', 'com', 'scr', 'pif', 'cpl', 'dll', 'sys', 'ps1', 'psm1', 'vbs', 'vbe', 'js', 'jse', 'mjs', 'wsf', 'wsh', 'hta',
  'jar', 'sh', 'bash', 'php', 'phtml', 'py', 'pl', 'rb', 'cgi', 'html', 'htm', 'xhtml', 'shtml', 'svg', 'svgz', 'xml', 'reg', 'lnk', 'apk', 'app', 'dmg',
]);

export const DEFAULT_FILE_KINDS: FileKind[] = ['image', 'pdf'];
export const DEFAULT_MAX_FILES = 1;
export const DEFAULT_MAX_FILE_MB = 10;
export const MAX_FILES_LIMIT = 10;
export const MAX_FILE_MB_LIMIT = 25;

export const STORED_NAME_RE = /^[a-f0-9]{32}-[A-Za-z0-9._-]{1,100}$/;

const clampInt = (v: unknown, min: number, max: number, dflt: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};

export function fileLimits(field: Pick<FormField, 'fileKinds' | 'maxFiles' | 'maxFileMb'>) {
  const kinds = (field.fileKinds ?? DEFAULT_FILE_KINDS).filter((k): k is FileKind => FILE_KINDS.some((x) => x.kind === k));
  return {
    kinds: kinds.length ? kinds : DEFAULT_FILE_KINDS,
    maxFiles: clampInt(field.maxFiles, 1, MAX_FILES_LIMIT, DEFAULT_MAX_FILES),
    maxFileMb: clampInt(field.maxFileMb, 1, MAX_FILE_MB_LIMIT, DEFAULT_MAX_FILE_MB),
  };
}

export const extOf = (name: string) => {
  const m = /\.([A-Za-z0-9]{1,10})$/.exec(name.trim());
  return m ? m[1].toLowerCase() : '';
};

/** Whether a file extension is allowed by the field's kinds. */
export function extAllowed(ext: string, kinds: FileKind[]) {
  if (!ext || BLOCKED_EXTS.has(ext)) return false;
  if (kinds.includes('any')) return true;
  return FILE_KINDS.some((k) => kinds.includes(k.kind) && k.exts.includes(ext));
}

/** Value for <input type="file" accept>. Empty for "Any". */
export function acceptAttr(kinds: FileKind[]) {
  if (kinds.includes('any')) return undefined;
  const parts: string[] = [];
  for (const k of FILE_KINDS) {
    if (!kinds.includes(k.kind)) continue;
    if (k.kind === 'image') parts.push('image/*');
    parts.push(...k.exts.map((e) => '.' + e));
  }
  return parts.join(',');
}

/** Display name: no control characters, separators or the reference delimiter. */
export function cleanOriginalName(name: string) {
  const s = name
    .replace(/[\u0000-\u001f\u007f|/\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return (s || 'file').slice(-200);
}

/** ASCII-only name for the disk: keeps letters, digits, dot, dash and underscore. */
export function safeDiskName(name: string) {
  const ext = extOf(name);
  const base = name
    .replace(/\.[^.]*$/, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 60);
  return (base || 'file') + (ext ? '.' + ext : '');
}

export interface FileRef {
  stored: string;
  name: string;
}

export function parseFileRef(ref: unknown): FileRef | null {
  if (typeof ref !== 'string' || ref.length > 400) return null;
  const i = ref.indexOf('|');
  if (i < 0) return null;
  const stored = ref.slice(0, i);
  const name = ref.slice(i + 1);
  if (!STORED_NAME_RE.test(stored) || !name) return null;
  return { stored, name };
}

export const makeFileRef = (stored: string, original: string) => `${stored}|${cleanOriginalName(original)}`;

/** The file references of an answer (anything malformed is dropped). */
export function fileRefs(value: AnswerValue | undefined): FileRef[] {
  if (!Array.isArray(value)) return [];
  return value.map(parseFileRef).filter((r): r is FileRef => !!r);
}

export const fileUrl = (formId: string, ref: FileRef, download = false) =>
  `/api/forms/${encodeURIComponent(formId)}/files/${encodeURIComponent(ref.stored)}?name=${encodeURIComponent(ref.name)}${download ? '&download=1' : ''}`;

export const INLINE_IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);
export const isPreviewableImage = (name: string) => INLINE_IMAGE_EXTS.has(extOf(name));

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
