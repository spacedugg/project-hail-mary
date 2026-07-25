import { parseLlmJson } from "@/lib/llm/json";
import { AENDERBARE_REGELN, type RegelKey } from "./regelstand";

/**
 * Regel-Wächter: Das Tool sucht selbst nach Amazon-Änderungen.
 *
 * Auslöser (Nutzer 22.07.): „Ich muss nicht manuell was eintragen, sondern du
 * schaust, ob es Neuigkeiten gibt, nachdem ich den Button klicke."
 *
 * Zwei Prinzipien, ohne die das gefährlich wäre:
 * 1. Es wird NIE automatisch übernommen. Eine Websuche kann einen Blogartikel
 *    von 2019 finden oder eine Zahl falsch lesen — würde das Tool daraufhin
 *    still eure Titel-Grenze ändern, entstünden Alerts für alle Kunden auf
 *    einer Falschmeldung. Es entstehen VORSCHLÄGE, die ein Mensch annimmt.
 * 2. Ohne Beleg kein Vorschlag: Jeder Fund braucht Quell-URL und wörtliches
 *    Zitat. Alles andere wirft der Code weg, bevor es jemand zu sehen bekommt.
 */

const SUCH_TOOL = process.env.ANTHROPIC_WEB_SEARCH_TOOL ?? "web_search_20250305";
const MODELL = process.env.RECIPE_MODEL_REGELN_WAECHTER ?? "claude-sonnet-5";
const ZEITBUDGET_MS = 240_000;

export type RegelFund = {
  key: RegelKey;
  label: string;
  aktuell: number;
  vorgeschlagen: number;
  einheit: string;
  quelle: string;
  url: string;
  zitat: string;
  sicherheit: "hoch" | "mittel" | "niedrig";
};

export type WaechterErgebnis = {
  gepruefaAm: string;
  funde: RegelFund[];
  /** Was die Suche gesehen, aber nicht als Änderung gewertet hat — Ehrlichkeit statt leerer Seite. */
  hinweise: string[];
  /** Verworfene Roh-Funde mit Grund (Beleg fehlte, Wert unplausibel …). */
  verworfen: string[];
};

const SYSTEM =
  "Du recherchierst Änderungen an Amazons Anforderungen für Listing-Inhalte auf dem deutschen Marktplatz. " +
  "Nutze die Websuche. Antworte AUSSCHLIESSLICH mit einem JSON-Objekt. " +
  "Erfinde NICHTS: Jede genannte Zahl muss wörtlich in einer gefundenen Quelle stehen, und du gibst das Zitat mit an. " +
  "Bevorzuge Amazon-eigene Quellen (Seller Central, Hilfeseiten, Ankündigungen) vor Blogs und Agentur-Seiten. " +
  "Findest du keine belastbare Änderung, gib eine leere Liste zurück — das ist ein gültiges Ergebnis.";

function prompt(aktuell: Array<{ key: string; label: string; wert: number; einheit: string }>, seit: string | null) {
  return `Prüfe, ob Amazon seine Vorgaben für Listing-Inhalte auf amazon.de geändert hat${
    seit ? ` — besonders seit ${new Date(seit).toLocaleDateString("de-DE")}` : ""
  }.

Unser aktueller Stand:
${aktuell.map((a) => `- ${a.key} (${a.label}): ${a.wert} ${a.einheit}`).join("\n")}

Suche nach aktuellen Angaben zu diesen Grenzwerten und zu neuen Pflichtangaben für Listings.

Antworte in diesem JSON-Schema:
{"funde": [
   {"key": "einer der Schlüssel oben",
    "vorgeschlagen": Zahl,
    "quelle": "Name der Quelle, z. B. Amazon Seller Central Hilfe",
    "url": "vollständige https-URL der Fundstelle",
    "zitat": "wörtlicher Satz aus der Quelle, der die Zahl nennt",
    "sicherheit": "hoch | mittel | niedrig"}],
 "hinweise": ["was du sonst Relevantes gesehen hast, in einem Satz je Eintrag"]}

Regeln:
- Nur Einträge, deren Wert sich von unserem Stand UNTERSCHEIDET.
- „sicherheit: hoch" nur bei einer Amazon-eigenen Quelle mit eindeutiger Zahl.
- Gilt eine Grenze nur für bestimmte Kategorien, gehört das in "hinweise", nicht in "funde".`;
}

