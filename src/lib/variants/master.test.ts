import { describe, it, expect } from "vitest";
import {
  zerlegeInSlots,
  wendeKlassifikationAn,
  wendeMasterAn,
  fuelleTokens,
  pruefeMaster,
  pruefeLockedKonsistenz,
  type ContentMaster,
  type MasterContent,
  type SlotRegenerator,
} from "./master";

/**
 * Content-Master-Engine (D221). Getestet wird der deterministische Kern:
 * Zerlegung/Token-Erkennung, Einsetzen, Wiederzusammenbau, Kontrakt,
 * Cross-Child-Konsistenz. Das LLM (Klassifikation/Regenerierung) ist eine
 * injizierte, hier gemockte Nahtstelle.
 */

const baseContent: MasterContent = {
  title: "Freaky Joe Erdbeere 500 g Zuckerfrei",
  bullets: [
    "Zuckerfrei und vegan — ohne künstliche Süßstoffe.",
    "Fruchtig-süßer Erdbeergeschmack für jeden Tag.",
    "Perfekt zum Anmischen mit Wasser.",
  ],
  description: "Freaky Joe Erdbeere versorgt dich mit Elektrolyten.\n\nEinfach in Wasser einrühren.",
};

describe("zerlegeInSlots", () => {
  const slots = zerlegeInSlots(baseContent, { flavor: "Erdbeere" }, ["flavor"]);

  it("erkennt freistehende Achsenwerte als token und ersetzt sie durch {{achse}}", () => {
    const title = slots.find((s) => s.id === "title")!;
    expect(title.kind).toBe("token");
    expect(title.template).toBe("Freaky Joe {{flavor}} 500 g Zuckerfrei");
    expect(title.achsen).toEqual(["flavor"]);
  });

  it("lässt Slots ohne Achsenwert locked", () => {
    const b1 = slots.find((s) => s.id === "bullet.1")!;
    expect(b1.kind).toBe("locked");
    expect(b1.achsen).toEqual([]);
  });

  it("fasst Erdbeergeschmack NICHT an (kein Wortende) -> bleibt locked-Kandidat fuers LLM", () => {
    const b2 = slots.find((s) => s.id === "bullet.2")!;
    expect(b2.template).toContain("Erdbeergeschmack");
    expect(b2.kind).toBe("locked");
  });

  it("zerlegt die Beschreibung in Absätze", () => {
    const descSlots = slots.filter((s) => s.quelle === "description");
    expect(descSlots.map((s) => s.id)).toEqual(["desc.1", "desc.2"]);
    expect(descSlots[0].kind).toBe("token"); // „Erdbeere" freistehend
  });
});

describe("wendeKlassifikationAn", () => {
  it("hebt genannte Slots auf regenerate und erbt bei fehlender Achse das theme", () => {
    const slots = zerlegeInSlots(baseContent, { flavor: "Erdbeere" }, ["flavor"]);
    const nachher = wendeKlassifikationAn(slots, ["bullet.2"], ["flavor"]);
    const b2 = nachher.find((s) => s.id === "bullet.2")!;
    expect(b2.kind).toBe("regenerate");
    expect(b2.achsen).toEqual(["flavor"]); // war locked (keine Achse) → erbt theme
  });
});

describe("fuelleTokens", () => {
  it("setzt bekannte Achsenwerte ein, lässt unbekannte Platzhalter stehen", () => {
    expect(fuelleTokens("Freaky Joe {{flavor}} 500 g", { flavor: "Kiwi" })).toBe("Freaky Joe Kiwi 500 g");
    expect(fuelleTokens("{{unbekannt}}", { flavor: "Kiwi" })).toBe("{{unbekannt}}");
  });
});

describe("wendeMasterAn", () => {
  // Master: Titel token, b1 locked, b2 regenerate, Rest wie zerlegt.
  const roh = zerlegeInSlots(baseContent, { flavor: "Erdbeere" }, ["flavor"]);
  const slots = wendeKlassifikationAn(roh, ["bullet.2"], ["flavor"]);
  const master: ContentMaster = { baseChildAsin: "B001", theme: ["flavor"], slots };

  const regenerate: SlotRegenerator = async (slot, axis) => `Fruchtiger ${axis.flavor}-Genuss (${slot.id}).`;

  it("kopiert locked wortgleich, tauscht token per Code, ruft LLM nur für regenerate", async () => {
    const { content } = await wendeMasterAn(master, { flavor: "Kiwi" }, regenerate);
    expect(content.title).toBe("Freaky Joe Kiwi 500 g Zuckerfrei"); // token-Tausch
    expect(content.bullets[0]).toBe("Zuckerfrei und vegan — ohne künstliche Süßstoffe."); // locked
    expect(content.bullets[1]).toBe("Fruchtiger Kiwi-Genuss (bullet.2)."); // regenerate
    expect(content.description).toBe("Freaky Joe Kiwi versorgt dich mit Elektrolyten.\n\nEinfach in Wasser einrühren.");
  });

  it("ruft den Regenerator NUR für regenerate-Slots auf", async () => {
    const aufgerufen: string[] = [];
    const zaehl: SlotRegenerator = async (slot) => {
      aufgerufen.push(slot.id);
      return "neu";
    };
    await wendeMasterAn(master, { flavor: "Kiwi" }, zaehl);
    expect(aufgerufen).toEqual(["bullet.2"]);
  });
});

