import { describe, expect, it } from "vitest";
import { assessableDims, enforceDeepAudit, istDeutsch, pruefeAuditBehauptungen, type DeepAuditInput } from "./deepAudit";
import type { DeepAuditPayload, ReviewInsightsPayload } from "@/db/schema";

const ri: ReviewInsightsPayload = {
  sources: [],
  stats: { reviewsTotal: 40, ratingAvg: 4.4 },
  painPoints: [{ label: "Dichtung undicht", frequencyPct: 30, mentionCount: 3, quotes: ["tropft"] }],
  buyingTriggers: [{ label: "hält kalt", frequencyPct: 60, mentionCount: 6, quotes: ["eiskalt"] }],
  languageToBorrow: ["eiskalt"],
  languageToAvoid: [],
};

const base: DeepAuditInput = {
  productName: "Testflasche",
  asin: "B0TESTD760",
  title: "Trinkflasche 1L Edelstahl",
  bullets: ["hält 24h kalt"],
  description: "",
  backendKeywords: "",
  imageCount: 5,
  basics: { reviewsTotal: 1343, ratingAvg: 4.6, dist: { "5": 70, "4": 15, "3": 6, "2": 3, "1": 6 } },
  priceEur: null,
  reviewInsights: ri,
  primaryKeywords: ["trinkflasche edelstahl"],
  topGaps: [],
};

describe("assessableDims — der Code bestimmt, was bewertbar ist", () => {
  it("nur schätzbare Dimensionen (D214): title/bullets/description/reviews", () => {
    const dims = assessableDims(base);
    expect([...dims].sort()).toEqual(["bullets", "reviews", "title"]); // base ohne description
  });

  it("Beschreibung kommt mit Daten dazu; backend/images/aplus/price NIE (nicht aus Scrape schätzbar, D214)", () => {
    const dims = assessableDims({ ...base, description: "Lange Beschreibung", backendKeywords: "kw1 kw2", priceEur: 29.9 });
    expect(dims.has("description")).toBe(true);
    expect(dims.has("backend")).toBe(false);
    expect(dims.has("images")).toBe(false);
    expect(dims.has("price")).toBe(false);
    expect(dims.has("aplus")).toBe(false);
  });
});

