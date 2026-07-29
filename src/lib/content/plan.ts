import type { ListingSection } from "@/lib/recipes/listing";
import type { ContentType } from "@/db/schema";

/**
 * Content-Plan (D257) — DIE eine Quelle für „welche Sektionen sollen entstehen"
 * und für das Mapping Sektion ↔ DB-Typ.
 *
 * Hintergrund (Nutzer-Befund): Die geführte Kette (D195) generierte nach JEDER
 * Freigabe blind die nächste Sektion der festen Reihenfolge. Wer keine
 * Beschreibung oder kein Q&A wollte, bekam sie trotzdem — oder blieb an einem
 * „wartet auf Freigabe"-Hinweis für eine Sektion hängen, die er nie wollte.
 * Der Plan macht die Auswahl verbindlich: nicht geplante Sektionen werden weder
 * generiert noch als Vorgänger verlangt.
 *
 * Das Mapping lag vorher als Ternär-Ausdruck an sieben Stellen im Code — hier
 * zentral, damit eine neue Sektion nicht sieben Stellen zu ändern bedeutet.
 */

/** Ketten-Reihenfolge (D195; Backend vor Beschreibung ab D204). */
export const SEKTIONS_REIHENFOLGE: readonly ListingSection[] = [
  "title",
  "highlights",
  "bullets",
  "backend",
  "description",
  "qa",
] as const;

export const SEKTIONS_LABEL: Record<ListingSection, string> = {
  title: "Titel",
  highlights: "Item Highlights",
  bullets: "Bullet Points",
  backend: "Backend-Keywords",
  description: "Beschreibung",
  qa: "Q&A",
};

/** DB-`contentVersions.type` einer Sektion. */
export function dbTypFuer(section: ListingSection): ContentType {
  return section === "backend" ? "backend_keywords" : section === "highlights" ? "item_highlights" : section;
}

/** Sektion zu einem DB-Typ (Umkehrung) — unbekannter Typ ⇒ null. */
export function sektionVonDbTyp(typ: string): ListingSection | null {
  const treffer = SEKTIONS_REIHENFOLGE.find((s) => dbTypFuer(s) === typ);
  return treffer ?? null;
}

/**
 * Der wirksame Plan. `null`/leer ⇒ ALLE Sektionen (rückwärtskompatibel: Produkte
 * ohne gespeicherten Plan verhalten sich wie bisher). Immer in Ketten-Reihenfolge
 * und dedupliziert — der Code bestimmt die Reihenfolge, nicht die Klick-Folge.
 */
export function wirksamerPlan(plan: ListingSection[] | null | undefined): ListingSection[] {
  if (!plan || plan.length === 0) return [...SEKTIONS_REIHENFOLGE];
  const gewaehlt = new Set(plan);
  return SEKTIONS_REIHENFOLGE.filter((s) => gewaehlt.has(s));
}

/** Ist die Sektion überhaupt geplant? */
export function istGeplant(plan: ListingSection[] | null | undefined, section: ListingSection): boolean {
  return wirksamerPlan(plan).includes(section);
}

/**
 * Die nächste GEPLANTE Sektion nach `section` — Taktgeber der Kette. Nicht
 * geplante Sektionen werden übersprungen; am Ende des Plans: null.
 */
export function naechsteGeplant(
  plan: ListingSection[] | null | undefined,
  section: ListingSection,
): ListingSection | null {
  const p = wirksamerPlan(plan);
  const abIndex = SEKTIONS_REIHENFOLGE.indexOf(section);
  if (abIndex < 0) return null;
  return p.find((s) => SEKTIONS_REIHENFOLGE.indexOf(s) > abIndex) ?? null;
}

/**
 * GEPLANTE Vorgänger einer Sektion — nur sie müssen freigegeben sein. Eine
 * abgewählte Sektion darf die Kette nie blockieren.
 */
export function geplanteVorgaenger(
  plan: ListingSection[] | null | undefined,
  section: ListingSection,
): ListingSection[] {
  const bis = SEKTIONS_REIHENFOLGE.indexOf(section);
  if (bis < 0) return [];
  return wirksamerPlan(plan).filter((s) => SEKTIONS_REIHENFOLGE.indexOf(s) < bis);
}

/** Eingabe (Formular/Client) auf gültige Sektionen normalisieren. */
export function normalisierePlan(werte: unknown): ListingSection[] {
  if (!Array.isArray(werte)) return [];
  const gueltig = new Set<string>(SEKTIONS_REIHENFOLGE);
  const gewaehlt = new Set(werte.filter((w): w is string => typeof w === "string").filter((w) => gueltig.has(w)));
  return SEKTIONS_REIHENFOLGE.filter((s) => gewaehlt.has(s));
}
