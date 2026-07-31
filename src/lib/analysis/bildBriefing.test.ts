import { describe, it, expect } from "vitest";
import { baueBildBriefing, BRIEF_GRENZEN, pruefeKonzeptFreiheit, type BriefEingabe } from "./bildBriefing";
import type { ConversionDriverPayload, NutzenBaustein } from "@/lib/analysis/driverTypen";

const baustein = (over: Partial<NutzenBaustein> = {}): NutzenBaustein => ({
  nutzen: "Verstellen stört niemanden im Raum",
  features: ["2 Motoren"],
  belege: [{ quelle: "listing", fundstelle: "≤55 dB" }],
  usp: false,
  textStufe: "prominent",
  kanaele: [],
  bildStufe: "fehlt",
  ...over,
});

const driver = (over: Partial<ConversionDriverPayload> = {}): ConversionDriverPayload => ({
  driver: [
    {
      id: "CD1",
      resultat: "Ruhig und konzentriert arbeiten",
      motivKlasse: "kern",
      motivBegruendung: "Kaufgrund der Kategorie",
      bausteine: [baustein()],
      score: 72,
      relevanz: 4,
      anteile: [
        { quelle: "Motiv-Klasse", punkte: 40, beleg: "Kernmotiv" },
        { quelle: "Eigene Bewertungen", punkte: 12, beleg: "14 von 182 analysierten Bewertungen nennen es" },
        { quelle: "Suchnachfrage", punkte: 16, beleg: "40 % des relevanten Suchvolumens" },
      ],
      nurKategorie: false,
    },
  ],
  blocker: [{ driverId: "CD1", nutzen: "Verstellen stört niemanden", fall: "bildbeweis_fehlt", titel: "Kein Bildbeweis für „Verstellen stört niemanden“", score: 43 }],
  ballast: [],
  produktFeedback: [],
  verworfen: 0,
  hinweise: ["Nicht erfasste Kanäle: aplus."],
  stats: { stichprobe: 182, wettbewerberGesamt: 3, suchvolumenGesamt: 100000 },
  ...over,
});

const eingabe = (over: Partial<BriefEingabe> = {}): BriefEingabe => ({
  produkt: "boho office Basic Line",
  marke: "boho office",
  asin: "B0TEST0001",
  marktplatz: "amazon.de",
  listingSprache: "Deutsch",
  facts: { productType: "Schreibtischgestell", dimensions: "61–126 cm", materials: ["Stahl"], certifications: ["TÜV"], usps: ["80 mm/Sek"] },
  driver: driver(),
  bestand: [{ slot: 1, typ: "main_image", inhalt: "Gestell freigestellt auf Weiß", design: 4, botschaft: 2, klarheit: 3, hinweis: "Nutzen sichtbar machen" }],
  languageToBorrow: ["endlich kein Wackeln"],
  languageToAvoid: ["hochwertig"],
  ...over,
});

describe("Konzept-Freiheit erzwingen (D269)", () => {
  it("eine reine Konzept-Idee passiert", () => {
    expect(pruefeKonzeptFreiheit("Zeigen, dass der Tisch sich im Alltag geräuscharm verstellt.").ok).toBe(true);
  });

  it("Szenen-Regie fliegt — Licht und Perspektive entscheidet der Designer", () => {
    for (const s of [
      "Weiches Licht von links, Softbox im Gegenlicht.",
      "Aus der Froschperspektive fotografiert.",
      "Shoot with a wide-angle lens and backlight.",
    ]) {
      const r = pruefeKonzeptFreiheit(s);
      expect(r.ok, s).toBe(false);
      expect(r.verstoesse.join(" ")).toContain("Szenen-Regie");
    }
  });

  it("ein vorgeschriebener Bildtext fliegt", () => {
    const r = pruefeKonzeptFreiheit('Headline oben: „Flüsterleise bei nur 55 dB“ groß setzen.');
    expect(r.ok).toBe(false);
    expect(r.verstoesse.join(" ")).toMatch(/Bildtext/);
  });

  it("greift auch bei geraden Anführungszeichen", () => {
    // Die Zeichenklasse war einmal durch eine Skript-Ersetzung gekippt und ließ
    // gerade Anführungszeichen durch — deshalb hier festgenagelt.
    const r = pruefeKonzeptFreiheit('Oben steht "Fluesterleise bei 55 dB" als Aussage.');
    expect(r.ok).toBe(false);
  });

  it("ein kurzes Zitat als Bezug ist erlaubt — nur ganze Headlines sind gemeint", () => {
    expect(pruefeKonzeptFreiheit("Belegt den Kaufgrund „leiser Betrieb“ sichtbar.").ok).toBe(true);
  });
});

