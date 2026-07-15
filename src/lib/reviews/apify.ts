import { generateForRecipe, resolveRecipe } from "@/lib/llm/registry";
import { parseLlmJson } from "@/lib/llm/json";
import type { ReviewInsightsPayload } from "@/db/schema";

/**
 * Review-Insights via Apify — Neubau der (defekten) temoa-os-Variante,
 * damit diese Version dort übernommen werden kann (D39).
 * Verbesserungen ggü. Bestand: (a) je Sterne-Klasse ein eigener Lauf (D72):
 * Apify liefert max. 100 Reviews pro Scrape — mit filterByStar one_star …
 * five_star holen 5 parallele Läufe bis zu 5×100 der AKTUELLSTEN Reviews
 * (sortBy "recent"), statt dass 5★-Masse alles andere verdrängt;
 * (b) robustes Rating-Parsing (Zahl ODER "4,0 von 5 Sternen"-String);
 * (c) klare Fehlerbilder statt silent fallback — scheitert eine Klasse,
 * läuft der Rest weiter und die Lücke wird als Notiz ausgewiesen.
 */

const ACTOR = "axesso_data~amazon-reviews-scraper";

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

/** Ein Sterne-Klassen-Lauf: alle ASINs, gefiltert auf eine Klasse, aktuellste zuerst. */
async function runStarClass(
  apiKey: string,
  asins: string[],
  filterByStar: (typeof STAR_FILTERS)[number],
  starValue: number,
  domain: string,
): Promise<RawReview[]> {
  const input = asins.map((asin) => ({
    asin,
    domainCode: domain,
    sortBy: "recent", // gibt es mehr als das Scrape-Maximum, gewinnen die aktuellsten
    maxPages: 10, // 10 Seiten ≈ 100 Reviews = Maximum pro Scrape
    filterByStar,
    reviewerType: "all_reviews",
    formatType: "current_format",
    mediaType: "all_contents",
  }));

  // Zeit-Budget: Vercel-Function max. 60 s → Apify synchron auf 50 s begrenzen
  const res = await fetch(
    `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?timeout=50`,
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ input }),
      signal: AbortSignal.timeout(55_000),
    },
  );
  if (res.status === 408) throw new Error("Zeitlimit");
  if (!res.ok) throw new Error(`Apify ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const items = (await res.json()) as Array<Record<string, unknown>>;

  return items
    .map((it) => ({
      asin: String(it.asin ?? it.ASIN ?? ""),
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

  const results = await Promise.allSettled(
    STAR_FILTERS.map((filter, i) => runStarClass(apiKey, valid, filter, i + 1, domain)),
  );

  const reviews: RawReview[] = [];
  const notes: string[] = [];
  results.forEach((r, i) => {
    const star = i + 1;
    if (r.status === "fulfilled") {
      reviews.push(...r.value);
    } else {
      const why =
        r.reason instanceof Error && (r.reason.name === "TimeoutError" || r.reason.message === "Zeitlimit")
          ? "ins Zeitlimit gelaufen"
          : `fehlgeschlagen (${r.reason instanceof Error ? r.reason.message : String(r.reason)})`;
      notes.push(`${star}★-Lauf ${why} — diese Klasse fehlt in der Datenbasis.`);
    }
  });

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
  const neg = reviews.filter((r) => r.rating <= 3).slice(0, 150);
  const pos = reviews.filter((r) => r.rating >= 4).slice(0, 150);
  const fmt = (rs: RawReview[]) => rs.map((r) => `[${r.rating}★ ${r.asin}] ${r.title}: ${r.body}`).join("\n").slice(0, 22000);
  return `NEGATIVE/KRITISCHE REVIEWS (Pain Points):
${fmt(neg) || "(keine)"}

POSITIVE REVIEWS (Kaufauslöser):
${fmt(pos) || "(keine)"}

AUFGABE: Extrahiere 8–12 Pain Points (aus kritischen) und 6–10 Kaufauslöser (aus positiven), je mit Häufigkeit und 1–3 verbatim-Zitaten. Dazu Kundensprache zum Übernehmen (wörtliche Formulierungen) und Sprache zum Vermeiden.
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
    core = parseLlmJson(res.text);
  }

  const confidence = reviews.length >= 60 ? "high" : reviews.length >= 20 ? "medium" : "low";
  return { payload: { sources, stats, ...core }, confidence: dataBasis === "apify_scrape" ? confidence : "medium" };
}
