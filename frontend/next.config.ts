import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: false, // Enable type checking now that we fixed issues
  },
};

export default nextConfig;