describe("Bilder-Briefing — Assemblierung (D269)", () => {
  it("Konzepte entstehen aus den Bild-Blockern und tragen die Driver-Referenz", () => {
    const p = baueBildBriefing(eingabe());
    expect(p.konzepte).toHaveLength(1);
    expect(p.konzepte[0]).toMatchObject({ id: "K1", driverIds: ["CD1"], resultat: "Ruhig und konzentriert arbeiten", status: "neu" });
  });

  it("Text-Blocker erzeugen KEIN Bild-Konzept", () => {
    const d = driver();
    d.blocker = [{ driverId: "CD1", nutzen: "x", fall: "nur_kleingedruckt", titel: "Steht nur in der Beschreibung", score: 50 }];
    expect(baueBildBriefing(eingabe({ driver: d })).konzepte).toHaveLength(0);
  });

  it("ein schwaches Bild wird nachgeschärft, nicht ersetzt", () => {
    const d = driver();
    d.blocker = [{ driverId: "CD1", nutzen: "x", fall: "beweis_schwach", titel: "Unzureichender Bildbeweis", score: 29, bildSlot: 3, bildNote: 2 }];
    const k = baueBildBriefing(eingabe({ driver: d })).konzepte[0];
    expect(k.status).toBe("nachschaerfen");
    expect(k.bezugSlot).toBe(3);
  });

  it("Findings kommen aus dem Befund und der Evidenz — nicht aus der Motiv-Klasse", () => {
    const k = baueBildBriefing(eingabe()).konzepte[0];
    expect(k.findings[0]).toContain("Kein Bildbeweis");
    expect(k.findings.join(" ")).toContain("182 analysierten Bewertungen");
    expect(k.findings.join(" ")).not.toContain("Motiv-Klasse");
    expect(k.findings.length).toBeLessThanOrEqual(BRIEF_GRENZEN.findingsJeKonzept);
  });

  it("ohne LLM-Idee entsteht ein deterministischer Satz, nie ein Platzhalter", () => {
    const k = baueBildBriefing(eingabe()).konzepte[0];
    expect(k.konzept).toContain("Ruhig und konzentriert arbeiten");
    expect(k.konzept.toLowerCase()).not.toContain("platzhalter");
    expect(k.konzept.toLowerCase()).not.toContain("tbd");
  });

  it("eine gelieferte Konzept-Idee gewinnt", () => {
    const p = baueBildBriefing(eingabe({ konzeptIdeen: { CD1: "Den Alltag zeigen, in dem niemand vom Verstellen aufschaut." } }));
    expect(p.konzepte[0].konzept).toContain("niemand vom Verstellen aufschaut");
  });

  it("Produkt-Wahrheit und Verbote stehen im Briefing — inklusive Zertifikats-Sperre", () => {
    const p = baueBildBriefing(eingabe());
    expect(p.produktWahrheit.join(" ")).toContain("TÜV");
    expect(p.verboten.join(" ")).toContain("Nur diese Zertifikate zeigen: TÜV");
  });

  it("ohne erfasste Zertifikate wird das Zeigen von Siegeln ausdrücklich verboten", () => {
    const p = baueBildBriefing(eingabe({ facts: { productType: "Gestell" } }));
    expect(p.verboten.join(" ")).toContain("Keine Zertifikate oder Prüfsiegel zeigen");
  });

  it("kein Konzept nötig ist ein Ergebnis, kein fehlender Lauf", () => {
    const p = baueBildBriefing(eingabe({ driver: driver({ blocker: [] }) }));
    expect(p.konzepte).toEqual([]);
    expect(p.auftrag).toContain("kein neues Bild nötig");
    expect(p.grenzen.join(" ")).toContain("Das ist ein Ergebnis");
  });

  it("Kundensprache und heutiger Bildinhalt bleiben unangetastet — sie sind sprachgebunden", () => {
    const p = baueBildBriefing(eingabe());
    expect(p.kundensprache.uebernehmen).toEqual(["endlich kein Wackeln"]);
    expect(p.bestand[0].inhalt).toBe("Gestell freigestellt auf Weiß");
    expect(p.sprache).toBe("de");
    expect(p.kopf.listingSprache).toBe("Deutsch");
  });

  it("deckelt die Konzepte", () => {
    const d = driver();
    d.driver = Array.from({ length: 12 }, (_, i) => ({ ...d.driver[0], id: `CD${i + 1}` }));
    d.blocker = Array.from({ length: 12 }, (_, i) => ({
      driverId: `CD${i + 1}`, nutzen: "x", fall: "bildbeweis_fehlt" as const, titel: `Lücke ${i}`, score: 40,
    }));
    expect(baueBildBriefing(eingabe({ driver: d })).konzepte).toHaveLength(BRIEF_GRENZEN.konzepte);
  });
});
