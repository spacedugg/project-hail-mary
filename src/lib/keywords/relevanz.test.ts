import { describe, expect, it } from "vitest";
import { extractMasse, extractAnzahlen, pruefeMasseUndAnzahl } from "./relevanz";

const krabbeldecke = {
  massText: "Krabbeldecke 200 x 150 cm · gepolstert",
  produktName: "Krabbeldecke",
  eigeneMarke: null,
};

const kabelbinder = {
  massText: "Kabelbinder Set 20 Stück schwarz 30 cm",
  produktName: "Kabelbinder",
  eigeneMarke: null,
};

describe("extractMasse / extractAnzahlen", () => {
  it("liest Maßpaare (Reihenfolge egal) und Einzelwerte mit Einheiten-Normierung", () => {
    expect(extractMasse("krabbeldecke 150x200")).toEqual([{ a: 200, b: 150, einheit: "cm" }]);
    expect(extractMasse("flasche 1 l")).toEqual([{ a: 1000, einheit: "ml" }]);
    expect(extractMasse("matte 1,5 m breit")).toEqual([{ a: 150, einheit: "cm" }]);
  });

  it("liest Stückzahlen (20 stück, 10er pack, 3er set)", () => {
    expect(extractAnzahlen("kabelbinder 20 stück")).toEqual([20]);
    expect(extractAnzahlen("10er pack")).toEqual([10]);
    expect(extractAnzahlen("3er set schrauben")).toEqual([3]);
  });
});

describe("pruefeMasseUndAnzahl — das Nutzer-Beispiel", () => {
  it("Krabbeldecke 200×150: abweichendes Maß 140×80 fliegt raus", () => {
    const grund = pruefeMasseUndAnzahl("krabbeldecke 140x80", krabbeldecke);
    expect(grund).toContain("Maß weicht ab");
    expect(grund).toContain("140×80");
  });

  it("passendes Maß bleibt drin — auch vertauscht (150x200)", () => {
    expect(pruefeMasseUndAnzahl("krabbeldecke 200x150", krabbeldecke)).toBeNull();
    expect(pruefeMasseUndAnzahl("krabbeldecke 150x200 grau", krabbeldecke)).toBeNull();
  });

  it("Keyword ohne Maß bleibt drin", () => {
    expect(pruefeMasseUndAnzahl("krabbeldecke baby", krabbeldecke)).toBeNull();
  });

  it("Kabelbinder 20 Stück: ‚kabelbinder 10 stück' fliegt raus, ‚20 stück' bleibt", () => {
    const grund = pruefeMasseUndAnzahl("kabelbinder 10 stück", kabelbinder);
    expect(grund).toContain("Anzahl weicht ab: 10");
    expect(pruefeMasseUndAnzahl("kabelbinder schwarz 20 stück", kabelbinder)).toBeNull();
  });

  it("ohne bekannte Produkt-Maße filtert die Regel NICHT (ehrlich passiv)", () => {
    const ohne = { massText: "Krabbeldecke weich", produktName: "Krabbeldecke", eigeneMarke: null };
    expect(pruefeMasseUndAnzahl("krabbeldecke 140x80", ohne)).toBeNull();
  });

  it("5-%-Toleranz deckt Rundungen (198 cm ≈ 200 cm)", () => {
    expect(pruefeMasseUndAnzahl("decke 198x150", krabbeldecke)).toBeNull();
  });
});
