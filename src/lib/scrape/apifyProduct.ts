/**
 * Produktdaten-Import via Apify (ASIN-first-Onboarding, R2/D46).
 * Actor per Env konfigurierbar (Amazon blockt direkte Scrapes — temoa-audit-Lehre:
 * nie WebFetch-Fallback-Kaskaden, sondern ein sauberer, austauschbarer Anbieter).
 */

const DEFAULT_ACTOR = "axesso_data~amazon-product-details-scraper";

export type ProductSnapshot = {
  title: string | null;
  bullets: string[];
  description: string | null;
  imageUrls: string[];
  /** Echte Gesamt-Bewertungszahl auf Amazon (Import-Zeitpunkt) — null, wenn der Actor sie nicht liefert. */
  reviewsTotal: number | null;
  /** Ø-Rating (z. B. 4.6) — geparst aus Zahl oder "4,6 von 5 Sternen". */
  ratingAvg: number | null;
  /** Sterne-Verteilung in % je Klasse ("1"–"5"), wie im Amazon-Histogramm. */
  ratingDist: Record<string, number> | null;
  raw: Record<string, unknown>;
};

/** "4,6 von 5 Sternen" / "4.6 out of 5 stars" / 4.6 → 4.6 */
function parseAvg(v: unknown): number | null {
  if (typeof v === "number" && v > 0 && v <= 5) return v;
  if (typeof v === "string") {
    const m = v.match(/(\d)[.,](\d)/);
    if (m) return parseFloat(`${m[1]}.${m[2]}`);
    const n = parseFloat(v);
    if (!Number.isNaN(n) && n > 0 && n <= 5) return n;
  }
  return null;
}

function parseCount(v: unknown): number | null {
  if (typeof v === "number" && v >= 0) return Math.round(v);
  if (typeof v === "string") {
    const n = parseInt(v.replace(/[^\d]/g, ""), 10);
    if (!Number.isNaN(n)) return n;
  }
  return null;
}

/**
 * Sterne-Histogramm tolerant erkennen. Actor-Varianten: Objekt {"5": "70%"…},
 * Array [{star/rating: 5, percentage/percent: 70}, …] oder Keys wie
 * "five_star". Liefert %-Werte je Klasse "1"–"5" oder null.
 */
function parseDist(it: Record<string, unknown>): Record<string, number> | null {
  const candidates = [it.reviewsRatings, it.ratingDistribution, it.starRatings, it.ratingsDistribution, it.histogram, it.ratingPercentages];
  const words: Record<string, string> = { one: "1", two: "2", three: "3", four: "4", five: "5" };
  for (const c of candidates) {
    const out: Record<string, number> = {};
    if (Array.isArray(c)) {
      for (const row of c) {
        if (typeof row !== "object" || row === null) continue;
        const r = row as Record<string, unknown>;
        const star = parseCount(r.star ?? r.stars ?? r.rating);
        const pct = parseCount(r.percentage ?? r.percent ?? r.value);
        if (star && star >= 1 && star <= 5 && pct !== null) out[String(star)] = pct;
      }
    } else if (typeof c === "object" && c !== null) {
      for (const [k, v] of Object.entries(c as Record<string, unknown>)) {
        const key = /^[1-5]$/.test(k) ? k : words[k.toLowerCase().replace(/[_\s]*star.*$/, "")];
        const pct = parseCount(v);
        if (key && pct !== null) out[key] = pct;
      }
    }
    if (Object.keys(out).length >= 3) return out;
  }
  return null;
}

export async function scrapeProduct(
  asin: string,
  domain = "de",
  opts: { timeoutSec?: number } = {},
): Promise<ProductSnapshot> {
  const apiKey = process.env.APIFY_API_KEY;
  if (!apiKey) throw new Error("APIFY_API_KEY fehlt (Env) — Produkt-Import nicht möglich.");
  const actor = process.env.APIFY_PRODUCT_ACTOR ?? DEFAULT_ACTOR;
  const timeoutSec = opts.timeoutSec ?? 180;

  const res = await fetch(
    `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?timeout=${timeoutSec}`,
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ input: [{ asin: asin.toUpperCase(), domainCode: domain }] }),
      signal: AbortSignal.timeout((timeoutSec + 5) * 1000),
    },
  );
  if (!res.ok)
    throw new Error(
      `Apify ${res.status} (Actor ${actor}): ${(await res.text()).slice(0, 250)} — ggf. anderen Actor via APIFY_PRODUCT_ACTOR setzen.`,
    );
  const items = (await res.json()) as Array<Record<string, unknown>>;
  const it = items[0];
  if (!it) throw new Error("Apify lieferte keine Daten für diese ASIN.");

  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map(String).filter(Boolean) : [];
  return {
    title: String(it.productTitle ?? it.title ?? "").trim() || null,
    bullets: arr(it.features ?? it.bullets ?? it.featureBullets),
    description: String(it.productDescription ?? it.description ?? "").trim() || null,
    imageUrls: arr(it.imageUrlList ?? it.images ?? it.imageUrls),
    reviewsTotal: parseCount(it.countReview ?? it.countReviews ?? it.reviewsCount ?? it.ratingsCount ?? it.countRatings),
    ratingAvg: parseAvg(it.productRating ?? it.rating ?? it.averageRating ?? it.ratingScore),
    ratingDist: parseDist(it),
    raw: it,
  };
}

/** H10-/generischer CSV-Import: findet Titel/Bullets/Beschreibung über Spaltennamen. */
export function parseListingCsv(text: string): ProductSnapshot {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error("CSV zu kurz — Header + mindestens 1 Datenzeile erwartet.");
  const split = (line: string) => {
    const out: string[] = [];
    let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ",") { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const header = split(lines[0]).map((h) => h.toLowerCase());
  const row = split(lines[1]);
  const col = (needle: string) => {
    const i = header.findIndex((h) => h.includes(needle));
    return i >= 0 ? (row[i] ?? "").trim() : "";
  };
  const bullets = header
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => h.includes("bullet"))
    .map(({ i }) => (row[i] ?? "").trim())
    .filter(Boolean);

  const title = col("title") || col("titel");
  if (!title && bullets.length === 0)
    throw new Error('Keine "Title"/"Bullet"-Spalten gefunden — ist das ein H10-Listing-Export?');
  return {
    title: title || null,
    bullets,
    description: col("description") || col("beschreibung") || null,
    imageUrls: [],
    reviewsTotal: null,
    ratingAvg: null,
    ratingDist: null,
    raw: { header: header.slice(0, 40) },
  };
}
