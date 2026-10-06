/** @type {import('next').NextConfig} */
const nextConfig = {
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
