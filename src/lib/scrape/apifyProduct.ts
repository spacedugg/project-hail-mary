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
  /**
   * Erweiterte Listing-Quellen (D145) — null heißt „vom Import-Weg nicht
   * erfasst" (ehrlich ausweisen), NIE „Produktseite hat keine".
   */
  attributes: Record<string, string> | null;
  importantInfo: string | null;
  aplusContent: string | null;
  raw: Record<string, unknown>;
};

/**
 * Strukturierte Attribute (Produktinformation-Tabelle) tolerant erkennen (D145).
 * Actor-Varianten: Array [{name/key/label, value}], Objekt {"Marke": "…"} oder
 * verschachtelt (productInformation/productDetails/attributes/technicalDetails).
 */
export function parseAttributes(it: Record<string, unknown>): Record<string, string> | null {
  const candidates = [it.productInformation, it.productDetails, it.attributes, it.technicalDetails, it.productOverview];
  for (const c of candidates) {
    const out: Record<string, string> = {};
    if (Array.isArray(c)) {
      for (const row of c) {
        if (typeof row !== "object" || row === null) continue;
        const r = row as Record<string, unknown>;
        const key = String(r.name ?? r.key ?? r.label ?? "").trim();
        const value = String(r.value ?? r.content ?? "").trim();
        if (key && value) out[key] = value.slice(0, 500);
      }
    } else if (typeof c === "object" && c !== null) {
      for (const [k, v] of Object.entries(c as Record<string, unknown>)) {
        const key = k.trim();
        const value = typeof v === "string" || typeof v === "number" ? String(v).trim() : "";
        if (key && value) out[key] = value.slice(0, 500);
      }
    }
    if (Object.keys(out).length >= 2) return out;
  }
  return null;
}

/** „Wichtige Informationen" tolerant erkennen: String, String-Array oder Sektionen [{title, content}]. */
export function parseImportantInfo(it: Record<string, unknown>): string | null {
  const candidates = [it.importantInformation, it.important_information, it.importantInfo, it.legalDisclaimer];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim().slice(0, 8000);
    if (Array.isArray(c)) {
      const text = c
        .map((row) => {
          if (typeof row === "string") return row.trim();
          if (typeof row === "object" && row !== null) {
            const r = row as Record<string, unknown>;
            const title = String(r.title ?? r.name ?? "").trim();
            const content = String(r.content ?? r.text ?? r.value ?? "").trim();
            return [title, content].filter(Boolean).join(": ");
          }
          return "";
        })
        .filter(Boolean)
        .join("\n");
      if (text.trim()) return text.trim().slice(0, 8000);
    }
  }
  return null;
}

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
  // Zeit-Budget: Vercel-Function max. 60 s — NIE höher defaulten (D78; das
  // 180-s-Default hat den Import in Produktion mitten im Lauf gekillt).
  const timeoutSec = opts.timeoutSec ?? 50;

  let res: Response;
  try {
    res = await fetch(
      `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?timeout=${timeoutSec}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ input: [{ asin: asin.toUpperCase(), domainCode: domain }] }),
        signal: AbortSignal.timeout((timeoutSec + 5) * 1000),
      },
    );
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError")
      throw new Error(`Listing-Import hat das Zeit-Budget (${timeoutSec} s) überschritten — bitte erneut versuchen.`);
    throw e;
  }
  if (res.status === 408)
    throw new Error("Der Scrape-Lauf hat das Zeit-Budget überschritten — bitte erneut versuchen.");
  if (!res.ok) {
    const { friendlyApifyError } = await import("./apifyError");
    throw new Error(friendlyApifyError(res.status, await res.text(), actor));
  }
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
    attributes: parseAttributes(it),
    importantInfo: parseImportantInfo(it),
    aplusContent: null, // Produkt-Detail-Actor liefert keinen A+-Inhalt — ehrlich „nicht erfasst"
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
    attributes: null, // H10-Export führt keine Produktinformation-Tabelle — „nicht erfasst" (D145)
    importantInfo: null,
    aplusContent: null,
    raw: { header: header.slice(0, 40) },
  };
}
