#!/usr/bin/env node
// One-click update for native (git checkout) installs, started from Settings → About.
// Runs in its own process so it survives the server stopping:
//   git pull --ff-only → npm ci → prisma generate → prisma db push → next build
// then, when pm2 / systemd supervises the server, stops the server so it restarts on the new version.
// Progress goes to data/update-status.json (read by the About page) and output to data/update.log.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const statusFile = process.env.FC_UPDATE_STATUS || path.join(root, 'data', 'update-status.json');
const supervisor = process.env.FC_SUPERVISOR || 'none';
const serverPid = Number(process.env.FC_SERVER_PID) || 0;
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const read = () => {
  try {
    return JSON.parse(fs.readFileSync(statusFile, 'utf8'));
  } catch {
    return {};
  }
};
const write = (patch) => fs.writeFileSync(statusFile, JSON.stringify({ ...read(), ...patch }));

function run(step, cmd, args) {
  write({ state: 'running', step });
  console.log(`\n▸ ${step}: ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32', env: process.env });
  if (r.status !== 0) throw new Error(`${step} failed (exit ${r.status ?? r.signal}). See data/update.log.`);
}

try {
  run('Downloading the new version', 'git', ['pull', '--ff-only']);
  const lock = fs.existsSync(path.join(root, 'package-lock.json'));
  run('Installing packages', npm, lock ? ['ci', '--no-audit', '--no-fund'] : ['install', '--no-audit', '--no-fund']);
  run('Preparing the database client', npx, ['prisma', 'generate']);
  run('Updating the database', npx, ['prisma', 'db', 'push', '--skip-generate']);
  run('Building', npx, ['next', 'build']);
  let to = read().to;
  try {
    to = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version || to;
  } catch {
    /* keep the expected version */
  }
  const restarts = supervisor === 'pm2' || supervisor === 'systemd';
  write({ state: restarts ? 'done' : 'restart_needed', step: restarts ? 'Restarting' : 'Restart FormCraft to finish', to, finishedAt: new Date().toISOString() });
  console.log(restarts ? '\n✓ Built. Restarting the server…' : '\n✓ Built. Restart FormCraft to run the new version.');
  if (restarts && serverPid) {
    // pm2 / systemd (Restart=always) start it again on the new build.
    setTimeout(() => {
      try {
        process.kill(serverPid, 'SIGTERM');
      } catch {
        /* already stopped */
      }
    }, 1500);
  }
} catch (err) {
  write({ state: 'failed', error: String(err?.message || err), finishedAt: new Date().toISOString() });
  console.error(`\n✗ ${err?.message || err}`);
  process.exitCode = 1;
}
