import { resolveRecipe } from "@/lib/llm/registry";
import { llmJsonLauf } from "@/lib/llm/qmLauf";
import { fuelleTokens, type MasterSlot, type SlotRegenerator } from "./master";

/**
 * Reale LLM-Nahtstellen der Content-Master-Engine (D221) — die zwei einzigen
 * Stellen, an denen ein LLM beteiligt ist (D184). Beide mit ehrlichem Mock-Fallback:
 * ohne API-Key RÄT der Mock NICHT, was ein LLM täte, sondern liefert das
 * konservative, deterministische Minimum und meldet `mock: true`.
 */

/** Mock-Modus für ein Recipe: kein echter Provider hinter dem Key. */
export function istMockRecipe(recipeKey: string): boolean {
  return resolveRecipe(recipeKey).provider.name === "mock";
}

const KLASSIFIKATOR = "variants.klassifikator";
const REGENERATOR = "variants.regenerator";

export type KlassifikationsVorschlag = { regenerateIds: string[]; mock: boolean };

/** Signatur des Klassifikators — injizierbar (Tests/Actions reichen die reale Impl. rein). */
export type SlotKlassifikator = (
  slots: MasterSlot[],
  theme: string[],
  baseAxisValues: Record<string, string>,
) => Promise<KlassifikationsVorschlag>;

/**
 * Schlägt vor, welche (bisher locked) Slots sprachlich vom Achsenwert abhängen und
 * daher je Variante NEU getextet werden müssen. Der Nutzer bestätigt/overridet danach —
 * das LLM entscheidet nicht. Mock: leerer Vorschlag (ehrlich: keine Einschätzung ohne Key).
 */
export const klassifiziereSlots: SlotKlassifikator = async (slots, theme, baseAxisValues) => {
  if (istMockRecipe(KLASSIFIKATOR)) return { regenerateIds: [], mock: true };

  // Nur die (bisher) locked-Slots zur Beurteilung vorlegen — token-Slots sind bereits sicher.
  const kandidaten = slots.filter((s) => s.kind === "locked");
  if (kandidaten.length === 0) return { regenerateIds: [], mock: false };

  const gueltigeIds = new Set(kandidaten.map((s) => s.id));
  const prompt =
    `Eine Amazon-Produktfamilie variiert entlang der Achse(n): ${theme.join(", ")}.\n` +
    `Referenz-Variante hat die Achsenwerte: ${JSON.stringify(baseAxisValues)}.\n\n` +
    `Für JEDE Variante werden diese Textbausteine wiederverwendet. Entscheide je Baustein, ob sein WORTLAUT ` +
    `semantisch vom Achsenwert abhängt (dann muss er je Variante neu getextet werden — z. B. „fruchtig-süßer ` +
    `Erdbeergeschmack" hängt vom Geschmack ab) ODER ob er für alle Varianten wortgleich passt (z. B. „zuckerfrei ` +
    `und vegan", Markenversprechen, Anwendungshinweise).\n\n` +
    `Bausteine:\n` +
    kandidaten.map((s) => `- ${s.id}: ${s.template}`).join("\n") +
    `\n\nAntworte NUR mit JSON: {"regenerate": ["<slot-id>", ...]} — die IDs der Bausteine, die je Variante NEU getextet werden müssen. Leeres Array, wenn keiner.`;

  const regenerateIds = await llmJsonLauf<string[]>({
    recipeKey: KLASSIFIKATOR,
    system: "Du klassifizierst Textbausteine einer Amazon-Produktfamilie präzise und konservativ.",
    prompt,
    maxTokens: 1500,
    kontrakt: (parsed) => {
      const arr = parsed.regenerate;
      if (!Array.isArray(arr)) return { verstoesse: ['Feld "regenerate" muss ein Array von Slot-IDs sein.'] };
      const gefiltert = arr.filter((x): x is string => typeof x === "string" && gueltigeIds.has(x));
      return { wert: gefiltert };
    },
  });
  return { regenerateIds, mock: false };
};

/**
 * Textet EINEN regenerate-Slot für die Achsenwerte einer konkreten Variante neu.
 * Mock: füllt vorhandene {{achse}}-Platzhalter deterministisch (kein echtes Neutexten —
 * ehrlich als Mock erkennbar über den Aufrufer, der den Mock-Zustand kennt).
 */
export const regeneriereSlot: SlotRegenerator = async (slot, axisValues) => {
  if (istMockRecipe(REGENERATOR)) return fuelleTokens(slot.template, axisValues);

  const prompt =
    `Schreibe den folgenden Produkttext-Baustein für eine Produktvariante um.\n` +
    `Ziel-Achsenwerte dieser Variante: ${JSON.stringify(axisValues)}.\n` +
    `Betroffene Achse(n): ${slot.achsen.join(", ")}.\n\n` +
    `Referenztext (andere Variante):\n"${slot.template}"\n\n` +
    `Behalte Stil, Satzbau, Länge und alle NICHT vom Achsenwert abhängigen Aussagen exakt bei — ` +
    `ändere ausschließlich, was sich sprachlich aus dem/den Achsenwert(en) ergibt. Keine neuen Fakten erfinden.\n` +
    `Antworte NUR mit JSON: {"text": "<neuer Baustein>"}.`;

  return await llmJsonLauf<string>({
    recipeKey: REGENERATOR,
    system: "Du textest einen einzelnen Produkttext-Baustein für eine Varianten-Variante neu — quellentreu, stilgleich.",
    prompt,
    maxTokens: 1000,
    kontrakt: (parsed) => {
      const t = parsed.text;
      if (typeof t !== "string" || !t.trim()) return { verstoesse: ['Feld "text" muss ein nicht-leerer String sein.'] };
      return { wert: t.trim() };
    },
  });
};
