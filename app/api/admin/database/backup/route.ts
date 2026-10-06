import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { forbidden, getCurrentUser, unauthorized } from '@/lib/auth';
import { dbProvider } from '@/lib/database';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

/** GET ?format=json (any database) | sqlite (raw database snapshot) */
export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  if (me.role !== 'ADMIN') return forbidden();
  const format = new URL(req.url).searchParams.get('format') ?? 'json';

  if (format === 'sqlite') {
    if (dbProvider() !== 'sqlite') return NextResponse.json({ error: 'Raw file backups are only available for SQLite.' }, { status: 400 });
    // VACUUM INTO writes a consistent snapshot even while the app is running.
    const tmp = path.join(os.tmpdir(), `formcraft-${Date.now()}.db`);
    await prisma.$executeRawUnsafe(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
    const buf = await fs.readFile(tmp);
    await fs.unlink(tmp).catch(() => {});
    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.sqlite3',
        'Content-Disposition': `attachment; filename="formcraft-${stamp()}.db"`,
      },
    });
  }

  const [forms, submissions, users, access, settings] = await Promise.all([
    prisma.form.findMany(),
    prisma.submission.findMany(),
    // Password hashes and secrets are intentionally excluded.
    prisma.user.findMany({ select: { id: true, username: true, email: true, name: true, role: true, formScope: true, active: true, createdAt: true } }),
    prisma.formAccess.findMany(),
    prisma.setting.findMany({ where: { key: 'app' } }),
  ]);
  const body = JSON.stringify({ exportedAt: new Date().toISOString(), version: 1, forms, submissions, users, formAccess: access, settings }, null, 2);
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="formcraft-export-${stamp()}.json"`,
    },
  });
}