describe("pruefeMaster (Kontrakt D183)", () => {
  const roh = zerlegeInSlots(baseContent, { flavor: "Erdbeere" }, ["flavor"]);
  const valid: ContentMaster = {
    baseChildAsin: "B001",
    theme: ["flavor"],
    slots: wendeKlassifikationAn(roh, ["bullet.2"], ["flavor"]),
  };

  it("akzeptiert einen sauber abgeleiteten Master", () => {
    expect(pruefeMaster(valid)).toEqual([]);
  });

  it("weist locked-Slot mit Platzhalter ab", () => {
    const kaputt: ContentMaster = {
      ...valid,
      slots: [{ id: "x", quelle: "title", index: 0, kind: "locked", template: "hat {{flavor}}", achsen: [] }],
    };
    expect(pruefeMaster(kaputt).some((v) => v.feld === "slots[0]")).toBe(true);
  });

  it("weist token-Slot ohne Platzhalter ab", () => {
    const kaputt: ContentMaster = {
      ...valid,
      slots: [{ id: "x", quelle: "title", index: 0, kind: "token", template: "kein token", achsen: ["flavor"] }],
    };
    expect(pruefeMaster(kaputt).some((v) => v.feld === "slots[0]")).toBe(true);
  });

  it("weist Achse ab, die nicht im theme steht", () => {
    const kaputt: ContentMaster = {
      ...valid,
      slots: [{ id: "x", quelle: "title", index: 0, kind: "token", template: "{{size}}", achsen: ["size"] }],
    };
    expect(pruefeMaster(kaputt).some((v) => v.feld === "slots[0].achsen")).toBe(true);
  });

  it("weist doppelte Slot-ID ab", () => {
    const s = { id: "dup", quelle: "bullet" as const, index: 1, kind: "locked" as const, template: "a", achsen: [] };
    expect(pruefeMaster({ ...valid, slots: [s, { ...s }] }).some((v) => v.feld === "slots[1].id")).toBe(true);
  });
});

describe("pruefeLockedKonsistenz (Cross-Child-Gate D221)", () => {
  const master: ContentMaster = {
    baseChildAsin: "B001",
    theme: ["flavor"],
    slots: [
      { id: "title", quelle: "title", index: 0, kind: "token", template: "{{flavor}}", achsen: ["flavor"] },
      { id: "bullet.1", quelle: "bullet", index: 1, kind: "locked", template: "Zuckerfrei und vegan.", achsen: [] },
    ],
  };

  it("ist grün, wenn alle Childs den locked-Slot byte-identisch tragen", () => {
    const issues = pruefeLockedKonsistenz(master, [
      { asin: "B001", slots: [{ id: "bullet.1", quelle: "bullet", index: 1, kind: "locked", text: "Zuckerfrei und vegan." }] },
      { asin: "B002", slots: [{ id: "bullet.1", quelle: "bullet", index: 1, kind: "locked", text: "Zuckerfrei und vegan." }] },
    ]);
    expect(issues).toEqual([]);
  });

  it("schlägt an, wenn ein Child im locked-Slot abweicht (zuckerfrei fehlt)", () => {
    const issues = pruefeLockedKonsistenz(master, [
      { asin: "B002", slots: [{ id: "bullet.1", quelle: "bullet", index: 1, kind: "locked", text: "Nur vegan." }] },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0].rule).toBe("familie.locked-konsistent");
    expect(issues[0].evidence).toBe("deterministic");
  });

  it("schlägt an, wenn der locked-Slot in einem Child ganz fehlt", () => {
    const issues = pruefeLockedKonsistenz(master, [{ asin: "B003", slots: [] }]);
    expect(issues[0].message).toContain("fehlt");
  });

  it("erkennt NFC/NFD-gleiche Texte als konsistent (kein Falsch-Positiv)", () => {
    const nfc = "vegan grün"; // präkomponiert
    const nfd = "vegan grün".normalize("NFD"); // dekomponiert, gleicher Text
    const m: ContentMaster = {
      baseChildAsin: "B001",
      theme: ["flavor"],
      slots: [{ id: "b1", quelle: "bullet", index: 1, kind: "locked", template: nfc, achsen: [] }],
    };
    const issues = pruefeLockedKonsistenz(m, [
      { asin: "B002", slots: [{ id: "b1", quelle: "bullet", index: 1, kind: "locked", text: nfd }] },
    ]);
    expect(issues).toEqual([]);
  });
});