describe("enforceDeepAudit — LLM generiert, Code erzwingt", () => {
  it("erzeugt keine nicht-schätzbaren Dimensionen (D214: aplus/price/backend/images fliegen ganz raus)", () => {
    const dims = assessableDims(base);
    const out = enforceDeepAudit(
      {
        derived: { usps: ["hält 24h kalt"], zielgruppe: "Pendler", positionierung: "Arbeitstier" },
        dimensions: [
          { key: "title", label: "x", score10: 7, aktuell: "ok", probleme: [], empfehlung: "" },
          // LLM behauptet Bewertungen für A+/Preis — die dürfen gar nicht erst erscheinen:
          { key: "aplus", label: "x", score10: 9, aktuell: "erfunden", probleme: [], empfehlung: "" },
          { key: "price", label: "x", score10: 2, aktuell: "erfunden", probleme: [], empfehlung: "" },
        ],
        topActions: ["Titel schärfen"],
      },
      dims,
    );
    const keys = out.dimensions.map((d) => d.key);
    expect(keys).not.toContain("aplus");
    expect(keys).not.toContain("price");
    expect(keys).not.toContain("images");
    expect(keys).not.toContain("backend");
    expect(out.dimensions.find((d) => d.key === "title")!.score10).toBe(7);
  });

  it("klemmt Scores auf 0–10 und liefert die vier schätzbaren Dimensionen in fester Reihenfolge", () => {
    const out = enforceDeepAudit(
      { dimensions: [{ key: "title", label: "x", score10: 42, aktuell: "", probleme: [], empfehlung: "" }] },
      assessableDims(base),
    );
    expect(out.dimensions).toHaveLength(4);
    expect(out.dimensions.map((d) => d.key)).toEqual(["title", "bullets", "description", "reviews"]);
    expect(out.dimensions[0].score10).toBe(10);
  });

  it("bewertbare, aber unbewertete Dimensionen bleiben ehrlich ohne Score", () => {
    const out = enforceDeepAudit({ dimensions: [] }, assessableDims(base));
    const bullets = out.dimensions.find((d) => d.key === "bullets")!;
    expect(bullets.score10).toBeNull();
    expect(bullets.aktuell).toBe("Vom Modell nicht bewertet.");
  });

  it("Wahrheits-Filter (D126) — der Werkstattlampen-Fall: falsche Fehlt- und Sprach-Behauptungen fliegen", () => {
    const input: DeepAuditInput = {
      ...base,
      title: "Northpoint LED Arbeitslampe kabellos mit Magnet für Werkstatt und Camping",
      bullets: ["HELLES LICHT: 300 Lumen für Werkstatt, Keller und unterwegs. Batteriebetrieb mit 4x AA."],
      description: "Die kabellose LED-Arbeitslampe von Northpoint ist der zuverlässige Begleiter für Werkstatt, Garage und Camping. Dank der starken Magnete hält sie sicher an allen metallischen Flächen und leuchtet dunkle Ecken zuverlässig aus.",
    };
    const payload: DeepAuditPayload = {
      derived: { usps: [], zielgruppe: "", positionierung: "" },
      dimensions: [
        {
          key: "title", label: "Titel", score10: 7,
          aktuell: "Titel vorhanden.",
          probleme: [
            'Fehlende Anwendungs-Keywords wie „Camping" oder „Werkstatt"', // FALSCH — beide stehen im Titel
            'Keine Erwähnung von „Batteriebetrieb"', // steht in den Bullets — Cross-Sektion deckt ab
            'Das Haupt-Keyword „Taschenlampe" fehlt', // WAHR — steht nirgends, muss bleiben
          ],
          empfehlung: "",
        },
        {
          key: "description", label: "Beschreibung", score10: 5,
          aktuell: "Beschreibung vorhanden.",
          probleme: ["Text ist nicht auf Deutsch", "Zu wenige Absätze"], // erste Behauptung FALSCH
          empfehlung: "",
        },
      ],
      topActions: [],
    };
    const out = pruefeAuditBehauptungen(payload, input);
    const titel = out.dimensions.find((d) => d.key === "title")!;
    expect(titel.probleme).toEqual(['Das Haupt-Keyword „Taschenlampe" fehlt']);
    expect(titel.aktuell).toContain("entfernt");
    const beschr = out.dimensions.find((d) => d.key === "description")!;
    expect(beschr.probleme).toEqual(["Zu wenige Absätze"]);
  });

  it("istDeutsch: erkennt deutschen Text, urteilt nicht bei zu kurzem Text", () => {
    expect(istDeutsch("Die kabellose Arbeitslampe ist der zuverlässige Begleiter für die Werkstatt und den Keller.")).toBe(true);
    expect(istDeutsch("This is a fully English product description for a work light with magnets.")).toBe(false);
    expect(istDeutsch("kurz")).toBe(false);
  });

  it("Wahrheits-Filter lässt echte Befunde unangetastet", () => {
    const payload: DeepAuditPayload = {
      derived: { usps: [], zielgruppe: "", positionierung: "" },
      dimensions: [{ key: "title", label: "Titel", score10: 6, aktuell: "Ok.", probleme: ['„Edelstahl" fehlt im Titel'], empfehlung: "" }],
      topActions: [],
    };
    const out = pruefeAuditBehauptungen(payload, base); // base-Titel enthält Edelstahl!
    expect(out.dimensions.find((d) => d.key === "title")!.probleme).toEqual([]);
    const out2 = pruefeAuditBehauptungen(payload, { ...base, title: "Trinkflasche 1L Glas" });
    expect(out2.dimensions.find((d) => d.key === "title")!.probleme).toHaveLength(1);
  });

  it("begrenzt Listen (USPs ≤ 6, topActions ≤ 5, Probleme ≤ 4)", () => {
    const many = Array.from({ length: 10 }, (_, i) => `Punkt ${i}`);
    const out = enforceDeepAudit(
      {
        derived: { usps: many, zielgruppe: "z", positionierung: "p" },
        dimensions: [{ key: "title", label: "x", score10: 5, aktuell: "a", probleme: many, empfehlung: "e" }],
        topActions: many,
      },
      assessableDims(base),
    );
    expect(out.derived.usps).toHaveLength(6);
    expect(out.topActions).toHaveLength(5);
    expect(out.dimensions.find((d) => d.key === "title")!.probleme).toHaveLength(4);
  });
});
