import { describe, it, expect } from "vitest";
import { pruefeClaimStaerke } from "./gate";

/**
 * Regel „fakten.claim-staerke“ (D265). Auslöser war ein echtes Listing, das
 * „flüsterleiser Motor“ bewirbt und selbst ≤ 55 dB angibt — Gesprächslautstärke.
 * Die Zahl ist belegt, die Steigerung darüber ist erfunden; der Zahlen-Check
 * konnte das nie fassen, weil im Claim keine Zahl steht.
 */
const QUELLEN_55DB = "2 Hochleistungsmotoren (≤55 dB), 80 mm/Sek, 36 kg";

describe("Claim-Stärke gegen Messwert", () => {
  it("„flüsterleise“ bei 55 dB ist ein Fehler und nennt die belegbare Formulierung", () => {
    const issues = pruefeClaimStaerke("Flüsterleiser Motor für konzentriertes Arbeiten", QUELLEN_55DB, "bullets");
    expect(issues).toHaveLength(1);
    expect(issues[0].rule).toBe("bullets.claim-staerke");
    expect(issues[0].severity).toBe("error");
    expect(issues[0].message).toContain("55 dB");
    expect(issues[0].message).toContain("angenehm leise");
    expect(issues[0].evidence).toBe("deterministic");
  });

  it("„angenehm leise“ bei 55 dB ist erlaubt", () => {
    expect(pruefeClaimStaerke("Angenehm leise im Betrieb", QUELLEN_55DB, "bullets")).toEqual([]);
  });

  it("die spezifischere Stufe gewinnt — „angenehm leise“ fällt nicht in die 50-dB-Regel", () => {
    expect(pruefeClaimStaerke("Geräuscharm und angenehm leise", QUELLEN_55DB, "title")).toEqual([]);
  });

  it("nacktes „leise“ ist bei 55 dB zu viel, bei 45 dB in Ordnung", () => {
    expect(pruefeClaimStaerke("Leiser Antrieb", QUELLEN_55DB, "bullets")).toHaveLength(1);
    expect(pruefeClaimStaerke("Leiser Antrieb", "Motor mit 45 dB", "bullets")).toEqual([]);
  });

  it("„sehr leise“ braucht 40 dB", () => {
    expect(pruefeClaimStaerke("Sehr leise Höhenverstellung", "Motor mit 48 dB", "bullets")).toHaveLength(1);
    expect(pruefeClaimStaerke("Sehr leise Höhenverstellung", "Motor mit 38 dB", "bullets")).toEqual([]);
  });

  it("„flüsterleise“ ohne Messwert bleibt ehrlich passiv — kein erfundener Verstoß", () => {
    expect(pruefeClaimStaerke("Flüsterleiser Motor", "36 kg Stahl, 80 mm/Sek", "bullets")).toEqual([]);
    expect(pruefeClaimStaerke("Flüsterleiser Motor", "", "bullets")).toEqual([]);
  });

  it("Text ohne Lautstärke-Claim bleibt unangetastet", () => {
    expect(pruefeClaimStaerke("Bis zu 40 % mehr Stahl für maximale Stabilität", QUELLEN_55DB, "bullets")).toEqual([]);
  });

  it("mehrere dB-Werte in den Quellen: der höchste entscheidet (Claim muss auch laut gelten)", () => {
    expect(pruefeClaimStaerke("Leiser Betrieb", "Leerlauf 30 dB, unter Last 58 dB", "bullets")).toHaveLength(1);
  });
});
