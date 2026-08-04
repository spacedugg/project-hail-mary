import { resolveRecipe } from "@/lib/llm/registry";
import { llmJsonLauf } from "@/lib/llm/qmLauf";
import { belegRelevanz } from "@/lib/analysis/relevanz";
import type { BelegAspekt, InsightCard, ReviewInsightsPayload } from "@/db/schema";

/**
 * Insight-Verdichtung (D131/D132/D133/D137) — die zweite Stufe über den
 * Roh-Themen: Aus gezählten Pain Points / Kaufauslösern werden benannte
 * Erkenntnisse in Klartext („Stoppt Grasfressen & Sodbrennen schnell"),
 * nach Relevanz sortiert. Regeln („LLM generiert, Code erzwingt"):
 * - Jede Karte MUSS auf Roh-Aspekte zurückverweisen; Karten ohne gültigen
 *   Beleg fliegen raus und werden GEZÄHLT ausgewiesen (D133, nie still).
 * - Zählwerte der Beleg-Aspekte kommen aus der Roh-Analyse (Code), nie vom LLM.
 * - Quellen-Tags setzt der AUFRUFER aus dem, was tatsächlich einfloss (D133).
 * - Gegensätzliche Aspekte dürfen zu EINER ausgewogenen Karte gebündelt
 *   werden (D137) — Erwartungs-Management statt Schönfärberei.
 * - Dedup-Gate (D137): identische Titel oder identische Beleg-Mengen werden
 *   zusammengelegt (Referenz-Tool zeigte dasselbe Insight dreifach).
 */

export type RoheAspekte = Pick<ReviewInsightsPayload, "painPoints" | "buyingTriggers">;

export type VerdichtungsErgebnis = {
  cards: InsightCard[];
  kernThese: string | null;
  verworfen: number;
  /** Vom Wahrheits-Filter (D134) aussortierte Bild-Ideen — ausgewiesen, nie still. */
  entfernteBildIdeen: Array<{ idee: string; grund: string }>;
  /** Signifikanz-Gate (D170): übergangene Einzelnennungen u. Ä. — ausgewiesen, nie still. */
  hinweise: string[];
};

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();

/**
 * Signifikanz-Gate (D170, Nutzer-Vorgabe 22.07.): Was bei großer Stichprobe
 * nur vereinzelt vorkommt (z. B. 1–2 von 1.000 Reviews), wird KEINE
 * Erkenntnis und KEIN Finding für Briefings — es bleibt in der Roh-Liste
 * sichtbar, wird aber ausgewiesen übergangen. Schwelle deterministisch:
 * unter 100 analysierten Reviews kein Gate (dünne Basis wird schon per
 * Worturteil eingeordnet, D138); ab 100 braucht ein Aspekt ≥2, ab 500 ≥3
 * verifizierte Fundstellen. Aspekte ohne Zählwert (Altbestand) bleiben.
 */
export function filtereEinzelnennungen(
  aspekte: RoheAspekte,
  reviewsGesamt: number,
): { aspekte: RoheAspekte; hinweise: string[] } {
  if (reviewsGesamt < 100) return { aspekte, hinweise: [] };
  const mindest = reviewsGesamt >= 500 ? 3 : 2;
  const uebergangen: string[] = [];
  const filter = (liste: RoheAspekte["painPoints"]) =>
    liste.filter((a) => {
      if (a.mentionCount === null || a.mentionCount >= mindest) return true;
      uebergangen.push(a.label);
      return false;
    });
  const gefiltert = { painPoints: filter(aspekte.painPoints), buyingTriggers: filter(aspekte.buyingTriggers) };
  // Sicherung (Review-Fix): Würde das Gate ALLES streichen, bleibt die
  // Roh-Liste stehen — ein leeres Ergebnis wäre ein Fehlurteil, weil die
  // Zählwerte nur Mindestwerte sind (max. 15 Zitate je Aspekt, D170).
  if (gefiltert.painPoints.length + gefiltert.buyingTriggers.length === 0) {
    return {
      aspekte,
      hinweise: [
        `Signifikanz-Gate ausgesetzt: Kein Aspekt erreicht ${mindest} verifizierte Fundstellen bei ${reviewsGesamt} analysierten Reviews — die Zählwerte sind Mindestwerte, alle Aspekte bleiben gewertet.`,
      ],
    };
  }
  const hinweise = uebergangen.length
    ? [
        `Signifikanz-Gate: ${uebergangen.length} Aspekt(e) mit weniger als ${mindest} verifizierten Fundstellen bei ${reviewsGesamt} analysierten Reviews nicht als Erkenntnis gewertet: ${uebergangen.map((l) => `„${l}"`).join(", ")}.`,
      ]
    : [];
  return { aspekte: gefiltert, hinweise };
}

