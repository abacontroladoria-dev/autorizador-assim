import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  trailingSlash: true,
  allowedDevOrigins: ['192.168.0.241'],
  turbopack: {},
};

export default nextConfig;
