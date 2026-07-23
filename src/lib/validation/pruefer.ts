import { generateForRecipe, resolveRecipe } from "@/lib/llm/registry";
import { parseLlmJson } from "@/lib/llm/json";
import { pruefRegelnFuerSektion, type Regel, type RegelSektion } from "./register";
import type { ValidationIssue } from "@/db/schema";

/**
 * LLM-Prüfer (D182, Nutzer-Entscheid „Immer LLM-Prüfer"): eine zweite,
 * unabhängige Instanz beurteilt jeden Entwurf gegen die llm-prüfbaren Regeln
 * des Registers — Prüfprotokoll je Regel (bestanden/verletzt + Textbeleg).
 * Der Prüfer ist Torwächter, nicht Autor: er liefert Verdikte, nie Text.
 *
 * Mock-Modus (kein API-Key / Tests): ehrlich KEINE Prüfung statt erfundener
 * Verdikte — deterministische Checks bleiben aktiv, das Ergebnis trägt dann
 * nur deterministische Evidenz. Ein Mock, der „bestanden" behauptet, wäre
 * genau die Fassade, die D182 verbietet.
 */

const PRUEFER_RECIPE = "listing.pruefer";

const PRUEFER_SYSTEM =
  "Du bist unbestechlicher Qualitäts-Prüfer für Amazon-Listing-Texte (DE). " +
  "Du beurteilst NUR die genannten Regeln am vorgelegten Text — du schreibst nie um, du bewertest. " +
  "Im Zweifel gilt eine Regel als VERLETZT (strenge Auslegung). " +
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

JSON: {"verdikte": [{"regel": "<Regel-ID>", "bestanden": true/false, "beleg": "<konkretes Zitat/Begründung aus dem Text>"}]}`;
}

/** Verdikte → ValidationIssues (nur Verletzungen; Severity aus dem Register). */
export function verdikteZuIssues(verdikte: Verdikt[], regeln: Regel[]): ValidationIssue[] {
  const byId = new Map(regeln.map((r) => [r.id, r]));
  const issues: ValidationIssue[] = [];
  for (const v of verdikte) {
    const regel = byId.get(v.regel);
    if (!regel || v.bestanden) continue;
    issues.push({ rule: regel.id, severity: regel.severity, message: v.beleg || regel.text, evidence: "llm" });
  }
  // Prüf-Vollständigkeit: eine unbeurteilte Regel gilt als ungeprüft = Fehler
  // (stilles Auslassen wäre ein Loch im Gate).
  const beurteilt = new Set(verdikte.map((v) => v.regel));
  for (const r of regeln)
    if (!beurteilt.has(r.id))
      issues.push({ rule: r.id, severity: "error", message: `Prüfer hat Regel ${r.id} nicht beurteilt — Prüfprotokoll unvollständig.`, evidence: "llm" });
  return issues;
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

  const prompt = prueferPrompt(sektion, text, regeln, kontext);
  let letzterFehler: unknown;
  for (let versuch = 0; versuch < 2; versuch++) {
    try {
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
      return verdikteZuIssues(verdikte, regeln);
    } catch (e) {
      letzterFehler = e;
    }
  }
  throw new Error(`QM-Prüfer lieferte keine auswertbare Antwort: ${letzterFehler instanceof Error ? letzterFehler.message : String(letzterFehler)}`);
}
