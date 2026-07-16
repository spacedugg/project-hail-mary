import { resolveRecipe } from "@/lib/llm/registry";
import { parseLlmJson } from "@/lib/llm/json";
import type { ProductSnapshot } from "./apifyProduct";

/**
 * Listing-Import über die Anthropic-API (D82, Nutzer-Vorgabe): Claude holt die
 * Amazon-Produktseite per Server-Tool web_fetch und extrahiert die Basics als
 * JSON — kein Apify-Produkt-Actor (und damit keine Actor-Freigabe) mehr nötig.
 * „LLM generiert, Code erzwingt": coerceListing validiert alles deterministisch
 * (nur echte Amazon-Bild-URLs, geklemmte Zahlen, nichts Erfundenes).
 * Ehrlichkeit: blockt Amazon den Abruf, gibt es einen klaren Fehler-Banner —
 * nie einen Fassaden-Snapshot.
 */

type RawListing = {
  blocked?: boolean;
  title?: string;
  bullets?: string[];
  description?: string;
  imageUrls?: string[];
  reviewsTotal?: number | null;
  ratingAvg?: number | null;
  ratingDist?: Record<string, number> | null;
};

/** Deterministische Durchsetzung: nur belegbare Werte, nichts Halluziniertes. */
export function coerceListing(raw: RawListing, url: string): ProductSnapshot {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const bullets = (Array.isArray(raw.bullets) ? raw.bullets : [])
    .map(str)
    .filter(Boolean)
    .slice(0, 10);
  // Nur echte Amazon-CDN-Bilder — alles andere wäre erfunden oder fremd
  const imageUrls = (Array.isArray(raw.imageUrls) ? raw.imageUrls : [])
    .map(str)
    .filter((u) => /^https:\/\/[a-z0-9.-]*media-amazon\.com\//.test(u))
    .slice(0, 10);

  const reviewsTotal =
    typeof raw.reviewsTotal === "number" && raw.reviewsTotal >= 0 ? Math.round(raw.reviewsTotal) : null;
  const ratingAvg =
    typeof raw.ratingAvg === "number" && raw.ratingAvg > 0 && raw.ratingAvg <= 5
      ? Math.round(raw.ratingAvg * 10) / 10
      : null;

  let ratingDist: Record<string, number> | null = null;
  if (raw.ratingDist && typeof raw.ratingDist === "object") {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw.ratingDist)) {
      if (/^[1-5]$/.test(k) && typeof v === "number" && v >= 0 && v <= 100) out[k] = Math.round(v);
    }
    if (Object.keys(out).length >= 3) ratingDist = out;
  }

  return {
    title: str(raw.title) || null,
    bullets,
    description: str(raw.description) || null,
    imageUrls,
    reviewsTotal,
    ratingAvg,
    ratingDist,
    raw: { provider: "anthropic", url },
  };
}

const SYSTEM =
  "Du extrahierst Produktdaten von einer Amazon-Produktseite. Hole die Seite mit web_fetch und antworte " +
  "AUSSCHLIESSLICH mit einem JSON-Objekt. NUR Daten übernehmen, die auf der Seite tatsächlich stehen — nichts erfinden, nichts ergänzen. " +
  'Wenn die Seite nicht geladen werden kann, eine Fehlerseite/CAPTCHA ist oder das Produkt nicht existiert: {"blocked": true}.';

const prompt = (url: string) => `Hole diese Amazon-Produktseite und extrahiere die Listing-Daten: ${url}

JSON-Schema (Felder weglassen, die auf der Seite nicht belegt sind):
{"title": "kompletter Produkttitel",
 "bullets": ["alle Bullet Points (Feature-Liste), wortwörtlich"],
 "description": "Produktbeschreibung als Text",
 "imageUrls": ["URLs der Produkt-Galerie-Bilder (media-amazon.com, größte Variante)"],
 "reviewsTotal": Gesamtzahl der Bewertungen als Zahl,
 "ratingAvg": Durchschnittsbewertung als Zahl (z. B. 4.6),
 "ratingDist": {"5": Prozent, "4": Prozent, "3": Prozent, "2": Prozent, "1": Prozent} aus dem Bewertungs-Histogramm}`;

export async function scrapeProductViaAnthropic(
  asin: string,
  domain = "de",
  opts: { timeoutSec?: number } = {},
): Promise<ProductSnapshot> {
  const { provider, model } = resolveRecipe("listing.scrape");
  const url = `https://www.amazon.${domain}/dp/${asin.toUpperCase()}`;

  if (provider.name === "mock") {
    // Dev ohne Key: klar gekennzeichneter Mock, damit der Flow testbar bleibt
    return coerceListing(
      {
        title: `Mock — Listing für ${asin.toUpperCase()} (kein ANTHROPIC_API_KEY)`,
        bullets: ["Mock: hält 24h kalt", "Mock: auslaufsicher", "Mock: BPA-frei"],
        description: "Mock-Beschreibung — in Produktion kommt hier das echte Listing.",
        imageUrls: [],
        reviewsTotal: 1343,
        ratingAvg: 4.6,
        ratingDist: { "5": 70, "4": 15, "3": 6, "2": 3, "1": 6 },
      },
      url,
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY fehlt (Env) — Listing-Import nicht möglich.");
  // Zeit-Budget: Vercel-Function max. 60 s — nie höher defaulten (D78)
  const timeoutSec = opts.timeoutSec ?? 50;
  const signal = AbortSignal.timeout(timeoutSec * 1000);

  type Block = { type: string; text?: string };
  let messages: Array<{ role: string; content: string | Block[] }> = [
    { role: "user", content: prompt(url) },
  ];

  try {
    // Server-Tool-Läufe können mit pause_turn unterbrechen → begrenzt fortsetzen
    for (let round = 0; round < 3; round++) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model,
          max_tokens: 8000,
          system: SYSTEM,
          messages,
          tools: [{ type: "web_fetch_20260209", name: "web_fetch", max_uses: 3, max_content_tokens: 60000 }],
        }),
        signal,
      });
      if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = (await res.json()) as { stop_reason: string; content: Block[] };

      if (data.stop_reason === "pause_turn") {
        messages = [...messages, { role: "assistant", content: data.content }];
        continue;
      }
      const text = data.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
      const raw = parseLlmJson<RawListing>(text);
      if (raw.blocked) {
        throw new Error("Amazon hat den Seiten-Abruf blockiert (Bot-Schutz) oder die Seite existiert nicht — bitte ASIN prüfen und in 1–2 Minuten erneut versuchen.");
      }
      const snap = coerceListing(raw, url);
      if (!snap.title && snap.bullets.length === 0) {
        throw new Error("Auf der Seite waren keine Listing-Daten erkennbar — bitte ASIN und Marktplatz prüfen.");
      }
      return snap;
    }
    throw new Error("Listing-Abruf nicht abgeschlossen (zu viele Fortsetzungen) — bitte erneut versuchen.");
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError")
      throw new Error(`Listing-Import hat das Zeit-Budget (${timeoutSec} s) überschritten — bitte erneut versuchen.`);
    throw e;
  }
}