type RohFund = {
  key?: string;
  vorgeschlagen?: unknown;
  quelle?: string;
  url?: string;
  zitat?: string;
  sicherheit?: string;
};

/**
 * Deterministische Annahme-Prüfung — „KI generiert, Code erzwingt".
 * Alles, was hier durchfällt, taucht als verworfener Fund mit Grund auf.
 */
export function pruefeFunde(
  roh: RohFund[],
  aktuell: Array<{ key: RegelKey; label: string; wert: number; einheit: string }>,
): { funde: RegelFund[]; verworfen: string[] } {
  const funde: RegelFund[] = [];
  const verworfen: string[] = [];

  for (const r of roh ?? []) {
    const def = AENDERBARE_REGELN.find((a) => a.key === r.key);
    const stand = aktuell.find((a) => a.key === r.key);
    if (!def || !stand) {
      verworfen.push(`Unbekannte Regel „${r.key ?? "—"}" — verworfen.`);
      continue;
    }
    const wert = Number(r.vorgeschlagen);
    if (!Number.isFinite(wert) || wert <= 0 || !Number.isInteger(wert)) {
      verworfen.push(`${def.label}: „${String(r.vorgeschlagen)}" ist keine ganze Zahl > 0 — verworfen.`);
      continue;
    }
    if (wert === stand.wert) continue; // keine Änderung, kein Vorschlag
    if (wert > stand.wert * 10 || wert * 10 < stand.wert) {
      verworfen.push(`${def.label}: ${wert} weicht um mehr als das Zehnfache vom Stand (${stand.wert}) ab — unplausibel, verworfen.`);
      continue;
    }
    const url = (r.url ?? "").trim();
    const zitat = (r.zitat ?? "").trim();
    if (!url.startsWith("https://") || zitat.length < 15) {
      verworfen.push(`${def.label}: ohne belastbare Quelle (URL/Zitat) — verworfen.`);
      continue;
    }
    const sicherheit = (["hoch", "mittel", "niedrig"] as const).find((s) => s === r.sicherheit) ?? "niedrig";
    funde.push({
      key: def.key,
      label: def.label,
      aktuell: stand.wert,
      vorgeschlagen: wert,
      einheit: def.einheit,
      quelle: (r.quelle ?? "unbenannt").trim(),
      url,
      zitat,
      sicherheit,
    });
  }
  return { funde, verworfen };
}

/** Führt die Websuche aus. Wirft mit klarer Meldung — nie stiller Fehlschlag. */
export async function sucheRegelaenderungen(
  aktuell: Array<{ key: RegelKey; label: string; wert: number; einheit: string }>,
  seit: string | null,
): Promise<WaechterErgebnis> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY fehlt — der Regel-Wächter braucht die Websuche.");

  type Block = { type: string; text?: string };
  let messages: Array<{ role: string; content: string | Block[] }> = [
    { role: "user", content: prompt(aktuell, seit) },
  ];

  const signal = AbortSignal.timeout(ZEITBUDGET_MS);
  let text = "";
  try {
    // Server-Tool-Läufe können mit pause_turn unterbrechen → begrenzt fortsetzen
    for (let runde = 0; runde < 4; runde++) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: MODELL,
          max_tokens: 8000,
          system: SYSTEM,
          messages,
          tools: [{ type: SUCH_TOOL, name: "web_search", max_uses: 8 }],
        }),
        signal,
      });
      if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = (await res.json()) as { stop_reason: string; content: Block[] };
      if (data.stop_reason === "pause_turn") {
        messages = [...messages, { role: "assistant", content: data.content }];
        continue;
      }
      text = data.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
      break;
    }
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError")
      throw new Error("Die Suche hat das Zeitbudget überschritten — bitte erneut versuchen.");
    throw e;
  }
  if (!text.trim()) throw new Error("Die Suche kam ohne Ergebnis zurück — bitte erneut versuchen.");

  const roh = parseLlmJson<{ funde?: RohFund[]; hinweise?: string[] }>(text);
  const { funde, verworfen } = pruefeFunde(roh.funde ?? [], aktuell);
  return {
    gepruefaAm: new Date().toISOString(),
    funde,
    hinweise: (roh.hinweise ?? []).map((h) => String(h)).filter(Boolean).slice(0, 8),
    verworfen,
  };
}
