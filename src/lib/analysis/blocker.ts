import { resolveRecipe } from "@/lib/llm/registry";
import { llmJsonLauf } from "@/lib/llm/qmLauf";
import { filtereEinzelnennungen, findeAspekt, type RoheAspekte } from "@/lib/reviews/verdichtung";
import { quellTexte, type FeatureQuellen } from "@/lib/analysis/featureRanking";
import { belegRelevanz } from "@/lib/analysis/relevanz";
import type { ConversionBlockerPayload, InsightCard } from "@/db/schema";

/**
 * Conversion-Blocker (D167, Referenz-Muster „Conversion Blockers"): Kunden-
 * Themen mit echtem Gewicht, die Listing/Bilder NICHT oder schwach
 * beantworten — der fehlende Match zwischen Kunden-Interesse und
 * Listing-Antwort kostet Conversion. „LLM generiert, Code erzwingt":
 * - Jeder Blocker MUSS auf echte Roh-Aspekte verweisen (findeAspekt, D137) —
 *   der Match ist die Existenzberechtigung; ohne aufgelösten Aspekt fliegt
 *   die Karte und wird GEZÄHLT verworfen (nie still).
 * - Relevanz (1–5) rechnet der CODE aus der Anzahl der Beleg-Aspekte
 *   (Formel belegRelevanz, D154/D266) — nie die KI.
 * - Quellen-Tags stempelt der CODE aus der tatsächlichen Datenbasis (D133):
 *   ein Fehlen lässt sich nicht verbatim zitieren, also behauptet die KI
 *   auch keine Quellen.
 * - KEINE Bild-Ideen (Nutzer 22.07.): visuelle Umsetzung gehört in die
 *   kommende Briefings-Überarbeitung (D168).
 */

type RawBlocker = { titel?: unknown; problem?: unknown; passendeAspekte?: unknown };

/** Struktur + Aspekt-Match erzwingen; Relevanz und Quellen-Tags stempelt der Code. */
export function normalisiereBlockerKarten(
  raw: unknown,
  aspekte: RoheAspekte,
  quellenTags: string[],
): { cards: InsightCard[]; verworfen: number } {
  const o = (raw ?? {}) as Record<string, unknown>;
  const liste = Array.isArray(o.blocker) ? (o.blocker as RawBlocker[]) : [];
  let verworfen = 0;

  const cards: InsightCard[] = [];
  for (const b of liste) {
    const titel = String(b.titel ?? "").trim();
    const problem = String(b.problem ?? "").trim();
    if (!titel || !problem) {
      verworfen++;
      continue;
    }

    // Der Match IST der Blocker: Referenzen gegen echte Roh-Aspekte auflösen (D137)
    const beleg = (Array.isArray(b.passendeAspekte) ? b.passendeAspekte : [])
      .map((r) => findeAspekt(String(r ?? ""), aspekte))
      .filter((a): a is NonNullable<typeof a> => a !== null)
      .filter((a, i, arr) => arr.findIndex((x) => x.label === a.label && x.typ === a.typ) === i);
    if (beleg.length === 0) {
      verworfen++; // Blocker ohne echten Kunden-Aspekt — gezählt, nie still
      continue;
    }

    cards.push({
      titel: titel.slice(0, 120),
      beschreibung: problem.slice(0, 800),
      relevanz: belegRelevanz(beleg.length),
      quellen: quellenTags,
      bildIdeen: [],
      belegAspekte: beleg,
    });
  }

  // Doppelte Blocker (gleiche Aspekt-Menge) einmal zeigen — der stärkste zuerst
  const erwaehnungenVon = (c: InsightCard) => c.belegAspekte.reduce((s, x) => s + (x.mentionCount ?? 0), 0);
  cards.sort((a, b) => b.relevanz - a.relevanz || erwaehnungenVon(b) - erwaehnungenVon(a));
  return { cards: cards.slice(0, 8), verworfen };
}

const SYSTEM =
  "Du findest Conversion-Blocker in einem Amazon-Listing: Kunden-Themen aus den Rezensionen, die das Listing " +
  "(Texte UND Bilder) nicht oder nur schwach beantwortet. Antworte AUSSCHLIESSLICH mit validem JSON.";

