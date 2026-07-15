import { sqliteTable, text, integer, real, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Entity-Hierarchie (D16): Kunde → Marke → Marktplatz/Land → Produktgruppe → Produkt (ASIN).
 * Dialekt: Turso/libSQL (D43) — gleicher Stack wie sales-room/seo-os und damit
 * merge-kompatibel zum temoa-os-Kosmos (D39). Enums = getypte text-Spalten,
 * JSON = text im json-Mode (Drizzle validiert via $type).
 */

const ts = (name: string) =>
  integer(name, { mode: "timestamp" }).$defaultFn(() => new Date());

export const clients = sqliteTable("clients", {
  id: text("id").primaryKey(), // crypto.randomUUID()
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logoUrl: text("logo_url"),
  notes: text("notes"),
  createdAt: ts("created_at").notNull(),
});

/**
 * Agentur-interne Nutzer (D57): jeder meldet sich mit eigenem Konto an und
 * sieht die gesamte Anwendung. Passwort als scrypt "saltHex:hashHex"
 * (reporting-main-Muster); Rollen für später (heute alle "member").
 */
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").$type<"admin" | "member">().notNull().default("member"),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

/**
 * Tool-weite Einstellungen als Key-Value (D61): z. B. `fee_config` =
 * Override der Amazon-Gebühren-Tabellen. Was hier steht, rechnet SOFORT —
 * das Rechenwerk zeigt immer den wirksamen Stand an (Anti-Blackbox).
 */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<unknown>().notNull(),
  updatedBy: text("updated_by"),
  updatedAt: ts("updated_at").notNull(),
});

export const brands = sqliteTable("brands", {
  id: text("id").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // Brand-Voice-Override; Default ist die temoa-Voice aus dem Wissens-Layer
  voiceTone: text("voice_tone"),
  /**
   * Account-Marge in % = Break-even-ACoS-Schwelle für die ACoS/TACoS-Ampel
   * (reporting-main-Priorität: Hand-Eintrag vor berechneten Produkt-Margen;
   * der volle Margen-Rechner mit Gebühren-Tabellen folgt).
   */
  marginPct: real("margin_pct"),
  /**
   * "brand" = betreute Kundenmarke (Portfolio/Workspace).
   * "workbench" = interner Listing-Optimizer-Container für Einzelaufträge
   * ohne Markenbetreuung (D68) — taucht nie als Kundenmarke auf.
   */
  kind: text("kind").$type<"brand" | "workbench">().notNull().default("brand"),
  createdAt: ts("created_at").notNull(),
});

/** v1: DE-only (D32) — Feld existiert, damit Multi-Marktplatz kein Schema-Bruch wird. */
export type Marketplace = "de" | "uk" | "fr" | "it" | "es" | "nl" | "us";

