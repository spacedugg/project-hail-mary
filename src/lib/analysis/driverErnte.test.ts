import { describe, it, expect } from "vitest";
import { normalisiereKandidaten } from "./driverErnte";

/**
 * Die Ernte darf keine Quelle behaupten, die sie nicht bekommen hat (D133), und
 * kein Zitat, das im Quelltext nicht steht. Der Code stempelt die erlaubten
 * Quellen je Lauf — das LLM kann sie nicht wählen.
 */
const LISTING = "Elektrisch höhenverstellbarer Schreibtisch mit 2 Hochleistungsmotoren (≤55 dB) und 3 Speicherplätzen.";

const kandidat = (belege: Array<{ quelle: string; fundstelle: string; ref?: string }>, extra: Record<string, unknown> = {}) => ({
  driver: [
    {
      resultat: "Ohne Rückenbeschwerden durch den Arbeitstag",
      motivKlasse: "kern",
      motivBegruendung: "Kaufgrund der Kategorie",
      bausteine: [{ nutzen: "Sitzen und Stehen im Wechsel", features: ["stufenlose Höhe"], belege, ...extra }],
    },
  ],
});

describe("Ernte-Normalisierung (D265)", () => {
  it("nimmt einen verifizierten Beleg an", () => {
    const r = normalisiereKandidaten(kandidat([{ quelle: "listing", fundstelle: "3 Speicherplätzen" }]), ["listing"], { listing: LISTING });
    expect(r.kandidaten).toHaveLength(1);
    expect(r.kandidaten[0].bausteine[0].belege[0].quelle).toBe("listing");
    expect(r.kandidaten[0].motivKlasse).toBe("kern");
  });

  it("weist ein Zitat ab, das im Quelltext nicht steht", () => {
    const r = normalisiereKandidaten(kandidat([{ quelle: "listing", fundstelle: "TÜV-geprüft in Deutschland" }]), ["listing"], { listing: LISTING });
    expect(r.kandidaten).toHaveLength(0);
    expect(r.verworfen).toBe(1);
  });

  it("weist eine Quelle ab, die dieser Lauf nicht bekommen hat", () => {
    const r = normalisiereKandidaten(
      kandidat([{ quelle: "wettbewerber_listing", fundstelle: "3 Speicherplätzen", ref: "B0X" }]),
      ["listing"],
      { listing: LISTING },
    );
    expect(r.kandidaten).toHaveLength(0);
    expect(r.verworfen).toBe(1);
  });

  it("erfundene Quellen-Namen fliegen", () => {
    const r = normalisiereKandidaten(kandidat([{ quelle: "bauchgefuehl", fundstelle: "3 Speicherplätzen" }]), ["listing"], { listing: LISTING });
    expect(r.verworfen).toBe(1);
  });

  it("Kategorie-Belege brauchen kein Zitat — sie sind Produktart-Wissen", () => {
    const r = normalisiereKandidaten(
      kandidat([{ quelle: "kategorie", fundstelle: "höhenverstellbarer Schreibtisch" }]),
      ["listing", "kategorie"],
      { listing: LISTING },
    );
    expect(r.kandidaten).toHaveLength(1);
  });

  it("Review-Labels werden hier nicht verbatim geprüft (das macht der Aufbau gegen die Aspekte)", () => {
    const r = normalisiereKandidaten(kandidat([{ quelle: "reviews_eigene", fundstelle: "Motor angenehm leise" }]), ["reviews_eigene"], {});
    expect(r.kandidaten).toHaveLength(1);
  });

  it("Hygienefaktoren kommen durch — der Code sortiert sie später aus und weist sie aus", () => {
    const roh = kandidat([{ quelle: "listing", fundstelle: "3 Speicherplätzen" }]);
    roh.driver[0].motivKlasse = "hygiene";
    const r = normalisiereKandidaten(roh, ["listing"], { listing: LISTING });
    expect(r.kandidaten[0].motivKlasse).toBe("hygiene");
  });

  it("unbekannte Motiv-Klasse fliegt", () => {
    const roh = kandidat([{ quelle: "listing", fundstelle: "3 Speicherplätzen" }]);
    roh.driver[0].motivKlasse = "wichtig";
    expect(normalisiereKandidaten(roh, ["listing"], { listing: LISTING }).verworfen).toBe(1);
  });

  it("entdoppelt gleiche Belege und deckelt Features", () => {
    const r = normalisiereKandidaten(
      kandidat(
        [
          { quelle: "listing", fundstelle: "3 Speicherplätzen" },
          { quelle: "listing", fundstelle: "3 SPEICHERPLÄTZEN" },
        ],
        { features: ["a", "b", "c", "d", "e", "f", "g", "h"] },
      ),
      ["listing"],
      { listing: LISTING },
    );
    expect(r.kandidaten[0].bausteine[0].belege).toHaveLength(1);
    expect(r.kandidaten[0].bausteine[0].features).toHaveLength(6);
  });

  it("kaputte Antworten werfen nicht", () => {
    const mitNullBelegen = { driver: [{ resultat: "x", motivKlasse: "kern", bausteine: [null, { nutzen: "y", belege: [null] }] }] };
    for (const roh of [null, {}, { driver: "nein" }, { driver: [null] }, { driver: [{ resultat: "x" }] }, mitNullBelegen])
      expect(() => normalisiereKandidaten(roh, ["listing"], {})).not.toThrow();
    expect(normalisiereKandidaten({ driver: [{ resultat: "x", motivKlasse: "kern" }] }, ["listing"], {}).verworfen).toBe(1);
  });
});
