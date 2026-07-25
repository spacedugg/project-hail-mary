import { describe, it, expect } from "vitest";
import { freigabeStand, type FreigabeEingabe } from "./freigabestand";

const T1 = new Date("2026-07-21T10:00:00Z");
const T2 = new Date("2026-07-22T10:00:00Z");

const basis: FreigabeEingabe = {
  hatInhalt: true,
  versionId: "v2",
  freigegeben: true,
  sentToClientAt: null,
  kundenFeedback: [],
};

describe("Freigabe-Kette", () => {
  it("leerer Platz", () => {
    expect(freigabeStand({ ...basis, hatInhalt: false }).stufe).toBe("leer");
  });

  it("Entwurf wartet auf interne Abnahme", () => {
    expect(freigabeStand({ ...basis, freigegeben: false }).stufe).toBe("entwurf");
  });

  it("intern abgenommen, noch nicht beim Kunden", () => {
    const s = freigabeStand(basis);
    expect(s.stufe).toBe("intern");
    expect(s.abgesichert).toBe(false);
  });

  it("beim Kunden, solange keine Rückmeldung da ist", () => {
    expect(freigabeStand({ ...basis, sentToClientAt: T1 }).stufe).toBe("beim_kunden");
  });

  it("vom Kunden freigegeben zählt als abgesichert", () => {
    const s = freigabeStand({
      ...basis,
      sentToClientAt: T1,
      kundenFeedback: [{ art: "freigabe", status: "offen", versionId: "v2", createdAt: T2 }],
    });
    expect(s.stufe).toBe("kunde_frei");
    expect(s.abgesichert).toBe(true);
  });

  it("die jüngste Kundenaussage gewinnt — erst Änderung, dann Freigabe", () => {
    const s = freigabeStand({
      ...basis,
      kundenFeedback: [
        { art: "aenderung", status: "offen", versionId: "v2", createdAt: T1 },
        { art: "freigabe", status: "offen", versionId: "v2", createdAt: T2 }, // später → gilt
      ],
    });
    expect(s.stufe).toBe("kunde_frei");
  });

  it("die jüngste Kundenaussage gewinnt — erst Freigabe, dann Änderung", () => {
    const s = freigabeStand({
      ...basis,
      kundenFeedback: [
        { art: "freigabe", status: "erledigt", versionId: "v2", createdAt: T1 },
        { art: "aenderung", status: "offen", versionId: "v2", createdAt: T2 }, // später → gilt
      ],
    });
    expect(s.stufe).toBe("kunde_aenderung");
    expect(s.abgesichert).toBe(false);
  });

  it("KRITISCH: Zustimmung zu einer ALTEN Version zählt nicht mehr", () => {
    const s = freigabeStand({
      ...basis,
      versionId: "v3",
      kundenFeedback: [{ art: "freigabe", status: "erledigt", versionId: "v2", createdAt: T1 }],
    });
    expect(s.stufe).toBe("intern");
    expect(s.abgesichert).toBe(false);
  });

  it("KRITISCH: versionslose Freigabe schlägt NICHT auf versionierten Text durch", () => {
    // Das war der Leak: Freigabe ohne Versionsbezug erbte jede neue Version.
    const s = freigabeStand({
      ...basis,
      versionId: "v2",
      kundenFeedback: [{ art: "freigabe", status: "offen", versionId: null, createdAt: T1 }],
    });
    expect(s.stufe).toBe("intern");
    expect(s.abgesichert).toBe(false);
  });

  it("versionsloses Feedback zählt für versionslosen Inhalt (Bild/Bestand)", () => {
    const s = freigabeStand({
      ...basis,
      versionId: null, // z. B. ein Bild-Piece
      kundenFeedback: [{ art: "freigabe", status: "offen", versionId: null, createdAt: T1 }],
    });
    expect(s.stufe).toBe("kunde_frei");
  });

  it("ignoriert Kommentare — nur Freigabe/Änderung schalten die Kette", () => {
    const s = freigabeStand({
      ...basis,
      sentToClientAt: T1,
      kundenFeedback: [{ art: "kommentar", status: "offen", versionId: "v2", createdAt: T2 }],
    });
    expect(s.stufe).toBe("beim_kunden");
  });
});