export const productGroups = sqliteTable("product_groups", {
  id: text("id").primaryKey(),
  brandId: text("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
});

export const products = sqliteTable(
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
    marketplace: text("marketplace").$type<Marketplace>().notNull().default("de"),
    name: text("name").notNull(),
    /**
     * Produkt-Wahrheit (PFLICHT-Input #1, knowledge/inputs.md):
     * Material, Maße, Specs, USPs — der Anker für Reference-Fidelity-Checks.
     */
    facts: text("facts", { mode: "json" }).$type<ProductFacts>().notNull().default({}),
    price: integer("price_cents"),
    /** Gespeicherte Margen-Kalkulation (Eingaben + Ergebnis) — liefert Break-even-ACoS je Produkt. */
    marginCalc: text("margin_calc", { mode: "json" }).$type<{
      inputs: import("@/lib/margin/calc").MarginInputs;
      results: import("@/lib/margin/calc").MarginResults;
    }>(),
    createdAt: ts("created_at").notNull(),
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
export type KeywordTier = "primary" | "secondary" | "tertiary" | "backend" | "excluded";

export const keywords = sqliteTable("keywords", {
  id: text("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  keyword: text("keyword").notNull(),
  searchVolume: integer("search_volume"),
  tier: text("tier").$type<KeywordTier>(),
  source: text("source").notNull().default("manual"), // manual | cerebro | sov_quick_win | sov_revenue_gap | sov_invisible
  meta: text("meta", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: ts("created_at").notNull(),
});

/**
 * Content-Objekte mit Zuständen (D27): Entwurf → freigegeben → synchronisiert.
 * Versioniert pro Produkt & Typ; Baseline für Performance-Monitoring (D33).
 */
export type ContentType =
  | "title"
  | "bullets"
  | "item_highlights" // neue Amazon-Sektion, 125 Zeichen (Nutzer 07/2026)
  | "description"
  | "backend_keywords"
  | "qa"; // Q&A-Paare — Datengrundlage für Alexa-for-Shopping

export type ContentStatus = "draft" | "approved" | "synced";

export const contentVersions = sqliteTable("content_versions", {
  id: text("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  type: text("type").$type<ContentType>().notNull(),
  version: integer("version").notNull().default(1),
  /** title/description/highlights: { text }, bullets: { items }, qa: { pairs }, + rationale */
  payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  status: text("status").$type<ContentStatus>().notNull().default("draft"),
  /** Ergebnis des Validation-Gates zum Zeitpunkt der Erstellung (Audit-Trail). */
  validation: text("validation", { mode: "json" }).$type<ValidationReport>(),
  /** Herkunft: Modell + Recipe-Version (D28: pro Recipe gepinnt) oder "manual". */
  generatedBy: text("generated_by"),
  createdAt: ts("created_at").notNull(),
  approvedAt: integer("approved_at", { mode: "timestamp" }),
  syncedAt: integer("synced_at", { mode: "timestamp" }),
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
export const reviewInsights = sqliteTable("review_insights", {
  id: text("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  dataBasis: text("data_basis").notNull(), // uploaded_csv | apify_scrape | none
  confidence: text("confidence").notNull(), // high | medium | low
  payload: text("payload", { mode: "json" }).$type<ReviewInsightsPayload>().notNull(),
  createdAt: ts("created_at").notNull(),
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
export const reportUploads = sqliteTable("report_uploads", {
  id: text("id").primaryKey(),
  brandId: text("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  marketplace: text("marketplace").$type<Marketplace>().notNull().default("de"),
  reportType: text("report_type").notNull(), // business | sqp | ads | searchterm | cerebro | h10_bundle | reviews_csv
  periodStart: integer("period_start", { mode: "timestamp" }),
  periodEnd: integer("period_end", { mode: "timestamp" }),
  fileName: text("file_name").notNull(),
  /** Geparste, normalisierte Daten — Rohdatei liegt später im Objektspeicher. */
  parsed: text("parsed", { mode: "json" }),
  parseStatus: text("parse_status").notNull().default("pending"), // pending | ok | error
  parseError: text("parse_error"),
  isSuspended: integer("is_suspended", { mode: "boolean" }).notNull().default(false), // Perioden-Flag-Muster
  createdAt: ts("created_at").notNull(),
});

/**
 * Handlungen (D45): entstehen in den Analysen, verankert an der Entität
 * (scope = brand | product; account folgt mit der Berichts-Schiene).
 * Der Handlungen-Reiter ist nur eine SICHT auf diese Tabelle — er erzeugt nichts.
 */
export type ActionScope = "account" | "brand" | "product";
export type ActionCategory = "content" | "ppc" | "listing" | "produkt" | "daten";
export type ActionStatus = "open" | "in_progress" | "done";

export const actions = sqliteTable("actions", {
  id: text("id").primaryKey(),
  brandId: text("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  productId: text("product_id").references(() => products.id, { onDelete: "cascade" }),
  scope: text("scope").$type<ActionScope>().notNull(),
  category: text("category").$type<ActionCategory>().notNull(),
  title: text("title").notNull(),
  /** Herkunft (Begründungs-Prinzip): welche Analyse hat das erzeugt. */
  source: text("source").notNull().default("listing-analyse"),
  upliftEur: integer("uplift_eur"),
  status: text("status").$type<ActionStatus>().notNull().default("open"),
  createdAt: ts("created_at").notNull(),
  doneAt: integer("done_at", { mode: "timestamp" }),
});

/** Original-Listing-Snapshot (Import aus Amazon-Scrape oder H10-CSV) — das "Vorher". */
export const listingSnapshots = sqliteTable("listing_snapshots", {
  id: text("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  source: text("source").notNull(), // apify | h10_csv | manual
  title: text("title"),
  bullets: text("bullets", { mode: "json" }).$type<string[]>(),
  description: text("description"),
  imageUrls: text("image_urls", { mode: "json" }).$type<string[]>(),
  raw: text("raw", { mode: "json" }),
  createdAt: ts("created_at").notNull(),
});

/**
 * Flat-File-Vorlagen (D46): Amazon-Kategorievorlagen ändern sich laufend —
 * die jeweils NEUSTE Vorlage wird pro Marke hochgeladen; wir speichern nur die
 * 3 Header-Zeilen + Feldnamen (klein, kein Binary) und erzeugen daraus
 * upload-fertige tab-getrennte TXT-Dateien.
 */
export const flatfileTemplates = sqliteTable("flatfile_templates", {
  id: text("id").primaryKey(),
  brandId: text("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  sheetName: text("sheet_name"),
  headerRows: text("header_rows", { mode: "json" }).$type<string[][]>().notNull(),
  fieldNames: text("field_names", { mode: "json" }).$type<string[]>().notNull(),
  createdAt: ts("created_at").notNull(),
});
