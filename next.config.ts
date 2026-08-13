import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    tsconfigPath: "tsconfig.vercel.json",
  },
  ...(process.env.VERCEL ? {
    turbopack: {
      resolveAlias: {
        "cloudflare:workers": "./app/lib/server/cloudflare-workers-vercel.ts",
      },
    },
  } : {}),
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" }] }];
  },
};

export default nextConfig;
