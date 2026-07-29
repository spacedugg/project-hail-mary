import { describe, it, expect } from "vitest";
import {
  SEKTIONS_REIHENFOLGE,
  dbTypFuer,
  sektionVonDbTyp,
  wirksamerPlan,
  istGeplant,
  naechsteGeplant,
  geplanteVorgaenger,
  normalisierePlan,
} from "./plan";

describe("Content-Plan (D257)", () => {
  it("kein Plan ⇒ alle Sektionen (rückwärtskompatibel)", () => {
    expect(wirksamerPlan(null)).toEqual([...SEKTIONS_REIHENFOLGE]);
    expect(wirksamerPlan([])).toEqual([...SEKTIONS_REIHENFOLGE]);
  });

  it("Plan wird in Ketten-Reihenfolge sortiert und dedupliziert — nicht in Klick-Folge", () => {
    expect(wirksamerPlan(["qa", "title", "qa", "bullets"])).toEqual(["title", "bullets", "qa"]);
  });

  it("DB-Typ-Mapping ist umkehrbar", () => {
    expect(dbTypFuer("backend")).toBe("backend_keywords");
    expect(dbTypFuer("highlights")).toBe("item_highlights");
    expect(dbTypFuer("title")).toBe("title");
    for (const s of SEKTIONS_REIHENFOLGE) expect(sektionVonDbTyp(dbTypFuer(s))).toBe(s);
    expect(sektionVonDbTyp("gibt_es_nicht")).toBeNull();
  });

  it("die Kette überspringt abgewählte Sektionen (Kern des Nutzer-Befunds)", () => {
    const plan = ["title", "bullets"] as const;
    // Nach dem Titel folgt NICHT „highlights" (abgewählt), sondern „bullets".
    expect(naechsteGeplant([...plan], "title")).toBe("bullets");
    // Nach der letzten geplanten Sektion ist Schluss — keine Beschreibung, kein Q&A.
    expect(naechsteGeplant([...plan], "bullets")).toBeNull();
  });

  it("ohne Plan bleibt die volle Kette erhalten", () => {
    expect(naechsteGeplant(null, "title")).toBe("highlights");
    expect(naechsteGeplant(null, "description")).toBe("qa");
    expect(naechsteGeplant(null, "qa")).toBeNull();
  });

  it("abgewählte Sektionen blockieren nie als Vorgänger", () => {
    // Nur Titel + Q&A geplant → Q&A wartet allein auf den Titel.
    expect(geplanteVorgaenger(["title", "qa"], "qa")).toEqual(["title"]);
    expect(geplanteVorgaenger(null, "qa")).toEqual(["title", "highlights", "bullets", "backend", "description"]);
    expect(geplanteVorgaenger(["title", "qa"], "title")).toEqual([]);
  });

  it("istGeplant respektiert die Auswahl", () => {
    expect(istGeplant(["title"], "title")).toBe(true);
    expect(istGeplant(["title"], "qa")).toBe(false);
    expect(istGeplant(null, "qa")).toBe(true);
  });

  it("normalisierePlan verwirft Unfug und sortiert", () => {
    expect(normalisierePlan(["qa", "quatsch", "title", 7])).toEqual(["title", "qa"]);
    expect(normalisierePlan("title")).toEqual([]);
  });
});
