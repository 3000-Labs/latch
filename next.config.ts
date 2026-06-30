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
  async headers() {
    return [
      {
        source: "/dev/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:",
              "frame-src 'self' https://*.moonpay.com",
              "connect-src 'self' https://*.moonpay.com https://horizon-testnet.stellar.org",
              "img-src 'self' data: https://*.moonpay.com",
              "style-src 'self' 'unsafe-inline'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
