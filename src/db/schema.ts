import {
  pgTable,
  text,
  integer,
  doublePrecision,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
// Ausnahme von „Payload-Typen leben hier" (D265): Der Driver-Kontrakt verweist
// auf Stufen, die in den Analyse-Modulen berechnet werden — eine zweite
// Definition wäre eine zweite Wahrheit (D183). Reiner Typ-Import, kein Laufzeit-Zyklus.
import type { ConversionDriverPayload } from "@/lib/analysis/driverTypen";
import type { InsightsReportPayload } from "@/lib/reports/insightsDokument";
import type { BildBriefingPayload } from "@/lib/analysis/bildBriefing";

/**
 * Entity-Hierarchie (D16): Kunde → Marke → Marktplatz/Land → Produktgruppe → Produkt (ASIN).
 * Dialekt: Supabase/Postgres (D221) — eine gemeinsame Online-DB, auf die alle
 * Personen/Geräte/Sessions denselben Stand sehen; nichts liegt offline/isoliert.
 * Enums = getypte text-Spalten, JSON = jsonb (Drizzle validiert via $type).
 */

/** notNull-Timestamp mit Default-Now (JS-seitig gesetzt, dialekt-neutral). */
const ts = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" }).$defaultFn(() => new Date());
/** Nullbarer Timestamp ohne Default (z. B. approvedAt). */
const tsNull = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const clients = pgTable("clients", {
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
export const users = pgTable(
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
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedBy: text("updated_by"),
  updatedAt: ts("updated_at").notNull(),
});

export const brands = pgTable("brands", {
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
  marginPct: doublePrecision("margin_pct"),
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
  publishNurMitKundenfreigabe: boolean("publish_nur_mit_kundenfreigabe")
    .notNull()
    .default(false),
  createdAt: ts("created_at").notNull(),
});

/** v1: DE-only (D32) — Feld existiert, damit Multi-Marktplatz kein Schema-Bruch wird. */
export type Marketplace = "de" | "uk" | "fr" | "it" | "es" | "nl" | "us";
/** Content-Sprache je Produkt (D128) — unabhängig vom Marktplatz wählbar. */
export type ContentSprache = "de" | "en" | "fr" | "it" | "es";

/**
 * Variantenrolle innerhalb einer Amazon-Variations-Familie (Parent-Child, D221).
 * - "standalone": Einzel-ASIN, keine Familie (Default → abwärtskompatibel).
 * - "parent": nicht kaufbarer Container, gruppiert die Childs, trägt Theme + Content-Master.
 * - "child": kaufbare Variante, verweist per parentProductId nach oben, trägt die Achsenwerte.
 * Rolle statt eigener Tabelle: Amazons Parent IST selbst eine ASIN und die gesamte
 * Content-Maschinerie läuft bereits auf `products`.
 */
export type VariantRole = "standalone" | "parent" | "child";

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
    facts: jsonb("facts").$type<ProductFacts>().notNull().default({}),
    price: integer("price_cents"),
    /** Gespeicherte Margen-Kalkulation (Eingaben + Ergebnis) — liefert Break-even-ACoS je Produkt. */
    marginCalc: jsonb("margin_calc").$type<{
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
    /**
     * Variations-Familie (D221). Default "standalone" → alle Alt-Produkte bleiben unberührt.
     * Gefüllt tool-intern (manuelles Gruppieren) oder später per Prefill (Scraper/SP-API).
     */
    variantRole: text("variant_role").$type<VariantRole>().notNull().default("standalone"),
    /**
     * Child → Parent (self-FK). Nur bei variantRole="child" gesetzt.
     * Postgres erzwingt FKs IMMER (D262) — anders als vorher SQLite/libSQL, wo sie ohne
     * `PRAGMA foreign_keys=ON` reine Absichts-Doku waren. `set null` greift also jetzt
     * wirklich. Das explizite Zurücksetzen von `parentProductId` beim Auflösen einer
     * Familie (D221) bleibt trotzdem: es ist die fachliche Absicht und darf nicht davon
     * abhängen, ob gerade der Parent-Datensatz verschwindet.
     */
    parentProductId: text("parent_product_id").references((): AnyPgColumn => products.id, {
      onDelete: "set null",
    }),
    /** Auf dem Parent: Variationsachsen (z. B. ["flavor"] oder ["size","color"]) — die Theme-Attribute. */
    variationTheme: jsonb("variation_theme").$type<string[]>(),
    /** Auf dem Child: Wert je Achse (z. B. { "flavor": "Kiwi" }) — steuert Token-Tausch & Ableitung. */
    variantAxisValues: jsonb("variant_axis_values").$type<Record<string, string>>(),
    /**
     * Auf dem Parent (D221): true = vom Tool angelegter, nicht kaufbarer Container
     * (beim Auflösen zu LÖSCHEN). false = designierte, real existierende Parent-ASIN
     * (beim Auflösen nur auf standalone zurückzusetzen). Explizit, damit „Container?"
     * NICHT aus asin==null geraten wird — ein echter Parent darf asin==null haben.
     */
    variantParentContainer: boolean("variant_parent_container").notNull().default(false),
    /**
     * Auf dem Parent: freigegebener Content-Master (D221) — das aus Child #1 abgeleitete,
     * in getypte Slots (locked/token/regenerate) zerlegte Template, aus dem die Geschwister
     * abgeleitet werden. Shape: siehe `ContentMaster` in src/lib/variants/master.ts.
     */
    contentMaster: jsonb("content_master").$type<
      import("@/lib/variants/master").ContentMaster
    >(),
    /**
     * Content-Plan (D257): WELCHE Sektionen für dieses Produkt überhaupt erstellt
     * werden sollen. `null` = alle (Alt-Daten, rückwärtskompatibel). Die geführte
     * Kette überspringt nicht geplante Sektionen — vorher wurde nach jeder Freigabe
     * blind die nächste Sektion generiert, auch eine ungewollte.
     * Auf einem Parent gilt der Plan zugleich als Umfang der Varianten-Ableitung.
     */
    contentPlan: jsonb("content_plan").$type<
      import("@/lib/recipes/listing").ListingSection[]
    >(),
    /**
     * Werk-Auswahl (D270): WELCHE Werke für dieses Produkt überhaupt entstehen
     * sollen — Listing-Texte, Bilder-Briefing, A+ Basic, A+ Premium,
     * Brand-Store. Eine Ebene ÜBER `contentPlan` (der die Bausteine innerhalb
     * des Werks „Listing" wählt).
     *
     * `null` = keine Entscheidung ⇒ `WERKE_STANDARD` (nur Listing), damit
     * laufende Ketten weiterlaufen. Leeres Array = bewusst „nichts erstellen".
     * Vorher wurden A+ Basic, A+ Premium und Store bei jedem Aufruf des
     * Briefings-Reiters gebaut — ungefragt, auch ohne Premium-Zugang.
     */
    werkePlan: jsonb("werke_plan").$type<import("@/lib/content/werke").Werk[]>(),
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

export const keywords = pgTable("keywords", {
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
  ausgeschlossen: boolean("ausgeschlossen").notNull().default(false),
  ausschlussGrund: text("ausschluss_grund"),
  meta: jsonb("meta").$type<Record<string, unknown>>(),
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

export const contentVersions = pgTable("content_versions", {
  id: text("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  type: text("type").$type<ContentType>().notNull(),
  version: integer("version").notNull().default(1),
  /** title/description/highlights: { text }, bullets: { items }, qa: { pairs }, + rationale */
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  status: text("status").$type<ContentStatus>().notNull().default("draft"),
  /** Ergebnis des Validation-Gates zum Zeitpunkt der Erstellung (Audit-Trail). */
  validation: jsonb("validation").$type<ValidationReport>(),
  /** Herkunft: Modell + Recipe-Version (D28: pro Recipe gepinnt) oder "manual". */
  generatedBy: text("generated_by"),
  createdAt: ts("created_at").notNull(),
  approvedAt: tsNull("approved_at"),
  /** Wer intern freigegeben hat (E-Feature Freigabe-Kette). */
  approvedBy: text("approved_by"),
  /** Wann diese Version an den Kunden geschickt/markiert wurde (E-Feature). */
  sentToClientAt: tsNull("sent_to_client_at"),
  /** Über welchen Freigabe-Link sie beim Kunden liegt (E-Feature). */
  sentShareId: text("sent_share_id"),
  syncedAt: tsNull("synced_at"),
});

/**
 * QM-Blockier-Log (D182/D193): Jeder harte QM-Block ist ein Bau-Auftrag —
 * hier persistent, damit auswertbar ist, WELCHE Regel wie oft scheitert
 * (Anzeige: „Daten & Formeln"). Die Server-Konsole allein war flüchtig.
 */
export const qmBlocks = pgTable("qm_blocks", {
  id: text("id").primaryKey(),
  productId: text("product_id").references(() => products.id, { onDelete: "cascade" }),
  /** z. B. "listing.title" — Pipeline-Bereich des Blocks. */
  bereich: text("bereich").notNull(),
  findings: jsonb("findings").$type<ValidationIssue[]>().notNull(),
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
export const reviewScrapes = pgTable("review_scrapes", {
  id: text("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  source: text("source").$type<"apify" | "mock" | "seed">().notNull().default("apify"),
  asins: jsonb("asins").$type<string[]>().notNull(),
  reviews: jsonb("reviews").$type<Array<{ asin: string; rating: number; title: string; body: string }>>().notNull(),
  /** Verteilung 1–5 Sterne der GESCRAPTEN Reviews (Stichprobe, je Klasse gedeckelt) — nicht die Amazon-Gesamtverteilung. */
  starCounts: jsonb("star_counts").$type<Record<string, number>>().notNull(),
  perAsin: jsonb("per_asin").$type<Record<string, number>>().notNull(),
  /**
   * Echte Amazon-Zahlen zum Scrape-Zeitpunkt (D74) — Gesamt-Bewertungen, Ø-Rating,
   * Verteilung in % je Klasse. Trennt die Wahrheit („1.343 · Ø 4,6") von der
   * Stichprobe („182 gescraped"), damit die Datenbasis nie trügerisch wirkt.
   */
  amazonTotals: jsonb("amazon_totals").$type<{
    reviewsTotal: number | null;
    ratingAvg: number | null;
    dist: Record<string, number> | null;
    asOf: string;
  }>(),
  /** Ehrlichkeits-Notizen, z. B. „3★-Lauf ins Zeitlimit gelaufen" (D72). */
  notes: jsonb("notes").$type<string[]>(),
  createdAt: ts("created_at").notNull(),
});

/**
 * Tiefen-Audit (D76) — die umfassende Listing-Analyse nach der temoa-audit-
 * Spezifikation (8 Dimensionen, „Aktuell / Probleme / Empfehlung"), gespeist
 * aus ECHTEN Daten (Listing-Snapshot, Review-Insights, SOV, Basics) statt aus
 * manuell getippten Fakten-Feldern. USPs & Zielgruppe werden HERGELEITET.
 */
export const deepAudits = pgTable("deep_audits", {
  id: text("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  payload: jsonb("payload").$type<DeepAuditPayload>().notNull(),
  /** Was tatsächlich eingeflossen ist (Transparenz, Anti-Blackbox). */
  dataBasis: jsonb("data_basis").$type<string[]>().notNull(),
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
export const featureRankings = pgTable("feature_rankings", {
  id: text("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  payload: jsonb("payload").$type<FeatureRankingPayload>().notNull(),
  dataBasis: jsonb("data_basis").$type<string[]>().notNull(),
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
export const conversionBlockers = pgTable("conversion_blockers", {
  id: text("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  payload: jsonb("payload").$type<ConversionBlockerPayload>().notNull(),
  dataBasis: jsonb("data_basis").$type<string[]>().notNull(),
  createdAt: ts("created_at").notNull(),
});

export type ConversionBlockerPayload = {
  cards: InsightCard[];
  /** Blocker ohne aufgelösten Beleg-Aspekt — gezählt ausgewiesen, nie still (D133). */
  verworfen: number;
  hinweise: string[];
  stats: { reviewsGesamt: number };
};

/**
 * Conversion Driver (D265) — die Neufassung von Driver UND Blocker in EINER
 * Tabelle, weil ein Blocker keine eigene Analyse ist, sondern ein Driver-
 * Baustein ohne ausreichenden Beweis. Zwei getrennte Läufe auf demselben
 * Aspekt-Pool waren die Ursache dafür, dass beide Listen dieselbe Erkenntnis
 * unter zwei Überschriften ausgaben.
 *
 * Der Payload-Typ liegt in `src/lib/analysis/driverTypen.ts`: er verweist auf
 * Abdeckungs- und Fall-Stufen, die dort BERECHNET werden — eine zweite
 * Definition derselben Union wäre eine zweite Wahrheit (D183).
 */
export const conversionDrivers = pgTable("conversion_drivers", {
  id: text("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  payload: jsonb("payload").$type<ConversionDriverPayload>().notNull(),
  /** Was tatsächlich eingeflossen ist (Transparenz, Anti-Blackbox). */
  dataBasis: jsonb("data_basis").$type<string[]>().notNull(),
  createdAt: ts("created_at").notNull(),
});

/**
 * Insights-Dokument (D267) — der eingefrorene Kunden-Report.
 *
 * Eingefroren, weil der Kundenlink sonst nach jedem neuen Analyse-Lauf etwas
 * anderes zeigt und „Stand 30.07." eine Lüge wäre. Ein neuer Lauf erzeugt eine
 * neue Version; alte Links bleiben gültig.
 *
 * Eigener Token statt `content_shares`: Das Content-Portal hat einen
 * Freigabe-Ablauf (Kunde gibt frei oder wünscht Änderungen) — dieses Dokument
 * ist rein lesend. Ein gemeinsamer Token würde zwei verschiedene Rechte
 * vermischen.
 */
export const insightsReports = pgTable(
  "insights_reports",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    /** Öffentlicher Zugriffsschlüssel — nur damit ist der Report erreichbar. */
    token: text("token").notNull(),
    payload: jsonb("payload").$type<InsightsReportPayload>().notNull(),
    /** Fortlaufend je Produkt, damit „Version 2" im Gespräch eindeutig ist. */
    version: integer("version").notNull().default(1),
    expiresAt: tsNull("expires_at"),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [uniqueIndex("insights_reports_token").on(t.token)],
);

/**
 * Bilder-Briefing (D269) — je Produkt und Sprache eine Fassung.
 *
 * Gespeichert statt bei jedem Seitenaufruf erzeugt: die englische Fassung
 * kostet einen LLM-Lauf, und ein Briefing, das sich beim Neuladen ändert, ist
 * für den Designer unbrauchbar. Append-only wie die anderen Läufe — die neueste
 * Zeile je Sprache gilt.
 */
export const bildBriefings = pgTable("bild_briefings", {
  id: text("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  sprache: text("sprache").notNull().default("de"),
  payload: jsonb("payload").$type<BildBriefingPayload>().notNull(),
  /** Was eingeflossen ist + Gate-Hinweise (Anti-Blackbox). */
  hinweise: jsonb("hinweise").$type<string[]>().notNull(),
  createdAt: ts("created_at").notNull(),
});

export const reviewInsights = pgTable("review_insights", {
  id: text("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  /** Auf welchem Scrape die Analyse lief (D79) — derselbe Scrape wird nie doppelt analysiert. */
  scrapeId: text("scrape_id").references(() => reviewScrapes.id, { onDelete: "set null" }),
  dataBasis: text("data_basis").notNull(), // uploaded_csv | apify_scrape | none
  confidence: text("confidence").notNull(), // high | medium | low
  payload: jsonb("payload").$type<ReviewInsightsPayload>().notNull(),
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
export const competitorListings = pgTable("competitor_listings", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  asin: text("asin").notNull(),
  source: text("source").notNull(), // anthropic | crawler | apify | mock
  title: text("title"),
  bullets: jsonb("bullets").$type<string[]>(),
  description: text("description"),
  attributes: jsonb("attributes").$type<Record<string, string> | null>(),
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
export const competitorInfoGaps = pgTable("competitor_info_gaps", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  payload: jsonb("payload").$type<CompetitorGapPayload>().notNull(),
  dataBasis: jsonb("data_basis").$type<string[]>().notNull(),
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
  /**
   * Zuständigkeits-Gate (D266): Das Gate läuft EINMAL beim Speichern der
   * Roh-Analyse, nicht in jedem Konsumenten. Damit arbeiten Verdichtung,
   * Feature-Ranking, Blocker, Driver UND `analyzeListing()` automatisch auf
   * bereinigten Aspekten — vorher erzeugte ein Versand-Pain-Point eine
   * Maßnahme für etwas, das kein Text der Welt lösen kann.
   *
   * Seller-Sache, aber nicht über den Listing-Text lösbar (Produktverpackung,
   * Transportschaden) — Produkt-Feedback statt Text-Maßnahme.
   */
  produktFeedback?: Array<{ label: string; typ: "painPoint" | "buyingTrigger"; mentionCount: number | null }>;
  /** Amazon-Zuständigkeit (Versand, Zustellung) — ausgewiesen, nie still entfernt. */
  ausgeschlossenAmazon?: string[];
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
export const reportUploads = pgTable("report_uploads", {
  id: text("id").primaryKey(),
  brandId: text("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  marketplace: text("marketplace").$type<Marketplace>().notNull().default("de"),
  reportType: text("report_type").notNull(), // business | sqp | ads | searchterm | cerebro | h10_bundle | reviews_csv
  periodStart: tsNull("period_start"),
  periodEnd: tsNull("period_end"),
  fileName: text("file_name").notNull(),
  /** Geparste, normalisierte Daten — Rohdatei liegt später im Objektspeicher. */
  parsed: jsonb("parsed"),
  parseStatus: text("parse_status").notNull().default("pending"), // pending | ok | error
  parseError: text("parse_error"),
  isSuspended: boolean("is_suspended").notNull().default(false), // Perioden-Flag-Muster
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

export const actions = pgTable("actions", {
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
  doneAt: tsNull("done_at"),
});

/** Original-Listing-Snapshot (Import aus Amazon-Scrape oder H10-CSV) — das "Vorher". */
export const listingSnapshots = pgTable("listing_snapshots", {
  id: text("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  source: text("source").notNull(), // apify | h10_csv | manual
  title: text("title"),
  bullets: jsonb("bullets").$type<string[]>(),
  description: text("description"),
  imageUrls: jsonb("image_urls").$type<string[]>(),
  /** Amazon-Basics zum Import-Zeitpunkt (D73): echte Gesamt-Bewertungszahl, Ø-Rating, Sterne-Verteilung (% je Klasse) — wie auf der Produktseite sichtbar. */
  reviewsTotal: integer("reviews_total"),
  ratingAvg: doublePrecision("rating_avg"),
  ratingDist: jsonb("rating_dist").$type<Record<string, number>>(),
  /**
   * Erweiterte Listing-Quellen (D145): strukturierte Attribute (Produktinformation-
   * Tabelle als Schlüssel→Wert), die Sektion „Wichtige Informationen" und der
   * A+-Inhalt („Vom Hersteller") als Text. null = vom Import-Weg nicht erfasst —
   * wird im UI ehrlich ausgewiesen, nie als „leer" gedeutet.
   */
  attributes: jsonb("attributes").$type<Record<string, string>>(),
  importantInfo: text("important_info"),
  aplusContent: text("aplus_content"),
  /**
   * Bild-Auslese (D158): Inhalte der Galeriebilder per Vision-Modell —
   * Text-im-Bild wortwörtlich, objektive Beschreibung, gezeigte Claims.
   * Läuft AUTOMATISCH beim Import (kein Extra-Schritt); null = nicht
   * ausgelesen (z. B. ohne API-Key) — ehrlich ausgewiesen.
   */
  bilderText: jsonb("bilder_text").$type<Array<{ slot: number; typ?: string | null; textImBild: string[]; inhalt: string; claims: string[]; faktoren?: Record<string, { score: number | null; wasWirSehen: string; warum: string; wieBesser: string }> | null }>>(),
  /** Bild-Audit-Befunde (nur faktische Regel-Verstöße, z. B. Text auf dem Hauptbild). */
  bildBefunde: jsonb("bild_befunde").$type<string[]>(),
  raw: jsonb("raw"),
  createdAt: ts("created_at").notNull(),
});

/**
 * Flat-File-Vorlagen (D46): Amazon-Kategorievorlagen ändern sich laufend —
 * die jeweils NEUSTE Vorlage wird pro Marke hochgeladen; wir speichern nur die
 * 3 Header-Zeilen + Feldnamen (klein, kein Binary) und erzeugen daraus
 * upload-fertige tab-getrennte TXT-Dateien.
 */
export const flatfileTemplates = pgTable("flatfile_templates", {
  id: text("id").primaryKey(),
  brandId: text("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  sheetName: text("sheet_name"),
  headerRows: jsonb("header_rows").$type<string[][]>().notNull(),
  fieldNames: jsonb("field_names").$type<string[]>().notNull(),
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

export const contentPieces = pgTable(
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
    werte: jsonb("werte").$type<unknown>(),
    quelle: text("quelle").$type<PieceQuelle>().notNull().default("manuell"),
    status: text("status").$type<PieceStatus>().notNull().default("entwurf"),
    notiz: text("notiz"),
    createdAt: ts("created_at").notNull(),
    updatedAt: ts("updated_at").notNull(),
  },
  (t) => [uniqueIndex("content_pieces_product_slot_mp").on(t.productId, t.slot, t.marketplace)],
);

/** Publish-Protokoll: was ging wann auf welchem Weg raus (der „Ist ausgeliefert"-Anker). */
export const contentPublications = pgTable("content_publications", {
  id: text("id").primaryKey(),
  brandId: text("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  productId: text("product_id").references(() => products.id, { onDelete: "cascade" }),
  weg: text("weg").$type<"flatfile" | "sp_api">().notNull(),
  /** Erzeugter Payload (JSON-Patch) bzw. Zusammenfassung der Flat-File-Zeilen. */
  payload: jsonb("payload").$type<unknown>(),
  slots: jsonb("slots").$type<string[]>().notNull(),
  /**
   * „erzeugt" = Datei/Payload gebaut · „eingereicht" = an Amazon übergeben ·
   * „bestaetigt" = im Soll/Ist-Abgleich live gesehen. ACCEPTED von Amazon ist
   * KEIN Beweis für live (Kontrakt §3.4) — deshalb der dritte Zustand.
   */
  status: text("status").$type<"erzeugt" | "eingereicht" | "bestaetigt" | "fehler">().notNull().default("erzeugt"),
  hinweise: jsonb("hinweise").$type<string[]>(),
  createdBy: text("created_by"),
  createdAt: ts("created_at").notNull(),
});

/** Ein Soll/Ist-Lauf je Produkt — Ergebnis von lib/cms/accuracy.ts. */
export const contentChecks = pgTable("content_checks", {
  id: text("id").primaryKey(),
  brandId: text("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  /** Auf welchem Listing-Snapshot der Abgleich lief (Nachvollziehbarkeit). */
  snapshotId: text("snapshot_id").references(() => listingSnapshots.id, { onDelete: "set null" }),
  ergebnis: jsonb("ergebnis").$type<unknown>().notNull(),
  /** null = nicht messbar (kein Ist-Stand) — bewusst NICHT 0 oder 100. */
  accuracyPct: integer("accuracy_pct"),
  createdAt: ts("created_at").notNull(),
});

export type AlertStatus = "offen" | "bestaetigt" | "erledigt";

export const contentAlerts = pgTable("content_alerts", {
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
  erledigtAt: tsNull("erledigt_at"),
});

/**
 * Ansprechpartner auf Kundenseite (Vorstufe zu Mandanten & Rollen, Stufe 3).
 * Heute ohne eigenes Login: Zugang läuft über zeitlich begrenzte Freigabe-Links.
 * `passwordHash` ist vorbereitet, damit daraus später ein echtes Kundenkonto wird,
 * ohne Datenumzug.
 */
export const clientContacts = pgTable(
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
export const contentShares = pgTable(
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
    productIds: jsonb("product_ids").$type<string[] | null>(),
    /** Darf der Kunde freigeben — oder nur kommentieren? */
    darfFreigeben: boolean("darf_freigeben").notNull().default(true),
    expiresAt: tsNull("expires_at"),
    revokedAt: tsNull("revoked_at"),
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
export const contentFeedback = pgTable("content_feedback", {
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
  erledigtAt: tsNull("erledigt_at"),
  createdAt: ts("created_at").notNull(),
});

// ── Amazon-Anbindung (D263) ──────────────────────────────────────────────────

/**
 * SP-API-Regionen. Ein Seller-Account gehört zu genau einer Region; alle
 * Marktplätze dieser Region laufen über denselben Endpunkt und denselben
 * Refresh Token. Europa deckt DE/UK/FR/IT/ES/NL/SE/PL/BE/IE/TR.
 */
export type AmazonRegion = "eu" | "na" | "fe";

/**
 * Lebenszyklus einer Seller-Verbindung.
 * - "pending": angelegt, aber der Kunde hat noch nicht autorisiert (kein Token).
 * - "active": Token vorhanden, Aufrufe erlaubt.
 * - "error": letzter Aufruf scheiterte technisch — Aufrufe bleiben erlaubt (Retry).
 * - "reauthorization_required": Amazon hat den Token entwertet (invalid_grant)
 *   ODER die Reautorisierungsfrist läuft ab. Aufrufe gesperrt bis Neu-Autorisierung.
 * - "disconnected": bewusst getrennt. Token gelöscht, KEINE automatische
 *   Reaktivierung — eine neue Autorisierung ist Pflicht.
 */
export type AmazonConnectionStatus =
  | "pending"
  | "active"
  | "error"
  | "reauthorization_required"
  | "disconnected";

/**
 * Eine autorisierte Amazon-Seller-Verbindung (D263). Bewusst NICHT identisch mit
 * `brands`: mehrere Marken können denselben Seller-Account nutzen, und ein Kunde
 * kann mehrere Seller-Accounts haben. Die Zuordnung läuft über
 * `amazon_connection_brands`.
 *
 * `encryptedRefreshToken` hält ausschließlich AES-256-GCM-Chiffrat (siehe
 * integrations/amazon/auth/tokenCrypto.ts). Der Klartext-Token verlässt niemals
 * den Server, landet nie in Logs, Audit-Einträgen oder API-Antworten.
 */
export const amazonConnections = pgTable(
  "amazon_connections",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    /** Anzeigename im Tool (z. B. „Seller DE — Hauptkonto"), rein intern. */
    label: text("label"),
    /** Amazons Seller-Kennung, kommt erst mit dem OAuth-Callback. */
    sellingPartnerId: text("selling_partner_id"),
    region: text("region").$type<AmazonRegion>().notNull().default("eu"),
    /** AES-256-GCM-Chiffrat, Format `v1:<base64>`. NULL, sobald getrennt. */
    encryptedRefreshToken: text("encrypted_refresh_token"),
    /**
     * SHA-256 des Klartext-Tokens. Erlaubt „ist das derselbe Token wie vorher?"
     * (Reautorisierung erkennen) OHNE Entschlüsselung — und ist selbst nutzlos,
     * falls die Zeile abfließt.
     */
    tokenFingerprint: text("token_fingerprint"),
    status: text("status").$type<AmazonConnectionStatus>().notNull().default("pending"),
    authorizedAt: tsNull("authorized_at"),
    /** Amazon-Autorisierungen laufen ab; Frist wird in der Oberfläche angezeigt. */
    reauthorizationDueAt: tsNull("reauthorization_due_at"),
    revokedAt: tsNull("revoked_at"),
    lastSuccessAt: tsNull("last_success_at"),
    lastErrorAt: tsNull("last_error_at"),
    /** Maschinenlesbarer Code aus mapAmazonError — nie die Rohmeldung Amazons. */
    lastErrorCode: text("last_error_code"),
    archivedAt: tsNull("archived_at"),
    createdAt: ts("created_at").notNull(),
    updatedAt: ts("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("amazon_connections_client_spid_region").on(t.clientId, t.sellingPartnerId, t.region),
  ],
);

/** Welche Marken laufen über welche Seller-Verbindung (n:m, D263). */
export const amazonConnectionBrands = pgTable(
  "amazon_connection_brands",
  {
    connectionId: text("connection_id")
      .notNull()
      .references(() => amazonConnections.id, { onDelete: "cascade" }),
    brandId: text("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [uniqueIndex("amazon_connection_brands_pk").on(t.connectionId, t.brandId)],
);

/**
 * Marktplatz-Teilnahme je Verbindung — gefüllt aus
 * GET /sellers/v1/marketplaceParticipations. Die Feldnamen folgen bewusst der
 * API (D114/D115: keine erfundenen Felder): Amazon liefert `isParticipating`
 * und `hasSuspendedListings`, keinen freien „listings_status".
 */
export const amazonMarketplaces = pgTable(
  "amazon_marketplaces",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id")
      .notNull()
      .references(() => amazonConnections.id, { onDelete: "cascade" }),
    /** Amazons Marketplace-ID, z. B. A1PA6795UKMFR9 für amazon.de. */
    marketplaceId: text("marketplace_id").notNull(),
    countryCode: text("country_code").notNull(),
    name: text("name").notNull(),
    defaultCurrency: text("default_currency"),
    defaultLanguage: text("default_language"),
    isParticipating: boolean("is_participating").notNull().default(false),
    hasSuspendedListings: boolean("has_suspended_listings").notNull().default(false),
    lastSyncedAt: tsNull("last_synced_at"),
    createdAt: ts("created_at").notNull(),
    updatedAt: ts("updated_at").notNull(),
  },
  (t) => [uniqueIndex("amazon_marketplaces_conn_mp").on(t.connectionId, t.marketplaceId)],
);

/**
 * OAuth-State (CSRF + Mandantenbindung, D263). Gespeichert wird der SHA-256-Hash
 * des State-Werts, nicht der Wert selbst — eine abgeflossene Zeile erlaubt damit
 * keinen Replay. Einmalverwendung wird über `usedAt` per bedingtem UPDATE
 * erzwungen, nicht im Anwendungscode geprüft (sonst gewinnt bei Doppel-Callback
 * niemand deterministisch).
 */
export const amazonOauthStates = pgTable(
  "amazon_oauth_states",
  {
    id: text("id").primaryKey(),
    stateHash: text("state_hash").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    connectionId: text("connection_id")
      .notNull()
      .references(() => amazonConnections.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    usedAt: tsNull("used_at"),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [uniqueIndex("amazon_oauth_states_hash").on(t.stateHash)],
);

/**
 * Audit-Protokoll (D263) für alles, was Zustand ändert oder Amazon berührt.
 * Absichtlich append-only gedacht: es gibt im Tool keine Update-/Delete-Pfade
 * darauf. `beforeData`/`afterData` dürfen NIEMALS Tokens oder personenbezogene
 * Käuferdaten enthalten — das ist Bedingung unserer Amazon-Registrierung.
 */
export const auditLogs = pgTable("audit_logs", {
  id: text("id").primaryKey(),
  clientId: text("client_id").references(() => clients.id, { onDelete: "set null" }),
  brandId: text("brand_id").references(() => brands.id, { onDelete: "set null" }),
  connectionId: text("connection_id").references(() => amazonConnections.id, { onDelete: "set null" }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  /** Punktnotation, z. B. "amazon.connection.disconnected". */
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  beforeData: jsonb("before_data").$type<unknown>(),
  afterData: jsonb("after_data").$type<unknown>(),
  /** Amazons x-amzn-RequestId — der Anker für jede Support-Anfrage. */
  amazonRequestId: text("amazon_request_id"),
  createdAt: ts("created_at").notNull(),
});
