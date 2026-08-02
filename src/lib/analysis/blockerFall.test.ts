import { describe, it, expect } from "vitest";
import { bestimmeBlockerFall, blockerBegruendung, blockerScore, blockerTitel, BLOCKER_FAELLE, FALL_GEWICHT } from "./blockerFall";
import type { KanalTreffer } from "./abdeckung";

describe("Blocker-Fall-Bestimmung (D265)", () => {
  it("Text prominent, Bild fehlt → Bildbeweis fehlt", () => {
    // Der Regelfall des Referenz-Musters: „≤55 dB“ steht im Bullet, kein Bild zeigt es.
    expect(bestimmeBlockerFall({ textStufe: "prominent", bildStufe: "fehlt", featureGenannt: true })).toBe("bildbeweis_fehlt");
  });

  it("Bild vorhanden, aber unter der Botschafts-Schwelle → Beweis schwach", () => {
    expect(bestimmeBlockerFall({ textStufe: "prominent", bildStufe: "schwach", featureGenannt: true })).toBe("beweis_schwach");
  });

  it("alles belegt → kein Blocker", () => {
    expect(bestimmeBlockerFall({ textStufe: "prominent", bildStufe: "belegt", featureGenannt: true })).toBeNull();
  });

  it("nur im Kleingedruckten → eigener Fall, schwerer als eine reine Bildlücke", () => {
    const fall = bestimmeBlockerFall({ textStufe: "erwaehnt", bildStufe: "belegt", featureGenannt: true });
    expect(fall).toBe("nur_kleingedruckt");
    expect(FALL_GEWICHT[fall!]).toBeGreaterThan(FALL_GEWICHT.bildbeweis_fehlt);
  });

  it("Merkmal genannt, Nutzen nicht → nicht als bloße Bildlücke untertreiben", () => {
    // Der Fall „ergonomisch“ steht im Bullet, „Rückenbeschwerden“ nirgends.
    expect(bestimmeBlockerFall({ textStufe: "fehlt", bildStufe: "fehlt", featureGenannt: true })).toBe("nutzen_nicht_benannt");
  });

  it("weder Merkmal noch Nutzen noch Bild → fehlt komplett, schwerster Fall", () => {
    const fall = bestimmeBlockerFall({ textStufe: "fehlt", bildStufe: "fehlt", featureGenannt: false });
    expect(fall).toBe("fehlt_komplett");
    expect(FALL_GEWICHT[fall!]).toBe(1);
  });

  it("nicht erfasste Quellen erzeugen KEINEN Blocker (keine erfundene Lücke)", () => {
    expect(bestimmeBlockerFall({ textStufe: "nicht_erfasst", bildStufe: "fehlt", featureGenannt: false })).toBeNull();
    expect(bestimmeBlockerFall({ textStufe: "prominent", bildStufe: "nicht_erfasst", featureGenannt: true })).toBeNull();
    expect(bestimmeBlockerFall({ textStufe: "prominent", bildStufe: "nicht_bewertet", featureGenannt: true })).toBeNull();
  });
});

describe("Blocker-Titel aus dem Template (D265)", () => {
  const basis = { resultat: "Ruhig und konzentriert arbeiten", baustein: "Verstellen stört niemanden im Raum" };

  it("benennt die fehlende Beweisart, nicht das Thema", () => {
    const t = blockerTitel({ ...basis, fall: "bildbeweis_fehlt" });
    expect(t).toContain("Kein Bildbeweis");
    expect(t).toContain(basis.baustein);
  });

  it("nennt bei schwachem Beweis Bild-Nummer und Note", () => {
    const t = blockerTitel({ ...basis, fall: "beweis_schwach", slot: 3, note: 2.5 });
    expect(t).toContain("Bild 3");
    expect(t).toContain("2,5/5");
  });

  it("fällt ohne Bild-Note auf eine Formulierung ohne Zahl zurück", () => {
    expect(blockerTitel({ ...basis, fall: "beweis_schwach", slot: 3, note: null })).not.toMatch(/\d\/5/);
    expect(blockerTitel({ ...basis, fall: "beweis_schwach" })).not.toMatch(/Bild \d/);
  });

  it("nennt bei „nur im Kleingedruckten“ den echten Fundort samt Bullet-Nummer", () => {
    const kanaele: KanalTreffer[] = [
      { kanal: "title", stufe: "fehlt", treffer: [] },
      { kanal: "bullets", stufe: "erwaehnt", treffer: ["Beinfreiheit"], position: 2 },
    ];
    const t = blockerTitel({ ...basis, fall: "nur_kleingedruckt", kanaele });
    expect(t).toContain("Bullets (Nr. 2)");
  });

  it("listet bei „Nutzen nicht benannt“ die Merkmale, die stattdessen dastehen", () => {
    const t = blockerTitel({ ...basis, fall: "nutzen_nicht_benannt", features: ["ergonomisch", "höhenverstellbar", "stufenlos"] });
    expect(t).toContain("nur das Merkmal");
    expect(t).toContain("ergonomisch");
    expect(t).toContain("u. a."); // gedeckelt, nicht alles ausschütten
  });

  it("nimmt das Resultat, wenn kein Baustein gesetzt ist", () => {
    expect(blockerTitel({ resultat: basis.resultat, baustein: "  ", fall: "fehlt_komplett" })).toContain(basis.resultat);
  });

  it("jeder Fall liefert einen nicht-leeren Titel", () => {
    for (const fall of Object.keys(FALL_GEWICHT) as Array<keyof typeof FALL_GEWICHT>)
      expect(blockerTitel({ ...basis, fall }).length).toBeGreaterThan(20);
  });
});

