import { generateForRecipe, resolveRecipe } from "@/lib/llm/registry";
import { parseLlmJson } from "@/lib/llm/json";
import { pruefRegelnFuerSektion, type Regel, type RegelSektion } from "./register";
import type { ValidationIssue } from "@/db/schema";

/**
 * LLM-Prüfer (D182, Nutzer-Entscheid „Immer LLM-Prüfer“): eine zweite,
 * unabhängige Instanz beurteilt jeden Entwurf gegen die llm-prüfbaren Regeln
 * des Registers — Prüfprotokoll je Regel (bestanden/verletzt + Textbeleg).
 * Der Prüfer ist Torwächter, nicht Autor: er liefert Verdikte, nie Text.
 *
 * Mock-Modus (kein API-Key / Tests): ehrlich KEINE Prüfung statt erfundener
 * Verdikte — deterministische Checks bleiben aktiv, das Ergebnis trägt dann
 * nur deterministische Evidenz. Ein Mock, der „bestanden“ behauptet, wäre
 * genau die Fassade, die D182 verbietet.
 */

const PRUEFER_RECIPE = "listing.pruefer";

const PRUEFER_SYSTEM =
  "Du bist unbestechlicher Qualitäts-Prüfer für Amazon-Listing-Texte (DE). " +
  "Du beurteilst NUR die genannten Regeln am vorgelegten Text — du schreibst nie um, du bewertest. " +
  // Kalibrierung (D193, Live-Befund: schwafelnde Grenzfall-Verdikte wie „grenzwertig,
  // aber im Zweifel bestanden“ wurden als Verstoß gewertet und blockierten endlos):
  "Ein Verdikt „verletzt“ braucht einen KONKRETEN, wörtlich zitierbaren Beleg aus dem Text. " +
  "Grenzfälle ohne klaren Beleg gelten als BESTANDEN — wenn dein Beleg Wörter wie „grenzwertig“, „akzeptabel“ oder „im Zweifel“ bräuchte, ist das Verdikt „bestanden“. " +
  "Der Beleg ist EIN kurzer Satz (max. 200 Zeichen) mit dem Zitat — kein Aufsatz, keine Abwägung. " +
  "Antworte AUSSCHLIESSLICH mit dem geforderten JSON, ohne Markdown-Zäune, ohne Vorwort.";

type Verdikt = { regel: string; bestanden: boolean; beleg: string };

export function prueferPrompt(sektion: RegelSektion, text: string, regeln: Regel[], kontext: string): string {
  return `ZU PRÜFENDER TEXT (Sektion: ${sektion}):
---
${text}
---

KONTEXT (Datengrundlage des Autors):
${kontext}

PRÜFE GENAU DIESE REGELN — für JEDE Regel-ID genau ein Verdikt:
${regeln.map((r) => `- [${r.id}] ${r.text}`).join("\n")}

JSON: {"verdikte": [{"regel": "<Regel-ID>", "bestanden": true/false, "beleg": "<EIN kurzer Satz mit wörtlichem Zitat des Verstoßes — max. 200 Zeichen>"}]}`;
}

/** Verdikte → ValidationIssues (nur Verletzungen; Severity aus dem Register; Beleg hart gekappt). */
export function verdikteZuIssues(verdikte: Verdikt[], regeln: Regel[]): ValidationIssue[] {
  const byId = new Map(regeln.map((r) => [r.id, r]));
  const issues: ValidationIssue[] = [];
  for (const v of verdikte) {
    const regel = byId.get(v.regel);
    if (!regel || v.bestanden) continue;
    const beleg = (v.beleg || regel.text).slice(0, 280);
    issues.push({ rule: regel.id, severity: regel.severity, message: beleg, evidence: "llm" });
  }
  return issues;
}

/**
 * Prüf-Vollständigkeit: unbeurteilte Regeln sind ein PRÜFER-Problem, kein
 * Autor-Problem (D193 — vorher eskalierten sie als Autor-Findings in die
 * Regenerier-Schleife, die der Autor nie beheben konnte). Der Aufrufer
 * fordert beim Prüfer nach.
 */
export function fehlendeVerdikte(verdikte: Verdikt[], regeln: Regel[]): string[] {
  const beurteilt = new Set(verdikte.map((v) => v.regel));
  return regeln.filter((r) => !beurteilt.has(r.id)).map((r) => r.id);
}

/**
 * Prüft einen Sektions-Text gegen alle llm-Regeln der Sektion.
 * Wirft bei kaputter Prüfer-Antwort (nach einem Wiederholungsversuch) —
 * ein Ergebnis OHNE Prüfung darf nie als geprüft durchgehen.
 */
export async function pruefeMitLlm(sektion: RegelSektion, text: string, kontext: string): Promise<ValidationIssue[]> {
  const regeln = pruefRegelnFuerSektion(sektion);
  if (regeln.length === 0) return [];
  const { provider } = resolveRecipe(PRUEFER_RECIPE);
  if (provider.name === "mock") return []; // ehrlich ungeprüft statt erfundener Verdikte

  const basisPrompt = prueferPrompt(sektion, text, regeln, kontext);
  let letzterFehler: unknown;
  let fehlend: string[] = [];
  for (let versuch = 0; versuch < 3; versuch++) {
    try {
      const prompt = fehlend.length
        ? `${basisPrompt}\n\nNACHTRAG: Dein voriges Protokoll ließ diese Regel-IDs UNBEURTEILT: ${fehlend.join(", ")} — liefere jetzt für JEDE oben gelistete Regel-ID genau ein Verdikt.`
        : basisPrompt;
      const res = await generateForRecipe(PRUEFER_RECIPE, {
        system: PRUEFER_SYSTEM,
        messages: [{ role: "user", content: prompt }],
        maxTokens: 8000,
        temperature: 0,
      });
      const parsed = parseLlmJson<{ verdikte?: unknown }>(res.text);
      if (!Array.isArray(parsed.verdikte)) throw new Error("Prüfer-Antwort ohne verdikte-Array.");
      const verdikte = (parsed.verdikte as Array<{ regel?: unknown; bestanden?: unknown; beleg?: unknown }>)
        .map((v) => ({ regel: String(v.regel ?? ""), bestanden: v.bestanden === true, beleg: String(v.beleg ?? "").trim() }))
        .filter((v) => v.regel);
      fehlend = fehlendeVerdikte(verdikte, regeln);
      if (fehlend.length > 0) {
        letzterFehler = new Error(`Prüfprotokoll unvollständig (unbeurteilt: ${fehlend.join(", ")}).`);
        continue; // beim PRÜFER nachfordern — nie als Autor-Finding eskalieren (D193)
      }
      return verdikteZuIssues(verdikte, regeln);
    } catch (e) {
      letzterFehler = e;
    }
  }
  throw new Error(`QM-Prüfer lieferte keine auswertbare Antwort: ${letzterFehler instanceof Error ? letzterFehler.message : String(letzterFehler)}`);
}
