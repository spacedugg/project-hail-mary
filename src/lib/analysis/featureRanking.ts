import { generateForRecipe, resolveRecipe } from "@/lib/llm/registry";
import { parseLlmJson } from "@/lib/llm/json";
import { findeAspekt, type RoheAspekte } from "@/lib/reviews/verdichtung";
import { pruefeBildIdeen } from "@/lib/analysis/bildideen";
import type { FeatureRankingPayload, InsightCard } from "@/db/schema";

/**
 * Feature-Relevanz-Ranking (D141/D146): Welche Features des LISTINGS
 * honorieren Kunden wirklich? Die Umkehrung des Kundenstimmen-Abgleichs
 * (Listing → Reviews). „LLM generiert, Code erzwingt":
 * - Quellen-Tags (D133) gibt es NUR nach verifiziertem Verbatim-Beleg: das
 *   LLM muss je Quelle ein wörtliches Zitat liefern, der Code prüft, dass es
 *   im Quelltext steht — unverifizierte Tags fliegen, Features ohne jeden
 *   verifizierten Beleg werden GEZÄHLT verworfen.
 * - Die Relevanz (1–5) rechnet der CODE aus den Erwähnungen der zugeordneten
 *   Review-Aspekte — nie die KI (Formel in Daten & Formeln).
 * - Ehrliche Grenze (D144): „bei Wettbewerbern unbeleuchtet" ist NICHT
 *   bewertbar, solange keine Wettbewerber-Listings vorliegen — wird als
 *   Hinweis ausgewiesen statt geraten.
 */

export type FeatureQuellen = {
  title: string | null;
  bullets: string[];
  description: string | null;
  attributes: Record<string, string> | null;
  importantInfo: string | null;
  aplusContent: string | null;
};