/** Aspekt-Referenz des LLM gegen die ECHTEN Roh-Themen auflösen (wortgleich oder enthalten). */
export function findeAspekt(ref: string, aspekte: RoheAspekte): BelegAspekt | null {
  const n = norm(ref);
  if (!n) return null;
  const suche = (
    liste: RoheAspekte["painPoints"],
    typ: BelegAspekt["typ"],
  ): BelegAspekt | null => {
    const exakt = liste.find((a) => norm(a.label) === n);
    const enthalten = exakt ?? liste.find((a) => norm(a.label).includes(n) || n.includes(norm(a.label)));
    // D275: Herkunft und Übertragbarkeit MITNEHMEN. Vorher endete die
    // Aufschlüsselung eigene/fremde Reviews (D196) hier — jede Karte trug danach
    // nur noch eine Summe, und niemand konnte mehr sehen, ob ein Befund
    // überhaupt am eigenen Produkt entstanden ist.
    return enthalten
      ? {
          label: enthalten.label,
          typ,
          mentionCount: enthalten.mentionCount,
          herkunft: enthalten.herkunft,
          uebertragbarkeit: enthalten.uebertragbarkeit,
        }
      : null;
  };
  return suche(aspekte.buyingTriggers, "buyingTrigger") ?? suche(aspekte.painPoints, "painPoint");
}

/**
 * Tendenz einer Erkenntnis (D171, erweitert in D284 nach Nutzer-Befund
 * 04.08.2026): Rechnet der CODE aus den verifizierten Zählwerten — nie die KI.
 *
 * Vorher gab es die Tendenz NUR für gemischte Karten (Beleg-Aspekte BEIDER
 * Typen mit Zählwerten); einseitige Karten bekamen `null` und in der Anzeige
 * damit GAR KEIN Vorzeichen. Ergebnis im Referenz-Fall: „Undichte Anschlüsse &
 * abrutschende Schläuche als Hauptärgernis" stand ohne jede Kennzeichnung neben
 * zwei Karten mit „▼ NEGATIV" — also gerade die eindeutigen Fälle ohne Urteil,
 * die uneindeutigen mit. Umgekehrt wäre eine rein positive Erkenntnis nie als
 * positiv erkennbar gewesen.
 *
 * Jetzt trägt JEDE Karte mit Beleg-Aspekten eine Richtung:
 * - nur eine Seite belegt → diese Seite IST die Richtung (kein Rechnen nötig)
 * - beide Seiten mit Zählwerten → die Seite mit mehr Fundstellen gewinnt
 * - beide Seiten, aber Zählwerte fehlen (Altbestand) → „ausgeglichen" mit
 *   `zahlenBekannt: false`; die Anzeige nennt dann KEINE Zahlen, statt „0+ / 0−"
 *   zu behaupten.
 */
export function kartenTendenz(karte: Pick<InsightCard, "belegAspekte">): {
  positiv: number;
  negativ: number;
  richtung: "positiv" | "negativ" | "ausgeglichen";
  /** Sind die Fundstellen-Zahlen belastbar? Nur dann dürfen sie angezeigt werden. */
  zahlenBekannt: boolean;
  /** Bündelt die Karte beide Seiten? Nur dann ist „überwiegend" die richtige Ansage. */
  beidseitig: boolean;
} | null {
  if (karte.belegAspekte.length === 0) return null;
  const seite = (typ: BelegAspekt["typ"]) => karte.belegAspekte.filter((b) => b.typ === typ);
  const summe = (typ: BelegAspekt["typ"]) =>
    seite(typ).filter((b) => b.mentionCount !== null).reduce((s, b) => s + (b.mentionCount ?? 0), 0);
  const positiv = summe("buyingTrigger");
  const negativ = summe("painPoint");
  const hatPos = seite("buyingTrigger").length > 0;
  const hatNeg = seite("painPoint").length > 0;
  // Zahlen sind nur belastbar, wenn JEDE vertretene Seite mindestens einen
  // Zählwert hat — sonst würde eine Seite mit 0 in den Vergleich gehen.
  const zahlenBekannt =
    (!hatPos || seite("buyingTrigger").some((b) => b.mentionCount !== null)) &&
    (!hatNeg || seite("painPoint").some((b) => b.mentionCount !== null));

  const richtung = !hatNeg
    ? "positiv"
    : !hatPos
      ? "negativ"
      : !zahlenBekannt
        ? "ausgeglichen"
        : positiv > negativ
          ? "positiv"
          : negativ > positiv
            ? "negativ"
            : "ausgeglichen";
  return { positiv, negativ, richtung, zahlenBekannt, beidseitig: hatPos && hatNeg };
}

