import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb', // Allow up to 50MB for PDF uploads
    },
  },
  // Silence workspace root warning (we use npm, not bun)
  outputFileTracingRoot: undefined,
};

export default nextConfig;