describe("Wortgrenzen & Token-Erkennung (deterministisch)", () => {
  const titelSlot = (title: string, axisValues: Record<string, string>, theme: string[]) =>
    zerlegeInSlots({ title, bullets: [], description: "x" }, axisValues, theme).find((s) => s.id === "title")!;

  it("ersetzt einen freistehenden Achsenwert durch den Platzhalter", () => {
    const s = titelSlot("Erdbeer 500 g", { flavor: "Erdbeer" }, ["flavor"]);
    expect(s.kind).toBe("token");
    expect(s.template).toBe("{{flavor}} 500 g");
  });

  it("laesst einen Wert, der Praefix eines laengeren Wortes ist, locked (Erdbeer in Erdbeergeschmack)", () => {
    const s = titelSlot("Erdbeergeschmack pur", { flavor: "Erdbeer" }, ["flavor"]);
    expect(s.kind).toBe("locked");
    expect(s.template).toBe("Erdbeergeschmack pur");
  });

  it("matcht einen Zahlenwert NICHT innerhalb einer laengeren Zahl (500 g nicht in 1500 g)", () => {
    expect(titelSlot("1500 g Beutel", { size: "500 g" }, ["size"]).kind).toBe("locked");
  });

  it("matcht einen freistehenden Zahlenwert (500 g)", () => {
    const s = titelSlot("500 g Beutel", { size: "500 g" }, ["size"]);
    expect(s.kind).toBe("token");
    expect(s.template).toBe("{{size}} Beutel");
  });

  it("behandelt Regex-Metazeichen im Wert literal (A+B)", () => {
    expect(titelSlot("Sorte A+B extra", { flavor: "A+B" }, ["flavor"]).template).toBe("Sorte {{flavor}} extra");
  });

  it("schuetzt vor Teilwort-Treffer bei Farben (Rot nicht in Dunkelrot)", () => {
    expect(titelSlot("Dunkelrot Shirt", { color: "Rot" }, ["color"]).kind).toBe("locked");
  });
});

describe("Round-Trip", () => {
  it("wendeMasterAn mit den Base-Achsenwerten reproduziert den Base-Content byte-genau", async () => {
    const slots = zerlegeInSlots(baseContent, { flavor: "Erdbeere" }, ["flavor"]);
    const master: ContentMaster = { baseChildAsin: "B001", theme: ["flavor"], slots };
    const nie: SlotRegenerator = async () => {
      throw new Error("regenerate darf hier nicht aufgerufen werden (keine regenerate-Slots)");
    };
    const { content } = await wendeMasterAn(master, { flavor: "Erdbeere" }, nie);
    expect(content.title).toBe(baseContent.title);
    expect(content.bullets).toEqual(baseContent.bullets);
    expect(content.description).toBe(baseContent.description);
  });
});

describe("pruefeMaster — Platzhalter-Namen (HIGH-Fix)", () => {
  it("weist token-Slot mit Platzhalter ausserhalb des theme ab ({{groesse}})", () => {
    const kaputt: ContentMaster = {
      baseChildAsin: "B001",
      theme: ["flavor"],
      slots: [{ id: "x", quelle: "title", index: 0, kind: "token", template: "Nimm {{groesse}}", achsen: ["flavor"] }],
    };
    expect(pruefeMaster(kaputt).some((v) => v.feld === "slots[0].template")).toBe(true);
  });

  it("weist Platzhalter ab, der im theme steht, aber nicht in achsen deklariert ist", () => {
    const kaputt: ContentMaster = {
      baseChildAsin: "B001",
      theme: ["flavor", "size"],
      slots: [{ id: "x", quelle: "title", index: 0, kind: "token", template: "{{flavor}} {{size}}", achsen: ["flavor"] }],
    };
    expect(pruefeMaster(kaputt).some((v) => v.feld === "slots[0].achsen")).toBe(true);
  });
});
