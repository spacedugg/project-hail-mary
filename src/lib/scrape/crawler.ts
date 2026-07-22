import { parseAttributes, parseImportantInfo, type ProductSnapshot } from "./apifyProduct";

/**
 * Apify-Produkt-Crawler (junglee/amazon-crawler, D84 — Nutzer lieferte das
 * Input-JSON): marktplatz-fähig über die URL (amazon.de/… → DE-Marktplatz,
 * Standard de aus product.marketplace). Liefert Produkt-Basics inkl.
 * reviewsCount/stars/starsBreakdown — aber KEINE einzelnen Bewertungstexte
 * (Routen: PRODUCT/SEARCH/OFFERS, keine REVIEWS-Route).
 * Einsatz: Fallback für den Listing-Import (D83) + Quelle für die
 * Amazon-Gesamtzahlen. Actor per Env austauschbar (APIFY_CRAWLER_ACTOR).
 */

const DEFAULT_ACTOR = "junglee~amazon-crawler";

type CrawlerItem = Record<string, unknown>;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);

/** starsBreakdown kommt als Anteil (0.7) ODER Prozent (70) — beides → Prozent je Klasse. */
export function mapCrawlerItem(it: CrawlerItem, url: string): ProductSnapshot {
  const breakdown = it.starsBreakdown as Record<string, unknown> | undefined;
  let ratingDist: Record<string, number> | null = null;
  if (breakdown && typeof breakdown === "object") {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(breakdown)) {
      const star = k.match(/^([1-5])\s*star/i)?.[1];
      const n = num(v);
      if (star && n !== null && n >= 0) out[star] = Math.round(n <= 1 ? n * 100 : n);
    }
    if (Object.keys(out).length >= 3) ratingDist = out;
  }

  const images = [
    ...strArr(it.highResolutionImages),
    ...strArr(it.imageUrlList),
    ...strArr(it.galleryThumbnails),
    ...(typeof it.thumbnailImage === "string" ? [it.thumbnailImage] : []),
  ].filter((u, i, arr) => u.startsWith("https://") && arr.indexOf(u) === i);

  const stars = num(it.stars);
  const reviewsCount = num(it.reviewsCount ?? it.countReview);
  return {
    title: String(it.title ?? "").trim() || null,
    bullets: strArr(it.features ?? it.featureBullets),
    description: String(it.description ?? "").trim() || null,
    imageUrls: images.slice(0, 10),
    reviewsTotal: reviewsCount !== null && reviewsCount >= 0 ? Math.round(reviewsCount) : null,
    ratingAvg: stars !== null && stars > 0 && stars <= 5 ? Math.round(stars * 10) / 10 : null,
    ratingDist,
    attributes: parseAttributes(it),
    importantInfo: parseImportantInfo(it),
    aplusContent: null, // Crawler-Route liefert keinen A+-Inhalt — ehrlich „nicht erfasst" (D145)
    raw: { provider: "crawler", url, asin: it.asin },
  };
}

export async function scrapeProductViaCrawler(
  asin: string,
  domain = "de",
  opts: { timeoutSec?: number } = {},
): Promise<ProductSnapshot> {
  const apiKey = process.env.APIFY_API_KEY;
  if (!apiKey) throw new Error("APIFY_API_KEY fehlt (Env) — Crawler-Import nicht möglich.");
  const actor = process.env.APIFY_CRAWLER_ACTOR ?? DEFAULT_ACTOR;
  // Zeit-Budget: Vercel-Function max. 60 s — nie höher defaulten (D78)
  const timeoutSec = opts.timeoutSec ?? 50;
  const url = `https://www.amazon.${domain}/dp/${asin.toUpperCase()}`;

  // Input-Schema exakt nach dem vom Nutzer gelieferten Actor-JSON —
  // Marktplatz steckt in der URL, Proxy wählt der Actor passend (AUTO).
  const input = {
    categoryOrProductUrls: [{ url }],
    locationDeliverableRoutes: ["PRODUCT"],
    maxItemsPerStartUrl: 1,
    maxOffers: 0,
    maxProductVariantsAsSeparateResults: 0,
    maxSearchPagesPerStartUrl: 1,
    proxyCountry: "AUTO_SELECT_PROXY_COUNTRY",
    scrapeProductDetails: true,
    scrapeProductVariantPrices: false,
    scrapeSellers: false,
    useCaptchaSolver: false,
  };

  let res: Response;
  try {
    res = await fetch(
      `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?timeout=${timeoutSec}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout((timeoutSec + 5) * 1000),
      },
    );
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError")
      throw new Error(`Crawler hat das Zeit-Budget (${timeoutSec} s) überschritten — bitte erneut versuchen.`);
    throw e;
  }
  if (res.status === 408)
    throw new Error("Der Crawler-Lauf hat das Zeit-Budget überschritten — bitte erneut versuchen.");
  if (!res.ok) {
    const { friendlyApifyError } = await import("./apifyError");
    throw new Error(friendlyApifyError(res.status, await res.text(), actor));
  }
  const items = (await res.json()) as CrawlerItem[];
  const it = items.find((x) => typeof x.title === "string" && x.title) ?? items[0];
  if (!it) throw new Error("Crawler lieferte keine Daten für diese ASIN — ASIN und Marktplatz prüfen.");
  return mapCrawlerItem(it, url);
}
