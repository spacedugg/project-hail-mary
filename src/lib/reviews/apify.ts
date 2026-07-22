import { generateForRecipe, resolveRecipe } from "@/lib/llm/registry";
import { parseLlmJson } from "@/lib/llm/json";
import type { ReviewInsightsPayload } from "@/db/schema";

/**
 * Review-Insights via Apify — Neubau der (defekten) temoa-os-Variante,
 * damit diese Version dort übernommen werden kann (D39).
 * Verbesserungen ggü. Bestand: (a) je ASIN UND je Sterne-Klasse ein EIGENER
 * Lauf (D72/D96, Nutzer-Vorgabe): Apify liefert max. 100 Reviews pro Scrape —
 * 2 ASINs bedeuten also 10 parallele Anfragen (2 × 1★…5★), jede holt bis zu
 * 100 der AKTUELLSTEN Reviews (sortBy "recent"). So verdrängt weder die
 * 5★-Masse die kritischen Klassen noch eine reviewstarke ASIN die anderen;
 * (b) robustes Rating-Parsing (Zahl ODER "4,0 von 5 Sternen"-String);
 * (c) klare Fehlerbilder statt silent fallback — scheitert ein Lauf,
 * läuft der Rest weiter und die Lücke wird je ASIN+Klasse ausgewiesen.
 */

// Per Env austauschbar (D84) — Achtung: ein anderer Actor braucht i. d. R. auch ein anderes Input-Schema
const ACTOR = process.env.APIFY_REVIEWS_ACTOR ?? "axesso_data~amazon-reviews-scraper";

export type RawReview = { asin: string; rating: number; title: string; body: string };

/** Apify-Werte für filterByStar, Index 0 → 1★ … Index 4 → 5★. */
const STAR_FILTERS = ["one_star", "two_star", "three_star", "four_star", "five_star"] as const;

function parseRating(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const m = v.match(/^(\d+)[,.]?(\d)?/);
    if (m) return parseFloat(`${m[1]}.${m[2] ?? "0"}`);
  }
  return 0;
}

/** EIN Lauf = EINE ASIN × EINE Sterne-Klasse (D96), aktuellste zuerst, bis zu 100 Reviews. */
async function runStarClass(
  apiKey: string,
  asin: string,
  filterByStar: (typeof STAR_FILTERS)[number],
  starValue: number,
  domain: string,
): Promise<RawReview[]> {
  const input = [{
    asin,
    domainCode: domain,
    sortBy: "recent", // gibt es mehr als das Scrape-Maximum, gewinnen die aktuellsten
    maxPages: 10, // 10 Seiten ≈ 100 Reviews = Maximum pro Scrape
    filterByStar,
    reviewerType: "all_reviews",
    formatType: "current_format",
    mediaType: "all_contents",
  }];

  // Zeit-Budget (D102/D118/D130): jeder Lauf bekommt 70 s (Abbruch 75 s).
  // Die alten 40 s schnitten Läufe MITTEN im Crawl ab — der Actor braucht für
  // 10 Seiten oft länger, und run-sync liefert beim Timeout nur die bis dahin
  // gesammelten Seiten (Nutzer-Befund: 93/74/79 statt ~100 je Klasse).
  // Worst Case mit 6 ASINs: 3 Batches × 75 s = 225 s + Auto-Analyse — passt
  // ins 300-s-Budget der Seite (D118).
  const res = await fetch(
    `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?timeout=70`,
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ input }),
      signal: AbortSignal.timeout(75_000),
    },
  );
  if (res.status === 408) throw new Error("Zeitlimit");
  if (!res.ok) {
    const { friendlyApifyError } = await import("@/lib/scrape/apifyError");
    throw new Error(friendlyApifyError(res.status, await res.text(), ACTOR));
  }
  const items = (await res.json()) as Array<Record<string, unknown>>;

  return items
    .map((it) => ({
      asin: String(it.asin ?? it.ASIN ?? asin),
      // Fehlt das Rating im Item, ist die Klasse durch den Filter trotzdem bekannt
      rating: parseRating(it.rating ?? it.ratingScore) || starValue,
      title: String(it.title ?? "").trim(),
      body: String(it.text ?? it.body ?? it.review ?? "").trim(),
    }))
    .filter((r) => r.body.length > 10);
}

