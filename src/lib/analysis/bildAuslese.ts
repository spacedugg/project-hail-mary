import { resolveRecipe } from "@/lib/llm/registry";
import { parseLlmJson } from "@/lib/llm/json";
import { BILD_TYPEN, BILD_TYP_KRITERIUM, BILD_TYP_LABELS, istBildTyp, type BildTyp } from "./bildTypen";
import { bildBloeckeAus, bildContentBlocks, MAX_VISION_BILDER, visionCall, visionUrls } from "./bildVision";

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

/** Aufgaben-Text (nach den Bildern, nicht gecacht): beschreiben + Typ zuordnen, KEIN Urteil. */
function ausleseAufgabe(anzahl: number, sprache: string): string {
  const typListe = BILD_TYPEN.map((t) => `"${t}" (${BILD_TYP_LABELS[t]}): ${BILD_TYP_KRITERIUM[t]}`).join("\n");
  return `AUFGABE: Lies die ${anzahl} Listing-Bilder oben aus (Antwort-Sprache "${sprache}").
Je Bild:
· typ = GENAU EINER dieser Bildtypen (Klassifikation, kein Urteil):
${typListe}
· textImBild = ALLER lesbare Text wortwörtlich (Headlines, Labels, Zahlen — leer, wenn textfrei)
· inhalt = EIN objektiver Satz, was gezeigt wird
· claims = im Bild behauptete Produkt-Aussagen (nur was da steht/gezeigt wird)
KEINE Urteile, KEINE Regel- oder Verstoß-Bewertungen, KEINE Stil-Kommentare — nur beschreiben, abtippen und den Typ zuordnen.
JSON-Schema:
{"bilder":[{"slot":1,"typ":"main_image","textImBild":["..."],"inhalt":"...","claims":["..."]}]}`;
}

export async function leseBilderAus(imageUrls: string[], sprache = "de"): Promise<BildAusleseErgebnis | null> {
  const urls = visionUrls(imageUrls);
  if (urls.length === 0) return null;
  const { provider, model } = resolveRecipe("listing.bild-auslese");
  if (provider.name !== "anthropic" || !process.env.ANTHROPIC_API_KEY) return null; // kein Mock — ehrlich „nicht ausgelesen"

  // Gemeinsamer Bild-Prefix (gecacht) + Aufgaben-Text danach; der Audit-Call
  // nutzt denselben Prefix und liest ihn aus dem Cache.
  const text = await visionCall({ model, blocks: bildContentBlocks(urls), aufgabe: ausleseAufgabe(urls.length, sprache) });
  return normalisiereBildAuslese(parseLlmJson(text), urls.length);
}

// ── A+-Bild-Auslese (D220) ───────────────────────────────────────────────────
// A+-/„Vom Hersteller"-Inhalte sind auf Amazon Bilder und für Text-Scrapes
// unsichtbar (die Scraper liefern aplusContent = null). Der Nutzer lädt sie
// deshalb hoch; wir lesen sie EINMAL aus (Vision) und behalten NUR den
// extrahierten Text — die Bild-Bytes werden nie gespeichert (ephemer). Der Text
// landet in snapshot.aplusContent und fließt von dort in Generierung
// (Beleg-Quellen) UND Analyse (Feature-Ranking) ein — kein neuer Datenpfad.

export type AplusBild = { mediaType: string; data: string };

/** Aufgabe für A+-Uploads: sichtbaren Text abtippen + Inhalt knapp beschreiben, kein Urteil. */
function aplusAufgabe(anzahl: number, sprache: string): string {
  return `AUFGABE: Dies sind ${anzahl} hochgeladene A+-/„Vom Hersteller"-Bilder eines Amazon-Listings (Antwort-Sprache "${sprache}").
Je Bild:
· textImBild = ALLER lesbare Text wortwörtlich (Überschriften, Absätze, Labels, Zahlen — leer, wenn textfrei)
· inhalt = EIN objektiver Satz, was das Bild zeigt
· claims = im Bild behauptete Produkt-Aussagen (nur was da steht/gezeigt wird)
KEINE Urteile, KEINE Stil-Kommentare — nur abtippen und beschreiben.
JSON-Schema:
{"bilder":[{"slot":1,"textImBild":["..."],"inhalt":"...","claims":["..."]}]}`;
}

/** Formatiert die A+-Auslese als zusammenhängenden A+-Text (Ziel: snapshot.aplusContent). */
export function aplusAlsText(bilder: BildAuslese[]): string {
  return bilder
    .map((b) => {
      const teile = [b.textImBild.join(" · "), b.inhalt, b.claims.length ? `Aussagen: ${b.claims.join(" · ")}` : ""].filter(Boolean);
      return `A+-Bild ${b.slot}: ${teile.join(" — ")}`;
    })
    .filter(Boolean)
    .join("\n");
}

/**
 * Liest hochgeladene A+-Bilder EINMAL aus und gibt den extrahierten Text zurück
 * (für snapshot.aplusContent). Bytes werden vom Aufrufer verworfen, nie
 * gespeichert (D220). Ohne API-Key: null (ehrlich, kein Mock).
 */
export async function leseAplusAus(bilder: AplusBild[], sprache = "de"): Promise<string | null> {
  const gueltig = bilder.filter((b) => b?.data && b?.mediaType?.startsWith("image/")).slice(0, MAX_VISION_BILDER);
  if (gueltig.length === 0) return null;
  const { provider, model } = resolveRecipe("listing.bild-auslese");
  if (provider.name !== "anthropic" || !process.env.ANTHROPIC_API_KEY) return null; // kein Mock — ehrlich „nicht ausgelesen"

  const blocks = bildBloeckeAus(gueltig.map((b) => ({ base64: b })), { hauptbild: false });
  const text = await visionCall({ model, blocks, aufgabe: aplusAufgabe(gueltig.length, sprache) });
  const res = normalisiereBildAuslese(parseLlmJson(text), gueltig.length);
  return aplusAlsText(res.bilder) || null;
}

/** Auslese als Quelltext für Feature-Ranking/Wahrheits-Filter (Quelle „Bilder", D133). */
export function bilderAlsText(bilder: Array<{ slot: number; typ?: string | null; textImBild: string[]; inhalt: string; claims: string[] }> | null | undefined): string {
  if (!bilder?.length) return "";
  // typ ist gespeichert lose typisiert (string); vor dem Label-Lookup gegen das Enum prüfen.
  return bilder
    .map((b) => `Bild ${b.slot}${istBildTyp(b.typ) ? ` [${BILD_TYP_LABELS[b.typ]}]` : ""}: ${b.inhalt}${b.textImBild.length ? ` — Text im Bild: ${b.textImBild.join(" | ")}` : ""}${b.claims.length ? ` — Claims: ${b.claims.join(" | ")}` : ""}`)
    .join("\n");
}
