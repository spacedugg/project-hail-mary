import { describe, it, expect } from "vitest";
import { baueInsightsReport, GRENZEN, pruefeInsightsReport, type ReportEingabe } from "./insightsDokument";
import type { ConversionDriverPayload, NutzenBaustein } from "@/lib/analysis/driverTypen";
import type { ReviewInsightsPayload } from "@/db/schema";

const baustein = (over: Partial<NutzenBaustein> = {}): NutzenBaustein => ({
  nutzen: "Sitzen und Stehen im Wechsel",
  features: ["stufenlose Höhe"],
  belege: [{ quelle: "reviews_eigene", fundstelle: "Motor angenehm leise" }],
  usp: false,
  textStufe: "prominent",
  kanaele: [],
  bildStufe: "fehlt",
  ...over,
});

const driverPayload = (over: Partial<ConversionDriverPayload> = {}): ConversionDriverPayload => ({
  driver: [
    {
      id: "CD1",
      resultat: "Ohne Rückenbeschwerden durch den Arbeitstag",
      motivKlasse: "kern",
      motivBegruendung: "Kaufgrund der Kategorie",
      bausteine: [baustein()],
      score: 78,
      relevanz: 4,
      anteile: [{ quelle: "Motiv-Klasse", punkte: 40, beleg: "Kernmotiv" }],
      nurKategorie: false,
    },
  ],
  blocker: [
    { driverId: "CD1", nutzen: "Sitzen und Stehen im Wechsel", fall: "bildbeweis_fehlt", titel: "Kein Bildbeweis für „Sitzen und Stehen im Wechsel“", score: 47, bildSlot: 3, bildNote: null },
  ],
  ballast: [{ feature: "Display-Sleep-Funktion", fundstelle: "prominent" }],
  produktFeedback: [{ label: "Karton eingedrückt", typ: "painPoint", mentionCount: 3 }],
  verworfen: 2,
  hinweise: ["Nicht erfasste Kanäle: aplus.", "Nicht erfasste Kanäle: aplus."],
  stats: { stichprobe: 182, wettbewerberGesamt: 3, suchvolumenGesamt: 100000 },
  ...over,
});

const insights = {
  sources: [],
  stats: { reviewsTotal: 182, ratingAvg: 4.3 },
  // Absteigend gemischt, damit der Sortier-Test wirklich etwas prüft (D277).
  painPoints: [
    { label: "Anleitung unklar", frequencyPct: null, mentionCount: 4, quotes: ["Die Anleitung ist kaum zu verstehen"] },
    { label: "Tischplatte verkratzt geliefert", frequencyPct: null, mentionCount: 11, quotes: ["Kratzer schon beim Auspacken"] },
    // Nur bei Wettbewerbern belegt (D275) — im Dokument als Marktsignal markiert.
    { label: "Wackelt bei voller Höhe", frequencyPct: null, mentionCount: 6, quotes: [], herkunft: { eigene: 0, fremde: 6, jeAsin: { B0FREMD01: 6 } } },
  ],
  buyingTriggers: [
    { label: "Motor angenehm leise", frequencyPct: null, mentionCount: 14, quotes: ["Absolut leise, ich höre den Motor kaum"] },
  ],
  languageToBorrow: [],
  languageToAvoid: [],
  kernThese: "Käufer suchen beschwerdefreies Arbeiten, das Listing verkauft Geschwindigkeit.",
  qualitaetsNotizen: ["Signifikanz-Gate: 2 Aspekte übergangen"],
} satisfies ReviewInsightsPayload;