export async function scrapeReviews(
  asins: string[],
  opts: { domain?: string } = {},
): Promise<{ reviews: RawReview[]; notes: string[] }> {
  const apiKey = process.env.APIFY_API_KEY;
  if (!apiKey) throw new Error("APIFY_API_KEY fehlt (Env) — Review-Scrape nicht möglich.");
  const valid = asins.map((a) => a.trim().toUpperCase()).filter((a) => /^B[A-Z0-9]{9}$/.test(a)).slice(0, 6);
  if (valid.length === 0) throw new Error("Keine gültigen ASINs (Format B + 9 Zeichen).");
  const domain = opts.domain ?? "de";

  // D96 (Nutzer-Vorgabe): je ASIN × Sterne-Klasse eine EIGENE Anfrage,
  // jede bis zu 100 aktuellste Reviews.
  const laeufe = valid.flatMap((asin) =>
    STAR_FILTERS.map((filter, i) => ({ asin, filter, star: i + 1 })),
  );
  // GESTAFFELT statt alles auf einmal (D129, Nutzer-Befund 21.07.): Bei
  // 6 ASINs feuerten 30 Läufe parallel — ab dem 3. ASIN kamen nur noch leere
  // Ergebnisse zurück (Scraper-Kontingent/Blockierung). Jetzt max. 10 Läufe
  // (= 2 ASINs) gleichzeitig, Batches nacheinander; 6 ASINs = 3 Batches,
  // Worst Case ~135 s — passt ins 300-s-Budget der Seite (D118).
  const BATCH = 10;
  const results: Array<PromiseSettledResult<RawReview[]>> = [];
  for (let i = 0; i < laeufe.length; i += BATCH) {
    const batch = laeufe.slice(i, i + BATCH);
    results.push(
      ...(await Promise.allSettled(batch.map((l) => runStarClass(apiKey, l.asin, l.filter, l.star, domain)))),
    );
  }

  const reviews: RawReview[] = [];
  const notes: string[] = [];
  const jeAsinKlasse = new Map<string, number[]>(); // asin → [n1★ … n5★]
  results.forEach((r, i) => {
    const { asin, star } = laeufe[i];
    if (r.status === "fulfilled") {
      reviews.push(...r.value);
      const zaehler = jeAsinKlasse.get(asin) ?? [0, 0, 0, 0, 0];
      zaehler[star - 1] = r.value.length;
      jeAsinKlasse.set(asin, zaehler);
    } else {
      const why =
        r.reason instanceof Error && (r.reason.name === "TimeoutError" || r.reason.message === "Zeitlimit")
          ? "ins Zeitlimit gelaufen"
          : `fehlgeschlagen (${r.reason instanceof Error ? r.reason.message : String(r.reason)})`;
      notes.push(`${asin} ${star}★-Lauf ${why} — diese Klasse fehlt in der Datenbasis.`);
    }
  });

  // Ehrliche Aufschlüsselung je ASIN (D102): jeder Lauf holt die bis zu 100
  // aktuellsten GESCHRIEBENEN Rezensionen seiner Klasse. Weniger als 100
  // heißt: mehr Text-Rezensionen waren für diese Klasse nicht erreichbar —
  // Amazons Gesamtzahl zählt auch Sterne-Bewertungen OHNE Text mit.
  for (const [asin, zaehler] of jeAsinKlasse) {
    const teile = zaehler.map((n, i) => `${i + 1}★ ${n}`).reverse().join(" · ");
    notes.push(`${asin}: ${teile} geschriebene Rezensionen geholt (je Klasse max. 100 der aktuellsten).`);
    // Komplett leere ASIN ehrlich markieren (D129): 0 über ALLE Klassen ist
    // fast nie „keine Reviews", sondern Blockierung oder falscher Marktplatz.
    if (zaehler.every((n) => n === 0)) {
      notes.push(`△ ${asin}: 0 Rezensionen über alle Klassen — ASIN auf amazon.${domain} prüfen (existiert sie dort?) oder später erneut scrapen.`);
    }
  }

  if (reviews.length === 0) {
    throw new Error(
      notes.length > 0
        ? `Alle Sterne-Klassen-Läufe sind fehlgeschlagen: ${notes[0]}`
        : "Scrape lieferte keine verwertbaren Reviews (evtl. keine Bewertungen vorhanden).",
    );
  }
  return { reviews, notes };
}

// ── Insights-Extraktion (LLM, Schema aus temoa-audit / SALVAGE §7) ──────────

const INSIGHTS_SYSTEM =
  "Du analysierst Amazon-Kundenrezensionen (DE) für Listing-Optimierung. " +
  "Antworte AUSSCHLIESSLICH mit validem JSON nach dem geforderten Schema. Zitate wortwörtlich (verbatim) aus den Reviews übernehmen.";