/**
 * Karten-Klasse (D178): positiv/negativ/gemischt — deterministisch aus den
 * Beleg-Aspekten, nie von der KI. Seit D284 fällt sie direkt aus der Tendenz;
 * der frühere Typ-Fallback ist dort aufgegangen.
 */
export function kartenKlasse(karte: Pick<InsightCard, "belegAspekte">): "positiv" | "negativ" | "gemischt" {
  const t = kartenTendenz(karte);
  if (!t) return "gemischt";
  return t.richtung === "ausgeglichen" ? "gemischt" : t.richtung;
}

/**
 * Struktur ERZWINGEN (D103-Muster): LLM-Antwort → validierte Karten.
 * `quellen` wird hier auf jede Karte gestempelt — deterministisch vom Aufrufer.
 */
export function normalisiereInsightCards(
  raw: unknown,
  aspekte: RoheAspekte,
  quellen: string[],
): { cards: InsightCard[]; verworfen: number } {
  const o = (raw ?? {}) as Record<string, unknown>;
  const liste = Array.isArray(o.insights) ? o.insights : [];
  let verworfen = 0;

  const cards: InsightCard[] = [];
  for (const x of liste) {
    const c = (x ?? {}) as Record<string, unknown>;
    const titel = String(c.titel ?? c.title ?? "").trim();
    const beschreibung = String(c.beschreibung ?? c.description ?? "").trim();
    if (!titel || !beschreibung) {
      verworfen++;
      continue;
    }
    const refs = Array.isArray(c.belegAspekte) ? c.belegAspekte : [];
    const beleg: BelegAspekt[] = [];
    for (const r of refs) {
      const a = findeAspekt(String(r ?? ""), aspekte);
      // Nur echte Roh-Themen zählen als Beleg; Duplikate (gleiches Label) nicht doppelt
      if (a && !beleg.some((b) => b.label === a.label && b.typ === a.typ)) beleg.push(a);
    }
    if (beleg.length === 0) {
      // Erkenntnis ohne zuordenbare Quelle fliegt raus (D133) — gezählt, nie still
      verworfen++;
      continue;
    }
    // Relevanz rechnet der CODE (D266): dieselbe Formel wie Feature-Ranking und
    // Blocker-Lauf. Vorher kam sie aus der LLM-Antwort — zwei Listen, zwei
    // Maßstäbe, nicht vergleichbar (Verstoß gegen D154/D170/D178).
    const relevanz = belegRelevanz(beleg.length);
    const bildIdeen = (Array.isArray(c.bildIdeen) ? c.bildIdeen : [])
      .map((s) => String(s ?? "").trim())
      .filter(Boolean)
      .slice(0, 3);
    // Schwerere Belege zuerst (D171): sortiert nach verifiziertem Zählwert
    beleg.sort((a, b) => (b.mentionCount ?? 0) - (a.mentionCount ?? 0));
    cards.push({ titel: titel.slice(0, 120), beschreibung: beschreibung.slice(0, 800), relevanz, quellen, bildIdeen, belegAspekte: beleg });
  }

  // Dedup-Gate (D137): gleicher Titel ODER identische Beleg-Menge → zusammenlegen
  const dedup: InsightCard[] = [];
  for (const card of cards) {
    const belegKey = card.belegAspekte.map((b) => `${b.typ}:${norm(b.label)}`).sort().join("|");
    const doppelt = dedup.find(
      (d) =>
        norm(d.titel) === norm(card.titel) ||
        d.belegAspekte.map((b) => `${b.typ}:${norm(b.label)}`).sort().join("|") === belegKey,
    );
    if (doppelt) {
      // Die stärkere Karte gewinnt; Bild-Ideen werden gemerged (max. 3)
      if (card.relevanz > doppelt.relevanz) {
        doppelt.titel = card.titel;
        doppelt.beschreibung = card.beschreibung;
        doppelt.relevanz = card.relevanz;
      }
      doppelt.bildIdeen = [...new Set([...doppelt.bildIdeen, ...card.bildIdeen])].slice(0, 3);
      verworfen++;
      continue;
    }
    dedup.push(card);
  }

  const erwaehnungen = (c: InsightCard) => c.belegAspekte.reduce((s, b) => s + (b.mentionCount ?? 0), 0);
  dedup.sort((a, b) => b.relevanz - a.relevanz || erwaehnungen(b) - erwaehnungen(a));
  return { cards: dedup.slice(0, 10), verworfen };
}

