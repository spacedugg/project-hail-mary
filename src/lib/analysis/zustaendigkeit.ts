import { normalizeToken } from "@/lib/text/bytes";
import type { RoheAspekte } from "@/lib/reviews/verdichtung";

/**
 * Zuständigkeits-Gate (D265, Nutzer 30.07.): Ein Kunden-Thema ist nur dann
 * Rohstoff für die Listing-Optimierung, wenn der SELLER es beeinflussen kann.
 * Versand, Zustellzeit und Paketdienst laufen bei Amazon — egal ob schnell,
 * langsam, heil oder beschädigt, der Seller kann daran nichts ändern und muss
 * es im Listing auch nicht adressieren.
 *
 * Warum das Gate GANZ VORNE sitzt (vor `filtereEinzelnennungen`): Amazon-Themen
 * zählten bisher in `mentionCount` mit, verschoben damit die Gewichtung aller
 * anderen Themen, wurden gegen die Stichprobe auf Signifikanz geprüft und
 * erzeugten über `analyzeListing()` sogar Maßnahmen („Pain Point nicht
 * adressiert") für etwas, das kein Text der Welt lösen kann.
 *
 * Vier Werte statt zwei (Nutzer-Entscheidung 30.07.):
 *  - "seller"  → listing-wirksam, normaler Rohstoff
 *  - "produkt" → Sache des Sellers, aber NICHT über Listing-Text lösbar
 *                (Produktverpackung, Transportschaden trotz FBA) → Produkt-
 *                Feedback an den Kunden, getrennt von allem Listing-Wirksamen
 *  - "amazon"  → nicht unser Gegenstand, fliegt (gezählt, nie still)
 *  - "unklar"  → bleibt drin. Wegwerfen wäre der teurere Fehler; das Thema
 *                wird ausgewiesen, damit die Klassifizierung nachschärfbar ist.
 */

export type AspektZustaendigkeit = "seller" | "produkt" | "amazon" | "unklar";

/**
 * Seller-Vorrang: Diese Begriffe gewinnen IMMER gegen die Amazon-Stämme.
 * Ohne Vorrang würde ein Stamm-Match auf „liefer" den „Lieferumfang" mit
 * erwischen — was in der Box liegt, entscheidet aber der Seller (steht sogar
 * als eigene Werbeaussage in Listings). Dieselbe Falle: „Aufbauanleitung"
 * gegen „auf…", „Rücknahme" gegen „Rücksendung".
 */
const SELLER_VORRANG = [
  "lieferumfang", "mitgeliefert", "beiliegend", "enthalten", "zubehor", "ersatzteil",
  "aufbau", "aufbauanleitung", "montage", "anleitung", "handbuch", "schraub",
  "garantie", "gewahrleistung", "ruckgabe", "rucknahme", "testen",
  "vollstandig", "unvollstandig", "fehlteil",
];

/**
 * Verpackungs-/Transportschaden (Nutzer-Entscheidung 30.07.): NICHT wegwerfen.
 * Ob ein Produkt den Versand übersteht, hängt an der Produktverpackung — und
 * die ist Sache des Sellers, auch bei FBA. Wirkt aber nie auf den Listing-Text,
 * sondern nur als Produkt-Feedback.
 */
const PRODUKT_STAEMME = [
  "verpackung", "umverpackung", "karton", "transportschaden", "beschadigt",
  "eingedruckt", "verkratzt", "bruch", "zerbrochen", "delle",
];

/**
 * Reine Amazon-Zuständigkeit: Logistik. Bewusst ENG gehalten — ein zu breiter
 * Filter löscht seller-relevante Themen unbemerkt, und das ist der teurere
 * Fehler. Deshalb NICHT hier: „Kundenservice"/„Ansprechpartner" (Bullet-
 * Versprechen vieler Seller, siehe „persönlicher Ansprechpartner"), „Amazon"
 * als bloße Ortsangabe („bestes Produkt auf Amazon") und „Wartezeit"
 * (mehrdeutig: Zustellung oder Support).
 */
const AMAZON_STAEMME = [
  "versand", "lieferzeit", "lieferung", "liefertermin", "lieferdatum", "zustellung",
  "zusteller", "paketdienst", "paketbote", "kurier", "spedition",
  "dhl", "hermes", "gls", "dpd", "packstation",
  "sendungsverfolgung", "tracking", "verspatet", "punktlich", "retourenabwicklung",
];

