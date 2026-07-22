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
/** Content-Sprache je Produkt (D128) — unabhängig vom Marktplatz wählbar. */
export type ContentSprache = "de" | "en" | "fr" | "it" | "es";

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
    asin: text("asin"), // Pflicht beim Anlegen (D159) — Alt-Daten können null sein
    /**
     * Produktmarke (D159, Pflicht beim Anlegen): DIE Marke für Content —
     * unabhängig vom Brand-Container (Werkbank-Aufträge haben keinen echten
     * Marken-Container, D149). Wandert in den MARKE-Slot der Generierung
     * und wird von der Fremdmarken-Blacklist ferngehalten.
     */
    marke: text("marke"),
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
    /**
     * Zusätzliche Produkt-Infos vom Team (D108): fließen in JEDE
     * Text-Generierung ein (z. B. fremde Bullets/Titel als Vorbild, Details,
     * die nicht im Listing stehen). Ohne Bewertungs-Analyse sind sie —
     * neben dem Listing-IST — die einzige Grundlage.
     */
    zusatzKontext: text("zusatz_kontext"),
    /**
     * Content-Sprache (D128): In welcher Sprache werden Texte generiert —
     * unabhängig vom Marktplatz. Zwei Gates sichern die Lokalisierung:
     * Keyword-Basis-Sprache muss passen, Review-Scrapes laufen gegen den
     * Marktplatz dieser Sprache.
     */
    contentSprache: text("content_sprache").$type<ContentSprache>().notNull().default("de"),
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
  /**
   * Relevanz-Filter (D87): irrelevante Keywords fliegen beim Import raus —
   * gekennzeichnet statt gelöscht (prüfbar, wieder aufnehmbar). Gründe z. B.
   * ‚Marke: Nuk', ‚Maß weicht ab: 140×80 (Produkt: 200×150)', ‚Anzahl weicht
   * ab: 10 Stück (Produkt: 20)', ‚manuell ausgeschlossen'. Ein Grund mit
   * Präfix „manuell" ist eine Nutzer-Entscheidung — Auto-Läufe überschreiben
   * sie nie.
   */
  ausgeschlossen: integer("ausgeschlossen", { mode: "boolean" }).notNull().default(false),
  ausschlussGrund: text("ausschluss_grund"),
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
/**
 * Roh-Scrape der Bewertungen (D71) — eigener Schritt VOR der Analyse:
 * der Nutzer sieht die Datenbasis (Reviews je Sterne-Zahl, je ASIN),
 * bevor er die KI-Auswertung auslöst.
 */
