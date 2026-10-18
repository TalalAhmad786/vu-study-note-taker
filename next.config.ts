import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Self-contained server for the Docker image (see Dockerfile).
  output: 'standalone',
  cacheComponents: true,
  // Uploads to /api/parse pass through proxy.ts, which buffers bodies (default cap 10 MB).
  experimental: { proxyClientMaxBodySize: '60mb' },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
