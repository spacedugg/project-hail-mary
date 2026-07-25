import { RULES, type RuleSet } from "./rules";
import { byteLength, charLength } from "@/lib/text/bytes";

/**
 * Regel-Stand: Amazons Vorgaben ändern sich — das Tool muss es merken.
 *
 * Ausgangsfall (Nutzer 22.07.): „Der Titel darf jetzt nur noch 50 Zeichen
 * haben." Ohne diesen Baustein fällt so etwas erst auf, wenn Amazon ein
 * Listing unterdrückt. Mit ihm schlägt jedes betroffene Produkt sofort an —
 * inklusive der bereits freigegebenen Texte, die niemand mehr anschaut.
 *
 * Die Werte aus `rules.ts` sind der Auslieferungsstand. Was hier als Override
 * gespeichert wird, gewinnt — und JEDE Änderung wird protokolliert, damit
 * nachvollziehbar bleibt, warum ein Text plötzlich zu lang ist.
 */

/** Die Grenzen, die Amazon erfahrungsgemäß ändert. Alles andere ist Agentur-Handwerk. */
export const AENDERBARE_REGELN = [
  { key: "title.maxChars", label: "Titel — maximale Zeichen", einheit: "Zeichen", pfad: ["title", "maxChars"] },
  { key: "bullets.hardMaxChars", label: "Bullet — maximale Zeichen", einheit: "Zeichen", pfad: ["bullets", "hardMaxChars"] },
  { key: "backendKeywords.maxBytes", label: "Backend-Keywords — maximale Bytes", einheit: "Bytes", pfad: ["backendKeywords", "maxBytes"] },
  { key: "description.maxBytes", label: "Beschreibung — maximale Bytes", einheit: "Bytes", pfad: ["description", "maxBytes"] },
  { key: "itemHighlights.maxChars", label: "Item Highlights — maximale Zeichen", einheit: "Zeichen", pfad: ["itemHighlights", "maxChars"] },
] as const;

export type RegelKey = (typeof AENDERBARE_REGELN)[number]["key"];

export type RegelOverrides = Partial<Record<RegelKey, number>>;

export type RegelAenderung = {
  key: RegelKey;
  label: string;
  alt: number;
  neu: number;
  /** Woher die Änderung kommt — z. B. „Amazon-Ankündigung 07/2026". Pflicht: keine Regel ohne Herkunft. */
  quelle: string;
  gueltigAb: string; // ISO-Datum
  erfasstVon: string | null;
};

export const SETTINGS_KEY_OVERRIDES = "regel_overrides";
export const SETTINGS_KEY_HISTORIE = "regel_historie";

/** Auslieferungswert einer Regel (aus rules.ts). */
export function standardWert(key: RegelKey): number {
  const def = AENDERBARE_REGELN.find((r) => r.key === key)!;
  const [a, b] = def.pfad;
  return (RULES as unknown as Record<string, Record<string, number>>)[a][b];
}

/** Der wirksame Regelsatz: Auslieferungsstand + gespeicherte Overrides. */
export function wirksameRegeln(overrides: RegelOverrides | null | undefined): RuleSet {
  if (!overrides || Object.keys(overrides).length === 0) return RULES;
  const kopie = JSON.parse(JSON.stringify(RULES)) as unknown as Record<string, Record<string, number>>;
  for (const def of AENDERBARE_REGELN) {
    const wert = overrides[def.key];
    if (typeof wert === "number" && Number.isFinite(wert)) {
      const [a, b] = def.pfad;
      kopie[a][b] = wert;
    }
  }
  return kopie as unknown as RuleSet;
}

export function wirksamerWert(regeln: RuleSet, key: RegelKey): number {
  const def = AENDERBARE_REGELN.find((r) => r.key === key)!;
  const [a, b] = def.pfad;
  return (regeln as unknown as Record<string, Record<string, number>>)[a][b];
}

/* ── Prüfung bestehender Inhalte gegen den aktuellen Regelstand ──────────── */

export type RegelVerstoss = {
  productId: string;
  produktName: string;
  slot: string;
  slotLabel: string;
  key: RegelKey;
  /** Stabile, pro Fundstelle eindeutige Kennung — bei Bullets inkl. Index,
   * damit Alerts je Bullet erzeugt UND geschlossen werden (Review 23.07.). */
  alertKey: string;
  ist: number;
  erlaubt: number;
  einheit: string;
  meldung: string;
};

export type ZuPruefendesProdukt = {
  id: string;
  name: string;
  title: string | null;
  bullets: string[];
  description: string | null;
  backendKeywords: string | null;
  itemHighlights: string | null;
};

/**
 * Prüft FREIGEGEBENEN Content gegen den wirksamen Regelstand.
 *
 * Bewusst nur Freigegebenes: Entwürfe laufen beim nächsten Speichern ohnehin
 * durchs Gate. Gefährlich ist der Text, den alle für fertig halten.
 */
export function pruefeInhalteGegenRegeln(produkte: ZuPruefendesProdukt[], regeln: RuleSet): RegelVerstoss[] {
  const verstoesse: RegelVerstoss[] = [];
  const melde = (
    p: ZuPruefendesProdukt,
    slot: string,
    slotLabel: string,
    key: RegelKey,
    ist: number,
    erlaubt: number,
    einheit: string,
    zusatz = "",
  ) => {
    if (ist <= erlaubt) return;
    verstoesse.push({
      productId: p.id,
      produktName: p.name,
      slot,
      slotLabel,
      key,
      alertKey: `${key}${zusatz.trim() ? `#${zusatz.trim()}` : ""}`,
      ist,
      erlaubt,
      einheit,
      meldung: `${p.name}: ${slotLabel}${zusatz} hat ${ist} ${einheit}, erlaubt sind ${erlaubt} — anpassen.`,
    });
  };

  for (const p of produkte) {
    if (p.title) melde(p, "title", "Titel", "title.maxChars", charLength(p.title), wirksamerWert(regeln, "title.maxChars"), "Zeichen");
    p.bullets.forEach((b, i) => {
      if (b) melde(p, "bullets", "Bullet Points", "bullets.hardMaxChars", charLength(b), wirksamerWert(regeln, "bullets.hardMaxChars"), "Zeichen", ` ${i + 1}`);
    });
    if (p.description)
      melde(p, "description", "Beschreibung", "description.maxBytes", byteLength(p.description), wirksamerWert(regeln, "description.maxBytes"), "Bytes");
    if (p.backendKeywords)
      melde(p, "backend_keywords", "Backend-Keywords", "backendKeywords.maxBytes", byteLength(p.backendKeywords), wirksamerWert(regeln, "backendKeywords.maxBytes"), "Bytes");
    if (p.itemHighlights)
      melde(p, "item_highlights", "Item Highlights", "itemHighlights.maxChars", charLength(p.itemHighlights), wirksamerWert(regeln, "itemHighlights.maxChars"), "Zeichen");
  }
  return verstoesse;
}
