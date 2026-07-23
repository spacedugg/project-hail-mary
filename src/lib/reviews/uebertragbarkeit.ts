import { resolveRecipe } from "@/lib/llm/registry";
import { llmJsonLauf } from "@/lib/llm/qmLauf";
import type { ProductFacts, ReviewInsightsPayload } from "@/db/schema";

/**
 * Übertragbarkeits-Prüfung (D196, Nutzer 23.07.): Wettbewerbs-Findings sind
 * der wertvollste Rohstoff — Konkurrenz-Kunden beschreiben Erwartungen und
 * Probleme der ZIELGRUPPE, aber am FREMDEN Produkt. Bevor sie in Content,
 * Briefings oder Bilder fließen, wird jeder wettbewerbs-dominante Aspekt
 * gegen UNSERE Produkt-Wahrheit + unser Listing beurteilt:
 *   ja        → trifft auch auf unser Produkt zu (Spezifikation deckt es)
 *   nein      → trifft uns nicht (andere Form/Größe/Eigenschaft) — bei
 *               Pain Points die ANGRIFFS-LÜCKE, bei Kaufauslösern weglassen
 *   unbekannt → Quellen reichen nicht für ein Urteil (ehrlich passiv)
 * Das Urteil steuert die Verwendung — es erlaubt NIE, fremde Spezifikationen
 * zu übernehmen (Fakten-Sperre und Zahlen-Herkunfts-Gate bleiben unberührt).
 */

const RECIPE = "reviews.uebertragbarkeit";

const SYSTEM =
  "Du vergleichst Kunden-Aspekte aus Wettbewerbs-Reviews mit einem konkreten Produkt (DE-Markt). " +
  "Du beurteilst NUR die Übertragbarkeit — du erfindest keine Produkteigenschaften. " +
  "Urteil „ja“ oder „nein“ braucht einen konkreten Bezug auf die Produkt-Wahrheit/das Listing; reicht das nicht, ist das Urteil „unbekannt“. " +
  "Antworte AUSSCHLIESSLICH mit dem geforderten JSON.";

export type TransferKontext = {
  produktName: string;
  facts: ProductFacts;
  listingTitel: string | null;
  listingBullets: string[] | null;
};

type Urteil = { label: string; urteil: "ja" | "nein" | "unbekannt"; grund: string };

function transferPrompt(labels: string[], ctx: TransferKontext): string {
  return `UNSER PRODUKT:
NAME: ${ctx.produktName}
PRODUKT-WAHRHEIT: ${JSON.stringify(ctx.facts)}
${ctx.listingTitel ? `LISTING-TITEL: ${ctx.listingTitel}` : ""}
${ctx.listingBullets?.length ? `LISTING-BULLETS: ${ctx.listingBullets.join(" • ")}` : ""}

KUNDEN-ASPEKTE AUS WETTBEWERBS-REVIEWS (beschreiben das KONKURRENZ-Produkt):
${labels.map((l) => `- "${l}"`).join("\n")}

AUFGABE: Beurteile für JEDEN Aspekt, ob er auf UNSER Produkt übertragbar ist.
- "ja" = die Aussage trifft nach Produkt-Wahrheit/Listing auch auf unser Produkt zu (gleiche Eigenschaft/Wirkweise/Form).
- "nein" = sie trifft NICHT zu, weil sich unser Produkt in der relevanten Eigenschaft unterscheidet (z. B. Konkurrenz-Tablette zu groß — wir sind Drops/Kapsel).
- "unbekannt" = Produkt-Wahrheit/Listing geben kein Urteil her. Im Zweifel "unbekannt" — nie raten.
grund: EIN Satz mit dem konkreten Spezifikations-Bezug.

JSON: {"urteile": [{"label": "<exakt wie oben>", "urteil": "ja|nein|unbekannt", "grund": "..."}]}`;
}

/** Wettbewerbs-dominant = mehr verifizierte Fundstellen aus fremden als aus eigenen Reviews. */
function istWettbewerbsDominant(a: { herkunft?: { eigene: number; fremde: number } }): boolean {
  return !!a.herkunft && a.herkunft.fremde > a.herkunft.eigene;
}

/**
 * Annotiert wettbewerbs-dominante Aspekte mit einem Übertragbarkeits-Urteil.
 * Mock-Modus/leere Kandidaten: Payload unverändert (ehrlich ungeprüft = „unbekannt“).
 */
export async function pruefeUebertragbarkeit(
  payload: ReviewInsightsPayload,
  ctx: TransferKontext,
): Promise<ReviewInsightsPayload> {
  const { provider } = resolveRecipe(RECIPE);
  if (provider.name === "mock") return payload;

  const kandidaten = [
    ...payload.painPoints.filter(istWettbewerbsDominant).map((a) => a.label),
    ...payload.buyingTriggers.filter(istWettbewerbsDominant).map((a) => a.label),
  ];
  if (kandidaten.length === 0) return payload;

  const { urteile } = await llmJsonLauf<{ urteile: Urteil[] }>({
    recipeKey: RECIPE,
    system: SYSTEM,
    prompt: transferPrompt(kandidaten, ctx),
    maxTokens: 4000,
    temperature: 0,
    kontrakt: (parsed) => {
      if (!Array.isArray(parsed.urteile))
        return { verstoesse: ["Feld „urteile“ fehlt oder ist kein Array — für jeden gelisteten Aspekt genau ein Urteil liefern."] };
      const roh = (parsed.urteile as Array<{ label?: unknown; urteil?: unknown; grund?: unknown }>)
        .map((u) => ({
          label: String(u.label ?? "").trim(),
          urteil: (["ja", "nein", "unbekannt"].includes(String(u.urteil)) ? String(u.urteil) : "unbekannt") as Urteil["urteil"],
          grund: String(u.grund ?? "").trim().slice(0, 240),
        }))
        .filter((u) => u.label);
      const beurteilt = new Set(roh.map((u) => u.label));
      const fehlend = kandidaten.filter((l) => !beurteilt.has(l));
      return fehlend.length > 0
        ? { verstoesse: [`Es fehlen Urteile für: ${fehlend.map((l) => `"${l}"`).join(", ")} — für JEDEN gelisteten Aspekt genau ein Urteil.`] }
        : { wert: { urteile: roh } };
    },
  });

  const urteilFuer = new Map(urteile.map((u) => [u.label, u]));
  const annotiere = <T extends { label: string; herkunft?: { eigene: number; fremde: number; jeAsin: Record<string, number> } }>(a: T): T => {
    const u = istWettbewerbsDominant(a) ? urteilFuer.get(a.label) : undefined;
    return u ? { ...a, uebertragbarkeit: { urteil: u.urteil, grund: u.grund } } : a;
  };
  return {
    ...payload,
    painPoints: payload.painPoints.map(annotiere),
    buyingTriggers: payload.buyingTriggers.map(annotiere),
  };
}