describe("Blocker-Score (D265)", () => {
  it("erbt den Driver-Score und gewichtet mit der Lückengröße", () => {
    expect(blockerScore(80, "fehlt_komplett")).toBe(80);
    expect(blockerScore(80, "beweis_schwach")).toBe(32);
  });

  it("ein unbewiesener starker Kaufgrund wiegt mehr als ein schwach bebilderter", () => {
    expect(blockerScore(80, "bildbeweis_fehlt")).toBeGreaterThan(blockerScore(80, "beweis_schwach"));
  });
});


/**
 * Blocker-Fließtext (D278, Nutzer-Vorgabe 02.08.2026: „wenn ich draufklicke, dann
 * habe ich dort das Problem noch mal mit Fließtext beschrieben").
 *
 * Deterministisch statt LLM (D184): Jeder Satz steht auf einem berechneten Wert.
 * Diese Tests halten fest, dass der Text (a) für JEDEN Fall entsteht, (b) den
 * konkreten Befund nennt statt allgemein zu bleiben und (c) den Kaufgrund
 * einordnet — genau die drei Dinge, die im alten Titelsatz fehlten.
 */
describe("Blocker-Fließtext (D278)", () => {
  const basis = {
    resultat: "Ohne Rückenbeschwerden durch den Arbeitstag",
    baustein: "Sitzen und Stehen im Wechsel",
    relevanz: 5,
    motiv: "Kernmotiv",
  };

  it("jeder Blocker-Fall erzeugt einen mehrsätzigen Text — nie ein Fragment", () => {
    for (const fall of BLOCKER_FAELLE) {
      const t = blockerBegruendung({ ...basis, fall });
      expect(t.length, `zu kurz bei ${fall}`).toBeGreaterThan(120);
      // Mindestens drei Sätze: Ist-Zustand, Wirkung, Einordnung.
      expect(t.split(". ").length, `zu wenige Sätze bei ${fall}`).toBeGreaterThanOrEqual(3);
      expect(t.trim().endsWith(".")).toBe(true);
    }
  });

  it("nennt den konkreten Befund statt allgemein zu bleiben", () => {
    const bild = blockerBegruendung({ ...basis, fall: "beweis_schwach", slot: 3, note: 2 });
    expect(bild).toContain("Bild 3");
    expect(bild).toContain("2 von 5");

    const merkmal = blockerBegruendung({ ...basis, fall: "nutzen_nicht_benannt", features: ["stufenlose Höhe"] });
    expect(merkmal).toContain("stufenlose Höhe");
  });

  it("ordnet den Kaufgrund ein — starke Kaufgründe werden als vorrangig benannt", () => {
    const stark = blockerBegruendung({ ...basis, fall: "bildbeweis_fehlt", relevanz: 5 });
    expect(stark).toContain("besonders schwer");
    expect(stark).toContain("5/5");

    const schwach = blockerBegruendung({ ...basis, fall: "bildbeweis_fehlt", relevanz: 2 });
    expect(schwach).toContain("Einordnung");
    expect(schwach).not.toContain("besonders schwer");
  });

  /**
   * Die Abgrenzung, auf der der Nutzer besteht: „Conversion Blocker sind nicht
   * einfach nur Conversion Driver." Der Text muss die LÜCKE beschreiben, nicht
   * den Kaufgrund wiederholen.
   */
  it("beschreibt die Lücke, nicht den Kaufgrund", () => {
    const t = blockerBegruendung({ ...basis, fall: "bildbeweis_fehlt" });
    expect(t).toMatch(/zeigt es nicht|keinen sichtbaren Beweis/);
  });
});
