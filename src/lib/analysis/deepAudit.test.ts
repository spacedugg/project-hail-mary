import { describe, expect, it } from "vitest";
import { assessableDims, enforceDeepAudit, type DeepAuditInput } from "./deepAudit";
import type { ReviewInsightsPayload } from "@/db/schema";

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
  it("nur Dimensionen mit Daten; aplus nie", () => {
    const dims = assessableDims(base);
    expect([...dims].sort()).toEqual(["bullets", "images", "reviews", "title"]);
  });

  it("Beschreibung/Backend/Preis kommen mit Daten dazu", () => {
    const dims = assessableDims({ ...base, description: "Lange Beschreibung", backendKeywords: "kw1 kw2", priceEur: 29.9 });
    expect(dims.has("description")).toBe(true);
    expect(dims.has("backend")).toBe(true);
    expect(dims.has("price")).toBe(true);
    expect(dims.has("aplus")).toBe(false);
  });
});

describe("enforceDeepAudit — LLM generiert, Code erzwingt", () => {
  it("verwirft Scores für nicht bewertbare Dimensionen (kein Fassaden-Score)", () => {
    const dims = assessableDims(base); // ohne description/price/aplus
    const out = enforceDeepAudit(
      {
        derived: { usps: ["hält 24h kalt"], zielgruppe: "Pendler", positionierung: "Arbeitstier" },
        dimensions: [
          { key: "title", label: "x", score10: 7, aktuell: "ok", probleme: [], empfehlung: "" },
          // LLM behauptet eine Bewertung für A+ und Preis — muss rausfliegen:
          { key: "aplus", label: "x", score10: 9, aktuell: "erfunden", probleme: [], empfehlung: "" },
          { key: "price", label: "x", score10: 2, aktuell: "erfunden", probleme: [], empfehlung: "" },
        ],
        topActions: ["Titel schärfen"],
      },
      dims,
    );
    const byKey = Object.fromEntries(out.dimensions.map((d) => [d.key, d]));
    expect(byKey.title.score10).toBe(7);
    expect(byKey.aplus.score10).toBeNull();
    expect(byKey.price.score10).toBeNull();
    expect(byKey.aplus.aktuell).toContain("noch");
  });

  it("klemmt Scores auf 0–10 und liefert immer alle 8 Dimensionen in fester Reihenfolge", () => {
    const out = enforceDeepAudit(
      { dimensions: [{ key: "title", label: "x", score10: 42, aktuell: "", probleme: [], empfehlung: "" }] },
      assessableDims(base),
    );
    expect(out.dimensions).toHaveLength(8);
    expect(out.dimensions.map((d) => d.key)).toEqual(["title", "bullets", "description", "backend", "images", "aplus", "reviews", "price"]);
    expect(out.dimensions[0].score10).toBe(10);
  });

  it("bewertbare, aber unbewertete Dimensionen bleiben ehrlich ohne Score", () => {
    const out = enforceDeepAudit({ dimensions: [] }, assessableDims(base));
    const bullets = out.dimensions.find((d) => d.key === "bullets")!;
    expect(bullets.score10).toBeNull();
    expect(bullets.aktuell).toBe("Vom Modell nicht bewertet.");
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
