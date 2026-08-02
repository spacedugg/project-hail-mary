import { describe, it, expect } from "vitest";
import { kanalTexte, normalisiereTreffer, verschmelzeAbdeckung, type SemantischerTreffer } from "./semantischeAbdeckung";
import type { FeatureQuellen } from "@/lib/analysis/featureRanking";
import type { KanalTreffer } from "@/lib/analysis/abdeckung";

/**
 * Semantische Abdeckung (D281, Nutzer-Vorgabe 02.08.2026: „Wortvergleiche sind
 * totaler Quatsch, du musst das inhaltlich verstehen").
 *
 * Der Referenz-Fall: Im Listing steht „Bogen-Design, präzise Sonnenausrichtung",
 * der Nutzen heißt „Effiziente Wärmeaufnahme durch optimale Ausrichtung zur
 * Sonne". Der Wortstamm-Abgleich meldet FEHLT und erzeugt einen Blocker für
 * etwas, das dasteht. Das Modell erkennt es — darf es aber nur behaupten, wenn
 * es ein wörtliches Zitat liefert, das der Code im Text wiederfindet.
 */

const QUELLEN: FeatureQuellen = {
  title: "Solarheizung für Pool mit Bogen-Design",
  bullets: ["Präzise Sonnenausrichtung für maximalen Ertrag", "Einfache Montage ohne Werkzeug"],
  description: "Die gewölbte Bauform folgt dem Sonnenstand.",
  attributes: null,
  importantInfo: null,
  aplusContent: null,
  bilder: null,
};

const NUTZEN = ["Effiziente Wärmeaufnahme durch optimale Ausrichtung zur Sonne"];
const texte = kanalTexte(QUELLEN);

describe("Verbatim-Gate — das Modell darf erkennen, nicht behaupten (D281)", () => {
  it("nimmt einen Treffer an, dessen Zitat wirklich im Kanal steht", () => {
    const { treffer, verworfen } = normalisiereTreffer(
      { treffer: [{ nutzen: NUTZEN[0], kanal: "bullets", zitat: "Präzise Sonnenausrichtung für maximalen Ertrag" }] },
      texte,
      NUTZEN,
    );
    expect(verworfen).toBe(0);
    expect(treffer).toHaveLength(1);
    expect(treffer[0].kanal).toBe("bullets");
  });

  it("verwirft ein paraphrasiertes Zitat — genau das ist die Halluzinations-Bremse", () => {
    const { treffer, verworfen } = normalisiereTreffer(
      { treffer: [{ nutzen: NUTZEN[0], kanal: "bullets", zitat: "das Produkt richtet sich zur Sonne aus" }] },
      texte,
      NUTZEN,
    );
    expect(treffer).toHaveLength(0);
    expect(verworfen).toBe(1);
  });

  it("verwirft ein Zitat, das im FALSCHEN Kanal verortet wird", () => {
    // Der Satz steht in den Bullets, nicht im Titel.
    const { treffer, verworfen } = normalisiereTreffer(
      { treffer: [{ nutzen: NUTZEN[0], kanal: "title", zitat: "Präzise Sonnenausrichtung" }] },
      texte,
      NUTZEN,
    );
    expect(treffer).toHaveLength(0);
    expect(verworfen).toBe(1);
  });

  it("verwirft erfundene Nutzen und unbekannte Kanäle", () => {
    const { verworfen } = normalisiereTreffer(
      {
        treffer: [
          { nutzen: "Nutzen, den niemand geprüft hat", kanal: "bullets", zitat: "Einfache Montage ohne Werkzeug" },
          { nutzen: NUTZEN[0], kanal: "erfundener_kanal", zitat: "Einfache Montage ohne Werkzeug" },
        ],
      },
      texte,
      NUTZEN,
    );
    expect(verworfen).toBe(2);
  });

  it("Groß-/Kleinschreibung und Umlaute stehen einem echten Treffer nicht im Weg", () => {
    const { treffer } = normalisiereTreffer(
      { treffer: [{ nutzen: NUTZEN[0], kanal: "description", zitat: "GEWÖLBTE BAUFORM folgt dem Sonnenstand" }] },
      texte,
      NUTZEN,
    );
    expect(treffer).toHaveLength(1);
  });

  it("je Nutzen und Kanal bleibt genau ein Treffer", () => {
    const { treffer } = normalisiereTreffer(
      {
        treffer: [
          { nutzen: NUTZEN[0], kanal: "bullets", zitat: "Präzise Sonnenausrichtung" },
          { nutzen: NUTZEN[0], kanal: "bullets", zitat: "für maximalen Ertrag" },
        ],
      },
      texte,
      NUTZEN,
    );
    expect(treffer).toHaveLength(1);
  });
});

describe("Verschmelzen ist additiv — die Prüfung erzeugt nie eine Lücke (D281)", () => {
  const semantisch: SemantischerTreffer[] = [
    { nutzen: NUTZEN[0], kanal: "bullets", zitat: "Präzise Sonnenausrichtung" },
  ];

  it("löst eine falsche Lücke auf: fehlt → erwähnt", () => {
    const roh: KanalTreffer[] = [{ kanal: "bullets", stufe: "fehlt", treffer: [] }];
    const neu = verschmelzeAbdeckung(roh, semantisch);
    expect(neu[0].stufe).toBe("erwaehnt");
    expect(neu[0].treffer).toContain("Präzise Sonnenausrichtung");
  });

  it("stuft einen bereits prominenten Kanal NIEMALS ab", () => {
    const roh: KanalTreffer[] = [{ kanal: "bullets", stufe: "prominent", treffer: ["sonnenausrichtung"] }];
    expect(verschmelzeAbdeckung(roh, semantisch)[0].stufe).toBe("prominent");
  });

  it("ein Titel-Treffer gilt als prominent", () => {
    const roh: KanalTreffer[] = [{ kanal: "title", stufe: "fehlt", treffer: [] }];
    const neu = verschmelzeAbdeckung(roh, [{ nutzen: NUTZEN[0], kanal: "title", zitat: "Solarheizung für Pool" }]);
    expect(neu[0].stufe).toBe("prominent");
  });

  it("ohne semantische Treffer bleibt alles unverändert", () => {
    const roh: KanalTreffer[] = [{ kanal: "bullets", stufe: "fehlt", treffer: [] }];
    expect(verschmelzeAbdeckung(roh, [])).toEqual(roh);
  });
});
