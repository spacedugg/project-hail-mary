import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@libsql/client"],
  // Drizzle-Migrationen werden zur Laufzeit vom Dateisystem gelesen —
  // ohne explizites Include fehlt der Ordner im Vercel-Serverless-Bundle.
  outputFileTracingIncludes: {
    "/**": ["./drizzle/**/*"],
  },
};

export default nextConfig;
