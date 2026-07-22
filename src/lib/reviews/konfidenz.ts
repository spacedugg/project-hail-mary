/**
 * Konfidenz-Einordnung der Bewertungs-Analyse (D138): Stichprobe +
 * Verlässlichkeit in WORTEN, deterministisch hergeleitet — keine
 * Fassaden-Prozente („Data Reliability 98 %") ohne Formel. Jede Stufe hier
 * hat ihren Eintrag im Daten-&-Formeln-Register (Anti-Blackbox).
 */

export type KonfidenzStufe = "belastbar" | "richtungsweisend" | "dünn" | "nicht belastbar";

export type AnalyseKonfidenz = {
  stufe: KonfidenzStufe;
  /** Fertiger Anzeige-Satz: „Basis: 100 von 374 Rezensionen (27 %) — …" */
  text: string;
  /** Die Herleitung zum Nachrechnen (wird im UI als Tooltip/Kleintext gezeigt). */
  herleitung: string;
};

/**
 * Einordnung der GESAMT-Analyse aus Stichprobe und Amazon-Gesamtzahl.
 * Stufen (dokumentiert in Daten & Formeln):
 *  - nicht belastbar: < 20 gescrapte Rezensionen
 *  - dünn:            20–59
 *  - richtungsweisend: ≥ 60 (Standard — Richtung stimmt, nicht repräsentativ)
 *  - belastbar:       ≥ 150 UND (Gesamtzahl unbekannt ODER Anteil ≥ 30 %)
 */
export function beurteileAnalyseBasis(gescrapt: number, amazonTotal: number | null): AnalyseKonfidenz {
  const anteil = amazonTotal && amazonTotal > 0 ? gescrapt / amazonTotal : null;
  const anteilPct = anteil !== null ? Math.round(anteil * 100) : null;

  let stufe: KonfidenzStufe;
  if (gescrapt < 20) stufe = "nicht belastbar";
  else if (gescrapt < 60) stufe = "dünn";
  else if (gescrapt >= 150 && (anteil === null || anteil >= 0.3)) stufe = "belastbar";
  else stufe = "richtungsweisend";

  const basis =
    amazonTotal && amazonTotal > 0
      ? `Basis: ${gescrapt} von ${amazonTotal} Rezensionen (${anteilPct} %)`
      : `Basis: ${gescrapt} gescrapte Rezensionen (Amazon-Gesamtzahl unbekannt — Listing-Import liefert sie)`;

  const deutung: Record<KonfidenzStufe, string> = {
    belastbar: "belastbare Datenbasis für Content-Entscheidungen",
    richtungsweisend: "richtungsweisend, nicht repräsentativ",
    "dünn": "dünne Datenbasis — Erkenntnisse als Hypothesen behandeln",
    "nicht belastbar": "nicht belastbar — mehr Reviews scrapen (Wettbewerber-ASINs dazu), bevor Content darauf baut",
  };

  return {
    stufe,
    text: `${basis} — ${deutung[stufe]}.`,
    herleitung:
      "Stufen: <20 nicht belastbar · 20–59 dünn · ≥60 richtungsweisend · ≥150 und ≥30 % der Gesamtzahl belastbar. Amazons Gesamtzahl zählt auch Bewertungen ohne Text — 100 % sind von außen nie erreichbar (~500/ASIN-Deckel, D130).",
  };
}