const eingabe = (over: Partial<ReportEingabe> = {}): ReportEingabe => ({
  produktName: "boho office Basic Line",
  asin: "B0TEST0001",
  marktplatz: "amazon.de",
  stand: new Date("2026-07-30T10:00:00Z"),
  driver: driverPayload(),
  insights,
  analysis: {
    overall: 58,
    dimensions: [
      { key: "title", label: "Titel", score: 70, measured: true, evidence: "deterministic", findings: ["Hauptkeyword steht vorn"], issues: [] },
      { key: "backend", label: "Backend-Keywords", score: 0, measured: false, evidence: "deterministic", findings: [], issues: [] },
    ],
    sov: null,
    recommendations: [],
  },
  usps: ["Sitz-Steh-Wechsel ohne Werkzeug", "Tragkraft 80 kg"],
  amazonTotals: { reviewsTotal: 1343, ratingAvg: 4.3 },
  wettbewerberAsins: 3,
  bilder: [{ slot: 3, design: 4, botschaft: 2, klarheit: 3, wieBesser: "Sitz-Steh-Wechsel im echten Arbeitstag zeigen" }],
  keywordsMitVolumen: 42,
  ...over,
});

describe("Insights-Dokument — Projektion (D267)", () => {
  it("Datenbasis und Kern-These kommen aus den echten Läufen", () => {
    const p = baueInsightsReport(eingabe());
    expect(p.datenbasis).toMatchObject({ reviewsAmazon: 1343, reviewsAnalysiert: 182, wettbewerberListings: 3, bilderAnalysiert: 1 });
    expect(p.kernThese).toContain("beschwerdefreies Arbeiten");
    expect(p.kopf.stand).toBe("2026-07-30T10:00:00.000Z");
  });

  it("die Ampel folgt dem SCHWÄCHSTEN Baustein, nicht dem besten", () => {
    const d = driverPayload();
    d.driver[0].bausteine = [
      baustein({ textStufe: "prominent", bildStufe: "belegt" }),
      baustein({ nutzen: "Zweiter Baustein", textStufe: "erwaehnt", bildStufe: "fehlt" }),
    ];
    const p = baueInsightsReport(eingabe({ driver: d }));
    expect(p.matrix[0].text).toBe("teil");
    expect(p.matrix[0].bild).toBe("fehlt");
  });

  it("höchstens ein Zitat je Zeile, gekürzt, aus einem verifizierten Aspekt", () => {
    const p = baueInsightsReport(eingabe());
    expect(p.matrix[0].zitat).toBe("Absolut leise, ich höre den Motor kaum");
  });

  it("kein Zitat, wenn der Driver nicht auf Bewertungen steht", () => {
    const d = driverPayload();
    d.driver[0].bausteine = [baustein({ belege: [{ quelle: "listing", fundstelle: "höhenverstellbar" }] })];
    expect(baueInsightsReport(eingabe({ driver: d })).matrix[0].zitat).toBeNull();
  });

  it("der Handlungsplan entsteht aus den Blockern und trennt Text von Bild", () => {
    const d = driverPayload();
    d.blocker = [
      { driverId: "CD1", nutzen: "x", fall: "nur_kleingedruckt", titel: "Steht nur in der Beschreibung", score: 55 },
      { driverId: "CD1", nutzen: "y", fall: "beweis_schwach", titel: "Unzureichender Bildbeweis", score: 31, bildSlot: 3, bildNote: 2 },
    ];
    const p = baueInsightsReport(eingabe({ driver: d }));
    expect(p.handlungsplan.text.map((m) => m.massnahme)).toEqual(["Steht nur in der Beschreibung"]);
    // Bild-Maßnahme wird mit „wie besser“ aus dem Bild-Audit angereichert
    expect(p.handlungsplan.bild[0].massnahme).toContain("Sitz-Steh-Wechsel im echten Arbeitstag zeigen");
    expect(p.handlungsplan.bild[0].slot).toBe(3);
  });

  it("jede Maßnahme trägt ihre Kaufgrund-Referenz", () => {
    const p = baueInsightsReport(eingabe());
    for (const m of [...p.handlungsplan.text, ...p.handlungsplan.bild]) expect(m.driverIds).toEqual(["CD1"]);
  });

  it("nicht messbare Dimensionen tragen score null, nie 0 (D70)", () => {
    const p = baueInsightsReport(eingabe());
    expect(p.listing.dimensionen.find((d) => d.label === "Backend-Keywords")?.score).toBeNull();
    expect(p.listing.dimensionen.find((d) => d.label === "Titel")?.score).toBe(70);
  });

  /**
   * D277 (Nutzer-Vorgabe 02.08.2026): Grenzen der Analyse, „Erwartungen, die wir
   * ehrlich setzen sollten" und die Noten-Tabelle der aktuellen Bilder gehoeren
   * NICHT ins Kunden-Dokument. Intern bleibt alles erhalten — hier ist es
   * Ballast, der von den Befunden ablenkt.
   */
  it("Grenzen, Erwartungs-Risiken und Bild-Noten stehen NICHT mehr im Dokument", () => {
    const p = baueInsightsReport(eingabe());
    expect(p).not.toHaveProperty("grenzen");
    expect(p).not.toHaveProperty("risiken");
    expect(p.listing).not.toHaveProperty("bilder");
  });

  /**
   * D277: Die Roh-Findings waren im Kunden-Dokument gar nicht vorhanden — nur
   * als einzelnes Zitat in einer Matrix-Zeile. Damit fehlte dem Kunden genau die
   * Ebene, die er selbst nachlesen kann.
   */
  it("Findings aus Bewertungen sind nach gut und schlecht aufgeschluesselt, mit Beleg", () => {
    const p = baueInsightsReport(eingabe());
    expect(p.findings.positiv.length).toBeGreaterThan(0);
    expect(p.findings.negativ.length).toBeGreaterThan(0);
    // Belegt heisst: Zaehlwert und, wo vorhanden, ein O-Ton.
    for (const f of [...p.findings.positiv, ...p.findings.negativ]) {
      expect(f.label.length).toBeGreaterThan(0);
      expect(f).toHaveProperty("nennungen");
      expect(f).toHaveProperty("zitat");
    }
  });

  it("Findings sind nach verifizierten Fundstellen sortiert — das Wichtigste zuerst", () => {
    const p = baueInsightsReport(eingabe());
    const zahlen = p.findings.negativ.map((f) => f.nennungen ?? -1);
    expect([...zahlen].sort((a, b) => b - a)).toEqual(zahlen);
  });

  /**
   * D275 + D277: Ein Befund, den es nur bei Wettbewerbern gibt, darf im
   * Kunden-Dokument nicht wie Kritik an SEINEM Produkt aussehen. Er bleibt drin
   * (Marktsignal), wird aber markiert.
   */
  it("Findings nur aus Wettbewerbs-Bewertungen sind als solche markiert", () => {
    const p = baueInsightsReport(eingabe());
    const fremd = p.findings.negativ.find((f) => f.label === "Wackelt bei voller Höhe");
    expect(fremd?.nurFremd).toBe(true);
    const eigen = p.findings.negativ.find((f) => f.label === "Anleitung unklar");
    expect(eigen?.nurFremd).toBe(false);
  });

  it("USPs kommen aus der Produkt-Wahrheit ins Dokument", () => {
    const p = baueInsightsReport(eingabe());
    expect(p.usps).toContain("Tragkraft 80 kg");
  });

  it("Blocker sind ein eigenes Kapitel und tragen den Kaufgrund im Klartext", () => {
    const p = baueInsightsReport(eingabe());
    expect(p.blocker.length).toBeGreaterThan(0);
    for (const b of p.blocker) {
      expect(b.driverId.length).toBeGreaterThan(0);
      expect(["text", "bild"]).toContain(b.art);
    }
  });

  it("Ballast steht beim Blocker-Kapitel, nicht mehr unter Listing", () => {
    const p = baueInsightsReport(eingabe());
    expect(Array.isArray(p.ballast)).toBe(true);
  });

  it("harte Obergrenzen greifen — das Dokument wächst nicht mit der Datenmenge", () => {
    const d = driverPayload();
    d.driver = Array.from({ length: 14 }, (_, i) => ({ ...d.driver[0], id: `CD${i + 1}` }));
    d.blocker = Array.from({ length: 14 }, (_, i) => ({ driverId: `CD${i + 1}`, nutzen: "x", fall: "fehlt_komplett" as const, titel: `Lücke ${i}`, score: 50 }));
    const p = baueInsightsReport(eingabe({ driver: d }));
    expect(p.matrix).toHaveLength(GRENZEN.matrix);
    expect(p.handlungsplan.text).toHaveLength(GRENZEN.textMassnahmen);
  });
});

