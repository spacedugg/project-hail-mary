import { describe, expect, it } from "vitest";
import { AUDIT_DIMENSIONEN, auditBilder, normalisiereBildAudit, schwaechstesBildProFaktor } from "./bildAudit";

/** D211: Bild-Audit — Struktur erzwungen, Scores geklemmt, nichts geraten. */
describe("normalisiereBildAudit", () => {
  it("klemmt Scores auf 0–5, füllt fehlende Faktoren, dedupliziert, sortiert", () => {
    const res = normalisiereBildAudit(
      {
        bilder: [
          { slot: 2, faktoren: { design: { score: 9, wasWirSehen: " überladen ", warum: "x", wieBesser: "y" } } },
          { slot: 1, faktoren: { design: { score: 3 }, message: { score: 3.44 }, clarity: { score: 4 } } },
          { slot: 1, faktoren: {} }, // Duplikat → verworfen
          { slot: 99, faktoren: {} }, // ungültiger Slot → verworfen
        ],
      },
      7,
    );
    expect(res.bilder.map((b) => b.slot)).toEqual([1, 2]); // dedupliziert + sortiert
    // Score-Klemmung + Rundung
    expect(res.bilder[0].faktoren.message.score).toBe(3.4);
    expect(res.bilder[1].faktoren.design.score).toBe(5); // 9 → 5
    expect(res.bilder[1].faktoren.design.wasWirSehen).toBe("überladen"); // getrimmt
    // Alle drei Faktoren immer vorhanden; fehlende → null-Score, nicht geraten
    for (const b of res.bilder) expect(Object.keys(b.faktoren).sort()).toEqual([...AUDIT_DIMENSIONEN].sort());
    expect(res.bilder[0].faktoren.clarity.score).toBe(4); // Slot 1 (Index 0) hatte alle drei
    expect(res.bilder[1].faktoren.message.score).toBeNull(); // Slot 2 (Index 1): fehlte → null
  });

  it("kaputte Antwort → leer, nichts geraten", () => {
    expect(normalisiereBildAudit({ bilder: "quatsch" }, 5)).toEqual({ bilder: [] });
    expect(normalisiereBildAudit(null, 5)).toEqual({ bilder: [] });
  });

  it("schwaechstesBildProFaktor findet je Faktor das Minimum, ignoriert null", () => {
    const audit = normalisiereBildAudit(
      {
        bilder: [
          { slot: 1, faktoren: { design: { score: 4 }, message: { score: 2 }, clarity: { score: 5 } } },
          { slot: 2, faktoren: { design: { score: 3 }, message: { score: 4 }, clarity: { score: 5 } } },
        ],
      },
      7,
    );
    const min = schwaechstesBildProFaktor(audit);
    expect(min.design).toEqual({ slot: 2, score: 3 });
    expect(min.message).toEqual({ slot: 1, score: 2 });
  });
});

describe("auditBilder — ehrlich ohne Key", () => {
  it("ohne ANTHROPIC_API_KEY: null statt Mock (erfundene Noten wären Gift)", async () => {
    expect(await auditBilder(["https://m.media-amazon.com/images/I/x.jpg"])).toBeNull();
  });
  it("ohne Bilder: null", async () => {
    expect(await auditBilder([])).toBeNull();
  });
});
