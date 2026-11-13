import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_PSYZON_BUILD: process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_PSYZON_BUILD || (process.env.NODE_ENV==="production"?new Date().toISOString():"development") },
  poweredByHeader: false,
  typescript: {
    tsconfigPath: "tsconfig.vercel.json",
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
        { key: "X-DNS-Prefetch-Control", value: "off" },
        // Deliberately excludes includeSubDomains/preload until every subdomain is HTTPS-only.
        { key: "Strict-Transport-Security", value: "max-age=31536000" },
      ],
    }];
  },
};

export default nextConfig;
