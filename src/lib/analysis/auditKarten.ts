import type { DeepAuditPayload, InsightCard } from "@/db/schema";

/**
 * Audit-Ausgaben im Insight-Karten-Format (D135): Stärken/Schwächen und
 * Maßnahmen des Tiefen-Audits werden in DASSELBE Schema gemappt wie die
 * Review-Erkenntnisse — ein Erkenntnis-Format über alle Analyse-Dimensionen,
 * eine Render-Komponente. Deterministischer Adapter, kein zusätzlicher
 * LLM-Lauf: alles steht schon im Audit-Payload.
 *
 * Relevanz-Herleitung (dokumentiert in Daten & Formeln):
 *  - Schwäche: relevanz = ceil((10 − score)/2), geklemmt 1–5 (Score 0 → 5, Score 8 → 1)
 *  - Stärke: relevanz = 2 (informativ — Handeln entsteht aus Schwächen)
 *  - Maßnahme: relevanz = 5 − Rang (Platz 1 → 5, ab Platz 5 → 1)
 */
export function befundKarten(payload: DeepAuditPayload, dataBasis: string[]): InsightCard[] {
  const cards: InsightCard[] = [];
  for (const d of payload.dimensions) {
    if (d.score10 === null) continue; // nicht messbar → keine Fassaden-Karte
    const istSchwaeche = d.probleme.length > 0 || d.score10 <= 6;
    const istStaerke = !istSchwaeche && d.score10 >= 8;
    if (!istSchwaeche && !istStaerke) continue;

    cards.push({
      titel: `${istSchwaeche ? "Schwäche" : "Stärke"}: ${d.label} (${d.score10}/10)`,
      beschreibung: d.empfehlung || d.aktuell,
      relevanz: istSchwaeche ? Math.min(5, Math.max(1, Math.ceil((10 - d.score10) / 2))) : 2,
      quellen: dataBasis,
      bildIdeen: [],
      belegAspekte: istSchwaeche
        ? d.probleme.map((p) => ({ label: p, typ: "painPoint" as const, mentionCount: null }))
        : [{ label: d.aktuell.slice(0, 160), typ: "buyingTrigger" as const, mentionCount: null }],
    });
  }
  return cards.sort((a, b) => b.relevanz - a.relevanz);
}

/** Priorisierte Maßnahmen (Audit + Regel-Messung) als Karten — Rang bestimmt die Relevanz. */
export function massnahmenKarten(
  topActions: string[],
  regelEmpfehlungen: string[],
  dataBasis: string[],
): InsightCard[] {
  const alle = [
    ...topActions.map((a) => ({ text: a, quelle: "Tiefen-Audit (KI, wahrheits-geprüft)" })),
    ...regelEmpfehlungen.map((r) => ({ text: r, quelle: "Regel-Messung (deterministisch)" })),
  ];
  return alle.map((m, i) => ({
    titel: m.text.length > 90 ? `${m.text.slice(0, 87)}…` : m.text,
    beschreibung: m.text,
    relevanz: Math.max(1, 5 - i),
    quellen: [m.quelle, ...dataBasis],
    bildIdeen: [],
    belegAspekte: [],
  }));
}
