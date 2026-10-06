import { logoSvg } from '@/lib/logo-svg';
import { getSettings } from '@/lib/settings';
import { ACCENTS, isAccent } from '@/lib/theme';

export const dynamic = 'force-dynamic';

/** Favicon / app icon: the Sha mark in the workspace accent colour. */
export async function GET() {
  const { app } = await getSettings();
  const p = ACCENTS[isAccent(app.accent) ? app.accent : 'indigo'];
  return new Response(logoSvg({ light: p[4], mid: p[6], dark: p[8] }), {
    headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=300' },
  });
}
