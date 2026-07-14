import { describe, it, expect } from "vitest";
import { parseSearchTermReport, ngramRoots, topConverting, negativeCandidates, isAsinTerm } from "./searchterm";

// Struktur nach dem reporting-main-Sample „Gardinenstange" (Golden-Muster §4)
const CLASSIC_CSV = [
  "Kampagnenname;Übereinstimmungstyp;Suchbegriff eines Kunden;Impressionen;Klicks;Ausgaben;7 Tage, Verkäufe gesamt;7 Tage, Bestellungen gesamt;7 Tage, verkaufte Einheiten gesamt",
  'GS Broad;BROAD;gardinenstange ausziehbar;"15.702";478;"211,34";"933,17";41;43',
  'GS Broad;BROAD;gardinenstange weiss;"9.100";320;"142,88";"612,40";29;30',
  'GS Phrase;PHRASE;gardinenstange ohne bohren;"4.200";150;"60,40";"188,00";8;9',
  'GS Exact;EXACT;gardinenstange;"5.000";200;"70,00";"388,00";17;18',
  'GS Broad;BROAD;teleskopstange;"3.000";90;"41,00";"0,00";0;0',
  'GS Auto;-;b0cxyz1234;"1.500";40;"20,43";"0,00";0;0',
  'GS Auto;-;B0AB981234;"1.000";30;"14,49";"0,00";0;0',
  'GS Broad;BROAD;gardinen;"2.000";60;"25,00";"120,00";4;4',
  'GS Broad;BROAD;vorhang stange;"1.800";50;"22,00";"95,00";3;3',
].join("\n");

const TEMPLATE_CSV = [
  "Datumsbereich,Suchbegriff,Gesamtkosten,Käufe,Verkäufe,Verkaufte Einheiten",
  "01.06.2026 - 30.06.2026,gardinenstange edelstahl,6.52,2,44.60,2",
  "01.06.2026 - 30.06.2026,stange balkon,15.00,0,0.00,0",
].join("\n");

describe("parseSearchTermReport", () => {
  it("parst den klassischen SP-Bericht: Rohwerte, Match-Types, ASIN-Flag, Wasted Spend", () => {
    const { rows, totals } = parseSearchTermReport(CLASSIC_CSV);
    const top = rows[0];
    expect(top.term).toBe("gardinenstange ausziehbar");
    expect(top.impressions).toBe(15702);
    expect(top.matchType).toBe("broad");
    expect(rows.find((r) => r.term === "gardinenstange")!.matchType).toBe("exact");
    expect(rows.find((r) => r.term === "b0cxyz1234")!.isAsin).toBe(true);
    expect(rows.find((r) => r.term === "b0cxyz1234")!.matchType).toBe("other");
    expect(totals.zeroOrderTerms).toBe(3);
    expect(totals.convertingTerms).toBe(6);
    expect(totals.wastedSpend).toBeCloseTo(41.0 + 20.43 + 14.49, 2);
    expect(totals.asinWastedSpend).toBeCloseTo(20.43 + 14.49, 2);
    expect(totals.orders).toBe(102);
  });

  it('parst das „Bericht erstellen"-Template: deutsche Header, US-Dezimalpunkte, Käufe ≠ Verkäufe', () => {
    const { rows, totals } = parseSearchTermReport(TEMPLATE_CSV);
    expect(totals.spend).toBeCloseTo(21.52, 2);
    expect(totals.sales).toBeCloseTo(44.6, 2);
    expect(rows.find((r) => r.term === "gardinenstange edelstahl")!.orders).toBe(2);
    expect(totals.wastedSpend).toBeCloseTo(15, 2);
  });

  it("wirft bei fehlenden Pflicht-Spalten", () => {
    expect(() => parseSearchTermReport("Suchbegriff;Klicks\nfoo;5")).toThrow(/Pflicht-Spalten/);
  });
});

describe("isAsinTerm", () => {
  it("erkennt ASIN-Ziele, keine False-Positives", () => {
    expect(isAsinTerm("b0cxyz1234")).toBe(true);
    expect(isAsinTerm("B0AB981234")).toBe(true);
    expect(isAsinTerm("b0")).toBe(false);
    expect(isAsinTerm("")).toBe(false);
    expect(isAsinTerm("gardinenstange")).toBe(false);
  });
});

describe("ngramRoots", () => {
  const rows = parseSearchTermReport(CLASSIC_CSV).rows;

  it("1-Wort-Wurzel: Frequenz + Summen über enthaltende Terme, ASINs ausgeschlossen, kein Stemming", () => {
    const roots = ngramRoots(rows, 1);
    const gs = roots.find((r) => r.root === "gardinenstange")!;
    // in 4 Termen, NICHT in „gardinen" oder „vorhang stange"
    expect(gs.frequency).toBe(4);
    expect(gs.spend).toBeCloseTo(211.34 + 142.88 + 60.4 + 70.0, 2);
    expect(gs.orders).toBe(41 + 29 + 8 + 17);
    expect(gs.sales).toBeCloseTo(933.17 + 612.4 + 188.0 + 388.0, 2);
    expect(roots.find((r) => r.root === "gardinen")!.frequency).toBe(1); // kein Stemming
    expect(roots.some((r) => r.root.startsWith("b0"))).toBe(false); // ASINs raus
    expect(roots[0].spend).toBeGreaterThanOrEqual(roots[1].spend); // Spend desc
  });

  it("2-Wort-Wurzeln nur zusammenhängend, de-dupliziert innerhalb eines Terms", () => {
    const roots = ngramRoots(rows, 2);
    expect(roots.find((r) => r.root === "gardinenstange ausziehbar")!.frequency).toBe(1);
    expect(roots.find((r) => r.root === "gardinenstange bohren")).toBeUndefined(); // nicht zusammenhängend
    expect(roots.find((r) => r.root === "ohne bohren")!.frequency).toBe(1);
  });

  it("topConverting nur Orders>0 nach Sales; negativeCandidates Spend>0 & 0 Orders nach Spend", () => {
    const roots = ngramRoots(rows, 1);
    expect(topConverting(roots)[0].root).toBe("gardinenstange");
    expect(negativeCandidates(roots)[0].root).toBe("teleskopstange");
    expect(negativeCandidates(roots)[0].spend).toBeCloseTo(41.0, 2);
  });
});
