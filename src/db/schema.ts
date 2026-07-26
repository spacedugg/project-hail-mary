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
  /**
   * Content-Verwaltung (E-Feature): Wenn true, blockiert das Publish-Gate, bis der
   * Kunde jeden Kern-Platz freigegeben hat. Die Zustimmung hängt an der Version.
   */
  publishNurMitKundenfreigabe: integer("publish_nur_mit_kundenfreigabe", { mode: "boolean" })
    .notNull()
    .default(false),
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
    /** Publish-Schlüssel (E-Feature): Verkäufer-SKU. Fehlt sie, springt die ASIN als Notbehelf ein. */
    sku: text("sku"),
    /** Amazon-Produkttyp-Token (z. B. DRINKING_CUP) — Pflicht für Publish, keine Freitext-Beschreibung. */
    amazonProductType: text("amazon_product_type"),
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
  /** Wer intern freigegeben hat (E-Feature Freigabe-Kette). */
  approvedBy: text("approved_by"),
  /** Wann diese Version an den Kunden geschickt/markiert wurde (E-Feature). */
  sentToClientAt: integer("sent_to_client_at", { mode: "timestamp" }),
  /** Über welchen Freigabe-Link sie beim Kunden liegt (E-Feature). */
  sentShareId: text("sent_share_id"),
  syncedAt: integer("synced_at", { mode: "timestamp" }),
});

/**
 * QM-Blockier-Log (D182/D193): Jeder harte QM-Block ist ein Bau-Auftrag —
 * hier persistent, damit auswertbar ist, WELCHE Regel wie oft scheitert
 * (Anzeige: „Daten & Formeln"). Die Server-Konsole allein war flüchtig.
 */
