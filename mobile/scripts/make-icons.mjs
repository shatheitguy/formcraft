#!/usr/bin/env node
// Renders the Android launcher icons and splash screens from SVG files.
//
//   node scripts/make-icons.mjs                                   (uses assets/icon.svg + assets/icon-foreground.svg)
//   node scripts/make-icons.mjs --icon path/to/icon.svg [--foreground path/to/fg.svg]
//        [--background "#0F172A"] [--splash-bg "#0F172A"] [--favicon ../docs/img/icon.png]
//
// --icon        full square icon (legacy launcher icon, splash artwork). Required unless assets/icon.svg exists.
// --foreground  adaptive-icon foreground on a 108x108 canvas with the artwork inside the central 66dp safe zone.
//               Without it the full icon is shrunk into the safe zone.
// --background  adaptive-icon background colour (default #0F172A).
// --splash-bg   splash screen colour (default: the --background colour).
// --favicon     also write a 256x256 PNG of the full icon to this path.
//
// Writes into android/app/src/main/res: mipmap-*/ic_launcher.png, ic_launcher_round.png, ic_launcher_foreground.png,
// values/ic_launcher_background.xml, values/splash_colors.xml and drawable*/splash.png. Then rebuild the APK.
import sharp from 'sharp';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const res = join(root, 'android', 'app', 'src', 'main', 'res');

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const iconPath = resolve(opt('icon', join(root, 'assets', 'icon.svg')));
const defaultFg = join(root, 'assets', 'icon-foreground.svg');
const fgPath = opt('foreground', args.includes('--icon') ? null : existsSync(defaultFg) ? defaultFg : null);
const bg = opt('background', '#0F172A');
const splashBg = opt('splash-bg', bg);
const favicon = opt('favicon', null);

if (!existsSync(iconPath)) {
  console.error(`Icon SVG not found: ${iconPath}`);
  process.exit(1);
}
if (!existsSync(res)) {
  console.error('android/ project not found: run "npx cap add android" first.');
  process.exit(1);
}
const iconSvg = readFileSync(iconPath);
const fgSvg = fgPath ? readFileSync(resolve(fgPath)) : null;

/** SVG rendered to a square PNG of `size` px (density raised so small viewBoxes stay sharp). */
const render = (svg, size) => sharp(svg, { density: 1200 }).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();

const out = async (file, buf) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, buf);
};

const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

/** Adaptive foreground (108dp canvas). */
async function foreground(px) {
  if (fgSvg) return render(fgSvg, px);
  // full icon shrunk into the 66dp safe zone
  const inner = Math.round((px * 66) / 108);
  return sharp({ create: { width: px, height: px, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await render(iconSvg, inner), gravity: 'center' }])
    .png()
    .toBuffer();
}

for (const [d, k] of Object.entries(densities)) {
  const dir = join(res, `mipmap-${d}`);
  const legacy = Math.round(48 * k);
  const fgPx = Math.round(108 * k);
  // legacy square icon: the full artwork
  await out(join(dir, 'ic_launcher.png'), await render(iconSvg, legacy));
  // legacy round icon: background circle with the foreground artwork
  const circle = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${legacy}" height="${legacy}"><circle cx="${legacy / 2}" cy="${legacy / 2}" r="${legacy / 2}" fill="${bg}"/></svg>`,
  );
  const fgForRound = await sharp(await foreground(fgPx)).resize(Math.round(legacy * 1.25), Math.round(legacy * 1.25)).extract({
    left: Math.round(legacy * 0.125), top: Math.round(legacy * 0.125), width: legacy, height: legacy,
  }).toBuffer();
  await out(join(dir, 'ic_launcher_round.png'), await sharp(circle).composite([{ input: fgForRound }]).png().toBuffer());
  await out(join(dir, 'ic_launcher_foreground.png'), await foreground(fgPx));
}

await out(
  join(res, 'values', 'ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${bg}</color>\n</resources>\n`,
);
await out(
  join(res, 'values', 'splash_colors.xml'),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="splash_background">${splashBg}</color>\n</resources>\n`,
);

// Splash (Android 11 and older show this image; Android 12+ show the launcher icon on splash_background)
const splashSizes = {
  drawable: [480, 320],
  'drawable-port-mdpi': [320, 480], 'drawable-port-hdpi': [480, 800], 'drawable-port-xhdpi': [720, 1280],
  'drawable-port-xxhdpi': [960, 1600], 'drawable-port-xxxhdpi': [1280, 1920],
  'drawable-land-mdpi': [480, 320], 'drawable-land-hdpi': [800, 480], 'drawable-land-xhdpi': [1280, 720],
  'drawable-land-xxhdpi': [1600, 960], 'drawable-land-xxxhdpi': [1920, 1280],
};
for (const [dir, [w, h]] of Object.entries(splashSizes)) {
  const size = Math.round(Math.min(w, h) * 0.3);
  const buf = await sharp({ create: { width: w, height: h, channels: 4, background: splashBg } })
    .composite([{ input: await render(iconSvg, size), gravity: 'center' }])
    .png()
    .toBuffer();
  await out(join(res, dir, 'splash.png'), buf);
}

if (favicon) {
  await out(resolve(favicon), await render(iconSvg, 256));
  console.log(`Wrote ${resolve(favicon)} (256x256)`);
}
console.log(`Icons and splash written from ${iconPath}${fgPath ? ` (foreground ${fgPath})` : ''}; background ${bg}, splash ${splashBg}.`);
