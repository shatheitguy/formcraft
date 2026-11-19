import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The running version, compared against the latest release for update notifications.
  env: { FC_VERSION: version },
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    const common = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
    ];
    return [
      { source: '/:path*', headers: common },
      // The app itself can't be framed by other sites (clickjacking). Public form pages (/f/…) stay embeddable.
      { source: '/((?!f/).*)', headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }] },
    ];
  },
  experimental: {
    // Starts per-form port listeners on boot (instrumentation.ts).
    instrumentationHook: true,
    // Every page shows live data (forms, responses, settings). By default the browser re-used a page it had seen
    // in the last 30 s, so e.g. a form created in the builder was missing on the dashboard until a reload.
    // 0 = always ask the server on navigation (the branded loading screen covers the wait).
    staleTimes: { dynamic: 0 },
    serverComponentsExternalPackages: ['@prisma/client', 'nodemailer', '@whiskeysockets/baileys', 'pino', 'pdf-lib'],
  },
};

export default nextConfig;
