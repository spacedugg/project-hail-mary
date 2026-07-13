import {
  pgTable,
  text,
  integer,
  timestamp,
  jsonb,
  boolean,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Entity-Hierarchie (D16): Kunde → Marke → Marktplatz/Land → Produktgruppe → Produkt (ASIN).
 * Diese Achse + Zeit (Perioden) ist das Rückgrat aller Auswertungen — Datenmodell, kein Feature.
 */

export const clients = pgTable("clients", {
  id: text("id").primaryKey(), // nanoid
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logoUrl: text("logo_url"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const brands = pgTable("brands", {
  id: text("id").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // Brand-Voice-Override; Default ist die temoa-Voice aus dem Wissens-Layer
  voiceTone: text("voice_tone"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** v1: DE-only (D32) — Feld existiert, damit Multi-Marktplatz kein Schema-Bruch wird. */
export const marketplaceEnum = pgEnum("marketplace", [
  "de",
  "uk",
  "fr",
  "it",
  "es",
  "nl",
  "us",
]);

export const productGroups = pgTable("product_groups", {
  id: text("id").primaryKey(),
  brandId: text("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
});

export const products = pgTable(
  "products",
  {
    id: text("id").primaryKey(),
    brandId: text("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    productGroupId: text("product_group_id").references(() => productGroups.id, {
      onDelete: "set null",
    }),
    asin: text("asin"), // null bei Neuprodukt ohne Listing
    marketplace: marketplaceEnum("marketplace").notNull().default("de"),
    name: text("name").notNull(),
    /**
     * Produkt-Wahrheit (PFLICHT-Input #1, knowledge/inputs.md):
     * Material, Maße, Specs, USPs — der Anker für Reference-Fidelity-Checks.
     * Bewusst strukturloses JSON in v1; härtet mit dem Wissens-Layer aus.
     */
    facts: jsonb("facts").$type<ProductFacts>().notNull().default({}),
    price: integer("price_cents"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("products_brand_asin_mp").on(t.brandId, t.asin, t.marketplace)],
);

export type ProductFacts = {
  productType?: string;
  materials?: string[]; // ehrlich, inkl. Hybride ("Aluminium-Korpus", "ABS-Abdeckung")
  dimensions?: string;
  specs?: Record<string, string>;
  usps?: string[]; // strukturiertes USP-Set — Verteilungsregel: jede USP genau 1×
  targetAudience?: string;
  certifications?: string[];
};

/** Keyword-Basis (PFLICHT-Input #2) — aus Cerebro-CSV oder manuell. */
export const keywordTierEnum = pgEnum("keyword_tier", [
  "primary", // 3–4 → Titel
  "secondary", // 8–12 → Bullets
  "tertiary", // → Beschreibung
  "backend", // Rest → Backend
  "excluded", // vom Filter ausgeschlossen (Grund in meta)
]);

export const keywords = pgTable("keywords", {
  id: text("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  keyword: text("keyword").notNull(),
  searchVolume: integer("search_volume"),
  tier: keywordTierEnum("tier"),
  source: text("source").notNull().default("manual"), // manual | cerebro | sov_quick_win | sov_revenue_gap | sov_invisible
  meta: jsonb("meta").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Content-Objekte mit Zuständen (D27): Entwurf → freigegeben → synchronisiert.
 * Versioniert pro Produkt & Typ; Baseline für Performance-Monitoring (D33).
 */
export const contentTypeEnum = pgEnum("content_type", [
  "title",
  "bullets",
  "item_highlights", // neue Amazon-Sektion, 125 Zeichen (Nutzer 07/2026)
  "description",
  "backend_keywords",
  "qa", // Q&A-Paare — Datengrundlage für Rufus/Alexa-for-Shopping
  // spätere Phase: main_image_brief, listing_image_brief, aplus_plan
]);

export const contentStatusEnum = pgEnum("content_status", [
  "draft",
  "approved",
  "synced",
]);

export const contentVersions = pgTable("content_versions", {
  id: text("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  type: contentTypeEnum("type").notNull(),
  version: integer("version").notNull().default(1),
  /** title/description: { text }, bullets: { items: string[5] }, backend: { terms } */
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  status: contentStatusEnum("status").notNull().default("draft"),
  /** Ergebnis des Validation-Gates zum Zeitpunkt der Erstellung (Audit-Trail). */
  validation: jsonb("validation").$type<ValidationReport>(),
  /** Herkunft: Modell + Recipe-Version (D28: pro Recipe gepinnt) oder "manual". */
  generatedBy: text("generated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  approvedAt: timestamp("approved_at"),
  syncedAt: timestamp("synced_at"),
});

export type ValidationIssue = {
  rule: string; // z.B. "title.max-length", "bullets.usp-duplicate"
  severity: "error" | "warning";
  message: string;
  /** deterministisch | llm-rubrik | manuell — Evidenz-Klasse (Review R4) */
  evidence: "deterministic" | "llm" | "manual";
};

export type ValidationReport = {
  passed: boolean;
  issues: ValidationIssue[];
  checkedAt: string;
};

/** Review-Insights (Output-Kontrakt aus temoa-audit, SALVAGE §7). */
export const reviewInsights = pgTable("review_insights", {
  id: text("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  dataBasis: text("data_basis").notNull(), // uploaded_csv | apify_scrape | none
  confidence: text("confidence").notNull(), // high | medium | low
  payload: jsonb("payload").$type<ReviewInsightsPayload>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ReviewInsightsPayload = {
  sources: string[];
  stats: { reviewsTotal: number; ratingAvg: number | null };
  painPoints: Array<{
    label: string;
    frequencyPct: number | null;
    mentionCount: number | null;
    quotes: string[];
  }>;
  buyingTriggers: Array<{
    label: string;
    frequencyPct: number | null;
    mentionCount: number | null;
    quotes: string[];
  }>;
  languageToBorrow: string[];
  languageToAvoid: string[];
};

/** Hochgeladene Berichte, getaggt mit Marke·Land·Periode (geführter Upload). */
export const reportUploads = pgTable("report_uploads", {
  id: text("id").primaryKey(),
  brandId: text("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  marketplace: marketplaceEnum("marketplace").notNull().default("de"),
  reportType: text("report_type").notNull(), // business | sqp | ads | searchterm | cerebro | h10_bundle | reviews_csv
  periodStart: timestamp("period_start"),
  periodEnd: timestamp("period_end"),
  fileName: text("file_name").notNull(),
  /** Geparste, normalisierte Zeilen — Rohdatei liegt im Objektspeicher (später). */
  parsed: jsonb("parsed"),
  parseStatus: text("parse_status").notNull().default("pending"), // pending | ok | error
  parseError: text("parse_error"),
  isSuspended: boolean("is_suspended").notNull().default(false), // Perioden-Flag-Muster
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
