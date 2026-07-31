/**
 * D268: Wettbewerber-ASINs kommen aus dem Keyword-Export — kein zweiter,
 * manueller Eintrag mehr für den Review-Scrape.
 *
 * Stehende Regel (D92): Report-Parser werden gegen ECHTE Exportdateien getestet,
 * nie gegen ein angenommenes Format. Fixture ist ein Auszug aus
 * DE_AMAZON_cerebro_B016XZRR56_2026-07-31.csv (byte-identisch inkl. BOM).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseCerebroCsv, wettbewerberAsinsAusRows } from "./audit";

const csv = readFileSync(fileURLToPath(new URL("./__fixtures__/cerebro-real-b016xzrr56.csv", import.meta.url)), "utf8");
const MAIN = "B016XZRR56"; // Haupt-ASIN hat keine eigene Spalte — ihr Rang steht in „Position (Rank)“

describe("wettbewerberAsinsAusRows — realer Export (Poolheizung)", () => {
  const rows = parseCerebroCsv(csv, MAIN, { keepUnranked: true });

  it("findet genau die vier Vergleichsprodukte aus der Kopfzeile", () => {
    const asins = wettbewerberAsinsAusRows(rows);
    expect(new Set(asins)).toEqual(new Set(["B0GZP5GD8B", "B0CXPGCY5J", "B0GXZXV8PC", "B0H1G51K7C"]));
  });

  it("die eigene ASIN ist nie dabei", () => {
    expect(wettbewerberAsinsAusRows(rows)).not.toContain(MAIN);
  });

  it("sortiert nach Anzahl gerankter Keywords — der breiteste Wettbewerber zuerst", () => {
    const asins = wettbewerberAsinsAusRows(rows);
    const zaehle = (asin: string) => rows.filter((r) => (r.compRanks[asin] ?? 0) > 0).length;
    const counts = asins.map(zaehle);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    expect(counts[0]).toBeGreaterThan(0);
  });
});

describe("wettbewerberAsinsAusRows — Randfälle", () => {
  it("eine Spalte ohne einen einzigen Rang zählt nicht als Wettbewerber", () => {
    // Formal im Export dabei, aber nie verglichen — sie zu scrapen würde
    // Zeitbudget für ein irrelevantes Produkt verbrennen.
    const rows = [
      { keyword: "a", sv: 100, mainRank: 5, ks: 0, cpr: 8, compRanks: { B0AAAAAAAA: 3, B0BBBBBBBB: 0 } },
      { keyword: "b", sv: 100, mainRank: 6, ks: 0, cpr: 8, compRanks: { B0AAAAAAAA: 4, B0BBBBBBBB: 0 } },
    ];
    expect(wettbewerberAsinsAusRows(rows)).toEqual(["B0AAAAAAAA"]);
  });

  it("ohne Wettbewerber-Spalten kommt eine leere Liste, kein Fehler", () => {
    expect(wettbewerberAsinsAusRows([{ keyword: "a", sv: 10, mainRank: 1, ks: 0, cpr: 8, compRanks: {} }])).toEqual([]);
    expect(wettbewerberAsinsAusRows([])).toEqual([]);
  });

  it("bei Gleichstand entscheidet die ASIN alphabetisch — stabile Reihenfolge über Läufe hinweg", () => {
    const rows = [{ keyword: "a", sv: 10, mainRank: 1, ks: 0, cpr: 8, compRanks: { B0ZZZZZZZZ: 2, B0AAAAAAAA: 3 } }];
    expect(wettbewerberAsinsAusRows(rows)).toEqual(["B0AAAAAAAA", "B0ZZZZZZZZ"]);
  });
});
