import { describe, it, expect } from "vitest";
import { analyzeListing, deckungsgrad } from "./listingAudit";
import type { ReviewInsightsPayload } from "@/db/schema";

/**
 * Kundenstimmen-Abgleich (D117) — der Northpoint-Fall: Die freigegebenen
 * Bullets adressieren die Top-Pain-Points mit POSITIVER Sprache, der alte
 * Abgleich verlangte aber JEDES Wort des Beschwerde-Satzes wörtlich in den
 * Bullets → dauerhaft 0/5. Der Themen-Abgleich matcht Wortstämme
 * komposita-bewusst („Lampe" trifft „Arbeitslampe", „Batteriefach" trifft
 * „Batterien") und weist die Treffer aus.
 */

// Die LIVE-Bullets des Northpoint-Listings (Screenshot 21.07.)
const northpointBullets = [
  "HELLE LED-ARBEITSLAMPE MIT MAGNET - 300 LUMEN AUF KNOPFDRUCK: Diese kabellose LED-Werkstattlampe liefert gleichmäßige 300 Lumen Lichtstärke und beleuchtet selbst dunkle Ecken in Keller, Carport oder Kfz-Werkstatt zuverlässig - ohne Stromanschluss, ohne Kompromisse",
  "DREIFACH-MAGNETHALTERUNG HÄLT SICHER AN ORT UND STELLE: Drei starke Magnete sorgen für festen Halt an Metallwerkzeug, Karosserie oder Regalen - kein Verrutschen, kein Herunterfallen",
  "ROBUSTE STABLEUCHTE FÜR ANSPRUCHSVOLLEN DAUEREINSATZ: Mit einem kompakten Maß von ca. 22 × 5,5 × 2,2 cm liegt die LED-Arbeitsleuchte sicher in der Hand. Der Schalter ist auf Langlebigkeit ausgelegt, und die Verarbeitung ist auf professionellen Einsatz in Werkstatt, auf der Baustelle und beim Heimwerken gedacht.",
  "INHALT & BETRIEB - ALLES WICHTIGE AUF EINEN BLICK: Die Arbeitslampe wird mit 4× AA-Batterien (Typ LR6) betrieben - nicht im Lieferumfang enthalten. Die Leuchtdauer beträgt bis zu 5 Stunden pro Batteriesatz.",
  "VIELSEITIG EINSETZBAR - NORTHPOINT QUALITÄT OHNE RISIKO: Ob als Kfz-Lampe, Inspektionsleuchte oder Campinglampe - die Northpoint LED-Arbeitslampe überzeugt durch klare Ausleuchtung und unkomplizierte Handhabung. Northpoint steht für geprüfte Qualität: Bei Fragen oder Mängeln steht der Kundenservice zur Verfügung",
];

// Die Top-5-Pain-Points aus der Bewertungs-Analyse (Screenshot 21.07.)
const painPoint = (label: string, frequencyPct: number) => ({ label, frequencyPct, mentionCount: null, quotes: [] });
const insights: ReviewInsightsPayload = {
  sources: ["test"],
  stats: { reviewsTotal: 317, ratingAvg: 4.2 },
  painPoints: [
    painPoint("Magnete zu schwach – halten Lampe nicht sicher an vertikalen/mobilen Flächen", 28),
    painPoint("Wackelkontakte Batteriefach – Lampe flackert oder fällt aus", 18),
    painPoint("Zu schwache Helligkeit – reicht nicht für Arbeiten/Ausleuchtung", 16),
    painPoint("Gehäuse nicht stoßfest – bricht/reißt bei Sturz", 14),
    painPoint("Batterien schnell leer – kurze Laufzeit", 12),
  ],
  buyingTriggers: [],
  languageToBorrow: [],
  languageToAvoid: [],
};

const analyse = () =>
  analyzeListing({
    snapshot: {
      title: "Northpoint LED Arbeitslampe 300 Lumen mit Magnet, kabellos, batteriebetrieben",
      bullets: northpointBullets,
      description: "",
      backendKeywords: "",
    },
    facts: {},
    primaryKeywords: [],
    reviewInsights: insights,
  });

describe("Kundenstimmen-Abgleich (Themen-Abgleich D117)", () => {
  it("Northpoint-Regression: adressierte Pain-Points werden erkannt (nicht mehr 0/5)", () => {
    const voc = analyse().dimensions.find((d) => d.key === "voc");
    expect(voc).toBeDefined();
    // Magnete (Bullet 2), Batteriefach/Lampe (Bullet 4), Helligkeit/Ausleuchtung (Bullet 1+5)
    expect(voc!.score).toBeGreaterThanOrEqual(60);
    const text = voc!.findings.join("\n");
    expect(text).toContain("Adressiert: „Magnete zu schwach");
    expect(text).toContain("Adressiert: „Zu schwache Helligkeit");
  });

  it("weist Themen-Treffer aus und bleibt bei fehlenden Themen ehrlich", () => {
    const voc = analyse().dimensions.find((d) => d.key === "voc")!;
    const text = voc.findings.join("\n");
    // Adressierte zeigen, WELCHE Wörter getroffen wurden
    expect(text).toMatch(/Themen-Treffer in den Bullets: .*Magnete/);
    // Stoßfestigkeit kommt in den Live-Bullets thematisch nicht vor → ehrlich „nicht adressiert"
    expect(text).toContain("Nicht adressiert: „Gehäuse nicht stoßfest");
    // Transparenz-Hinweis auf die Grenzen der Wortstamm-Heuristik
    expect(text).toContain("wortstamm-basiert");
  });

  it("ein Bullet, der den Einwand nur wörtlich NICHT wiederholt, zählt trotzdem (positive Konter-Sprache)", () => {
    // Genau der alte Fehler: „schwach", „vertikalen", „Flächen" stehen nie in den
    // Bullets — der Magnet-Pain-Point muss über Magnete/halten/sicher matchen.
    const voc = analyse().dimensions.find((d) => d.key === "voc")!;
    expect(voc.findings.join("\n")).not.toContain("Nicht adressiert: „Magnete zu schwach");
  });
});

describe("deckungsgrad (D126) — ist unser Soll live?", () => {
  const soll = "HELLES LICHT: 300 Lumen leuchten Werkstatt und Keller zuverlässig aus. Drei starke Magnete halten sicher.";
  it("identischer Text = 100 %", () => {
    expect(deckungsgrad(soll, soll)).toBe(100);
  });
  it("leicht abgeänderter Text bleibt über 85 % (Kunde formuliert beim Einstellen minimal um)", () => {
    const live = "HELLES LICHT: 300 Lumen leuchten Werkstatt und Keller zuverlässig aus. Drei kräftige Magnete halten sicher fest.";
    expect(deckungsgrad(soll, live)).toBeGreaterThanOrEqual(85);
  });
  it("fremder Text liegt deutlich darunter", () => {
    const fremd = "Praktische Taschenlampe für unterwegs mit USB-Anschluss und Ladekabel im Lieferumfang.";
    expect(deckungsgrad(soll, fremd)).toBeLessThan(50);
  });
  it("leeres Soll = 0 (ehrlich, kein Fake-Treffer)", () => {
    expect(deckungsgrad("", "irgendwas")).toBe(0);
  });
});