export const reviewScrapes = sqliteTable("review_scrapes", {
  id: text("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  source: text("source").$type<"apify" | "mock" | "seed">().notNull().default("apify"),
  asins: text("asins", { mode: "json" }).$type<string[]>().notNull(),
  reviews: text("reviews", { mode: "json" }).$type<Array<{ asin: string; rating: number; title: string; body: string }>>().notNull(),
  /** Verteilung 1–5 Sterne der GESCRAPTEN Reviews (Stichprobe, je Klasse gedeckelt) — nicht die Amazon-Gesamtverteilung. */
  starCounts: text("star_counts", { mode: "json" }).$type<Record<string, number>>().notNull(),
  perAsin: text("per_asin", { mode: "json" }).$type<Record<string, number>>().notNull(),
  /**
   * Echte Amazon-Zahlen zum Scrape-Zeitpunkt (D74) — Gesamt-Bewertungen, Ø-Rating,
   * Verteilung in % je Klasse. Trennt die Wahrheit („1.343 · Ø 4,6") von der
   * Stichprobe („182 gescraped"), damit die Datenbasis nie trügerisch wirkt.
   */
  amazonTotals: text("amazon_totals", { mode: "json" }).$type<{
    reviewsTotal: number | null;
    ratingAvg: number | null;
    dist: Record<string, number> | null;
    asOf: string;
  }>(),
  /** Ehrlichkeits-Notizen, z. B. „3★-Lauf ins Zeitlimit gelaufen" (D72). */
  notes: text("notes", { mode: "json" }).$type<string[]>(),
  createdAt: ts("created_at").notNull(),
});

/**
 * Tiefen-Audit (D76) — die umfassende Listing-Analyse nach der temoa-audit-
 * Spezifikation (8 Dimensionen, „Aktuell / Probleme / Empfehlung"), gespeist
 * aus ECHTEN Daten (Listing-Snapshot, Review-Insights, SOV, Basics) statt aus
 * manuell getippten Fakten-Feldern. USPs & Zielgruppe werden HERGELEITET.
 */
export const deepAudits = sqliteTable("deep_audits", {
  id: text("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  payload: text("payload", { mode: "json" }).$type<DeepAuditPayload>().notNull(),
  /** Was tatsächlich eingeflossen ist (Transparenz, Anti-Blackbox). */
  dataBasis: text("data_basis", { mode: "json" }).$type<string[]>().notNull(),
  createdAt: ts("created_at").notNull(),
});

export type DeepAuditDimension = {
  key: "title" | "bullets" | "description" | "backend" | "images" | "aplus" | "reviews" | "price";
  label: string;
  /** 0–10 — null = nicht bewertbar (Datenbasis fehlt); vom Code erzwungen, nie vom LLM behauptet. */
  score10: number | null;
  aktuell: string;
  probleme: string[];
  empfehlung: string;
};

export type DeepAuditPayload = {
  derived: { usps: string[]; zielgruppe: string; positionierung: string };
  dimensions: DeepAuditDimension[];
  topActions: string[];
};

/**
 * Feature-Relevanz-Ranking (D146): Listing-Features nach Kunden-Relevanz —
 * die Umkehrung des Kundenstimmen-Abgleichs (Listing → Reviews). Karten im
 * einheitlichen Insight-Schema (D132/D135); Relevanz DETERMINISTISCH aus den
 * Erwähnungen der zugeordneten Review-Aspekte, Quellen-Tags nur nach
 * verifiziertem Verbatim-Beleg im Listing-Text (D133).
 */
export const featureRankings = sqliteTable("feature_rankings", {
  id: text("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  payload: text("payload", { mode: "json" }).$type<FeatureRankingPayload>().notNull(),
  dataBasis: text("data_basis", { mode: "json" }).$type<string[]>().notNull(),
  createdAt: ts("created_at").notNull(),
});

export type FeatureRankingPayload = {
  cards: InsightCard[];
  /** Features ohne verifizierten Listing-Beleg — gezählt ausgewiesen (D133). */
  verworfen: number;
  entfernteBildIdeen: Array<{ idee: string; grund: string }>;
  /** Ehrliche Grenzen, z. B. „USP-Vergleich nicht bewertbar — Wettbewerber-Listings liegen nicht vor (D144)". */
  hinweise: string[];
  stats: { reviewsGesamt: number };
};

export const reviewInsights = sqliteTable("review_insights", {
  id: text("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  /** Auf welchem Scrape die Analyse lief (D79) — derselbe Scrape wird nie doppelt analysiert. */
  scrapeId: text("scrape_id").references(() => reviewScrapes.id, { onDelete: "set null" }),
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
  /**
   * Verdichtungs-Etappe (D131/D132): benannte Erkenntnisse ÜBER den Roh-Themen.
   * Optional, weil sie als eigene, nachholbare Etappe NACH der Roh-Analyse
   * läuft (D136) — fehlt sie, zeigt das UI ehrlich „Verdichtung steht aus".
   */
  insightCards?: InsightCard[];
  /** Kern-These der Analyse in EINEM Satz (D143, „Reasoning over the data"). */
  kernThese?: string | null;
  /** Von der Normalisierung verworfene Karten (ohne gültigen Beleg) — ausgewiesen statt still (D133). */
  verworfeneKarten?: number;
  /** Vom Bild-Ideen-Wahrheitsfilter (D134) Aussortiertes — ausgewiesen, nie still. */
  entfernteBildIdeen?: Array<{ idee: string; grund: string }>;
  /** Beleg-Prüfung der Roh-Analyse (D152): Verbatim-Gate, verworfene Aspekte, Sentiment-Hinweise. */
  qualitaetsNotizen?: string[];
};

/** Beleg-Aspekt einer Insight-Karte (D137): Rückverweis auf ein Roh-Thema MIT Zählwert — vom Code gesetzt, nie vom LLM behauptet. */
export type BelegAspekt = {
  label: string;
  typ: "painPoint" | "buyingTrigger";
  mentionCount: number | null;
};

/**
 * Einheitliche Insight-Karte (D132, verschlankt per D140 — bewusst OHNE
 * Sentiment-Label und Journey-Phase): das Schema ALLER verdichteten
 * Analyse-Erkenntnisse. `quellen` trägt die Datenquellen-Tags (D133) —
 * deterministisch aus der Pipeline mitgeführt, nie von der KI behauptet.
 */
export type InsightCard = {
  titel: string;
  beschreibung: string;
  /** 1–5, Liste absteigend sortiert (D132). */
  relevanz: number;
  quellen: string[];
  /** 2–3 visuelle Umsetzungsideen (D134) — unterliegen den Wahrheits-Regeln. */
  bildIdeen: string[];
  belegAspekte: BelegAspekt[];
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
  /** Amazon-Basics zum Import-Zeitpunkt (D73): echte Gesamt-Bewertungszahl, Ø-Rating, Sterne-Verteilung (% je Klasse) — wie auf der Produktseite sichtbar. */
  reviewsTotal: integer("reviews_total"),
  ratingAvg: real("rating_avg"),
  ratingDist: text("rating_dist", { mode: "json" }).$type<Record<string, number>>(),
  /**
   * Erweiterte Listing-Quellen (D145): strukturierte Attribute (Produktinformation-
   * Tabelle als Schlüssel→Wert), die Sektion „Wichtige Informationen" und der
   * A+-Inhalt („Vom Hersteller") als Text. null = vom Import-Weg nicht erfasst —
   * wird im UI ehrlich ausgewiesen, nie als „leer" gedeutet.
   */
  attributes: text("attributes", { mode: "json" }).$type<Record<string, string>>(),
  importantInfo: text("important_info"),
  aplusContent: text("aplus_content"),
  /**
   * Bild-Auslese (D158): Inhalte der Galeriebilder per Vision-Modell —
   * Text-im-Bild wortwörtlich, objektive Beschreibung, gezeigte Claims.
   * Läuft AUTOMATISCH beim Import (kein Extra-Schritt); null = nicht
   * ausgelesen (z. B. ohne API-Key) — ehrlich ausgewiesen.
   */
  bilderText: text("bilder_text", { mode: "json" }).$type<Array<{ slot: number; textImBild: string[]; inhalt: string; claims: string[] }>>(),
  /** Bild-Audit-Befunde (nur faktische Regel-Verstöße, z. B. Text auf dem Hauptbild). */
  bildBefunde: text("bild_befunde", { mode: "json" }).$type<string[]>(),
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