function prompt(quellen: FeatureQuellen, aspekte: RoheAspekte, sprache: string): string {
  const texte = quellTexte(quellen);
  const quellBlock = Object.entries(texte)
    .map(([k, v]) => `### QUELLE "${k}"\n${v.trim() ? v.slice(0, 4000) : "(nicht erfasst)"}`)
    .join("\n\n");
  const aspektBlock = [
    ...aspekte.buyingTriggers.map((a) => `- [Kaufauslöser] "${a.label}"`),
    ...aspekte.painPoints.map((a) => `- [Pain Point] "${a.label}"`),
  ].join("\n");
  return `LISTING-QUELLTEXTE (das ist ALLES, was Kaufinteressenten sehen — inkl. ausgelesener Bilder):
${quellBlock}

KUNDEN-THEMEN AUS DEN REZENSIONEN (ausgezählt, echt):
${aspektBlock || "(keine — Review-Analyse fehlt)"}

AUFGABE: Finde die CONVERSION-BLOCKER (KEINE Mindest- oder Zielmenge, D266 — so viele, wie wirklich belegt sind; oft sind es zwei bis vier, manchmal keiner) (Sprache "${sprache}"): Kunden-Themen von oben, die das Listing NICHT oder nur schwach beantwortet. Ein Blocker existiert NUR, wenn beides zusammenkommt — das Thema ist Kunden nachweislich wichtig UND die Antwort darauf fehlt in den Quelltexten.
REGELN:
1. titel: der Blocker in Klartext (max. 8 Wörter, z. B. "Dosierung im Listing unbeantwortet").
2. problem: 2–3 Sätze — WAS Kunden erwarten (aus den Themen oben), WO im Listing die Antwort fehlt oder zu schwach ist und warum das den Kauf bremst. Nur auf die Quelltexte oben stützen, nichts erfinden.
3. passendeAspekte: die WORTGLEICHEN Labels der Kunden-Themen oben, die diesen Blocker belegen — mindestens eins, sonst zählt der Blocker nicht.
4. Quellen mit "(nicht erfasst)" sind UNBEKANNT, nicht leer: Ein Thema, das dort beantwortet sein könnte, ist KEIN Blocker.
5. KEINE Stil-Urteile, KEINE Regel-Urteile, KEINE erfundenen Wettbewerbs-Vergleiche.

JSON-Schema:
{"blocker":[{"titel":"...","problem":"...","passendeAspekte":["..."]}]}`;
}

export async function findeBlocker(input: {
  quellen: FeatureQuellen;
  aspekte: RoheAspekte;
  reviewsGesamt: number;
  sprache?: string;
}): Promise<ConversionBlockerPayload> {
  const texte = quellTexte(input.quellen);
  if (!Object.values(texte).some((t) => t.trim())) {
    throw new Error("Der Blocker-Lauf braucht Listing-Inhalt — erst das Listing importieren.");
  }
  // Signifikanz-Gate (D170): Einzelnennungen bei großer Stichprobe werden kein Blocker
  const gate = filtereEinzelnennungen(input.aspekte, input.reviewsGesamt);
  input = { ...input, aspekte: gate.aspekte };
  if (input.aspekte.painPoints.length + input.aspekte.buyingTriggers.length === 0) {
    throw new Error("Der Blocker-Lauf braucht die Kunden-Themen der Bewertungs-Analyse — der Match ist der Blocker.");
  }

  // Quellen-Tags stempelt der CODE (D133): die tatsächlich geprüfte Datenbasis
  const quellenTags = ["Reviews", "Listing", ...(texte.bilder.trim() ? ["Bilder"] : [])];
  const hinweise: string[] = [...gate.hinweise];
  const QUELL_LABEL: Record<string, string> = {
    title: "Titel", bullets: "Bullets", description: "Beschreibung", attributes: "Attribute",
    important_info: "Wichtige Informationen", aplus: "A+-Inhalt", bilder: "Bilder",
  };
  const leereQuellen = Object.entries(texte).filter(([, v]) => !v.trim()).map(([k]) => QUELL_LABEL[k]);
  if (leereQuellen.length) {
    hinweise.push(`Nicht erfasste Quellen (dort kann eine Antwort stehen, die der Lauf nicht sieht): ${leereQuellen.join(", ")}.`);
  }

  const { provider } = resolveRecipe("listing.blocker");
  if (provider.name === "mock") {
    const aspekt = input.aspekte.buyingTriggers[0] ?? input.aspekte.painPoints[0];
    return {
      cards: [
        {
          titel: `Mock-Blocker: ${aspekt.label.slice(0, 80)}`,
          beschreibung: "Mock-Lauf — in Produktion stehen hier die Kunden-Themen ohne Listing-Antwort.",
          relevanz: belegRelevanz(1),
          quellen: quellenTags,
          bildIdeen: [],
          belegAspekte: [findeAspekt(aspekt.label, input.aspekte)!],
        },
      ],
      verworfen: 0,
      hinweise,
      stats: { reviewsGesamt: input.reviewsGesamt },
    };
  }

  // QM-Lauf (D182/D183): Blocker ohne echten Beleg-Aspekt werden automatisch
  // mit Korrektur-Auftrag neu angefordert statt manuell „erneut starten".
  // WICHTIG: 0 Blocker bei 0 Verworfenen ist ein GÜLTIGES Ergebnis (gutes Listing).
  const { cards, verworfen } = await llmJsonLauf<ReturnType<typeof normalisiereBlockerKarten>>({
    recipeKey: "listing.blocker",
    system: SYSTEM,
    prompt: prompt(input.quellen, input.aspekte, input.sprache ?? "de"),
    maxTokens: 6000,
    temperature: 0,
    kontrakt: (raw) => {
      const r = normalisiereBlockerKarten(raw, input.aspekte, quellenTags);
      return r.cards.length === 0 && r.verworfen > 0
        ? { verstoesse: ["Jeder gelieferte Blocker referenzierte einen nicht existierenden Kunden-Aspekt — verwende AUSSCHLIESSLICH exakte Aspekt-Labels aus der Liste; ohne echten Aspekt-Beleg keinen Blocker behaupten."] }
        : { wert: r };
    },
  });
  if (cards.length === 0) {
    hinweise.push("Kein Blocker gefunden: Die gewichtigen Kunden-Themen sind im Listing beantwortet — ein gutes Zeichen, kein Fehler.");
  }

  return { cards, verworfen, hinweise, stats: { reviewsGesamt: input.reviewsGesamt } };
}