function insightsPrompt(reviews: RawReview[]): string {
  // Gruppierung nur zur Orientierung — die Sterne-Zahl ist KEIN Filter (D75):
  // Pain Points stecken oft in 4–5★ („gut, aber…"), Kaufauslöser auch in
  // kritischen Reviews (was trotz Enttäuschung überzeugt hat).
  const crit = reviews.filter((r) => r.rating <= 3).slice(0, 150);
  const pos = reviews.filter((r) => r.rating >= 4).slice(0, 150);
  const fmt = (rs: RawReview[]) => rs.map((r) => `[${r.rating}★ ${r.asin}] ${r.title}: ${r.body}`).join("\n").slice(0, 22000);
  return `REVIEWS 1–3★:
${fmt(crit) || "(keine)"}

REVIEWS 4–5★:
${fmt(pos) || "(keine)"}

AUFGABE: Extrahiere 8–12 Pain Points und 6–10 Kaufauslöser, je mit Häufigkeit und 1–3 verbatim-Zitaten. Dazu Kundensprache zum Übernehmen (wörtliche Formulierungen) und Sprache zum Vermeiden.
WICHTIG: Werte ALLE Reviews auf BEIDES aus. Pain Points finden sich auch in 4–5★-Reviews (Einschränkungen, „gut, aber…", Wünsche) — das sind oft die wertvollsten, weil sie von überzeugten Käufern kommen. Kaufauslöser finden sich auch in 1–3★-Reviews (was trotz Enttäuschung überzeugt hat, warum gekauft wurde). Die Sterne-Zahl ist Kontext für die Gewichtung, kein Filter.
BELEG-REGELN (WICHTIGSTE REGELN — Verstöße werden programmatisch aussortiert):
1. Das Label darf NUR behaupten, was seine Zitate WÖRTLICH stützen. Beispiel-Fehler: Zitat „Nachdem medizinische Gründe ärztlich ausgeschlossen wurden, probierten wir es" belegt KEINE „Empfehlung durch Tierarzt" — der Arzt hat Ursachen ausgeschlossen, nicht das Produkt empfohlen.
2. HOFFNUNG/ERWARTUNG ist kein Wirkungs-Beleg: „Ich hoffe, es wird besser" belegt weder Wirkung noch Kaufauslöser „Wirkung" — höchstens den Kaufauslöser „Hoffnung auf Lösung", dann auch so benennen.
3. Empfehlungen Dritter (Tierarzt, Bekannte, Influencer) NUR als Aspekt aufnehmen, wenn ein Zitat die Empfehlung EXPLIZIT ausspricht.
4. Jedes Zitat gehört zu GENAU dem Aspekt, den es belegt — keine Zitate umverteilen, keine sinngemäßen Umformulierungen (Zitate werden gegen die Review-Texte geprüft).
5. Pain Point = der Käufer berichtet NEGATIVES zu diesem Aspekt; Kaufauslöser = der Käufer benennt POSITIV, was ihn überzeugt hat. Im Zweifel weglassen statt raten.
JSON-Schema:
{"painPoints":[{"label":"...","frequencyPct":N,"mentionCount":N,"quotes":["..."]}],
 "buyingTriggers":[{"label":"...","frequencyPct":N,"mentionCount":N,"quotes":["..."]}],
 "languageToBorrow":["..."],"languageToAvoid":["..."]}`;
}

