import { describe, it, expect } from "vitest";
import { parseSqpNumber, parseSqpReport } from "./sqp";

const CSV = [
  '"Marke=[""HaA""],Berichtszeitraum=[""Monatlich""],Jahr auswählen=[""2026""],Monat auswählen=[""April""]"',
  '"Suchabfrage","Volumen der Suchabfrage","Eindrücke: Gesamtanzahl","Eindrücke: Markenanzahl","Eindrücke: Markenanteil %","Klicks: Gesamtanzahl","Klicks: Klickrate %","Klicks: Markenanzahl","Klicks: Markenanteil %","In den Einkaufswagen: Gesamtanzahl","In den Einkaufswagen: Markenanzahl","Käufe: Gesamtanzahl","Käufe: Markenanzahl","Käufe: Preis (Median)","Käufe: Markenpreis (Median)"',
  '"edelstahl trinkflasche","1200","1000","200","20.00","100","10.00","20","20.00","40","8","25","2","28.50","30.00"',
  '"bioethanol zum reinigen","17","478","24","5.02","7","41.18","1","14.29","2","0","0","0","-",""',
].join("\n");

describe("parseSqpNumber (Golden: nie NaN, beide Formate)", () => {
  it("deckt die reporting-main-Goldfälle ab", () => {
    expect(parseSqpNumber("")).toBeNull();
    expect(parseSqpNumber("-")).toBeNull();
    expect(parseSqpNumber("41.18")).toBeCloseTo(41.18, 2);
    expect(parseSqpNumber("16,95 €")).toBeCloseTo(16.95, 2);
    expect(parseSqpNumber("5,02 %")).toBeCloseTo(5.02, 2);
    expect(parseSqpNumber("1.234,56")).toBeCloseTo(1234.56, 2);
  });
});

describe("parseSqpReport", () => {
  it("liest Meta-Zeile, Header in Zeile 2, Metriken nach den Golden-Formeln", () => {
    const rep = parseSqpReport(CSV);
    expect(rep.meta.brand).toBe("HaA");
    expect(rep.meta.period).toBe("April 2026");

    // Standard-Row-Goldwerte: 200/20/2 Marke, 1000/100/25 Markt, Preis 30
    const r = rep.rows.find((x) => x.query === "edelstahl trinkflasche")!;
    expect(r.brandCtr).toBeCloseTo(10, 1);
    expect(r.marketCtr).toBeCloseTo(10, 1);
    expect(r.brandCvr).toBeCloseTo(10, 1);
    expect(r.marketCvr).toBeCloseTo(25, 1);
    expect(r.cvrDeltaPp).toBeCloseTo(-15, 1);
    expect(r.lostPurchases).toBeCloseTo(3, 2); // 0,25×20 − 2
    expect(r.revenuePotential).toBeCloseTo(90, 2); // 3 × 30 (Markenpreis)

    // 0-Käufe-Zeile: echte 0-%-CVR (kein null — null nur bei 0-Nennern), nie NaN, lost=0
    const z = rep.rows.find((x) => x.query === "bioethanol zum reinigen")!;
    expect(z.volume).toBe(17);
    expect(z.imprShare).toBeCloseTo(5.02, 2);
    expect(z.brandCvr).toBe(0);
    expect(z.marketCvr).toBe(0);
    expect(z.price).toBeNull(); // „-" und "" → null, nicht NaN
    expect(z.lostPurchases).toBe(0);
    expect(z.revenuePotential).toBe(0);

    // Report-Ebene: brandCvr aus SUMMEN (2/21), Sortierung nach Potenzial
    expect(rep.totals.brandCvr).toBeCloseTo((2 / 21) * 100, 1);
    expect(rep.rows[0].query).toBe("edelstahl trinkflasche");
    expect(rep.totals.totalPotential).toBeCloseTo(90, 2);
    expect(rep.totals.brandRevenue).toBeCloseTo(2 * 30, 2);
  });

  it("wirft bei fehlenden Pflicht-Spalten und zu kurzen Dateien", () => {
    expect(() => parseSqpReport("nur\nzwei")).toThrow(/zu kurz/);
    expect(() => parseSqpReport('meta\n"Suchabfrage","Volumen"\n"a","1"')).toThrow(/Pflicht-Spalten/);
  });
});
