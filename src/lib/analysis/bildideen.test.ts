import { describe, expect, it } from "vitest";
import { pruefeBildIdeen } from "./bildideen";

/** D134: Bild-Ideen unterliegen den Wahrheits-Regeln — deterministisch geprüft. */
describe("pruefeBildIdeen", () => {
  const OHNE_BELEG = "Ergänzungsfuttermittel für Hunde. Ulmenrinde, Heilmoor, Fenchel. 30 ml Tropfen.";
  const MIT_TIERARZT = OHNE_BELEG + " Die Rezeptur wurde von Tierärzten entwickelt.";

  it("entfernt das erfundene Tierarzt-Zitat aus der Referenz-Sichtung", () => {
    const { zulaessig, entfernt } = pruefeBildIdeen(
      ["Eine Grafik mit einem Zitat eines Tierarztes, der die Vorteile hervorhebt."],
      OHNE_BELEG,
    );
    expect(zulaessig).toEqual([]);
    expect(entfernt).toHaveLength(1);
    expect(entfernt[0].grund).toContain("nicht belegt");
  });

  it("erlaubt die Tierarzt-Idee, wenn die Produkt-Wahrheit sie belegt", () => {
    const { zulaessig, entfernt } = pruefeBildIdeen(
      ["Siegel mit der Aufschrift Von Tierärzten entwickelt auf dem Hauptproduktbild."],
      MIT_TIERARZT,
    );
    expect(entfernt).toEqual([]);
    expect(zulaessig).toHaveLength(1);
  });

  it("entfernt Siegel/Zertifikat ohne Beleg", () => {
    const { zulaessig, entfernt } = pruefeBildIdeen(
      ["Ein goldenes Gütesiegel prominent platzieren.", "Nahaufnahme der Tropfen mit Etikett."],
      OHNE_BELEG,
    );
    expect(zulaessig).toEqual(["Nahaufnahme der Tropfen mit Etikett."]);
    expect(entfernt[0].grund).toContain("Siegel");
  });

  it("erlaubt Siegel, wenn Zertifikate in der Produkt-Wahrheit stehen", () => {
    const { entfernt } = pruefeBildIdeen(
      ["GMP-Siegel dezent im Eckbereich zeigen."],
      OHNE_BELEG + " Zertifikate: GMP-zertifizierte Herstellung.",
    );
    expect(entfernt).toEqual([]);
  });

  it("normale Ideen (Vorher/Nachher, Infografik, GIF) passieren ungefiltert", () => {
    const ideen = [
      "Vorher/Nachher-Grafik: Hund frisst kein Gras mehr.",
      "Infografik mit Icons der drei Hauptprobleme.",
      "Kurzes GIF: Hund nimmt die Tropfen als Leckerli.",
    ];
    const { zulaessig, entfernt } = pruefeBildIdeen(ideen, OHNE_BELEG);
    expect(zulaessig).toEqual(ideen);
    expect(entfernt).toEqual([]);
  });

  it("Autoritäts-Wort OHNE Behauptungs-Kontext bleibt zulässig (z. B. Szene beim Tierarzt-Besuch sparen)", () => {
    const { zulaessig } = pruefeBildIdeen(
      ["Grafik: Kosten pro Tag im Vergleich zu einem Tierarzt-Besuch."],
      OHNE_BELEG,
    );
    expect(zulaessig).toHaveLength(1);
  });
});
