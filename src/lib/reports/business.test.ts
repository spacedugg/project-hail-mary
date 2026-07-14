import { describe, it, expect } from "vitest";
import { parseBusinessReport } from "./business";

const DE_CSV = [
  '"(Untergeordnete) ASIN","Titel","Sitzungen – Gesamt","Seitenaufrufe – Gesamt","Einkaufswagen-Prozentsatz","Bestellte Einheiten","Gesamtzahl an Bestellposten","Bestellte Produkte – Umsätze"',
  '"B0AAAA1111","Trinkflasche 750 ml","1.250","2.900","97,5 %","85","80","1.699,15 €"',
  '"B0BBBB2222","Trinkflasche 1 l","750","1.600","92,0 %","35","34","874,65 €"',
  '"","Gesamtzeile ohne ASIN","2.000","4.500","","120","114","2.573,80 €"',
].join("\n");

describe("Business-Report-Parser", () => {
  const { rows, totals } = parseBusinessReport(DE_CSV);

  it("parst deutsche Zahlen (1.250 / 1.699,15 € / 97,5 %) korrekt", () => {
    expect(rows[0].sessions).toBe(1250);
    expect(rows[0].revenue).toBeCloseTo(1699.15, 2);
    expect(rows[0].buyBoxPct).toBeCloseTo(97.5, 1);
  });

  it("filtert Zeilen ohne gültige ASIN (Summenzeilen)", () => {
    expect(rows).toHaveLength(2);
  });

  it("Totals aus Roh-Summen: Orders = Bestellposten, CVR & Buybox gewichtet", () => {
    expect(totals.sessions).toBe(2000);
    expect(totals.units).toBe(120);
    expect(totals.orders).toBe(114); // Bestellposten, EINE Definition (D48)
    expect(totals.revenue).toBeCloseTo(2573.8, 2);
    expect(totals.cvr).toBeCloseTo(5.7, 1); // 114/2000
    // gewichtet: (97.5*1250 + 92*750) / 2000 = 95.4…
    expect(totals.buyBoxPct).toBeCloseTo(95.4, 1);
  });

  it("wirft klare Fehler bei fremdem Format", () => {
    expect(() => parseBusinessReport("Foo,Bar\n1,2")).toThrow(/ASIN/);
  });

  it("US-Zahlenformat wird erkannt", () => {
    const us = '"(Child) ASIN","Title","Sessions - Total","Page Views - Total","Featured Offer","Units Ordered","Total Order Items","Ordered Product Sales"\n"B0CCCC3333","Bottle","1,250","2,000","95.5","40","38","1,234.56"';
    const r = parseBusinessReport(us);
    expect(r.totals.sessions).toBe(1250);
    expect(r.totals.revenue).toBeCloseTo(1234.56, 2);
  });
});
