import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ANALYSE_WIRKUNG, DATENFLUSS, RECIPE_INPUT_HERKUNFT } from "./register";

/**
 * Das Datenfluss-Register ist maschinenwirksam, nicht Doku (CLAUDE.md/D180):
 * diese Tests erzwingen, dass jede deklarierte Kette real existiert —
 * ein Datenpunkt ohne vollständige Kette oder mit erfundenem Code-Ort
 * bricht den Build.
 */

describe("Datenfluss-Register", () => {
  it("jeder deklarierte Analyse-Code-Ort existiert wirklich im Repo", () => {
    const fehlend = DATENFLUSS.flatMap((d) =>
      d.analysen.filter((a) => !existsSync(resolve(process.cwd(), a.modul))).map((a) => `${d.id}: ${a.modul}`),
    );
    expect(fehlend).toEqual([]);
  });

  it("kein Datenpunkt ohne vollständige Kette (Quelle → Speicher → Analyse → Verwendung → Anzeige)", () => {
    for (const d of DATENFLUSS) {
      expect(d.quelle.length, `${d.id}: Quelle fehlt`).toBeGreaterThan(0);
      expect(d.speicher.length, `${d.id}: Speicher fehlt`).toBeGreaterThan(0);
      expect(d.analysen.length, `${d.id}: keine Analyse deklariert`).toBeGreaterThan(0);
      expect(d.verwendung.length, `${d.id}: keine Verwendung deklariert`).toBeGreaterThan(0);
      expect(d.anzeige.length, `${d.id}: keine Anzeige deklariert`).toBeGreaterThan(0);
      for (const a of d.analysen) expect(a.outcome.length, `${d.id}/${a.name}: Outcome fehlt`).toBeGreaterThan(0);
    }
  });

  it("IDs sind eindeutig", () => {
    const ids = DATENFLUSS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /**
   * Feld-Ebene (D265): Die Prüfungen oben lassen Prosa durchgehen — ein
   * Datenpunkt kann eine Anzeige deklarieren, die es nicht gibt, und einzelne
   * Payload-Felder können erzeugt und nie gelesen werden. Genau so sind
   * `bildBefunde` und `qualitaetsNotizen` zu Karteileichen geworden.
   */
  it("jeder deklarierte Feld-Consumer existiert UND liest das Feld wirklich", () => {
    const fehler: string[] = [];
    for (const d of DATENFLUSS) {
      for (const f of d.felder ?? []) {
        const blatt = f.feld.split(".").pop()!.replace(/\[\]/g, "");
        expect(f.consumer.length, `${d.id}/${f.feld}: kein Consumer deklariert`).toBeGreaterThan(0);
        for (const c of f.consumer) {
          const pfad = resolve(process.cwd(), c);
          if (!existsSync(pfad)) {
            fehler.push(`${d.id}/${f.feld}: Consumer fehlt — ${c}`);
            continue;
          }
          if (!readFileSync(pfad, "utf8").includes(blatt)) fehler.push(`${d.id}/${f.feld}: ${c} liest „${blatt}“ nicht`);
        }
      }
    }
    expect(fehler).toEqual([]);
  });

  it("jede Karteileiche trägt einen Bau-Auftrag (Befund = Auftrag, D182)", () => {
    for (const d of DATENFLUSS)
      for (const o of d.offeneFelder ?? []) {
        expect(o.feld.trim(), `${d.id}: offenes Feld ohne Namen`).not.toBe("");
        expect(o.bauauftrag.trim().length, `${d.id}/${o.feld}: Bau-Auftrag fehlt oder ist zu dünn`).toBeGreaterThan(40);
      }
  });

  it("kein Feld gilt gleichzeitig als genutzt und als offen", () => {
    for (const d of DATENFLUSS) {
      const genutzt = new Set((d.felder ?? []).map((f) => f.feld));
      for (const o of d.offeneFelder ?? [])
        expect(genutzt.has(o.feld), `${d.id}/${o.feld}: steht in felder UND offeneFelder`).toBe(false);
    }
  });

  /**
   * Wirkungs-Register (D286, Nutzer-Audit 04.08.2026): Nimmt JEDES
   * Analyse-Ergebnis Einfluss auf den Content — oder ist begründet, warum nicht?
   *
   * Diese Prüfung schließt die Lücke, durch die drei Ergebnisse ohne Wirkung
   * blieben (Kaufgründe, Blocker aus dem Driver-Lauf, Audit-Befunde): Sie waren
   * NIRGENDS deklariert und fielen deshalb durch alle Feld-Prüfungen.
   */
  describe("Wirkungs-Register Analyse → Content", () => {
    it("jedes Ergebnis mit Content-Wirkung hat existierende Consumer, die den Marker wirklich lesen", () => {
      const fehler: string[] = [];
      for (const e of ANALYSE_WIRKUNG) {
        if (e.wirkung.art === "keine") continue;
        expect(e.wirkung.consumer.length, `${e.ergebnis}: kein Consumer deklariert`).toBeGreaterThan(0);
        expect(e.wirkung.marker.trim(), `${e.ergebnis}: kein Marker deklariert`).not.toBe("");
        for (const c of e.wirkung.consumer) {
          const pfad = resolve(process.cwd(), c);
          if (!existsSync(pfad)) {
            fehler.push(`${e.ergebnis}: Consumer fehlt — ${c}`);
            continue;
          }
          if (!readFileSync(pfad, "utf8").includes(e.wirkung.marker))
            fehler.push(`${e.ergebnis}: ${c} liest „${e.wirkung.marker}“ nicht — deklarierte Wirkung ohne Deckung`);
        }
      }
      expect(fehler).toEqual([]);
    });

    it("„keine Wirkung“ gilt nur mit tragfähiger Begründung (nie stillschweigend)", () => {
      for (const e of ANALYSE_WIRKUNG)
        if (e.wirkung.art === "keine")
          expect(e.wirkung.grund.trim().length, `${e.ergebnis}: Begründung fehlt oder ist zu dünn`).toBeGreaterThan(80);
    });

    it("jedes Ergebnis ist eindeutig und trägt seine Entstehungs-Etappe", () => {
      const namen = ANALYSE_WIRKUNG.map((e) => e.ergebnis);
      expect(new Set(namen).size).toBe(namen.length);
      for (const e of ANALYSE_WIRKUNG) expect(e.entsteht.trim(), `${e.ergebnis}: Etappe fehlt`).not.toBe("");
    });

    /**
     * Gegen-Richtung: Jedes RecipeInputs-Feld, das aus einer ANALYSE stammt, muss
     * im Wirkungs-Register auftauchen. Sonst könnte ein Input existieren, dessen
     * Analyse-Quelle nirgends als wirksam geführt wird — die Buchführung wäre
     * einseitig und genau das hat die Lücken erzeugt.
     */
    it("jeder Analyse-Input der Generierung ist im Wirkungs-Register geführt", () => {
      const marker = new Set(ANALYSE_WIRKUNG.flatMap((e) => (e.wirkung.art === "keine" ? [] : [e.wirkung.marker])));
      // Stammdaten/Freitext-Felder sind keine Analyse-Ergebnisse — sie brauchen
      // keinen Eintrag (Marke, Produktname, Sprache, Zusatz-Infos vom Team …).
      const nichtAnalyse = new Set([
        "brand", "eigenmarkeAusListing", "variantenName", "productName", "marketplace",
        "voiceTone", "approved", "competitorBrands", "zusatzKontext", "sprache", "facts",
      ]);
      const fehlend = Object.keys(RECIPE_INPUT_HERKUNFT).filter((f) => !nichtAnalyse.has(f) && !marker.has(f));
      expect(fehlend, "Analyse-Inputs ohne Eintrag im Wirkungs-Register").toEqual([]);
    });
  });

  it("jedes Content-Input (RecipeInputs) verweist auf einen existierenden Datenpunkt", () => {
    const ids = new Set(DATENFLUSS.map((d) => d.id));
    for (const [feld, herkunft] of Object.entries(RECIPE_INPUT_HERKUNFT))
      expect(ids.has(herkunft), `RecipeInputs.${feld} → unbekannter Datenpunkt „${herkunft}"`).toBe(true);
  });
});