const SYSTEM =
  "Du verdichtest ausgezählte Themen aus Amazon-Kundenrezensionen zu benannten Kauf-Erkenntnissen für die Listing-Optimierung. " +
  "Antworte AUSSCHLIESSLICH mit validem JSON nach dem geforderten Schema.";

function prompt(aspekte: RoheAspekte, sprache: string): string {
  const fmt = (liste: RoheAspekte["painPoints"], typ: string) =>
    liste
      .map((a) => `- [${typ}] "${a.label}"${a.mentionCount !== null ? ` (${a.mentionCount}× belegt)` : ""}${a.quotes.length ? ` — O-Töne: ${a.quotes.slice(0, 2).map((q) => `„${q.slice(0, 120)}"`).join(" / ")}` : ""}`)
      .join("\n");
  return `ROH-THEMEN AUS DER REVIEW-ANALYSE (Zählwerte = verifizierte Fundstellen in verschiedenen Reviews):
${fmt(aspekte.buyingTriggers, "Kaufauslöser") || "(keine Kaufauslöser)"}
${fmt(aspekte.painPoints, "Pain Point") || "(keine Pain Points)"}

AUFGABE: Verdichte diese Roh-Themen zu benannten Erkenntnissen (Insight-Karten) in Sprache "${sprache}".
REGELN:
0. KEINE Mindest- oder Zielmenge (D266): Liefere so viele Erkenntnisse, wie die Roh-Themen wirklich tragen — oft sind es zwei bis vier. Nichts auffüllen; ein Roh-Thema ohne eigene Erkenntnis bleibt lieber weg, als dass eine dünne Karte entsteht.
1. Der Titel ist ein prägnanter Kaufgrund/Befund in Klartext (max. 10 Wörter) — KEIN wörtliches Kundenzitat, sondern die Abstraktion dahinter (Beispiel-Muster: "Stoppt Grasfressen & Sodbrennen schnell").
2. Die Beschreibung (2–4 Sätze) erklärt nutzenorientiert, was dahintersteckt und warum es Kaufentscheidungen beeinflusst. Titel und Beschreibung dürfen NUR behaupten, was die O-Töne der Beleg-Aspekte wörtlich stützen — keine Steigerungen (aus „Bekannte haben es empfohlen" wird KEIN „Tierarzt-Tipp").
3. GEGENSATZ-PFLICHT: Positive und negative Roh-Themen zum SELBEN Aspekt (z. B. "riecht gut" 8× + "riecht unangenehm" 19×) MÜSSEN zu GENAU EINER Erkenntnis gebündelt werden — NIE dasselbe Thema als getrennte positive UND negative Erkenntnis, damit kann niemand arbeiten. Beide Seiten kommen in belegAspekte. Der Titel folgt der Seite mit MEHR belegten Fundstellen (Zählwerte oben) und benennt die Gegenseite ehrlich mit (Beispiel-Muster: "Hohe Akzeptanz bei vielen Hunden, aber für wählerische Fresser eine Herausforderung").
4. GEGENMASSNAHME: Bei so gebündelten Erkenntnissen leiten Beschreibung und bildIdeen aus der negativen Seite eine KONKRETE, durch O-Töne gedeckte Maßnahme ab (Beispiel-Muster: Hunde verweigern die Drops → Galeriebild, das das Untermischen ins Futter zeigt) — aus der negativen Erfahrung wird ein umsetzbarer Listing-Hebel.
5. KEINE Relevanz-Angabe (D266): Die Relevanz rechnet der Code aus den verifizierten Zählwerten der Beleg-Aspekte. Liefere sie nicht mit.
6. belegAspekte: die WORTGLEICHEN Labels der Roh-Themen oben, auf denen die Erkenntnis beruht (mindestens 1) — nichts erfinden, keine neuen Labels.
7. bildIdeen: 2–3 konkrete visuelle Umsetzungsideen fürs Listing (Galeriebild, Infografik, A+-Modul). VERBOTEN: erfundene Autoritäts-Belege (Experten-Zitate, Testimonials, Siegel, Zertifikate, Zahlen), die nicht in den Roh-Themen belegt sind.
8. kernThese: EIN Satz, der die wichtigste Erkenntnis der gesamten Analyse zusammenfasst.

JSON-Schema:
{"kernThese":"...","insights":[{"titel":"...","beschreibung":"...","bildIdeen":["..."],"belegAspekte":["wortgleiches Label", "..."]}]}`;
}

