import { describe, expect, it } from "vitest";
import { extractMasse, extractAnzahlen, pruefeProduktAttribute } from "./relevanz";

const krabbeldecke = {
  attributText: "Krabbeldecke 200 x 150 cm · gepolstert",
  produktName: "Krabbeldecke",
  eigeneMarke: null,
};

const kabelbinder = {
  attributText: "Kabelbinder Set 20 Stück schwarz 30 cm",
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

describe("pruefeProduktAttribute — das Nutzer-Beispiel", () => {
  it("Krabbeldecke 200×150: abweichendes Maß 140×80 fliegt raus", () => {
    const grund = pruefeProduktAttribute("krabbeldecke 140x80", krabbeldecke);
    expect(grund).toContain("Maß weicht ab");
    expect(grund).toContain("140×80");
  });

  it("passendes Maß bleibt drin — auch vertauscht (150x200)", () => {
    expect(pruefeProduktAttribute("krabbeldecke 200x150", krabbeldecke)).toBeNull();
    expect(pruefeProduktAttribute("krabbeldecke 150x200 grau", krabbeldecke)).toBeNull();
  });

  it("Keyword ohne Maß bleibt drin", () => {
    expect(pruefeProduktAttribute("krabbeldecke baby", krabbeldecke)).toBeNull();
  });

  it("Kabelbinder 20 Stück: ‚kabelbinder 10 stück' fliegt raus, ‚20 stück' bleibt", () => {
    const grund = pruefeProduktAttribute("kabelbinder 10 stück", kabelbinder);
    expect(grund).toContain("Anzahl weicht ab: 10");
    expect(pruefeProduktAttribute("kabelbinder schwarz 20 stück", kabelbinder)).toBeNull();
  });

  it("ohne bekannte Produkt-Maße filtert die Regel NICHT (ehrlich passiv)", () => {
    const ohne = { attributText: "Krabbeldecke weich", produktName: "Krabbeldecke", eigeneMarke: null };
    expect(pruefeProduktAttribute("krabbeldecke 140x80", ohne)).toBeNull();
  });

  it("5-%-Toleranz deckt Rundungen (198 cm ≈ 200 cm)", () => {
    expect(pruefeProduktAttribute("decke 198x150", krabbeldecke)).toBeNull();
  });
});

describe("Farbe & Form (D91) — das Nutzer-Beispiel eckige Krabbelmatte", () => {
  const eckigGrau = {
    attributText: "Krabbelmatte eckig 200x150 cm grau gepolstert",
    produktName: "Krabbelmatte",
    eigeneMarke: null,
  };

  it("eckige Matte: ‚krabbelmatte rund' fliegt raus, ‚rechteckig' bleibt (gleiche Form-Gruppe)", () => {
    const grund = pruefeProduktAttribute("krabbelmatte rund", eckigGrau);
    expect(grund).toContain("Form weicht ab: rund");
    expect(pruefeProduktAttribute("krabbelmatte rechteckig", eckigGrau)).toBeNull();
    expect(pruefeProduktAttribute("spielmatte quadratisch", eckigGrau)).toBeNull();
  });

  it("graue Matte: ‚krabbelmatte beige' fliegt raus, ‚hellgrau' bleibt (Farbfamilie)", () => {
    const grund = pruefeProduktAttribute("krabbelmatte beige", eckigGrau);
    expect(grund).toContain("Farbe weicht ab: beige");
    expect(pruefeProduktAttribute("krabbelmatte hellgrau", eckigGrau)).toBeNull();
  });

  it("ohne bekannte Produkt-Farbe/-Form filtern die Regeln NICHT (ehrlich passiv)", () => {
    const neutral = { attributText: "Krabbelmatte 200x150 cm", produktName: "Krabbelmatte", eigeneMarke: null };
    expect(pruefeProduktAttribute("krabbelmatte rund", neutral)).toBeNull();
    expect(pruefeProduktAttribute("krabbelmatte beige", neutral)).toBeNull();
  });

  it("Farbwörter matchen nur als ganzes Wort (kein Treffer IN Wörtern)", () => {
    const rotesProdukt = { attributText: "Teekanne rot", produktName: "Teekanne", eigeneMarke: null };
    expect(pruefeProduktAttribute("teekanne rotationsverschluss", rotesProdukt)).toBeNull();
  });

  it("buntes Produkt lässt alle Farben durch", () => {
    const bunt = { attributText: "Spielmatte bunt", produktName: "Spielmatte", eigeneMarke: null };
    expect(pruefeProduktAttribute("spielmatte grau", bunt)).toBeNull();
  });
});
