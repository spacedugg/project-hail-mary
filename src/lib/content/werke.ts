/**
 * Werk-Auswahl (D270) — DIE eine Quelle für „welche WERKE sollen für dieses
 * Produkt überhaupt entstehen".
 *
 * Hintergrund (Nutzer-Vorgabe 31.07.2026): „Wir generieren nicht bei jedem
 * Listing oder jedem Content ein Listing UND ein A+ UND ein Premium-A+. Wichtig
 * ist, dass man sich das auswählen und dann generieren kann, weil nicht immer
 * jeder Content generiert werden muss."
 *
 * Vorher: Der Briefings-Reiter baute bei JEDEM Aufruf alle drei Text-Briefs
 * (A+ Basic, A+ Premium, Brand-Store) — unabhängig davon, ob der Kunde je ein
 * A+ bekommt oder überhaupt Premium-Zugang hat. Erzeugt und angezeigt ohne
 * Auftrag ist erzeugt: es sah nach beauftragter Arbeit aus, war aber geraten.
 *
 * Zwei Ebenen, klar getrennt:
 *  - WERK   = was insgesamt entsteht (Listing · Bilder-Briefing · A+ · Store)
 *  - SEKTION= welche Bausteine INNERHALB des Werks Listing entstehen (D257,
 *            `plan.ts`). Die Sektions-Auswahl gilt nur, wenn „Listing" gewählt ist.
 *
 * Verbindlich wie D257: Die Auswahl ist nicht Deko, sondern wird serverseitig
 * erzwungen (`actions.ts` blockt die Generierung eines nicht gewählten Werks) —
 * Regeln sind Gesetze, keine Empfehlungen (D181).
 */

export type Werk =
  | "listing"
  | "bilder-briefing"
  | "aplus-basic"
  | "aplus-premium"
  | "brand-store"
  /** Analyse-Option, kein Deliverable (D281) — siehe Kommentar bei WERK_HINWEIS. */
  | "wettbewerber-bilder";

/** Anzeige-/Verarbeitungs-Reihenfolge — der Code bestimmt sie, nicht die Klick-Folge. */
export const WERKE_REIHENFOLGE: readonly Werk[] = [
  "listing",
  "bilder-briefing",
  "aplus-basic",
  "aplus-premium",
  "brand-store",
  "wettbewerber-bilder",
] as const;

/**
 * Analyse-Optionen (D284, Nutzer-Befund 04.08.2026): Werke, die KEIN Deliverable
 * sind, sondern die Tiefe des ANALYSE-Laufs bestimmen.
 *
 * Warum die Trennung nötig war: Die Wettbewerber-Bildanalyse stand unter
 * „Was soll erstellt werden?" zwischen A+ Content und Brand Store — sie sah
 * damit aus wie etwas, das erst bei der Content-Erstellung passiert („wohl die
 * Bilder von Konkurrenten erst analysiert werden, wenn ich Content erstellen
 * will"). Tatsächlich läuft sie als Etappe des Analyse-Laufs, VOR Verdichtung,
 * Features und Drivern. Die Auswahl bleibt dieselbe Liste (eine Quelle), die
 * Darstellung trennt jetzt Deliverable von Analyse-Tiefe.
 */
export const ANALYSE_WERKE: readonly Werk[] = ["wettbewerber-bilder"] as const;

/** Die eigentlichen Liefergegenstände — alles, was kein Analyse-Schalter ist. */
export const DELIVERABLE_WERKE: readonly Werk[] = WERKE_REIHENFOLGE.filter((w) => !ANALYSE_WERKE.includes(w));

export const WERK_LABEL: Record<Werk, string> = {
  listing: "Listing-Texte",
  "bilder-briefing": "Bilder-Briefing",
  "aplus-basic": "A+ Content (Basic)",
  "aplus-premium": "A+ Content (Premium)",
  "brand-store": "Brand-Store-Konzept",
  "wettbewerber-bilder": "Wettbewerber-Bilder auslesen",
};