export async function verdichteInsights(
  payload: ReviewInsightsPayload,
  opts: {
    quellen: string[];
    sprache?: string;
    /** Produkt-Wahrheit als Text (Fakten + Listing) — Basis des Bild-Ideen-Wahrheitsfilters (D134). */
    belegText?: string;
  },
): Promise<VerdichtungsErgebnis> {
  // Signifikanz-Gate (D170): Einzelnennungen bei großer Stichprobe werden
  // keine Erkenntnis — ausgewiesen, nie still.
  const gate = filtereEinzelnennungen(
    { painPoints: payload.painPoints, buyingTriggers: payload.buyingTriggers },
    payload.stats.reviewsTotal,
  );
  const aspekte = gate.aspekte;
  if (aspekte.painPoints.length === 0 && aspekte.buyingTriggers.length === 0) {
    throw new Error("Verdichtung braucht Roh-Themen — die Review-Analyse (Etappe davor) hat keine geliefert.");
  }

  const { provider } = resolveRecipe("reviews.verdichtung");
  if (provider.name === "mock") {
    // Dev ohne Key: deterministische Karten aus den ECHTEN Top-Aspekten — kein erfundener Inhalt
    const top = [
      ...aspekte.buyingTriggers.slice(0, 1).map((a) => ({ a, typ: "buyingTrigger" as const })),
      ...aspekte.painPoints.slice(0, 1).map((a) => ({ a, typ: "painPoint" as const })),
    ];
    return {
      cards: top.map(({ a, typ }) => ({
        titel: `Mock-Erkenntnis: ${a.label.slice(0, 90)}`,
        beschreibung: `Mock-Verdichtung aus dem Roh-Thema „${a.label}" (${a.mentionCount ?? "?"}× erwähnt) — in Produktion steht hier die abstrahierte Erkenntnis.`,
        relevanz: belegRelevanz(1),
        quellen: opts.quellen,
        bildIdeen: ["Mock-Bildidee: Galeriebild zum Thema"],
        belegAspekte: [{ label: a.label, typ, mentionCount: a.mentionCount }],
      })),
      kernThese: "Mock-Kern-These — in Produktion fasst EIN Satz die Analyse zusammen.",
      verworfen: 0,
      entfernteBildIdeen: [],
      hinweise: gate.hinweise,
    };
  }

  // QM-Lauf (D182/D183): kaputtes JSON oder komplett unbelegte Karten werden
  // mit Korrektur-Auftrag automatisch wiederholt — kein manuelles „bitte
  // erneut starten" mehr; erst nach 3 Versuchen harter Fehler.
  const { cards, verworfen, kernTheseRoh } = await llmJsonLauf<
    ReturnType<typeof normalisiereInsightCards> & { kernTheseRoh: string }
  >({
    recipeKey: "reviews.verdichtung",
    system: SYSTEM,
    prompt: prompt(aspekte, opts.sprache ?? "de"),
    maxTokens: 6000,
    temperature: 0,
    kontrakt: (raw) => {
      const r = normalisiereInsightCards(raw, aspekte, opts.quellen);
      return r.cards.length === 0
        ? { verstoesse: ["Keine Erkenntnis-Karte hatte einen gültigen Roh-Themen-Beleg — referenziere in den Beleg-Aspekten AUSSCHLIESSLICH exakte Labels aus der gelisteten Roh-Themen-Liste, nichts erfinden."] }
        : { wert: { ...r, kernTheseRoh: String((raw as { kernThese?: unknown }).kernThese ?? "").trim() } };
    },
  });

  // Wahrheits-Filter für Bild-Ideen (D134): erfundene Autoritäts-Belege/Siegel
  // fliegen deterministisch raus, wenn die Produkt-Wahrheit sie nicht deckt.
  const entfernteBildIdeen: VerdichtungsErgebnis["entfernteBildIdeen"] = [];
  if (opts.belegText) {
    const { pruefeBildIdeen } = await import("@/lib/analysis/bildideen");
    for (const card of cards) {
      const geprueft = pruefeBildIdeen(card.bildIdeen, opts.belegText);
      card.bildIdeen = geprueft.zulaessig;
      entfernteBildIdeen.push(...geprueft.entfernt);
    }
  }

  const kernThese = kernTheseRoh || null;
  return { cards, kernThese, verworfen, entfernteBildIdeen, hinweise: gate.hinweise };
}
