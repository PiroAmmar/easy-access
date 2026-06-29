import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Use standalone output for production deployments
  // output: 'standalone',

  // Allow importing from @shared package
  transpilePackages: ['@easy-access/shared'],

  experimental: {
    // Enable React 19 features
    ppr: false,
  },

  serverExternalPackages: ['pg', 'pg-native'],

  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      'pg-native': false,
    };
    return config;
  },

  // Strict security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
