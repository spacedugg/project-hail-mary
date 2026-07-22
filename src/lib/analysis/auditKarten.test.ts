import { describe, expect, it } from "vitest";
import { befundKarten, massnahmenKarten } from "./auditKarten";
import type { DeepAuditPayload } from "@/db/schema";

/** D135: Audit-Ausgaben deterministisch ins Insight-Karten-Schema gemappt. */
const payload: DeepAuditPayload = {
  derived: { usps: [], zielgruppe: "", positionierung: "" },
  dimensions: [
    { key: "title", label: "Titel", score10: 3, aktuell: "Kurz", probleme: ["Haupt-Keyword fehlt", "zu kurz"], empfehlung: "Keyword nach vorn" },
    { key: "images", label: "Bilder", score10: 9, aktuell: "7 Bilder, Hauptbild sauber", probleme: [], empfehlung: "" },
    { key: "aplus", label: "A+", score10: null, aktuell: "", probleme: [], empfehlung: "" },
    { key: "price", label: "Preis", score10: 7, aktuell: "im Marktband", probleme: [], empfehlung: "" },
  ],
  topActions: ["Titel neu schreiben", "Bullets schärfen"],
};

describe("befundKarten", () => {
  it("Schwäche aus Problemen (− Belege), Stärke aus hohem Score (+ Beleg), null-Score fällt raus", () => {
    const cards = befundKarten(payload, ["Listing-Import"]);
    expect(cards.map((c) => c.titel)).toEqual(["Schwäche: Titel (3/10)", "Stärke: Bilder (9/10)"]);
    expect(cards[0].belegAspekte.map((b) => b.typ)).toEqual(["painPoint", "painPoint"]);
    expect(cards[1].belegAspekte[0].typ).toBe("buyingTrigger");
    // Score 7 ohne Probleme: weder Schwäche noch Stärke — keine Karte
    expect(cards).toHaveLength(2);
  });

  it("Relevanz aus dem Score hergeleitet: Score 3 → ceil(7/2)=4, Stärke fix 2, Schwächen zuerst", () => {
    const cards = befundKarten(payload, []);
    expect(cards[0].relevanz).toBe(4);
    expect(cards[1].relevanz).toBe(2);
  });

  it("Quellen-Tags kommen vom Aufrufer (D133), Bild-Ideen bleiben leer", () => {
    const cards = befundKarten(payload, ["Review-Insights", "SOV-Audit"]);
    expect(cards[0].quellen).toEqual(["Review-Insights", "SOV-Audit"]);
    expect(cards[0].bildIdeen).toEqual([]);
  });
});

describe("massnahmenKarten", () => {
  it("Rang bestimmt die Relevanz (Platz 1 → 5), Quelle je Herkunft ausgewiesen", () => {
    const cards = massnahmenKarten(["Titel neu schreiben"], ["Bullet 3 kürzen"], ["Basis"]);
    expect(cards[0].relevanz).toBe(5);
    expect(cards[1].relevanz).toBe(4);
    expect(cards[0].quellen[0]).toContain("Tiefen-Audit");
    expect(cards[1].quellen[0]).toContain("Regel-Messung");
  });

  it("lange Maßnahmen werden im Titel gekürzt, Beschreibung trägt den vollen Text", () => {
    const lang = "Eine sehr lange Maßnahme, die deutlich mehr als neunzig Zeichen hat und deshalb im Titel gekürzt werden muss, damit die Zeile lesbar bleibt";
    const cards = massnahmenKarten([lang], [], []);
    expect(cards[0].titel.length).toBeLessThanOrEqual(90);
    expect(cards[0].titel.endsWith("…")).toBe(true);
    expect(cards[0].beschreibung).toBe(lang);
  });

  it("keine Maßnahmen → leere Liste (kein Fassaden-Inhalt)", () => {
    expect(massnahmenKarten([], [], [])).toEqual([]);
  });
});
