import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  env: {
    // Versión que reporta el iPad de planta al sincronizar (se ve en /admin/sincronizacion).
    NEXT_PUBLIC_APP_VERSION:
      process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? new Date().toISOString().slice(0, 16),
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Nadie debe poder incrustar la app en un iframe (clickjacking).
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Evita filtrar el token del portal (/c/[token]) a otros sitios.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // El service worker de planta debe actualizarse en cada despliegue.
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
};

export default nextConfig;
