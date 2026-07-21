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

  // Zeit-Budget (D102/D118): jeder Lauf bekommt 40 s (Abbruch 45 s) — nicht
  // wegen Vercel (Seite hat seit D118 maxDuration=300), sondern weil ein
  // Review-Scrape, der länger als 45 s hängt, praktisch nie mehr liefert und
  // der Nutzer eine RÜCKMELDUNG mit Ausbeute-Notizen verdient statt Wartens.
  const res = await fetch(
    `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?timeout=40`,
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ input }),
      signal: AbortSignal.timeout(45_000),
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
  if (provider.name === "mock") {
    core = {
      painPoints: [{ label: "Mock: Dichtung undicht nach 2 Wochen", frequencyPct: 30, mentionCount: 3, quotes: ["tropft in der Tasche"] }],
      buyingTriggers: [{ label: "Mock: hält wirklich kalt", frequencyPct: 60, mentionCount: 6, quotes: ["nach 24h noch eiskalt"] }],
      languageToBorrow: ["nach 24h noch eiskalt"],
      languageToAvoid: ["Premium-Qualität"],
    };
  } else {
    const res = await generateForRecipe("reviews.pain-points", {
      system: INSIGHTS_SYSTEM,
      messages: [{ role: "user", content: insightsPrompt(reviews) }],
      maxTokens: 4000,
      temperature: 0,
    });
    // Struktur ERZWINGEN statt blind speichern (D103): kaputte/abweichende
    // LLM-Antworten crashten das Findings-Dashboard beim Rendern.
    const { normalisiereInsights } = await import("./insights");
    core = normalisiereInsights(parseLlmJson(res.text));
    if (core.painPoints.length === 0 && core.buyingTriggers.length === 0) {
      throw new Error("Die Analyse lieferte kein verwertbares Ergebnis (keine Findings im Antwort-JSON) — bitte erneut starten.");
    }
  }

  const confidence = reviews.length >= 60 ? "high" : reviews.length >= 20 ? "medium" : "low";
  return { payload: { sources, stats, ...core }, confidence: dataBasis === "apify_scrape" ? confidence : "medium" };
}
