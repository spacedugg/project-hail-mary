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
  raw: Record<string, unknown>;
};

export async function scrapeProduct(asin: string, domain = "de"): Promise<ProductSnapshot> {
  const apiKey = process.env.APIFY_API_KEY;
  if (!apiKey) throw new Error("APIFY_API_KEY fehlt (Env) — Produkt-Import nicht möglich.");
  const actor = process.env.APIFY_PRODUCT_ACTOR ?? DEFAULT_ACTOR;

  const res = await fetch(
    `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?timeout=180`,
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ input: [{ asin: asin.toUpperCase(), domainCode: domain }] }),
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
    raw: { header: header.slice(0, 40) },
  };
}
