/**
 * Anbieter-agnostische LLM-Registry (D28).
 * - Provider implementieren ein schmales Interface; Auswahl per Env/Config.
 * - Modelle werden PRO RECIPE gepinnt (Review R6): Prompts sind modellspezifisch
 *   kalibriert — ein Modellwechsel läuft durchs Eval-Harness, nie ad hoc.
 * - Keys nur serverseitig (Env), nie im Client (temoa-os-Proxy-Prinzip).
 */

export type LlmMessage = { role: "user" | "assistant"; content: string };

export type LlmRequest = {
  system?: string;
  messages: LlmMessage[];
  maxTokens?: number;
  temperature?: number;
};

export type LlmResponse = { text: string; model: string; provider: string };

export interface LlmProvider {
  readonly name: string;
  generate(model: string, req: LlmRequest): Promise<LlmResponse>;
}

// ── Provider: Anthropic ──────────────────────────────────────────────────────

/**
 * Sonnet 5 / Opus 4.7+ / Fable lehnen Sampling-Parameter (temperature/top_p/
 * top_k) mit 400 ab — NIE mitsenden (D83; war die Wurzel der toten
 * „Generieren"-Buttons in Produktion). Haiku 4.5 & ältere akzeptieren sie.
 */
const SAMPLING_UNSUPPORTED = /^claude-(sonnet-5|opus-4-[7-9]|fable|mythos)/;

class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic";

  async generate(model: string, req: LlmRequest): Promise<LlmResponse> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY fehlt (Env).");

    const body: Record<string, unknown> = {
      model,
      system: req.system,
      messages: req.messages,
      max_tokens: req.maxTokens ?? 2000,
    };
    if (!SAMPLING_UNSUPPORTED.test(model)) body.temperature = req.temperature ?? 0.4;

    // Hartes Zeitlimit UNTER dem Vercel-Budget (D109): läuft die Anfrage zu
    // lange, gibt es eine klare deutsche Meldung statt eines von Vercel
    // gekillten Prozesses ohne Rückmeldung („unexpected response", ALG-00).
    let res: Response;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(50_000),
      });
    } catch (e) {
      if (e instanceof Error && e.name === "TimeoutError") {
        throw new Error("Die KI-Anfrage hat das Zeitlimit (50 s) überschritten — bitte erneut versuchen. Läuft bereits eine andere Generierung, erst deren Ende abwarten: Anfragen laufen nacheinander.");
      }
      throw e;
    }
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { content: Array<{ type: string; text?: string }>; stop_reason?: string };
    const text = data.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    // Sonnet-5-Familie: adaptives Denken ist automatisch AN und teilt sich
    // max_tokens mit der Antwort (D106). Frisst die Denkphase das Budget auf,
    // kommt KEIN Text zurück — das war die Wurzel von „KI-Antwort enthielt
    // kein JSON". Hier klar benennen statt kryptisch scheitern.
    if (!text.trim()) {
      throw new Error(
        data.stop_reason === "max_tokens"
          ? "Die Denkphase des Modells hat das gesamte Antwort-Budget (max_tokens) verbraucht — bitte erneut versuchen; wiederholt sich das, muss das Budget im Code erhöht werden."
          : `Das Modell lieferte keinen Text (stop_reason: ${data.stop_reason ?? "unbekannt"}) — bitte erneut versuchen.`,
      );
    }
    return { text, model, provider: this.name };
  }
}

// ── Provider: Mock (Dev/Tests ohne Key) ─────────────────────────────────────

class MockProvider implements LlmProvider {
  readonly name = "mock";
  constructor(private responder?: (req: LlmRequest) => string) {}

  async generate(model: string, req: LlmRequest): Promise<LlmResponse> {
    const text = this.responder
      ? this.responder(req)
      : `[mock:${model}] ${req.messages.at(-1)?.content.slice(0, 80) ?? ""}`;
    return { text, model, provider: this.name };
  }
}

// ── Registry & Recipe-Pinning ────────────────────────────────────────────────

const providers = new Map<string, LlmProvider>([
  ["anthropic", new AnthropicProvider()],
  ["mock", new MockProvider()],
]);

export function registerProvider(p: LlmProvider): void {
  providers.set(p.name, p);
}

/**
 * Recipe-Konfiguration: pro Aufgabe gepinnter Provider+Modell.
 * Änderbar ohne Code-Deploy (Env-Override RECIPE_MODEL_<KEY>), aber Wechsel
 * gilt erst nach Eval-Lauf (D33).
 */
export const RECIPE_MODELS: Record<string, { provider: string; model: string }> = {
  "listing.title": { provider: "anthropic", model: "claude-sonnet-5" },
  "listing.bullets": { provider: "anthropic", model: "claude-sonnet-5" },
  "listing.description": { provider: "anthropic", model: "claude-sonnet-5" },
  "listing.backend": { provider: "anthropic", model: "claude-sonnet-5" },
  "listing.highlights": { provider: "anthropic", model: "claude-sonnet-5" },
  "listing.qa": { provider: "anthropic", model: "claude-sonnet-5" },
  "reviews.pain-points": { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
  "listing.deep-audit": { provider: "anthropic", model: "claude-sonnet-5" },
  "listing.scrape": { provider: "anthropic", model: "claude-sonnet-5" },
  "keywords.filter": { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
  "keywords.brands": { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
  "facts.extract": { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
};

export function resolveRecipe(recipeKey: string): { provider: LlmProvider; model: string } {
  const envOverride = process.env[`RECIPE_MODEL_${recipeKey.toUpperCase().replace(/[.\-]/g, "_")}`];
  const pinned = RECIPE_MODELS[recipeKey];
  if (!pinned && !envOverride) throw new Error(`Unbekanntes Recipe: ${recipeKey}`);

  let providerName = pinned?.provider ?? "anthropic";
  let model = pinned?.model ?? "";
  if (envOverride) {
    // Format: "provider:model" oder nur "model"
    const [a, b] = envOverride.split(":");
    if (b) [providerName, model] = [a, b];
    else model = a;
  }
  if (process.env.LLM_FORCE_MOCK === "1") providerName = "mock";
  // DX-Fallback: ohne Key läuft der Mock (deterministisches Template) statt eines Fehlers.
  if (providerName === "anthropic" && !process.env.ANTHROPIC_API_KEY) providerName = "mock";

  const provider = providers.get(providerName);
  if (!provider) throw new Error(`Unbekannter Provider: ${providerName}`);
  return { provider, model };
}

export async function generateForRecipe(recipeKey: string, req: LlmRequest): Promise<LlmResponse> {
  const { provider, model } = resolveRecipe(recipeKey);
  return provider.generate(model, req);
}
