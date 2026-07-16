/**
 * D92: Tests gegen ECHTE Zeilen aus einem realen Cerebro-Export
 * (DE_AMAZON_cerebro_B0CLY13LNW_20260716.csv, Auszug byte-identisch inkl. BOM).
 *
 * Stehende Regel (docs/DECISIONS.md D92): Parser für Report-Formate werden
 * nur gegen echte Beispieldateien gebaut und getestet — nie gegen ein
 * angenommenes Format.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseCerebroCsv, computeSovAudit } from "./audit";
import { deriveKeywordTiers } from "./tiering";

const csv = readFileSync(fileURLToPath(new URL("./__fixtures__/cerebro-real-auszug.csv", import.meta.url)), "utf8");
const MAIN = "B0CLY13LNW"; // Haupt-ASIN hat KEINE eigene Spalte — ihr Rang steht in "Position (Rank)"

describe("parseCerebroCsv — realer Helium-10-Export", () => {
  it("liest den Header trotz UTF-8-BOM und findet die Wettbewerber-ASIN-Spalten", () => {
    const rows = parseCerebroCsv(csv, MAIN, { keepUnranked: true });
    expect(rows.length).toBe(7);
    expect(Object.keys(rows[0].compRanks).sort()).toEqual(["B0DM1W6TD6", "B0GR1MVKR6"]);
  });

  it("Haupt-Rang kommt aus ‚Position (Rank)' — spielmatte: SV 6093, Rang 110, Wettbewerber 35/10", () => {
    const rows = parseCerebroCsv(csv, MAIN, { keepUnranked: true });
    const spielmatte = rows.find((r) => r.keyword === "spielmatte");
    expect(spielmatte).toMatchObject({ sv: 6093, mainRank: 110, compRanks: { B0GR1MVKR6: 35, B0DM1W6TD6: 10 } });
  });

  it("Keywords mit Kommas IN den Anführungszeichen bleiben eine Zeile (Zeile 23 des Real-Exports)", () => {
    const rows = parseCerebroCsv(csv, MAIN, { keepUnranked: true });
    const lang = rows.find((r) => r.keyword.includes("korallenrote"));
    expect(lang?.keyword).toBe("loartee korallenrote samtmatte teppich rund, als krabbeldecke für kinder, 2,5cm dicker kinderteppich");
    expect(lang?.sv).toBe(38);
  });

  it("SV 0 / ‚-'-Zellen: Zeile bleibt für die Keyword-Basis erhalten (D92), fliegt aber aus dem SOV-Pfad", () => {
    const basis = parseCerebroCsv(csv, MAIN, { keepUnranked: true });
    expect(basis.map((r) => r.keyword)).toContain("kinderzimmer krabbeldecke"); // SV 0, aber gerankt (75)
    expect(basis.map((r) => r.keyword)).toContain("krabbelmatten"); // SV 0
    const sov = parseCerebroCsv(csv, MAIN);
    expect(sov.map((r) => r.keyword)).not.toContain("kinderzimmer krabbeldecke");
  });

  it("Rang ‚-' oder 0 heißt: nicht gerankt (vertbaudet rankt nur bei B0DM1W6TD6 auf 5)", () => {
    const rows = parseCerebroCsv(csv, MAIN, { keepUnranked: true });
    const vb = rows.find((r) => r.keyword === "vertbaudet");
    expect(vb).toMatchObject({ mainRank: 0, compRanks: { B0GR1MVKR6: 0, B0DM1W6TD6: 5 } });
  });
});

describe("Tiering auf dem Real-Auszug — Rangfolge ist BERECHNET (SV × Relevanz), nicht CSV-Zeilenfolge", () => {
  it("teppich kinderzimmer (SV 9200, CSV-Zeile 217!) schlägt spielmatte (SV 6093, Zeile 89)", () => {
    const alle = parseCerebroCsv(csv, MAIN, { keepUnranked: true });
    const fuerSov = (r: (typeof alle)[number]) => r.sv > 0 && (r.mainRank > 0 || Object.values(r.compRanks).some((x) => x > 0));
    const audit = computeSovAudit(alle.filter(fuerSov), { mainAsin: MAIN });
    const rest = alle.filter((r) => !fuerSov(r)).map((r) => ({ keyword: r.keyword, sv: r.sv }));
    const { tiered } = deriveKeywordTiers(audit, rest);
    expect(tiered).toHaveLength(7); // KEINE Zeile geht verloren
    expect(tiered[0].keyword).toBe("teppich kinderzimmer");
    // SV-0-Keywords: Score 0 → ehrlich ans Ende, nicht erfunden einsortiert
    const letzte = tiered.slice(-2).map((t) => t.keyword).sort();
    expect(letzte).toEqual(["kinderzimmer krabbeldecke", "krabbelmatten"]);
  });
});
