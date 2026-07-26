import { resolveRecipe } from "@/lib/llm/registry";
import { parseLlmJson } from "@/lib/llm/json";
import { BILD_TYPEN, BILD_TYP_KRITERIUM, BILD_TYP_LABELS, istBildTyp, type BildTyp } from "./bildTypen";

/**
 * Bild-Auslese + Bild-Audit (D158, Nutzer-Vorgabe 22.07.): Galeriebilder
 * werden per Vision-Modell gelesen — AUTOMATISCH beim Listing-Import, kein
 * Extra-Schritt. Zwei Ergebnisse:
 * 1. AUSLESE (objektiv): Text-im-Bild wortwörtlich, Bildinhalt in einem Satz,
 *    gezeigte Claims — schließt die größte Datenlücke (Infografiken/A+ sind
 *    für Text-Scrapes unsichtbar) und wird Quelle „Bilder" (D133).
 * 2. KEINE Regel-Urteile (D165, Nutzer-Korrektur): Was auf Amazon erlaubt/
 *    üblich ist, ist kategorie- und praxisabhängig — Urteile gibt es erst
 *    wieder mit einem kuratierten Regelwerk aus dem Agentur-Wissen.
 * Ohne API-Key: null (ehrlich „nicht ausgelesen"), nie ein Mock — erfundene
 * Bild-Inhalte wären Gift für die Wahrheits-Kette.
 */

export type BildAuslese = { slot: number; typ: BildTyp | null; textImBild: string[]; inhalt: string; claims: string[] };
export type BildAusleseErgebnis = { bilder: BildAuslese[]; befunde: string[] };

/** Struktur erzwingen (D103-Muster): Slots geklemmt, Strings bereinigt, nichts Erfundenes ergänzt. */
export function normalisiereBildAuslese(raw: unknown, anzahlBilder: number): BildAusleseErgebnis {
  const o = (raw ?? {}) as Record<string, unknown>;
  const strs = (v: unknown) => (Array.isArray(v) ? v.map((s) => String(s ?? "").trim()).filter(Boolean) : []);
  const bilder = (Array.isArray(o.bilder) ? o.bilder : [])
    .map((x) => {
      const b = (x ?? {}) as Record<string, unknown>;
      const slot = Math.round(Number(b.slot));
      if (!Number.isFinite(slot) || slot < 1 || slot > anzahlBilder) return null;
      // Typ-Label (D209): Enum erzwingen. Slot 1 ist auf Amazon garantiert das
      // Hauptbild — fehlt/ungültig das Label dort, setzt der Code main_image;
      // sonst ehrlich null (nicht klassifiziert), nie geraten.
      const typRoh = typeof b.typ === "string" ? b.typ.trim().toLowerCase() : "";
      const typ: BildTyp | null = istBildTyp(typRoh) ? typRoh : slot === 1 ? "main_image" : null;
      return {
        slot,
        typ,
        textImBild: strs(b.textImBild).slice(0, 20),
        inhalt: String(b.inhalt ?? "").trim().slice(0, 300),
        claims: strs(b.claims).slice(0, 10),
      };
    })
    .filter((b): b is BildAuslese => b !== null)
    // je Slot nur ein Eintrag, aufsteigend
    .filter((b, i, arr) => arr.findIndex((x) => x.slot === b.slot) === i)
    .sort((a, b) => a.slot - b.slot);
  return { bilder, befunde: strs(o.befunde).slice(0, 12) };
}

const SYSTEM =
  "Du liest Amazon-Listing-Bilder aus. NUR beschreiben und wortwörtlich abtippen, was sichtbar ist — nichts deuten, " +
  "nichts ergänzen, keine Geschmacksurteile. Antworte AUSSCHLIESSLICH mit validem JSON.";

const MAX_BILDER = 9;

export async function leseBilderAus(imageUrls: string[], sprache = "de"): Promise<BildAusleseErgebnis | null> {
  const urls = imageUrls.filter((u) => u.startsWith("https://")).slice(0, MAX_BILDER);
  if (urls.length === 0) return null;
  const { provider, model } = resolveRecipe("listing.bild-auslese");
  if (provider.name !== "anthropic" || !process.env.ANTHROPIC_API_KEY) return null; // kein Mock — ehrlich „nicht ausgelesen"

  type Block = { type: string; [k: string]: unknown };
  const content: Block[] = urls.flatMap((url, i) => [
    { type: "text", text: `BILD ${i + 1}${i === 0 ? " (HAUPTBILD)" : ""}:` },
    { type: "image", source: { type: "url", url } },
  ]);
  const typListe = BILD_TYPEN.map((t) => `"${t}" (${BILD_TYP_LABELS[t]}): ${BILD_TYP_KRITERIUM[t]}`).join("\n");
  content.push({
    type: "text",
    text: `AUFGABE: Lies die ${urls.length} Listing-Bilder oben aus (Antwort-Sprache "${sprache}").
Je Bild:
· typ = GENAU EINER dieser Bildtypen (Klassifikation, kein Urteil):
${typListe}
· textImBild = ALLER lesbare Text wortwörtlich (Headlines, Labels, Zahlen — leer, wenn textfrei)
· inhalt = EIN objektiver Satz, was gezeigt wird
· claims = im Bild behauptete Produkt-Aussagen (nur was da steht/gezeigt wird)
KEINE Urteile, KEINE Regel- oder Verstoß-Bewertungen, KEINE Stil-Kommentare — nur beschreiben, abtippen und den Typ zuordnen.
JSON-Schema:
{"bilder":[{"slot":1,"typ":"main_image","textImBild":["..."],"inhalt":"...","claims":["..."]}]}`,
  });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 8000, system: SYSTEM, messages: [{ role: "user", content }] }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Bildanalyse: Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { content: Array<{ type: string; text?: string }> };
  const text = data.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
  return normalisiereBildAuslese(parseLlmJson(text), urls.length);
}

/** Auslese als Quelltext für Feature-Ranking/Wahrheits-Filter (Quelle „Bilder", D133). */
export function bilderAlsText(bilder: Array<{ slot: number; typ?: string | null; textImBild: string[]; inhalt: string; claims: string[] }> | null | undefined): string {
  if (!bilder?.length) return "";
  // typ ist gespeichert lose typisiert (string); vor dem Label-Lookup gegen das Enum prüfen.
  return bilder
    .map((b) => `Bild ${b.slot}${istBildTyp(b.typ) ? ` [${BILD_TYP_LABELS[b.typ]}]` : ""}: ${b.inhalt}${b.textImBild.length ? ` — Text im Bild: ${b.textImBild.join(" | ")}` : ""}${b.claims.length ? ` — Claims: ${b.claims.join(" | ")}` : ""}`)
    .join("\n");
}
