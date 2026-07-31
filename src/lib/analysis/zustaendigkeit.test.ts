import { describe, it, expect } from "vitest";
import { bestimmeZustaendigkeit, teileNachZustaendigkeit } from "./zustaendigkeit";
import type { RoheAspekte } from "@/lib/reviews/verdichtung";

const aspekt = (label: string, mentionCount: number | null = 5) => ({
  label,
  frequencyPct: null,
  mentionCount,
  quotes: [],
});

describe("Zuständigkeits-Gate (D265)", () => {
  it("Amazon-Logistik ist nicht unser Gegenstand", () => {
    for (const l of [
      "Lieferung kam zwei Tage zu spät",
      "Versand dauerte über eine Woche",
      "DHL hat das Paket beim Nachbarn abgestellt",
      "Sendungsverfolgung war nicht aktuell",
    ])
      expect(bestimmeZustaendigkeit(l), l).toBe("amazon");
  });

  it("„Lieferumfang“ ist Seller-Sache — die Stamm-Falle greift nicht", () => {
    // Ein Stamm-Match auf „liefer“ würde das mit erwischen; was in der Box
    // liegt, entscheidet aber der Seller (eigene Werbeaussage in Bullet 5).
    expect(bestimmeZustaendigkeit("Lieferumfang unvollständig, Schrauben fehlten")).toBe("seller");
    expect(bestimmeZustaendigkeit("Aufbauanleitung war unverständlich")).toBe("seller");
    expect(bestimmeZustaendigkeit("Rückgabe innerhalb 60 Tagen problemlos")).toBe("seller");
    expect(bestimmeZustaendigkeit("Garantie wurde anerkannt")).toBe("seller");
  });

  it("Verpackung und Transportschaden sind Produkt-Feedback, nicht Listing-Stoff", () => {
    expect(bestimmeZustaendigkeit("Karton war eingedrückt, Gestell verkratzt")).toBe("produkt");
    expect(bestimmeZustaendigkeit("Verpackung viel zu dünn für das Gewicht")).toBe("produkt");
  });

  it("Kundenservice und „auf Amazon“ werden NICHT weggefiltert (zu breiter Filter ist der teurere Fehler)", () => {
    expect(bestimmeZustaendigkeit("Kundenservice hat sofort geantwortet")).toBe("seller");
    expect(bestimmeZustaendigkeit("bestes Gestell auf Amazon")).toBe("seller");
  });

  it("Produkt-Themen bleiben unangetastet", () => {
    expect(bestimmeZustaendigkeit("wackelt bei maximaler Höhe")).toBe("seller");
    expect(bestimmeZustaendigkeit("Motor ist angenehm leise")).toBe("seller");
  });

  it("teilt den Pool auf, weist Ausgeschlossenes aus und verliert nichts still", () => {
    const aspekte: RoheAspekte = {
      painPoints: [aspekt("Versand dauerte zu lange"), aspekt("wackelt bei voller Höhe", 12), aspekt("Karton eingedrückt", 3)],
      buyingTriggers: [aspekt("Motor angenehm leise", 20), aspekt("DHL war schnell", 4)],
    };
    const r = teileNachZustaendigkeit(aspekte);

    expect(r.aspekte.painPoints.map((a) => a.label)).toEqual(["wackelt bei voller Höhe"]);
    expect(r.aspekte.buyingTriggers.map((a) => a.label)).toEqual(["Motor angenehm leise"]);
    expect(r.ausgeschlossen).toHaveLength(2);
    expect(r.produktFeedback).toEqual([{ label: "Karton eingedrückt", typ: "painPoint", mentionCount: 3 }]);
    // Gezählt, nie still (D133)
    expect(r.hinweise.join(" ")).toContain("Amazon zuständig");
    expect(r.hinweise.join(" ")).toContain("Produkt-Feedback");
  });

  it("ohne Amazon-Themen entstehen keine Hinweise", () => {
    const r = teileNachZustaendigkeit({ painPoints: [aspekt("Höhe verstellt sich ruckelig")], buyingTriggers: [aspekt("sehr stabil")] });
    expect(r.ausgeschlossen).toEqual([]);
    expect(r.produktFeedback).toEqual([]);
    expect(r.hinweise).toEqual([]);
  });
});
