import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@libsql/client"],
  // A+-Upload (D220): hochgeladene A+-Bilder reisen als base64 im Server-Action-
  // Request der listing-Etappe. Der Client skaliert sie vorher herunter; 12 MB
  // deckt mehrere Bilder sicher ab (Default 1 MB reichte nicht).
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
  // Drizzle-Migrationen werden zur Laufzeit vom Dateisystem gelesen —
  // ohne explizites Include fehlt der Ordner im Vercel-Serverless-Bundle.
  outputFileTracingIncludes: {
    "/**": ["./drizzle/**/*"],
  },
};

export default nextConfig;
