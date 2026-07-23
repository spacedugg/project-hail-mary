import { describe, it, expect } from "vitest";
import { fixeTitelLaenge, fixeWhitespace } from "./fixers";
import { charLength } from "./bytes";
import { keywordStammAbgedeckt } from "@/lib/validation/gate";

/**
 * Titel-Längen-Fixer (D184/D192, Live-Befund 23.07.: QM-Block nach 3× 77
 * Zeichen): Zeichen zählt und kürzt der CODE — nie das LLM.
 */

const BAND = { max: 75, min: 68 };

describe("fixeTitelLaenge", () => {
  it("kürzt einen 77-Zeichen-Titel deterministisch ins Pflichtband (der Live-Fall)", () => {
    const zuLang = "Tierliebhaber Ulmenrinde-Drops für Hunde mit Heilmoor gegen Sodbrennen, 350 g";
    expect(charLength(zuLang)).toBeGreaterThan(75);
    const fixiert = fixeTitelLaenge(zuLang, {
      ...BAND,
      istZulaessig: (s) => keywordStammAbgedeckt("ulmenrinde für hunde", s),
    });
    expect(charLength(fixiert)).toBeLessThanOrEqual(75);
    expect(charLength(fixiert)).toBeGreaterThanOrEqual(68);
    expect(keywordStammAbgedeckt("ulmenrinde für hunde", fixiert)).toBe(true);
    expect(fixiert.endsWith(",")).toBe(false);
  });

  it("lässt Titel im Band unverändert", () => {
    const ok = "AquaNova Edelstahl-Trinkflasche 750 ml, auslaufsicher, isoliert, BPA-frei";
    expect(fixeTitelLaenge(ok, BAND)).toBe(ok);
  });

  it("erfindet bei zu KURZEN Titeln nichts (Fakten-Sperre — Gate übernimmt)", () => {
    const kurz = "AquaNova Trinkflasche 750 ml";
    expect(fixeTitelLaenge(kurz, BAND)).toBe(kurz);
  });

  it("gibt unverändert zurück, wenn Kürzen das Hauptkeyword verlieren würde (Gate übernimmt)", () => {
    // Keyword-Stämme stehen ganz hinten — jede Kürzung von hinten verliert sie
    const zuLang = "Tierliebhaber Premium Naturprodukt zur täglichen Unterstützung empfindlicher Verdauung Ulmenrinde Hunde";
    expect(charLength(zuLang)).toBeGreaterThan(75);
    const fixiert = fixeTitelLaenge(zuLang, {
      ...BAND,
      istZulaessig: (s) => keywordStammAbgedeckt("ulmenrinde hunde", s),
    });
    expect(fixiert).toBe(fixeWhitespace(zuLang));
  });
});
