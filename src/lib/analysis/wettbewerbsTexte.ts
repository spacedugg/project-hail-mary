import { resolveRecipe } from "@/lib/llm/registry";
import { llmJsonLauf } from "@/lib/llm/qmLauf";
import type { CompetitorGapPayload, CompetitorInfoGap, ProductFacts } from "@/db/schema";

/**
 * Wettbewerber-Listing-Abgleich (D199, Nutzer 23.07.): Die Konkurrenz-Listings
 * zeigen, welche Informationen die Zielgruppe erwartet — und welche UNSER
 * Listing (oft schlecht gemacht) NICHT abbildet. Diese Lücken sind wertvoll:
 * fehlende Informationen, die wir wahrscheinlich abbilden KÖNNTEN.
 *
 * Zweistufig, streng an der Fakten-Sperre:
 *  1. Lücken-Extraktion: Was nennen die Wettbewerber-Listings, das in UNSEREM
 *     Listing fehlt? (nur Informationen/Eigenschaften, keine erfundenen Zahlen)
 *  2. Übertragbarkeits-Urteil gegen UNSERE Produkt-Wahrheit:
 *     ja        → Spezifikation deckt es → aufnehmbar
 *     nein      → widerspricht unseren Angaben (andere Form/Wert) → NIE aufnehmen
 *     unbekannt → kein Beleg für Widerspruch UND keiner für Deckung →
 *                 tendenziell aufnehmbar, aber als PRÜFEN markiert
 * Das Urteil erlaubt NIE, fremde Spezifikationen/Zahlen zu übernehmen — es
 * markiert nur, welche THEMEN wir mit EIGENEN belegten Angaben besetzen dürfen.
 */

const RECIPE = "reviews.wettbewerb-texte";

const SYSTEM =
  "Du vergleichst Konkurrenz-Produktlisttexte mit einem eigenen Produkt (DE-Markt). " +
  "Du findest Informationen, die die Konkurrenz nennt und das eigene Listing NICHT — und beurteilst NUR, ob sie auf das eigene Produkt übertragbar sind. " +
  "Du erfindest KEINE Werte, Zahlen oder Spezifikationen. " +
  "Ein Urteil „nein“ braucht einen KONKRETEN Widerspruch zur Produkt-Wahrheit; „ja“ braucht eine konkrete Deckung; sonst „unbekannt“. " +
  "Antworte AUSSCHLIESSLICH mit dem geforderten JSON.";

export type WettbewerbsTexteKontext = {
  produktName: string;
  facts: ProductFacts;
  eigenesListing: { title: string | null; bullets: string[] | null; description: string | null };
  wettbewerber: Array<{
    asin: string;
    title: string | null;
    bullets: string[] | null;
    description: string | null;
    attributes?: Record<string, string> | null;
    /**
     * Vision-Auslese der Wettbewerber-Bilder (D276, Nutzer-Vorgabe 01.08.:
     * „ein 100 % volles Bild ueber den Zustand der Konkurrenz-Listings und die
     * Informationen, die diese kommunizieren").
     *
     * Der Text-Scrape sieht Infografiken nicht — genau dort steht bei vielen
     * Kategorien die halbe Argumentation (Masse, Vergleichstabellen,
     * Anwendungsschritte). Ohne die Bilder war die Informationsluecke
     * systematisch zu klein gemessen.
     */
    bilder?: Array<{ slot: number; inhalt: string; textImBild: string[]; claims: string[] }> | null;
  }>;
};

function block(l: WettbewerbsTexteKontext["wettbewerber"][number]): string {
  return [
    `### WETTBEWERBER ${l.asin}`,
    l.title ? `Titel: ${l.title}` : "",
    l.bullets?.length ? `Bullets: ${l.bullets.join(" • ")}` : "",
    l.description ? `Beschreibung: ${l.description.slice(0, 1500)}` : "",
    l.attributes ? `Attribute: ${Object.entries(l.attributes).map(([k, v]) => `${k}: ${v}`).join("; ")}` : "",
    // D276: Bildinhalte als eigener, klar getrennter Abschnitt — das LLM muss
    // wissen, dass diese Aussagen aus einem BILD stammen und nicht aus dem Text.
    l.bilder?.length
      ? `Bildinhalte (per Vision ausgelesen, KEIN Listing-Text):\n${l.bilder
          .slice(0, 9)
          .map((b) => {
            const teile = [
              b.inhalt,
              b.textImBild.length ? `Text im Bild: ${b.textImBild.join(" | ").slice(0, 400)}` : "",
              b.claims.length ? `Aussagen: ${b.claims.join(" | ").slice(0, 400)}` : "",
            ].filter(Boolean);
            return `  - Bild ${b.slot}: ${teile.join(" — ")}`;
          })
          .join("\n")}`
      : "",
  ].filter(Boolean).join("\n");
}

