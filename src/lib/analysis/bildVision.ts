/**
 * Gemeinsame Vision-Basis für Bild-Auslese (D158) und Bild-Audit (D211).
 *
 * Warum geteilt: Auslese und Audit sehen DIESELBEN Bilder. Ohne Teilung würde
 * jeder der beiden Vision-Calls die Bilder erneut übertragen und verarbeiten
 * (doppelte Image-Tokens). Mit Prompt-Caching wird der GEMEINSAME Prefix
 * — identisches System-Prompt + identische Bild-Blöcke — nur einmal verarbeitet:
 * der erste Call schreibt den Cache, der zweite liest ihn (~0,1× statt voll).
 *
 * Damit der Cache greift, muss der Prefix bytegleich sein (Prefix-Match):
 *  - dasselbe System-Prompt (dieses hier, neutral für beide Aufgaben),
 *  - dieselbe Bild-Block-Folge (aus `bildContentBlocks`),
 *  - Cache-Breakpoint (`cache_control`) auf dem LETZTEN Bild.
 * Die aufgaben-spezifische Anweisung (beschreiben vs. bewerten) kommt als Text
 * NACH den Bildern — sie darf sich unterscheiden und wird nicht gecacht.
 *
 * „LLM generiert, Code erzwingt" (D7/D184): Das LLM macht nur den nicht
 * automatisierbaren Teil (Bild ansehen); Struktur/Erzwingung liegt im Code der
 * Aufrufer (`normalisiereBildAuslese` / `normalisiereBildAudit`).
 */

import { bereinigeBildUrls } from "@/lib/scrape/bilder";

/** Neutral genug für beide Aufgaben — die konkrete Anweisung steht im Aufgaben-Text nach den Bildern. */
export const BILD_VISION_SYSTEM =
  "Du bist Experte für Amazon-Listing-Bilder und arbeitest für eine deutsche Agentur. " +
  "Du urteilst und beschreibst NUR anhand des sichtbaren Bildes — nichts erfinden. " +
  "Antworte AUSSCHLIESSLICH mit validem JSON nach dem im Aufgaben-Text geforderten Schema.";

export const MAX_VISION_BILDER = 9;

/**
 * Gültige, begrenzte Bild-URLs — bei beiden Aufrufen identisch, damit der Cache greift.
 * Entdoppelt zuerst Größen-Varianten desselben Bilds (D216): sonst füllen verpixelte
 * Dubletten die hinteren Slots und werden mit-analysiert (Phantom-Slots 8/9).
 */
export function visionUrls(imageUrls: string[]): string[] {
  return bereinigeBildUrls(imageUrls)
    .filter((u) => u.startsWith("https://"))
    .slice(0, MAX_VISION_BILDER);
}

type Block = { type: string; [k: string]: unknown };

/**
 * Ein zu übertragendes Bild — entweder als Amazon-URL (Listing-Bilder) oder
 * als base64 (hochgeladene A+-Bilder, D220: einmal auslesen, nie speichern).
 */
export type VisionBild = { url: string } | { base64: { mediaType: string; data: string } };

/**
 * Der gemeinsame, cachebare Prefix: je Bild ein Label-Text + das Bild.
 * Auf dem LETZTEN Bild sitzt der Cache-Breakpoint (`cache_control`), damit
 * System + alle Bilder als ein Prefix gecacht werden.
 * `hauptbild` markiert BILD 1 als HAUPTBILD (nur für Listing-Bilder sinnvoll,
 * nicht für A+-Uploads).
 */
export function bildBloeckeAus(bilder: VisionBild[], opts: { hauptbild?: boolean } = {}): Block[] {
  const hauptbild = opts.hauptbild !== false;
  return bilder.flatMap((b, i) => {
    const source =
      "url" in b
        ? { type: "url", url: b.url }
        : { type: "base64", media_type: b.base64.mediaType, data: b.base64.data };
    const bild: Block = { type: "image", source };
    if (i === bilder.length - 1) bild.cache_control = { type: "ephemeral" };
    return [{ type: "text", text: `BILD ${i + 1}${hauptbild && i === 0 ? " (HAUPTBILD)" : ""}:` }, bild];
  });
}

/** Rückwärtskompatibler Helfer für die URL-basierten Listing-Bilder. */
export function bildContentBlocks(urls: string[]): Block[] {
  return bildBloeckeAus(urls.map((url) => ({ url })));
}

/**
 * Ein Vision-Call ans Messages-Endpoint. `blocks` = gemeinsamer Bild-Prefix,
 * `aufgabe` = aufgaben-spezifischer Text danach (nicht gecacht). Gibt den
 * zusammengefügten Antwort-Text zurück; wirft bei HTTP-Fehler.
 */
export async function visionCall(opts: {
  model: string;
  blocks: Block[];
  aufgabe: string;
  maxTokens?: number;
}): Promise<string> {
  // Defensiv (Review-Hinweis): ohne Key würde "undefined" als x-api-key ein
  // verwirrendes 401 erzeugen. Aufrufer gaten zwar vorher, aber der Helper
  // bleibt so auch bei direkter Nutzung ehrlich.
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Vision: kein ANTHROPIC_API_KEY gesetzt.");
  const content = [...opts.blocks, { type: "text", text: opts.aufgabe }];
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 8000,
      system: BILD_VISION_SYSTEM,
      messages: [{ role: "user", content }],
    }),
    // Prompt-Caching greift nur, wenn beide Vision-Calls DASSELBE Modell nutzen
    // (Cache ist modell-spezifisch): listing.bild-auslese und listing.bild-audit
    // müssen in registry.ts auf demselben Modell gepinnt bleiben.
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Vision: Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { content: Array<{ type: string; text?: string }> };
  return data.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
}