export const WERK_HINWEIS: Record<Werk, string> = {
  listing: "Titel, Highlights, Bullets, Backend, Beschreibung, Q&A — Auswahl der Bausteine darunter.",
  "bilder-briefing": "Designer-Briefing für die Listing-Bilder, deutsch oder englisch.",
  "aplus-basic": "Brief für den Standard-A+ (1940×1200, Module, weißer Trenner).",
  "aplus-premium": "Brief für Premium-A+ (Full Image, Karussells/Hotspots) — nur bei Premium-Zugang.",
  "brand-store": "Seitenstruktur, Kachel-Plan, Specs und Guidelines des Brand Stores.",
  /**
   * Einziger Eintrag, der kein Deliverable ist, sondern eine Analyse-Tiefe
   * (D281, Nutzer: „Das kann man auch mit der Komponente auswählen"). Er steht
   * hier, weil er echtes Geld und Laufzeit kostet — pro Wettbewerber bis zu
   * neun Vision-Auslesen — und deshalb eine bewusste Entscheidung verdient.
   */
  "wettbewerber-bilder":
    "Läuft im ANALYSE-Lauf (Standard: an), nicht bei der Content-Erstellung: Alle Bilder der Vergleichs-ASINs werden per Vision ausgelesen, bevor Insights, Merkmale und Kaufgründe entstehen — Infografiken der Konkurrenz sind für Text-Scrapes unsichtbar. Abwählen spart je Wettbewerber bis zu neun Auslesen, kostet aber Analyse-Tiefe.",
};

/**
 * Standard-Auswahl für Produkte OHNE gespeicherte Entscheidung (`null`).
 *
 * Enthalten sind die Listing-Texte (das Werk, an dem die geführte Kette D195
 * hängt — es hier abzuschalten würde laufende Ketten stillstellen) und seit D281
 * die Wettbewerber-Bildanalyse. Alle DELIVERABLES (A+ Basic, A+ Premium, Store,
 * Bilder-Briefing) bleiben AUS, bis sie gewählt werden: genau der Punkt der
 * Nutzer-Vorgabe — „nicht immer muss jeder Content generiert werden". Beides
 * bleibt abwählbar.
 */
// D281: Die Wettbewerber-Bildanalyse ist im Standard AN — sie schliesst die
// groesste verbliebene Datenluecke (Infografiken der Konkurrenz sind fuer
// Text-Scrapes unsichtbar). Abwaehlbar bleibt sie, weil sie Laufzeit kostet.
export const WERKE_STANDARD: readonly Werk[] = ["listing", "wettbewerber-bilder"] as const;

/**
 * Die wirksame Auswahl. `null`/undefined ⇒ `WERKE_STANDARD` (Alt-Produkte
 * verhalten sich beim Listing wie bisher). Ein LEERES Array ist dagegen eine
 * echte Entscheidung („nichts erstellen") und wird respektiert — deshalb wird
 * leer NICHT auf den Standard zurückgebogen, sondern nur `null`.
 */
export function wirksameWerke(plan: Werk[] | null | undefined): Werk[] {
  if (plan == null) return [...WERKE_STANDARD];
  const gewaehlt = new Set(plan);
  return WERKE_REIHENFOLGE.filter((w) => gewaehlt.has(w));
}

/** Ist dieses Werk beauftragt? Einzige zulässige Frage vor jeder Generierung. */
export function istWerkGewaehlt(plan: Werk[] | null | undefined, werk: Werk): boolean {
  return wirksameWerke(plan).includes(werk);
}

/** Eingabe (Formular/Client) auf gültige Werke normalisieren — Reihenfolge vom Code. */
export function normalisiereWerke(werte: unknown): Werk[] {
  if (!Array.isArray(werte)) return [];
  const gueltig = new Set<string>(WERKE_REIHENFOLGE);
  const gewaehlt = new Set(werte.filter((w): w is string => typeof w === "string").filter((w) => gueltig.has(w)));
  return WERKE_REIHENFOLGE.filter((w) => gewaehlt.has(w));
}

/**
 * Klartext-Begründung für die Sperre — landet 1:1 im Banner. Kein Jargon, kein
 * Fehlercode-Kauderwelsch: der Nutzer soll wissen, welcher Haken fehlt.
 */
export function werkNichtGewaehltGrund(werk: Werk): string {
  return `„${WERK_LABEL[werk]}" ist für dieses Produkt nicht als Werk ausgewählt — deshalb wird dafür nichts erzeugt. Unter „Was soll erstellt werden?" anhaken, dann erzeugen.`;
}
