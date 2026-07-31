import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DATENFLUSS, RECIPE_INPUT_HERKUNFT } from "./register";

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

  it("jedes Content-Input (RecipeInputs) verweist auf einen existierenden Datenpunkt", () => {
    const ids = new Set(DATENFLUSS.map((d) => d.id));
    for (const [feld, herkunft] of Object.entries(RECIPE_INPUT_HERKUNFT))
      expect(ids.has(herkunft), `RecipeInputs.${feld} → unbekannter Datenpunkt „${herkunft}"`).toBe(true);
  });
});