/** Wortstämme eines Themen-Labels — dieselbe Normalisierung wie im Listing-Abgleich. */
function staemme(text: string): string[] {
  return text
    .split(/[\s\-–—/,.;:()"„“]+/)
    .map(normalizeToken)
    .filter((t) => t.length >= 3);
}

/** Trifft einer der Stämme des Textes einen Listen-Eintrag (beidseitig enthalten)? */
function trifft(tokens: string[], liste: string[]): boolean {
  return tokens.some((t) =>
    liste.some((l) => t === l || (l.length >= 4 && t.includes(l)) || (t.length >= 4 && l.includes(t))),
  );
}

/**
 * Zuständigkeit eines Kunden-Themas — deterministisch, ohne LLM.
 * Reihenfolge ist bedeutungstragend: Seller-Vorrang schlägt alles, danach
 * Verpackung/Transport (Produkt), danach Amazon-Logistik.
 */
export function bestimmeZustaendigkeit(text: string): AspektZustaendigkeit {
  const tokens = staemme(text);
  if (tokens.length === 0) return "unklar";
  if (trifft(tokens, SELLER_VORRANG)) return "seller";
  if (trifft(tokens, PRODUKT_STAEMME)) return "produkt";
  if (trifft(tokens, AMAZON_STAEMME)) return "amazon";
  return "seller";
}

export type ZustaendigkeitsErgebnis = {
  /** Nur listing-wirksame Themen — Rohstoff für Driver, Blocker und Maßnahmen. */
  aspekte: RoheAspekte;
  /** Seller-Sache, aber nicht über Listing-Text lösbar → Produkt-Feedback-Block. */
  produktFeedback: Array<{ label: string; typ: "painPoint" | "buyingTrigger"; mentionCount: number | null }>;
  /** Amazon-Zuständigkeit — ausgewiesen, nie still verschwunden (D133). */
  ausgeschlossen: string[];
  hinweise: string[];
};

/**
 * Aspekt-Pool nach Zuständigkeit aufteilen. Läuft VOR jeder Zählung und vor
 * dem Signifikanz-Gate, damit Signifikanz gegen die bereinigte Menge misst.
 */
export function teileNachZustaendigkeit(aspekte: RoheAspekte): ZustaendigkeitsErgebnis {
  const produktFeedback: ZustaendigkeitsErgebnis["produktFeedback"] = [];
  const ausgeschlossen: string[] = [];

  const teile = <T extends { label: string; mentionCount: number | null }>(
    liste: T[],
    typ: "painPoint" | "buyingTrigger",
  ): T[] =>
    liste.filter((a) => {
      const z = bestimmeZustaendigkeit(a.label);
      if (z === "amazon") {
        ausgeschlossen.push(a.label);
        return false;
      }
      if (z === "produkt") {
        produktFeedback.push({ label: a.label, typ, mentionCount: a.mentionCount });
        return false;
      }
      return true;
    });

  // ZUERST filtern, dann berichten: die Hinweise lesen `ausgeschlossen` und
  // `produktFeedback`, die erst der Filterlauf füllt.
  const painPoints = teile(aspekte.painPoints, "painPoint");
  const buyingTriggers = teile(aspekte.buyingTriggers, "buyingTrigger");

  const hinweise: string[] = [];
  if (ausgeschlossen.length) {
    hinweise.push(
      `Zuständigkeits-Gate: ${ausgeschlossen.length} Thema/Themen betreffen Versand und Zustellung — dafür ist Amazon zuständig, nicht der Seller. Nicht in die Listing-Analyse eingeflossen: ${ausgeschlossen.map((l) => `„${l}"`).join(", ")}.`,
    );
  }
  if (produktFeedback.length) {
    hinweise.push(
      `${produktFeedback.length} Thema/Themen betreffen Produktverpackung oder Transportschaden — Sache des Sellers, aber nicht über den Listing-Text lösbar. Als Produkt-Feedback ausgewiesen.`,
    );
  }

  return { aspekte: { painPoints, buyingTriggers }, produktFeedback, ausgeschlossen, hinweise };
}
