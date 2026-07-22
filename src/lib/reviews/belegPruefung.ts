import type { ReviewInsightsPayload } from "@/db/schema";
import type { RawReview } from "./apify";

/**
 * Beleg-Prüfung der Roh-Analyse (D152, Nutzer-Befund 22.07.: Zitate stützen
 * ihre Labels nicht, „Empfehlung durch Tierarzt" ohne belegendes Zitat,
 * Sentiment-Seite fraglich). Deterministische Stufe zwischen LLM-Antwort und
 * Speicherung:
 * 1. VERBATIM-GATE: Jedes Zitat muss wörtlich in einem gescrapten Review
 *    stehen — erfundene/verfälschte Zitate fliegen raus.
 * 2. BELEG-PFLICHT: Ein Aspekt ohne ein einziges belegtes Zitat wird
 *    verworfen und GEZÄHLT ausgewiesen (nichts Stilles).
 * 3. SENTIMENT-PLAUSIBILITÄT: Die Sterne der Beleg-Reviews sind ein Signal —
 *    ein „Kaufauslöser", dessen Belege im Schnitt aus 1–2★-Reviews stammen,
 *    bekommt einen sichtbaren Warnhinweis (kein stilles Umsortieren).
 * 4. ECHTER ZÄHLWERT (D170): mentionCount = Anzahl VERSCHIEDENER Reviews mit
 *    verifizierter Fundstelle — vom Code gezählt, nie vom LLM geschätzt
 *    (D154). Ein ehrlicher Mindestwert: mindestens so oft kommt der Aspekt
 *    nachweislich vor.
 */

type Aspekt = ReviewInsightsPayload["painPoints"][number];

const norm = (s: string) => s.toLowerCase().replace(/["„“‚’'«»]/g, "").replace(/\s+/g, " ").trim();

export function verifiziereZitate(
  aspekte: Aspekt[],
  reviews: Array<Pick<RawReview, "rating" | "title" | "body">>,
  typ: "painPoint" | "buyingTrigger",
): { aspekte: Aspekt[]; notizen: string[] } {
  const texte = reviews.map((r) => ({ text: norm(`${r.title} ${r.body}`), rating: r.rating }));
  const notizen: string[] = [];
  let entfernteZitate = 0;
  const behalten: Aspekt[] = [];

  for (const a of aspekte) {
    const belegt: string[] = [];
    const sterne: number[] = [];
    const fundReviews = new Set<number>();
    for (const q of a.quotes) {
      const nq = norm(q);
      const trefferIndex = nq.length >= 8 ? texte.findIndex((t) => t.text.includes(nq)) : -1;
      if (trefferIndex >= 0) {
        belegt.push(q);
        sterne.push(texte[trefferIndex].rating);
        fundReviews.add(trefferIndex);
      } else {
        entfernteZitate++;
      }
    }
    if (belegt.length === 0) {
      notizen.push(`Aspekt „${a.label}" verworfen — kein Zitat wörtlich in den Reviews auffindbar (${typ === "painPoint" ? "Pain Point" : "Kaufauslöser"}).`);
      continue;
    }
    const avg = sterne.reduce((s, x) => s + x, 0) / sterne.length;
    if (typ === "buyingTrigger" && avg <= 2.5) {
      notizen.push(`△ Kaufauslöser „${a.label}": Beleg-Zitate stammen im Schnitt aus ${avg.toFixed(1)}★-Reviews — Einordnung als Kaufauslöser prüfen.`);
    }
    // Echter Zählwert (D170): verschiedene Reviews mit verifizierter Fundstelle
    behalten.push({ ...a, quotes: belegt, mentionCount: fundReviews.size, frequencyPct: null });
  }
  if (entfernteZitate > 0) {
    notizen.push(`${entfernteZitate} Zitat(e) ohne wörtliche Fundstelle in den Reviews entfernt (Verbatim-Gate).`);
  }
  return { aspekte: behalten, notizen };
}