function prompt(ctx: WettbewerbsTexteKontext): string {
  return `UNSER PRODUKT:
NAME: ${ctx.produktName}
PRODUKT-WAHRHEIT (die einzige Quelle für Übertragbarkeits-Urteile): ${JSON.stringify(ctx.facts)}
UNSER LISTING:
Titel: ${ctx.eigenesListing.title ?? "(leer)"}
Bullets: ${ctx.eigenesListing.bullets?.join(" • ") ?? "(leer)"}
Beschreibung: ${(ctx.eigenesListing.description ?? "(leer)").slice(0, 1500)}

WETTBEWERBER-LISTINGS:
${ctx.wettbewerber.map(block).join("\n\n")}

AUFGABE:
1. Finde INFORMATIONEN/EIGENSCHAFTEN, die mindestens ein Wettbewerber-Listing nennt und UNSER Listing NICHT enthält (Themen, Nutzen, Anwendungshinweise, Eigenschaften — KEINE konkreten Fremd-Zahlen/Maße übernehmen).
2. Beurteile je Lücke die Übertragbarkeit auf UNSER Produkt anhand der Produkt-Wahrheit:
   - "ja" = die Produkt-Wahrheit deckt das ausdrücklich (wir können es mit EIGENEN Angaben abbilden).
   - "nein" = die Produkt-Wahrheit WIDERSPRICHT (andere Form/Wert/Eigenschaft) — NIE aufnehmen.
   - "unbekannt" = kein Widerspruch und keine ausdrückliche Deckung — tendenziell aufnehmbar, aber prüfen.
   grund: EIN Satz mit dem konkreten Bezug zur Produkt-Wahrheit.
   quellen: die ASIN(s), die die Information nennen.

JSON: {"gaps": [{"info": "...", "quellen": ["B0..."], "urteil": "ja|nein|unbekannt", "grund": "..."}]}`;
}

/** Analysiert die Lücken; leerer Wettbewerber-Satz oder Mock → leeres Ergebnis (ehrlich passiv). */
export async function analysiereWettbewerbsTexte(ctx: WettbewerbsTexteKontext): Promise<CompetitorGapPayload> {
  if (ctx.wettbewerber.length === 0) return { gaps: [] };
  const { provider } = resolveRecipe(RECIPE);
  if (provider.name === "mock") return { gaps: [] };

  const gueltigeAsins = new Set(ctx.wettbewerber.map((w) => w.asin.toUpperCase()));
  const { gaps } = await llmJsonLauf<{ gaps: CompetitorInfoGap[] }>({
    recipeKey: RECIPE,
    system: SYSTEM,
    prompt: prompt(ctx),
    maxTokens: 6000,
    temperature: 0,
    kontrakt: (parsed) => {
      if (!Array.isArray(parsed.gaps))
        return { verstoesse: ["Feld „gaps“ fehlt oder ist kein Array — auch bei null Lücken ein leeres Array liefern."] };
      const gaps = (parsed.gaps as Array<Record<string, unknown>>)
        .map((g) => ({
          info: String(g.info ?? "").trim(),
          // Quellen-Attribution deterministisch bereinigen: nur real gescrapte ASINs
          quellen: (Array.isArray(g.quellen) ? g.quellen.map((x) => String(x).toUpperCase().trim()) : []).filter((a) => gueltigeAsins.has(a)),
          urteil: (["ja", "nein", "unbekannt"].includes(String(g.urteil)) ? String(g.urteil) : "unbekannt") as CompetitorInfoGap["urteil"],
          grund: String(g.grund ?? "").trim().slice(0, 240),
        }))
        .filter((g) => g.info);
      return { wert: { gaps } };
    },
  });
  // „nein“-Lücken (Widerspruch zur Produkt-Wahrheit) fliegen hart raus — sie
  // dürfen nie in den Content, auch nicht als PRÜFEN-Kandidat.
  return { gaps: gaps.filter((g) => g.urteil !== "nein") };
}
