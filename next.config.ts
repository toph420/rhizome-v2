import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable ESLint during builds (we have warnings for any types that we'll fix incrementally)
  eslint: {
    ignoreDuringBuilds: true,
  },

  experimental: {
    serverActions: {
      bodySizeLimit: '50mb', // Allow up to 50MB for PDF uploads
    },
  },

  // Ignore log files to prevent Fast Refresh on worker logging
  webpack: (config, { isServer }) => {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ['**/node_modules/**', '**/.git/**', '**/*.log'],
    }

    // PDF.js configuration - disable canvas on both server and client
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    }

    return config
  },

  // Silence workspace root warning (we use npm, not bun)
  outputFileTracingRoot: undefined,
  // Allow external images (YouTube thumbnails)
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'i.ytimg.com',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
