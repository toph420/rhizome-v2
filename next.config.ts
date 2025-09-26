import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverActions: {
    bodySizeLimit: '50mb', // Allow up to 50MB for PDF uploads
  },
};

export default nextConfig;
