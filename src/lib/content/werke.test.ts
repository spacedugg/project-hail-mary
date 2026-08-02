import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  WERKE_REIHENFOLGE,
  WERKE_STANDARD,
  WERK_LABEL,
  WERK_HINWEIS,
  wirksameWerke,
  istWerkGewaehlt,
  normalisiereWerke,
  werkNichtGewaehltGrund,
} from "./werke";

describe("Werk-Auswahl (D270)", () => {
  it("keine Entscheidung (null) ⇒ nur Listing — A+ und Store entstehen NICHT ungefragt", () => {
    expect(wirksameWerke(null)).toEqual([...WERKE_STANDARD]);
    // D281: Die Wettbewerber-Bildanalyse gehoert zum Standard — sie ist kein
    // Deliverable, sondern Analyse-Tiefe, und schliesst die groesste Datenluecke.
    expect(wirksameWerke(undefined)).toEqual(["listing", "wettbewerber-bilder"]);
    expect(istWerkGewaehlt(null, "wettbewerber-bilder")).toBe(true);
    // Der Kern des Nutzer-Befunds: kein A+, kein Premium-A+, kein Store ohne Auftrag.
    expect(istWerkGewaehlt(null, "aplus-basic")).toBe(false);
    expect(istWerkGewaehlt(null, "aplus-premium")).toBe(false);
    expect(istWerkGewaehlt(null, "brand-store")).toBe(false);
    expect(istWerkGewaehlt(null, "bilder-briefing")).toBe(false);
  });

  it("leere Auswahl ist eine echte Entscheidung (nichts erstellen) und wird nicht zurückgebogen", () => {
    expect(wirksameWerke([])).toEqual([]);
    expect(istWerkGewaehlt([], "listing")).toBe(false);
  });

  it("Auswahl wird in Code-Reihenfolge sortiert und dedupliziert — nicht in Klick-Folge", () => {
    expect(wirksameWerke(["brand-store", "listing", "brand-store"])).toEqual(["listing", "brand-store"]);
  });

  it("A+ Basic und Premium sind unabhängig wählbar — nie beide automatisch", () => {
    expect(istWerkGewaehlt(["aplus-basic"], "aplus-premium")).toBe(false);
    expect(istWerkGewaehlt(["aplus-premium"], "aplus-basic")).toBe(false);
    expect(wirksameWerke(["aplus-premium", "aplus-basic"])).toEqual(["aplus-basic", "aplus-premium"]);
  });

  it("Listing kann abgewählt werden (nur A+ briefen, keine Texte)", () => {
    expect(istWerkGewaehlt(["aplus-basic"], "listing")).toBe(false);
    expect(wirksameWerke(["aplus-basic"])).toEqual(["aplus-basic"]);
  });

  it("normalisiereWerke verwirft Unfug und sortiert", () => {
    expect(normalisiereWerke(["brand-store", "quatsch", "listing", 7])).toEqual(["listing", "brand-store"]);
    expect(normalisiereWerke("listing")).toEqual([]);
    expect(normalisiereWerke(null)).toEqual([]);
  });

  it("jedes Werk hat Label und Hinweis — die UI kann nichts Unbeschriftetes anbieten", () => {
    for (const w of WERKE_REIHENFOLGE) {
      expect(WERK_LABEL[w]?.length, `Label fehlt: ${w}`).toBeGreaterThan(0);
      expect(WERK_HINWEIS[w]?.length, `Hinweis fehlt: ${w}`).toBeGreaterThan(0);
    }
  });

  it("die Sperr-Begründung nennt das Werk im Klartext (kein Jargon im Banner)", () => {
    const grund = werkNichtGewaehltGrund("aplus-premium");
    expect(grund).toContain(WERK_LABEL["aplus-premium"]);
    expect(grund).toContain("Was soll erstellt werden?");
  });
});

/**
 * Wirksamkeits-Kette (D181/D251-Muster): Eine Auswahl, die nur die UI ausgraut,
 * ist keine Regel. Diese Tests halten fest, dass die Entscheidung an JEDEM
 * Erzeugungs-Eingang wirklich abgefragt wird — sie brechen, sobald jemand einen
 * Brief oder eine Sektion wieder ungefragt baut.
 */
describe("Werk-Auswahl ist durchgesetzt, nicht dekorativ (D270)", () => {
  const quelle = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

  it("die Listing-Generierung fragt das Werk ab und blockt mit GEN-06", () => {
    const actions = quelle("src/app/actions.ts");
    expect(actions).toContain('istWerkGewaehlt(product.werkePlan, "listing")');
    expect(actions).toContain("GEN-06");
  });

  it("die Freigabe-Kette taktet ohne beauftragtes Listing nicht weiter", () => {
    const actions = quelle("src/app/actions.ts");
    expect(actions).toContain('istWerkGewaehlt(planProdukt?.werkePlan, "listing")');
  });

  it("das Bilder-Briefing läuft nur auf Auftrag", () => {
    expect(quelle("src/app/actions.ts")).toContain('istWerkGewaehlt(produkt.werkePlan, "bilder-briefing")');
  });

  it("kein A+/Store-Brief wird ungefragt assembliert — der Kern des Nutzer-Befunds", () => {
    const briefs = quelle("src/app/(app)/produkte/[id]/briefs/page.tsx");
    for (const w of ["aplus-basic", "aplus-premium", "brand-store"] as const) {
      expect(briefs, `Brief ohne Werk-Abfrage: ${w}`).toContain(`istWerkGewaehlt(product.werkePlan, "${w}")`);
    }
  });

  it("der Ein-Klick-Lauf textet nur bei beauftragtem Listing", () => {
    expect(quelle("src/components/analyse-start.tsx")).toContain("listingGewaehlt ? fd.getAll(\"sections\")");
    expect(quelle("src/app/actions.ts")).toContain('istWerkGewaehlt(product.werkePlan, "listing")');
  });
});
