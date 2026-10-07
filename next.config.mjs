import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The running version, compared against the latest release for update notifications.
  env: { FC_VERSION: version },
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Starts per-form port listeners on boot (instrumentation.ts).
    instrumentationHook: true,
    serverComponentsExternalPackages: ['@prisma/client', 'nodemailer'],
  },
};

export default nextConfig;