export async function extractInsights(
  reviews: RawReview[],
  sources: string[],
  dataBasis: string,
): Promise<{ payload: ReviewInsightsPayload; confidence: string }> {
  const { provider } = resolveRecipe("reviews.pain-points");
  const stats = {
    reviewsTotal: reviews.length,
    ratingAvg: reviews.length
      ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10
      : null,
  };

  let core: Omit<ReviewInsightsPayload, "sources" | "stats">;
  let qualitaetsNotizen: string[];
  if (provider.name === "mock") {
    core = {
      painPoints: [{ label: "Mock: Dichtung undicht nach 2 Wochen", frequencyPct: 30, mentionCount: 3, quotes: ["tropft in der Tasche"] }],
      buyingTriggers: [{ label: "Mock: hält wirklich kalt", frequencyPct: 60, mentionCount: 6, quotes: ["nach 24h noch eiskalt"] }],
      languageToBorrow: ["nach 24h noch eiskalt"],
      languageToAvoid: ["Premium-Qualität"],
    };
    qualitaetsNotizen = [];
  } else {
    const res = await generateForRecipe("reviews.pain-points", {
      system: INSIGHTS_SYSTEM,
      messages: [{ role: "user", content: insightsPrompt(reviews) }],
      maxTokens: 8000,
      temperature: 0,
    });
    // Struktur ERZWINGEN statt blind speichern (D103): kaputte/abweichende
    // LLM-Antworten crashten das Findings-Dashboard beim Rendern.
    const { normalisiereInsights } = await import("./insights");
    core = normalisiereInsights(parseLlmJson(res.text));

    // Beleg-Prüfung (D152): Verbatim-Gate + Beleg-Pflicht + Sentiment-Signal —
    // deterministisch, VOR dem Speichern; Entferntes wird ausgewiesen.
    const { verifiziereZitate } = await import("./belegPruefung");
    const pp = verifiziereZitate(core.painPoints, reviews, "painPoint");
    const bt = verifiziereZitate(core.buyingTriggers, reviews, "buyingTrigger");
    core = { ...core, painPoints: pp.aspekte, buyingTriggers: bt.aspekte };
    qualitaetsNotizen = [...pp.notizen, ...bt.notizen];

    // Label↔Zitat-Gegencheck (D152): eine zweite, unabhängige KI-Instanz prüft
    // je Aspekt, ob die (verbatim-belegten) Zitate das Label WIRKLICH stützen —
    // die Fehlerklasse „Empfehlung durch Tierarzt" ohne Empfehlungs-Zitat.
    try {
      const urteile = await belegCheck(core.painPoints, core.buyingTriggers);
      core = {
        ...core,
        painPoints: core.painPoints.filter((a) => !urteile.has(a.label)),
        buyingTriggers: core.buyingTriggers.filter((a) => !urteile.has(a.label)),
      };
      for (const [label, grund] of urteile) {
        qualitaetsNotizen.push(`Aspekt „${label}" verworfen — Gegencheck: ${grund}`);
      }
    } catch {
      qualitaetsNotizen.push("△ Label↔Zitat-Gegencheck konnte nicht laufen — Aspekte sind verbatim-geprüft, aber nicht gegengeprüft.");
    }

    if (core.painPoints.length === 0 && core.buyingTriggers.length === 0) {
      throw new Error("Die Analyse lieferte kein belegbares Ergebnis (alle Aspekte ohne wörtliche Zitat-Belege) — bitte erneut starten.");
    }
  }

  const confidence = reviews.length >= 60 ? "high" : reviews.length >= 20 ? "medium" : "low";
  return {
    payload: { sources, stats, ...core, qualitaetsNotizen },
    confidence: dataBasis === "apify_scrape" ? confidence : "medium",
  };
}

/**
 * Label↔Zitat-Gegencheck (D152): unabhängige Prüf-Instanz. Liefert je Aspekt,
 * dessen Zitate das Label NICHT stützen, den Grund — der Code verwirft dann.
 */
async function belegCheck(
  painPoints: ReviewInsightsPayload["painPoints"],
  buyingTriggers: ReviewInsightsPayload["buyingTriggers"],
): Promise<Map<string, string>> {
  const { resolveRecipe: rr } = await import("@/lib/llm/registry");
  if (rr("reviews.beleg-check").provider.name === "mock") return new Map();

  const fmt = (liste: ReviewInsightsPayload["painPoints"], typ: string) =>
    liste.map((a) => `- [${typ}] Label: "${a.label}" — Zitate: ${a.quotes.map((q) => `„${q.slice(0, 160)}"`).join(" / ")}`).join("\n");
  const res = await generateForRecipe("reviews.beleg-check", {
    system:
      "Du prüfst als unabhängige Instanz, ob Review-Zitate ein Aspekt-Label WIRKLICH stützen. Sei streng: " +
      "Hoffnung/Erwartung belegt keine Wirkung; ein Arzt, der Ursachen ausschließt, ist keine Produkt-Empfehlung; " +
      "das Zitat muss die Behauptung des Labels tragen, nicht nur zum Thema passen. Antworte NUR mit JSON.",
    messages: [
      {
        role: "user",
        content: `ASPEKTE MIT ZITATEN:\n${fmt(painPoints, "Pain Point")}\n${fmt(buyingTriggers, "Kaufauslöser")}\n\nGib NUR die Aspekte zurück, deren Zitate das Label NICHT stützen oder deren Pain-Point/Kaufauslöser-Einordnung den Zitaten widerspricht:\n{"nichtGestuetzt":[{"label":"exaktes Label","grund":"ein Satz"}]}`,
      },
    ],
    maxTokens: 3000,
    temperature: 0,
  });
  const raw = parseLlmJson<{ nichtGestuetzt?: Array<{ label?: unknown; grund?: unknown }> }>(res.text);
  const map = new Map<string, string>();
  const labels = new Set([...painPoints, ...buyingTriggers].map((a) => a.label));
  for (const u of raw.nichtGestuetzt ?? []) {
    const label = String(u.label ?? "").trim();
    // Nur exakt existierende Labels verwerfen — der Prüfer darf nichts erfinden
    if (labels.has(label)) map.set(label, String(u.grund ?? "Zitate stützen das Label nicht.").trim());
  }
  return map;
}