describe("Auslieferungs-Gate (D267)", () => {
  it("ein vollständiges Dokument passiert", () => {
    expect(pruefeInsightsReport(baueInsightsReport(eingabe()))).toEqual({ ok: true, verstoesse: [] });
  });

  it("ohne jede Datenbasis wird nicht ausgeliefert", () => {
    const d = driverPayload({ stats: { stichprobe: 0, wettbewerberGesamt: 0, suchvolumenGesamt: 0 } });
    const r = pruefeInsightsReport(baueInsightsReport(eingabe({ driver: d, keywordsMitVolumen: 0 })));
    expect(r.ok).toBe(false);
    expect(r.verstoesse.join(" ")).toContain("Keine Datenbasis");
  });

  it("ohne Kaufgrund gibt es kein Dokument", () => {
    const r = pruefeInsightsReport(baueInsightsReport(eingabe({ driver: driverPayload({ driver: [], blocker: [] }) })));
    expect(r.ok).toBe(false);
    expect(r.verstoesse.join(" ")).toContain("Keine Kaufgründe");
  });

  it("eine Matrix-Zeile ohne Beleg-Quelle blockt", () => {
    const d = driverPayload();
    d.driver[0].bausteine = [baustein({ belege: [] })];
    const r = pruefeInsightsReport(baueInsightsReport(eingabe({ driver: d })));
    expect(r.verstoesse.join(" ")).toContain("ohne Beleg-Quelle");
  });

  it("eine Maßnahme ohne gültige Kaufgrund-Referenz blockt — keine zweite, unverbundene Liste", () => {
    const p = baueInsightsReport(eingabe());
    p.handlungsplan.text.push({ massnahme: "Irgendwas verbessern", driverIds: ["CD99"] });
    const r = pruefeInsightsReport(p);
    expect(r.ok).toBe(false);
    expect(r.verstoesse.join(" ")).toContain("ohne gültige Kaufgrund-Referenz");
  });

  it("unmögliche Zahlen blocken", () => {
    const p = baueInsightsReport(eingabe());
    p.matrix[0].relevanz = 9;
    p.listing.dimensionen[0].score = 400;
    const r = pruefeInsightsReport(p);
    expect(r.verstoesse.join(" ")).toContain("unmöglicher Relevanz");
    expect(r.verstoesse.join(" ")).toContain("unmöglichem Score");
  });

  /**
   * D271 (Nutzer-Befund 01.08., Screenshot „Dimension Bullet Points mit
   * unmöglichem Score 0"): Score 0 ist eine ECHTE Messung — `scoreFromIssues`
   * klemmt bei 0, ab vier Fehlern in einer Dimension ist 0 korrekt. „Nicht
   * bewertbar" trägt `measured=false` und kommt als `null` an. Vorher blockierte
   * genau das Listing mit dem größten Optimierungsbedarf sein Kunden-Dokument.
   */
  it("Score 0 ist ein gültiger Messwert und blockt das Dokument NICHT", () => {
    const p = baueInsightsReport(eingabe());
    p.listing.dimensionen[0].score = 0;
    const r = pruefeInsightsReport(p);
    expect(r.verstoesse.join(" ")).not.toContain("unmöglichem Score");
    expect(r.ok).toBe(true);
  });

  it("negative Scores bleiben unmöglich", () => {
    const p = baueInsightsReport(eingabe());
    p.listing.dimensionen[0].score = -1;
    expect(pruefeInsightsReport(p).verstoesse.join(" ")).toContain("unmöglichem Score");
  });
});