export const qmBlocks = sqliteTable("qm_blocks", {
  id: text("id").primaryKey(),
  productId: text("product_id").references(() => products.id, { onDelete: "cascade" }),
  /** z. B. "listing.title" — Pipeline-Bereich des Blocks. */
  bereich: text("bereich").notNull(),
  findings: text("findings", { mode: "json" }).$type<ValidationIssue[]>().notNull(),
  versuche: integer("versuche").notNull(),
  createdAt: ts("created_at").notNull(),
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

/**
 * Conversion-Blocker (D167): Kunden-Themen mit echtem Gewicht (Roh-Aspekte),
 * die Listing/Bilder nicht oder schwach beantworten — der fehlende MATCH
 * kostet Conversion. Karten im Insight-Schema (D132/D135); ein Blocker ohne
 * aufgelösten Beleg-Aspekt fliegt (der Match IST die Existenzberechtigung).
 */
export const conversionBlockers = sqliteTable("conversion_blockers", {
  id: text("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  payload: text("payload", { mode: "json" }).$type<ConversionBlockerPayload>().notNull(),
  dataBasis: text("data_basis", { mode: "json" }).$type<string[]>().notNull(),
  createdAt: ts("created_at").notNull(),
});

export type ConversionBlockerPayload = {
  cards: InsightCard[];
  /** Blocker ohne aufgelösten Beleg-Aspekt — gezählt ausgewiesen, nie still (D133). */
  verworfen: number;
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

/**
 * Herkunfts-Attribution + Übertragbarkeit je Roh-Aspekt (D196, Nutzer 23.07.):
 * Wettbewerbs-Reviews sind der wertvollste Rohstoff — aber nur mit Herkunft
 * und Übertragbarkeits-Urteil gegen UNSERE Produkt-Wahrheit nutzbar.
 * Die Zählwerte stammen deterministisch aus der Beleg-Prüfung (der Code kennt
 * die ASIN jedes verifizierten Zitats); das Urteil aus der Transfer-Prüfung.
 */
export type AspektHerkunft = {
  /** Verifizierte Fundstellen aus Reviews der EIGENEN ASIN. */
  eigene: number;
  /** Verifizierte Fundstellen aus Wettbewerbs-Reviews. */
  fremde: number;
  /** Aufschlüsselung je ASIN (deterministisch gezählt). */
  jeAsin: Record<string, number>;
};

export type AspektUebertragbarkeit = {
  urteil: "ja" | "nein" | "unbekannt";
  /** Ein Satz: warum (Spezifikations-Vergleich gegen unsere Produkt-Wahrheit). */
  grund: string;
};

/**
 * Wettbewerber-Listing-Texte (D199, Nutzer 23.07.): Nicht nur Reviews der
 * Vergleichs-ASINs, auch deren LISTINGS (Titel/Bullets/Beschreibung/Attribute)
 * sind Rohstoff — dort steht, welche Informationen die Konkurrenz abbildet und
 * wir (noch) nicht. Gescrapt beim Review-Scrape, wenn Competitor-ASINs vorliegen.
 */
export const competitorListings = sqliteTable("competitor_listings", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  asin: text("asin").notNull(),
  source: text("source").notNull(), // anthropic | crawler | apify | mock
  title: text("title"),
  bullets: text("bullets", { mode: "json" }).$type<string[]>(),
  description: text("description"),
  attributes: text("attributes", { mode: "json" }).$type<Record<string, string> | null>(),
  createdAt: ts("created_at").notNull(),
});

/**
 * Übertragbare Wettbewerbs-Informationen (D199): Aus dem Abgleich der
 * Wettbewerber-Listings mit UNSEREM Listing — Informationen, die die Konkurrenz
 * nennt und wir nicht, mit Übertragbarkeits-Urteil gegen unsere Produkt-Wahrheit.
 * urteil „ja" = aufnehmbar (Spezifikation deckt es) · „nein" = widerspricht
 * unseren Angaben (nie aufnehmen) · „unbekannt" = kein Beleg für Widerspruch
 * ODER Deckung — tendenziell aufnehmbar, aber als PRÜFEN markiert.
 */
export const competitorInfoGaps = sqliteTable("competitor_info_gaps", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  payload: text("payload", { mode: "json" }).$type<CompetitorGapPayload>().notNull(),
  dataBasis: text("data_basis", { mode: "json" }).$type<string[]>().notNull(),
  createdAt: ts("created_at").notNull(),
});

export type CompetitorInfoGap = {
  /** Die Information, die die Konkurrenz nennt und uns fehlt. */
  info: string;
  /** Welche Wettbewerber-ASIN(s) sie nennen. */
  quellen: string[];
  urteil: "ja" | "nein" | "unbekannt";
  /** Spezifikations-Bezug: warum übertragbar / warum nicht / warum unklar. */
  grund: string;
};

export type CompetitorGapPayload = { gaps: CompetitorInfoGap[] };

export type ReviewInsightsPayload = {
  sources: string[];
  stats: { reviewsTotal: number; ratingAvg: number | null };
  painPoints: Array<{
    label: string;
    frequencyPct: number | null;
    mentionCount: number | null;
    quotes: string[];
    herkunft?: AspektHerkunft;
    uebertragbarkeit?: AspektUebertragbarkeit;
  }>;
  buyingTriggers: Array<{
    label: string;
    frequencyPct: number | null;
    mentionCount: number | null;
    quotes: string[];
    herkunft?: AspektHerkunft;
    uebertragbarkeit?: AspektUebertragbarkeit;
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
  bilderText: text("bilder_text", { mode: "json" }).$type<Array<{ slot: number; typ?: string | null; textImBild: string[]; inhalt: string; claims: string[] }>>(),
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

/* ============================================================================
 * Content-Verwaltung (E-Feature, D-CMS): Content-Pieces, Publish-Protokoll,
 * Soll/Ist-Checks, Alerts, Kunden-Ansprechpartner, Freigabe-Links, Feedback.
 * Getrennt von der Content-ERSTELLUNG (contentVersions/Werkstatt): hier wird
 * freigegeben, veröffentlicht und überwacht — „die Freigabe ist die Grenze".
 * ==========================================================================*/

/**
 * Woher ein Piece stammt. `ist_uebernommen` ist bewusst eine EIGENE Quelle und
 * nicht bloß „import": Ein aus dem Live-Listing übernommener Stand ist der
 * AUSGANGSZUSTAND, kein von uns erarbeitetes Soll. Die Bibliothek und die
 * Accuracy weisen das aus — sonst meldet das Tool 100 % Übereinstimmung dafür,
 * dass wir nichts verändert haben.
 */
export type PieceQuelle = "optimizer" | "import" | "manuell" | "ist_uebernommen";
export type PieceStatus = "entwurf" | "intern_frei" | "kunde_frei" | "live";

export const contentPieces = sqliteTable(
  "content_pieces",
  {
    id: text("id").primaryKey(),
    brandId: text("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    marketplace: text("marketplace").$type<Marketplace>().notNull().default("de"),
    /** Slot-Schlüssel aus lib/amazon/attributes.ts (title, bullets, main_image, aplus_basic …). */
    slot: text("slot").notNull(),
    /** Einzelwert (Text-Slots) bzw. Asset-URL (Bild-Slots). */
    wert: text("wert"),
    /** Mehrteilige Slots (Bullets, Q&A) und A+-Modul-Listen. */
    werte: text("werte", { mode: "json" }).$type<unknown>(),
    quelle: text("quelle").$type<PieceQuelle>().notNull().default("manuell"),
    status: text("status").$type<PieceStatus>().notNull().default("entwurf"),
    notiz: text("notiz"),
    createdAt: ts("created_at").notNull(),
    updatedAt: ts("updated_at").notNull(),
  },
  (t) => [uniqueIndex("content_pieces_product_slot_mp").on(t.productId, t.slot, t.marketplace)],
);

/** Publish-Protokoll: was ging wann auf welchem Weg raus (der „Ist ausgeliefert"-Anker). */
export const contentPublications = sqliteTable("content_publications", {
  id: text("id").primaryKey(),
  brandId: text("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  productId: text("product_id").references(() => products.id, { onDelete: "cascade" }),
  weg: text("weg").$type<"flatfile" | "sp_api">().notNull(),
  /** Erzeugter Payload (JSON-Patch) bzw. Zusammenfassung der Flat-File-Zeilen. */
  payload: text("payload", { mode: "json" }).$type<unknown>(),
  slots: text("slots", { mode: "json" }).$type<string[]>().notNull(),
  /**
   * „erzeugt" = Datei/Payload gebaut · „eingereicht" = an Amazon übergeben ·
   * „bestaetigt" = im Soll/Ist-Abgleich live gesehen. ACCEPTED von Amazon ist
   * KEIN Beweis für live (Kontrakt §3.4) — deshalb der dritte Zustand.
   */
  status: text("status").$type<"erzeugt" | "eingereicht" | "bestaetigt" | "fehler">().notNull().default("erzeugt"),
  hinweise: text("hinweise", { mode: "json" }).$type<string[]>(),
  createdBy: text("created_by"),
  createdAt: ts("created_at").notNull(),
});

/** Ein Soll/Ist-Lauf je Produkt — Ergebnis von lib/cms/accuracy.ts. */
export const contentChecks = sqliteTable("content_checks", {
  id: text("id").primaryKey(),
  brandId: text("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  /** Auf welchem Listing-Snapshot der Abgleich lief (Nachvollziehbarkeit). */
  snapshotId: text("snapshot_id").references(() => listingSnapshots.id, { onDelete: "set null" }),
  ergebnis: text("ergebnis", { mode: "json" }).$type<unknown>().notNull(),
  /** null = nicht messbar (kein Ist-Stand) — bewusst NICHT 0 oder 100. */
  accuracyPct: integer("accuracy_pct"),
  createdAt: ts("created_at").notNull(),
});

export type AlertStatus = "offen" | "bestaetigt" | "erledigt";

export const contentAlerts = sqliteTable("content_alerts", {
  id: text("id").primaryKey(),
  brandId: text("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  art: text("art").notNull(), // text_ueberschrieben | hauptbild_weg | listing_leer | nie_live | regel_geaendert
  slot: text("slot"),
  schwere: text("schwere").$type<"hoch" | "mittel">().notNull().default("mittel"),
  nachricht: text("nachricht").notNull(),
  status: text("status").$type<AlertStatus>().notNull().default("offen"),
  createdAt: ts("created_at").notNull(),
  erledigtAt: integer("erledigt_at", { mode: "timestamp" }),
});

/**
 * Ansprechpartner auf Kundenseite (Vorstufe zu Mandanten & Rollen, Stufe 3).
 * Heute ohne eigenes Login: Zugang läuft über zeitlich begrenzte Freigabe-Links.
 * `passwordHash` ist vorbereitet, damit daraus später ein echtes Kundenkonto wird,
 * ohne Datenumzug.
 */
export const clientContacts = sqliteTable(
  "client_contacts",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    rolle: text("rolle"), // z.B. "Marketing", "Geschäftsführung"
    passwordHash: text("password_hash"),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [uniqueIndex("client_contacts_client_email").on(t.clientId, t.email)],
);

/**
 * Freigabe-Link: tokengeschützte Kunden-Sicht auf Content-Pieces einer Marke.
 * Bewusst ohne Login — der Kunde soll Feedback geben können, nicht ein Konto
 * verwalten. Ablauf + Widerruf sind Pflicht, sonst ist es ein Dauerleck.
 */
export const contentShares = sqliteTable(
  "content_shares",
  {
    id: text("id").primaryKey(),
    brandId: text("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    contactId: text("contact_id").references(() => clientContacts.id, { onDelete: "set null" }),
    label: text("label").notNull(),
    /** null = alle Produkte der Marke. */
    productIds: text("product_ids", { mode: "json" }).$type<string[] | null>(),
    /** Darf der Kunde freigeben — oder nur kommentieren? */
    darfFreigeben: integer("darf_freigeben", { mode: "boolean" }).notNull().default(true),
    expiresAt: integer("expires_at", { mode: "timestamp" }),
    revokedAt: integer("revoked_at", { mode: "timestamp" }),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [uniqueIndex("content_shares_token").on(t.token)],
);

export type FeedbackArt = "kommentar" | "freigabe" | "aenderung";
export type FeedbackStatus = "offen" | "erledigt";

/**
 * Feedback am Content-Piece — von Team ODER Kunde, an derselben Stelle.
 * Anker ist (Produkt, Slot) plus optional die konkrete Version: So bleibt
 * nachvollziehbar, auf welchen Stand sich eine Kundenaussage bezog, auch wenn
 * danach neu generiert wurde.
 */
export const contentFeedback = sqliteTable("content_feedback", {
  id: text("id").primaryKey(),
  brandId: text("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  slot: text("slot").notNull(),
  /** Position innerhalb eines mehrteiligen Slots (Bullet 3 = 2). */
  ankerIndex: integer("anker_index"),
  contentVersionId: text("content_version_id").references(() => contentVersions.id, { onDelete: "set null" }),
  pieceId: text("piece_id").references(() => contentPieces.id, { onDelete: "set null" }),
  autorTyp: text("autor_typ").$type<"team" | "kunde">().notNull(),
  autorName: text("autor_name").notNull(),
  autorUserId: text("autor_user_id").references(() => users.id, { onDelete: "set null" }),
  autorContactId: text("autor_contact_id").references(() => clientContacts.id, { onDelete: "set null" }),
  shareId: text("share_id").references(() => contentShares.id, { onDelete: "set null" }),
  art: text("art").$type<FeedbackArt>().notNull().default("kommentar"),
  nachricht: text("nachricht").notNull(),
  status: text("status").$type<FeedbackStatus>().notNull().default("offen"),
  erledigtVon: text("erledigt_von"),
  erledigtAt: integer("erledigt_at", { mode: "timestamp" }),
  createdAt: ts("created_at").notNull(),
});
