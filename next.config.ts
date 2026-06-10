import type { NextConfig } from "next";

const extraDevOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Allow opening the dev app via LAN hostname (e.g. phone on http(s)://192.168.x.x:3000).
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", ...extraDevOrigins],
};

export default nextConfig;
