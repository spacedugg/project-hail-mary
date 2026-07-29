import { defineConfig } from "drizzle-kit";

/**
 * Supabase/Postgres (D262). `generate` braucht keine Verbindung — Migrationen
 * entstehen allein aus dem Schema. `dbCredentials` wird nur für `push`/`studio`
 * gebraucht und kommt dann aus .env.local.
 */
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
