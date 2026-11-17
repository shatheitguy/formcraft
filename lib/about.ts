import os from 'node:os';
import { CURRENT_VERSION, latestKnownVersion, newerVersion } from './activity';
import { readState as readBackupState } from './auto-backup';
import { databaseInfo } from './database';
import { prisma } from './db';
import { gitInfo, installKind, readUpdateStatus, supervisor } from './self-update';
import { waStatus } from './whatsapp';

/** Everything Settings → About shows: version, update state, install type, runtime and counts. */
export async function aboutInfo() {
  const [db, latest, activeForms, backup] = await Promise.all([
    databaseInfo(),
    latestKnownVersion(),
    prisma.form.count({ where: { status: 'ACTIVE' } }).catch(() => 0),
    readBackupState().catch(() => null),
  ]);
  const checked = await prisma.appMeta.findUnique({ where: { key: 'update.checkedAt' } }).catch(() => null);
  return {
    version: CURRENT_VERSION,
    latest,
    updateAvailable: !!latest && newerVersion(latest, CURRENT_VERSION),
    checkedAt: checked?.value ?? null,
    install: installKind(),
    supervisor: supervisor(),
    git: gitInfo(),
    update: readUpdateStatus(),
    runtime: {
      node: process.version,
      platform: `${os.type()} ${os.release()} (${process.arch})`,
      uptimeSec: Math.round(process.uptime()),
      memoryMb: Math.round(process.memoryUsage().rss / 1048576),
      hostname: os.hostname(),
    },
    database: { provider: db.provider, version: db.version, sizeBytes: db.sizeBytes, ok: db.ok },
    counts: { ...db.counts, activeForms },
    whatsapp: waStatus().status,
    backup: backup ? { lastSuccess: backup.lastSuccessAt } : null,
  };
}

export type AboutInfo = Awaited<ReturnType<typeof aboutInfo>>;
