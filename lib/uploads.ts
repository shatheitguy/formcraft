import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

// In Docker the working dir is /app, so uploads land on the /app/data volume next to the database.
export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'data', 'uploads');
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const UPLOAD_URL_PREFIX = '/api/uploads/';

// SVG is deliberately excluded: it can carry scripts and is served from our own origin.
const TYPES: Record<string, { ext: string; magic: (b: Buffer) => boolean }> = {
  'image/png': { ext: 'png', magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/jpeg': { ext: 'jpg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/gif': { ext: 'gif', magic: (b) => b.subarray(0, 4).toString('ascii') === 'GIF8' },
  'image/webp': { ext: 'webp', magic: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
};

export const CONTENT_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
export const UPLOAD_NAME_RE = /^[a-f0-9]{32}\.(png|jpg|gif|webp)$/;

export async function saveUpload(file: File): Promise<{ url: string } | { error: string }> {
  const type = TYPES[file.type];
  if (!type) return { error: 'Only PNG, JPG, GIF and WebP images are supported.' };
  if (file.size > MAX_UPLOAD_BYTES) return { error: 'Images must be 2 MB or smaller.' };
  const buf = Buffer.from(await file.arrayBuffer());
  if (!type.magic(buf)) return { error: 'The file doesn’t look like a valid image.' };

  const name = `${crypto.randomBytes(16).toString('hex')}.${type.ext}`;
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOAD_DIR, name), buf);
  return { url: UPLOAD_URL_PREFIX + name };
}

/** Accepts our own upload URLs or absolute http(s) URLs; anything else becomes ''. */
export function safeImageUrl(v: unknown): string {
  if (typeof v !== 'string') return '';
  const s = v.trim();
  if (s.startsWith(UPLOAD_URL_PREFIX) && UPLOAD_NAME_RE.test(s.slice(UPLOAD_URL_PREFIX.length))) return s;
  if (/^https?:\/\/[^\s"'<>]+$/.test(s) && s.length <= 1000) return s;
  return '';
}
