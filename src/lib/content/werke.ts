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

export type Werk = "listing" | "bilder-briefing" | "aplus-basic" | "aplus-premium" | "brand-store";

/** Anzeige-/Verarbeitungs-Reihenfolge — der Code bestimmt sie, nicht die Klick-Folge. */
export const WERKE_REIHENFOLGE: readonly Werk[] = [
  "listing",
  "bilder-briefing",
  "aplus-basic",
  "aplus-premium",
  "brand-store",
] as const;

export const WERK_LABEL: Record<Werk, string> = {
  listing: "Listing-Texte",
  "bilder-briefing": "Bilder-Briefing",
  "aplus-basic": "A+ Content (Basic)",
  "aplus-premium": "A+ Content (Premium)",
  "brand-store": "Brand-Store-Konzept",
};

export const WERK_HINWEIS: Record<Werk, string> = {
  listing: "Titel, Highlights, Bullets, Backend, Beschreibung, Q&A — Auswahl der Bausteine darunter.",
  "bilder-briefing": "Designer-Briefing für die Listing-Bilder, deutsch oder englisch.",
  "aplus-basic": "Brief für den Standard-A+ (1940×1200, Module, weißer Trenner).",
  "aplus-premium": "Brief für Premium-A+ (Full Image, Karussells/Hotspots) — nur bei Premium-Zugang.",
  "brand-store": "Seitenstruktur, Kachel-Plan, Specs und Guidelines des Brand Stores.",
};

/**
 * Standard-Auswahl für Produkte OHNE gespeicherte Entscheidung (`null`).
 *
 * Bewusst NUR das Listing: Es ist das Werk, an dem die geführte Kette (D195)
 * hängt und das bei laufenden Produkten schon in Arbeit ist — es hier
 * abzuschalten würde bestehende Ketten stillstellen. Alles andere (A+ Basic,
 * A+ Premium, Store, Bilder-Briefing) ist ab jetzt AUS, bis es gewählt wird:
 * genau der Punkt der Nutzer-Vorgabe — „nicht immer muss jeder Content
 * generiert werden". Auch das Listing bleibt abwählbar.
 */
export const WERKE_STANDARD: readonly Werk[] = ["listing"] as const;

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