const QUELL_LABEL: Record<string, string> = {
  title: "Titel",
  bullets: "Bullets",
  description: "Beschreibung",
  attributes: "Attribute",
  important_info: "Wichtige Informationen",
  aplus: "A+-Inhalt",
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Quelltexte je Quelle — Basis der Verbatim-Verifikation. */
function quellTexte(q: FeatureQuellen): Record<string, string> {
  return {
    title: q.title ?? "",
    bullets: q.bullets.join("\n"),
    description: q.description ?? "",
    attributes: q.attributes ? Object.entries(q.attributes).map(([k, v]) => `${k}: ${v}`).join("\n") : "",
    important_info: q.importantInfo ?? "",
    aplus: q.aplusContent ?? "",
  };
}

/**
 * Relevanz DETERMINISTISCH aus der ANZAHL zugeordneter Review-Aspekte
 * (echter Wert; LLM-Zählwerte sind seit D154 verbannt):
 * 0 Aspekte → 1 · 1 → 3 · 2 → 4 · ≥3 → 5.
 */
export function featureRelevanz(anzahlBelegAspekte: number): number {
  return anzahlBelegAspekte >= 3 ? 5 : anzahlBelegAspekte === 2 ? 4 : anzahlBelegAspekte === 1 ? 3 : 1;
}

type RawFeature = {
  titel?: unknown;
  beschreibung?: unknown;
  belege?: unknown;
  passendeAspekte?: unknown;
  bildIdeen?: unknown;
};

/** Struktur + Verbatim-Belege erzwingen; Relevanz rechnet der Code. */
export function normalisiereFeatureKarten(
  raw: unknown,
  quellen: FeatureQuellen,
  aspekte: RoheAspekte,
  reviewsGesamt: number,
): { cards: InsightCard[]; verworfen: number } {
  const o = (raw ?? {}) as Record<string, unknown>;
  const liste = Array.isArray(o.features) ? (o.features as RawFeature[]) : [];
  const texte = quellTexte(quellen);
  let verworfen = 0;

  const cards: InsightCard[] = [];
  for (const f of liste) {
    const titel = String(f.titel ?? "").trim();
    const beschreibung = String(f.beschreibung ?? "").trim();
    if (!titel || !beschreibung) {
      verworfen++;
      continue;
    }

    // Verbatim-Verifikation je Quelle (D133): Zitat muss im Quelltext stehen
    const quellTags: string[] = [];
    for (const b of Array.isArray(f.belege) ? f.belege : []) {
      const r = (b ?? {}) as Record<string, unknown>;
      const quelle = String(r.quelle ?? "").trim();
      const zitat = norm(String(r.zitat ?? ""));
      const label = QUELL_LABEL[quelle];
      if (!label || zitat.length < 3) continue;
      if (norm(texte[quelle] ?? "").includes(zitat) && !quellTags.includes(label)) quellTags.push(label);
    }
    if (quellTags.length === 0) {
      verworfen++; // Feature ohne verifizierten Listing-Beleg — gezählt, nie still
      continue;
    }

    // Kunden-Echo: Referenzen gegen echte Roh-Aspekte auflösen (Zählwerte vom Code)
    const beleg = (Array.isArray(f.passendeAspekte) ? f.passendeAspekte : [])
      .map((r) => findeAspekt(String(r ?? ""), aspekte))
      .filter((a): a is NonNullable<typeof a> => a !== null)
      .filter((a, i, arr) => arr.findIndex((x) => x.label === a.label && x.typ === a.typ) === i);

    const bildIdeen = (Array.isArray(f.bildIdeen) ? f.bildIdeen : [])
      .map((s) => String(s ?? "").trim())
      .filter(Boolean)
      .slice(0, 3);

    cards.push({
      titel: titel.slice(0, 120),
      beschreibung: beschreibung.slice(0, 800),
      relevanz: featureRelevanz(beleg.length),
      quellen: quellTags,
      bildIdeen,
      belegAspekte: beleg,
    });
  }

  const erwaehnungenVon = (c: InsightCard) => c.belegAspekte.reduce((s, b) => s + (b.mentionCount ?? 0), 0);
  cards.sort((a, b) => b.relevanz - a.relevanz || erwaehnungenVon(b) - erwaehnungenVon(a));
  return { cards: cards.slice(0, 10), verworfen };
}

const SYSTEM =
  "Du extrahierst Produkt-Features aus einem Amazon-Listing und ordnest ihnen Kundenstimmen-Themen zu. " +
  "Antworte AUSSCHLIESSLICH mit validem JSON nach dem geforderten Schema. Zitate wortwörtlich (verbatim) aus den Quelltexten.";

function prompt(quellen: FeatureQuellen, aspekte: RoheAspekte, sprache: string): string {
  const texte = quellTexte(quellen);
  const quellBlock = Object.entries(texte)
    .map(([k, v]) => `### QUELLE "${k}"\n${v.trim() ? v.slice(0, 4000) : "(nicht erfasst)"}`)
    .join("\n\n");
  const aspektBlock = [
    ...aspekte.buyingTriggers.map((a) => `- [Kaufauslöser] "${a.label}"`),
    ...aspekte.painPoints.map((a) => `- [Pain Point] "${a.label}"`),
  ].join("\n");
  return `LISTING-QUELLTEXTE:
${quellBlock}

ROH-THEMEN AUS DEN KUNDENREZENSIONEN (ausgezählt):
${aspektBlock || "(keine — Review-Analyse fehlt)"}

AUFGABE: Extrahiere 5–10 PRODUKT-FEATURES aus den Listing-Quelltexten (Sprache "${sprache}") und ordne jedem die passenden Kunden-Themen zu.
REGELN:
1. titel: das Feature in Klartext (max. 8 Wörter, z. B. "Gezielte Wirkung bei Sodbrennen & Grasfressen") — nur Features, die WIRKLICH im Listing stehen.
2. beschreibung: 2–3 Sätze, was das Feature ist und leistet — nur Belegtes, keine Erfindungen.
3. belege: je Quelle, in der das Feature vorkommt, ein Objekt {"quelle": "title|bullets|description|attributes|important_info|aplus", "zitat": "WORTWÖRTLICHER Ausschnitt (3–12 Wörter) aus GENAU dieser Quelle"}. Der Ausschnitt wird programmatisch geprüft — paraphrasieren lässt den Beleg platzen.
4. passendeAspekte: die WORTGLEICHEN Labels der Roh-Themen oben, die dieses Feature betreffen (leer lassen, wenn Kunden es nicht erwähnen — das ist ein ehrliches, wichtiges Signal).
5. bildIdeen: 2–3 konkrete visuelle Umsetzungsideen. VERBOTEN: erfundene Autoritäts-Belege (Experten-Zitate, Testimonials, Siegel, Zertifikate), die nicht in den Quelltexten stehen.

JSON-Schema:
{"features":[{"titel":"...","beschreibung":"...","belege":[{"quelle":"bullets","zitat":"..."}],"passendeAspekte":["..."],"bildIdeen":["..."]}]}`;
}

export async function rankeFeatures(input: {
  quellen: FeatureQuellen;
  aspekte: RoheAspekte;
  reviewsGesamt: number;
  sprache?: string;
  /** Beleg-Text für den Bild-Ideen-Wahrheitsfilter (D134). */
  belegText: string;
  /** Für den ehrlichen USP-Hinweis (D144): Anzahl Wettbewerber-ASINs im Review-Scrape. */
  wettbewerberAsins: number;
}): Promise<FeatureRankingPayload> {
  const texte = quellTexte(input.quellen);
  if (!Object.values(texte).some((t) => t.trim())) {
    throw new Error("Feature-Ranking braucht Listing-Inhalt — erst das Listing importieren (D145-Felder inklusive).");
  }

  const hinweise: string[] = [
    "USP-Vergleich (‚bei Wettbewerbern unbeleuchtet') ist nicht bewertbar — Wettbewerber-LISTINGS liegen nicht vor (Wettbewerber-Auswahl auf Hold, D144). " +
      (input.wettbewerberAsins > 0
        ? `Die ${input.wettbewerberAsins} Wettbewerber-ASINs im Review-Scrape liefern Kundenstimmen, aber keine Listing-Inhalte.`
        : "Auch im Review-Scrape sind keine Wettbewerber-ASINs enthalten."),
  ];
  const leereQuellen = Object.entries(texte).filter(([, v]) => !v.trim()).map(([k]) => QUELL_LABEL[k]);
  if (leereQuellen.length) hinweise.push(`Nicht erfasste Quellen (fließen nicht ein): ${leereQuellen.join(", ")}.`);

  const { provider } = resolveRecipe("listing.feature-ranking");
  if (provider.name === "mock") {
    const bullet = input.quellen.bullets[0] ?? input.quellen.title ?? "Feature";
    return {
      cards: [
        {
          titel: `Mock-Feature: ${bullet.slice(0, 80)}`,
          beschreibung: "Mock-Ranking — in Produktion stehen hier die Listing-Features nach Kunden-Relevanz.",
          relevanz: featureRelevanz(0),
          quellen: [input.quellen.bullets.length ? "Bullets" : "Titel"],
          bildIdeen: [],
          belegAspekte: [],
        },
      ],
      verworfen: 0,
      entfernteBildIdeen: [],
      hinweise,
      stats: { reviewsGesamt: input.reviewsGesamt },
    };
  }

  const res = await generateForRecipe("listing.feature-ranking", {
    system: SYSTEM,
    messages: [{ role: "user", content: prompt(input.quellen, input.aspekte, input.sprache ?? "de") }],
    maxTokens: 6000,
    temperature: 0,
  });
  const raw = parseLlmJson<Record<string, unknown>>(res.text);
  const { cards, verworfen } = normalisiereFeatureKarten(raw, input.quellen, input.aspekte, input.reviewsGesamt);
  if (cards.length === 0) {
    throw new Error("Das Feature-Ranking lieferte kein Feature mit verifiziertem Listing-Beleg — bitte erneut starten.");
  }

  const entfernteBildIdeen: FeatureRankingPayload["entfernteBildIdeen"] = [];
  for (const card of cards) {
    const geprueft = pruefeBildIdeen(card.bildIdeen, input.belegText);
    card.bildIdeen = geprueft.zulaessig;
    entfernteBildIdeen.push(...geprueft.entfernt);
  }

  const ohneEcho = cards.filter((c) => c.belegAspekte.length === 0).length;
  if (ohneEcho > 0) {
    hinweise.push(`${ohneEcho} Feature(s) ohne Kunden-Echo in den Reviews — entweder unwichtig ODER im Listing unbeleuchtet erklärt (Prüf-Kandidaten für Content/Bilder).`);
  }

  return { cards, verworfen, entfernteBildIdeen, hinweise, stats: { reviewsGesamt: input.reviewsGesamt } };
}
