import { generateForRecipe } from "./registry";
import { parseLlmJson } from "./json";

/**
 * Generischer QM-Lauf für JEDE LLM-JSON-Grenze außerhalb der Listing-Texte
 * (D182/D183, Scheibe 3): generieren → parsen → Kontrakt prüfen → bei
 * Abweisung Korrektur-Versuch mit konkreter Fehlerliste → nach N Versuchen
 * harter Fehler statt stillem Weiterreichen oder manuellem „bitte erneut
 * starten"-Klick. Der Kontrakt gehört dem Aufrufer: er weiß, welche Form
 * und welche Mindest-Substanz seine Stufe braucht.
 *
 * Mock-Modus: Aufrufer behalten ihre Mock-Guards VOR diesem Lauf (der Mock
 * liefert kein kontrakt-fähiges JSON — ehrlich deterministisch statt raten).
 */

export class QmLaufFehler extends Error {
  constructor(
    public recipeKey: string,
    public verstoesse: string[],
    public versuche: number,
  ) {
    super(
      `QM-Lauf ${recipeKey}: nach ${versuche} Versuch(en) kein kontrakt-konformes Ergebnis. ` +
        verstoesse.slice(0, 3).join(" · "),
    );
  }
}

/** Kontrakt-Urteil: entweder der extrahierte Wert ODER die Abweisungs-Gründe. */
export type QmUrteil<T> = { wert: T } | { verstoesse: string[] };

export async function llmJsonLauf<T>(opts: {
  recipeKey: string;
  system?: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  /** Prüft UND extrahiert — Schema plus Mindest-Substanz der Stufe. */
  kontrakt: (parsed: Record<string, unknown>) => QmUrteil<T>;
  /** 1 Erstversuch + (maxVersuche-1) Korrektur-Schleifen. Default 3. */
  maxVersuche?: number;
}): Promise<T> {
  const max = opts.maxVersuche ?? 3;
  let verstoesse: string[] = [];

  for (let versuch = 1; versuch <= max; versuch++) {
    const content = verstoesse.length
      ? `${opts.prompt}\n\nKORREKTUR-AUFTRAG: Deine vorherige Antwort wurde an der Kontrakt-Grenze abgewiesen:\n${verstoesse
          .map((v) => `- ${v}`)
          .join("\n")}\nLiefere eine NEUE Antwort, die genau diese Abweisungen behebt und das geforderte JSON-Format exakt einhält.`
      : opts.prompt;

    const res = await generateForRecipe(opts.recipeKey, {
      system: opts.system,
      messages: [{ role: "user", content }],
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
    });

    let parsed: Record<string, unknown>;
    try {
      parsed = parseLlmJson<Record<string, unknown>>(res.text);
    } catch (e) {
      verstoesse = [e instanceof Error ? e.message : String(e)];
      continue;
    }

    const urteil = opts.kontrakt(parsed);
    if ("wert" in urteil) return urteil.wert;
    verstoesse = urteil.verstoesse;
  }

  // Blockier-Ereignis = Bau-Auftrag (D182): strukturiert loggen, hart scheitern.
  console.error(`[QM-BLOCK] ${opts.recipeKey}`, JSON.stringify({ versuche: max, verstoesse }));
  throw new QmLaufFehler(opts.recipeKey, verstoesse, max);
}
