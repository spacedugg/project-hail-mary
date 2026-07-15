/**
 * Tolerantes JSON-Parsen für LLM-Antworten (D70): Fences entfernen,
 * erstes Objekt greifen; wenn die Antwort abgeschnitten ist (der Klassiker
 * hinter „Expected ',' or ']' …"), wird auf das letzte vollständige Element
 * gekürzt und offene Klammern werden geschlossen. Wirft mit verständlicher
 * Meldung, wenn auch das nicht reicht.
 */
export function parseLlmJson<T>(raw: string): T {
  const cleaned = raw.trim().replace(/^```(?:json)?/m, "").replace(/```\s*$/m, "");
  const start = cleaned.indexOf("{");
  if (start === -1) throw new Error("KI-Antwort enthielt kein JSON — bitte erneut versuchen.");
  const body = cleaned.slice(start, cleaned.lastIndexOf("}") + 1 || undefined);

  try {
    return JSON.parse(body) as T;
  } catch {
    // Abgeschnittene Antwort reparieren: bis zum letzten vollständigen Element
    // zurückschneiden, dann offene Strings/Arrays/Objekte schließen.
    for (let end = body.length; end > start + 1; end--) {
      const cut = body.slice(0, end).replace(/,\s*$/, "");
      let depth = 0, inStr = false, esc = false;
      const stack: string[] = [];
      for (const ch of cut) {
        if (esc) { esc = false; continue; }
        if (ch === "\\") { esc = true; continue; }
        if (ch === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (ch === "{") { stack.push("}"); depth++; }
        else if (ch === "[") { stack.push("]"); depth++; }
        else if (ch === "}" || ch === "]") { stack.pop(); depth--; }
      }
      if (inStr || depth < 0) continue;
      const candidate = cut + stack.reverse().join("");
      try {
        return JSON.parse(candidate) as T;
      } catch {
        // weiter zurückschneiden
      }
    }
    throw new Error("KI-Antwort war unvollständig (abgeschnittenes JSON) — bitte erneut versuchen.");
  }
}
