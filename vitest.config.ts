import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    /**
     * Vitests Standard sind 5 s. Die DB-gestützten Tests (Varianten-Familie,
     * SP-API-Kette) sprechen ein echtes Supabase-Postgres über das Netz an und
     * liefen unter paralleler Last genau an dieser Grenze in Zeitüberschreitungen
     * — ein Flake, der wie ein echter Fehlschlag aussieht. Reine Rechen-Tests
     * brauchen Millisekunden, ein höheres Limit kostet sie also nichts.
     */
    testTimeout: 20000,
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
