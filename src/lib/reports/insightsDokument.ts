import type { ListingAnalysis } from "@/lib/analysis/listingAudit";
import type { ConversionDriverPayload } from "@/lib/analysis/driverTypen";
import { QUELL_LABEL } from "@/lib/analysis/driverTypen";
import type { AbdeckungsStufe, BildStufe } from "@/lib/analysis/abdeckung";
import type { InsightCard, ReviewInsightsPayload } from "@/db/schema";

/**
 * Insights-Dokument (D267) — das Kunden-Dokument als DETERMINISTISCHE PROJEKTION
 * vorhandener Analyse-Zeilen. Kein LLM-Aufruf zur Report-Zeit (D184): Es wird
 * kein Kapitel „getextet“. Fehlt eine Etappe, fällt das Kapitel weg und wird in
 * den Grenzen benannt — niemals ein Platzhalter, niemals geschätzt.
 *
 * Anti-Redundanz-Prinzip (Nutzer-Vorgabe): Jede Erkenntnis ist GENAU EINMAL
 * ausformuliert — in der Driver-Matrix. Danach wird nur über die Driver-ID
 * referenziert. Deshalb gibt es kein eigenes Blocker-Kapitel: ein Blocker ist
 * eine Zeile mit roter Ampel, und der Handlungsplan entsteht aus genau diesen
 * Zeilen.
 */

export type Ampel = "gut" | "teil" | "fehlt" | "unbekannt";

const TEXT_AMPEL: Record<AbdeckungsStufe, Ampel> = {
  prominent: "gut",
  erwaehnt: "teil",
  fehlt: "fehlt",
  nicht_erfasst: "unbekannt",
};

const BILD_AMPEL: Record<BildStufe, Ampel> = {
  belegt: "gut",
  schwach: "teil",
  fehlt: "fehlt",
  nicht_bewertet: "unbekannt",
  nicht_erfasst: "unbekannt",
};

export type InsightsReportPayload = {
  kopf: {
    produktName: string;
    asin: string | null;
    marktplatz: string;
    /** Eingefrorener Stand — der Kundenlink zeigt danach nie etwas anderes. */
    stand: string;
  };
  /** Vertrauensanker, keine Deko: was tatsächlich ausgewertet wurde. */
  datenbasis: {
    reviewsAmazon: number | null;
    ratingAvg: number | null;
    reviewsAnalysiert: number;
    wettbewerberAsins: number;
    wettbewerberListings: number;
    bilderAnalysiert: number;
    keywordsMitVolumen: number;
  };
  kernThese: string | null;
  kennzahlen: Array<{ label: string; wert: string }>;
  /** Das Herzstück: jede Erkenntnis genau einmal. */
  matrix: Array<{
    id: string;
    resultat: string;
    motiv: string;
    relevanz: number;
    quellen: string[];
    text: Ampel;
    bild: Ampel;
    zitat: string | null;
  }>;
  listing: {
    overall: number | null;
    dimensionen: Array<{ label: string; score: number | null; befund: string | null }>;
    bilder: Array<{ slot: number; design: number | null; botschaft: number | null; klarheit: number | null }>;
    ballast: Array<{ feature: string; prominent: boolean }>;
  };
  handlungsplan: {
    text: Array<{ massnahme: string; driverIds: string[] }>;
    bild: Array<{ slot: number | null; massnahme: string; driverIds: string[] }>;
  };
  risiken: Array<{ titel: string; beschreibung: string }>;
  /** Ehrliche Grenzen — der stärkste Vertrauensbeweis, nicht das Kleingedruckte. */
  grenzen: string[];
};

/** Harte Obergrenzen (Nutzer-Vorgabe): das Dokument darf mit der Datenmenge nicht mitwachsen. */
export const GRENZEN = { matrix: 10, textMassnahmen: 6, bildMassnahmen: 5, risiken: 4, grenzenZeilen: 8 } as const;

const MOTIV_TEXT = {
  kern: "Kernmotiv",
  entscheidung: "Entscheidungsmotiv",
  absicherung: "Absicherungsmotiv",
} as const;

/** Erstes verifiziertes Zitat zu einem Driver — max. eines je Zeile, gekürzt, ohne Namen. */
function zitatFuer(driver: ConversionDriverPayload["driver"][number], insights: ReviewInsightsPayload | null): string | null {
  if (!insights) return null;
  const labels = new Set(
    driver.bausteine
      .flatMap((b) => b.belege)
      .filter((x) => x.quelle === "reviews_eigene" || x.quelle === "reviews_fremde")
      .map((x) => x.fundstelle.toLowerCase().trim()),
  );
  if (labels.size === 0) return null;
  for (const a of [...insights.buyingTriggers, ...insights.painPoints]) {
    if (!labels.has(a.label.toLowerCase().trim())) continue;
    const q = a.quotes.find((x) => x.trim());
    if (q) return q.trim().slice(0, 160);
  }
  return null;
}

export type ReportEingabe = {
  produktName: string;
  asin: string | null;
  marktplatz: string;
  stand: Date;
  driver: ConversionDriverPayload;
  insights: ReviewInsightsPayload | null;
  analysis: ListingAnalysis | null;
  /** Verdichtete Karten ohne positive Tendenz — Erwartungs-Management. */
  risikoKarten: InsightCard[];
  amazonTotals: { reviewsTotal: number | null; ratingAvg: number | null } | null;
  wettbewerberAsins: number;
  bilder: Array<{ slot: number; design: number | null; botschaft: number | null; klarheit: number | null; wieBesser?: string }>;
  keywordsMitVolumen: number;
};

/**
 * Projektion — reine Datenaufbereitung, kein Kreativ-Raten.
 *
 * Der Handlungsplan entsteht aus den BLOCKERN, nicht aus einer zweiten Liste:
 * jeder Blocker ist bereits eine benannte Lücke mit Driver-Referenz. Die
 * Bild-Maßnahmen werden mit `wieBesser` des betroffenen Slots aus dem Bild-Audit
 * angereichert — fertige Handlungsempfehlung statt allgemeiner Bildidee.
 */
export function baueInsightsReport(e: ReportEingabe): InsightsReportPayload {
  const d = e.driver;

  const matrix = d.driver.slice(0, GRENZEN.matrix).map((drv) => {
    // Schlechteste Stufe über alle Bausteine: die Ampel darf nicht schöner sein
    // als der schwächste Beweis, auf dem das Resultat steht.
    const rang: Record<Ampel, number> = { fehlt: 0, teil: 1, unbekannt: 2, gut: 3 };
    const schlechteste = (werte: Ampel[]): Ampel =>
      werte.length === 0 ? "unbekannt" : werte.reduce((a, b) => (rang[b] < rang[a] ? b : a));
    return {
      id: drv.id,
      resultat: drv.resultat,
      motiv: MOTIV_TEXT[drv.motivKlasse],
      relevanz: drv.relevanz,
      quellen: [...new Set(drv.bausteine.flatMap((b) => b.belege).map((b) => QUELL_LABEL[b.quelle]))],
      text: schlechteste(drv.bausteine.map((b) => TEXT_AMPEL[b.textStufe])),
      bild: schlechteste(drv.bausteine.map((b) => BILD_AMPEL[b.bildStufe])),
      zitat: zitatFuer(drv, e.insights),
    };
  });

  const istBildFall = (f: string) => f === "bildbeweis_fehlt" || f === "beweis_schwach";
  const wieBesserFuer = (slot: number | undefined) =>
    slot === undefined ? undefined : e.bilder.find((b) => b.slot === slot)?.wieBesser?.trim() || undefined;

  const textMassnahmen = d.blocker
    .filter((b) => !istBildFall(b.fall))
    .slice(0, GRENZEN.textMassnahmen)
    .map((b) => ({ massnahme: b.titel, driverIds: [b.driverId] }));

  const bildMassnahmen = d.blocker
    .filter((b) => istBildFall(b.fall))
    .slice(0, GRENZEN.bildMassnahmen)
    .map((b) => {
      const besser = wieBesserFuer(b.bildSlot);
      return {
        slot: b.bildSlot ?? null,
        massnahme: besser ? `${b.titel} — Empfehlung: ${besser}` : b.titel,
        driverIds: [b.driverId],
      };
    });

  const grenzen: string[] = [...d.hinweise];
  if (e.insights?.qualitaetsNotizen?.length) grenzen.push(...e.insights.qualitaetsNotizen);
  if (!e.analysis) grenzen.push("Die Listing-Kontrolle lag zum Zeitpunkt dieses Dokuments nicht vor — die Score-Zeilen fehlen deshalb.");
  if (e.bilder.length === 0) grenzen.push("Es lag keine Bildanalyse vor — Bildbeweise sind nicht bewertet, es wird keine Bildlücke behauptet.");

  const kennzahlen: Array<{ label: string; wert: string }> = [];
  if (e.analysis?.overall !== null && e.analysis?.overall !== undefined) {
    kennzahlen.push({ label: "Listing-Score", wert: `${e.analysis.overall}/100` });
  }
  kennzahlen.push({ label: "Belegte Kaufgründe", wert: String(d.driver.length) });
  kennzahlen.push({ label: "Davon ohne Beweis im Listing", wert: String(new Set(d.blocker.map((b) => b.driverId)).size) });

  return {
    kopf: {
      produktName: e.produktName,
      asin: e.asin,
      marktplatz: e.marktplatz,
      stand: e.stand.toISOString(),
    },
    datenbasis: {
      reviewsAmazon: e.amazonTotals?.reviewsTotal ?? null,
      ratingAvg: e.amazonTotals?.ratingAvg ?? null,
      reviewsAnalysiert: d.stats.stichprobe,
      wettbewerberAsins: e.wettbewerberAsins,
      wettbewerberListings: d.stats.wettbewerberGesamt,
      bilderAnalysiert: e.bilder.length,
      keywordsMitVolumen: e.keywordsMitVolumen,
    },
    kernThese: e.insights?.kernThese ?? null,
    kennzahlen,
    matrix,
    listing: {
      overall: e.analysis?.overall ?? null,
      // Nicht messbare Dimensionen tragen score null — „nicht bewertbar“ statt 0 (D70).
      dimensionen: (e.analysis?.dimensions ?? []).map((dim) => ({
        label: dim.label,
        score: dim.measured ? dim.score : null,
        befund: dim.findings[0] ?? null,
      })),
      bilder: e.bilder.map(({ slot, design, botschaft, klarheit }) => ({ slot, design, botschaft, klarheit })),
      ballast: d.ballast.map((b) => ({ feature: b.feature, prominent: b.fundstelle === "prominent" })),
    },
    handlungsplan: { text: textMassnahmen, bild: bildMassnahmen },
    risiken: [
      ...e.risikoKarten.map((k) => ({ titel: k.titel, beschreibung: k.beschreibung })),
      ...d.produktFeedback.map((f) => ({
        titel: f.label,
        beschreibung: "Betrifft Produkt oder Verpackung — über den Listing-Text nicht lösbar.",
      })),
    ].slice(0, GRENZEN.risiken),
    grenzen: [...new Set(grenzen)].slice(0, GRENZEN.grenzenZeilen),
  };
}

/**
 * Auslieferungs-Gate (D182/D183): Nur ein vollständiges Dokument erreicht den
 * Kunden. Kein Report ohne Datenbasis-Angabe, ohne mindestens eine Matrix-Zeile
 * und ohne Beleg-Quelle je Zeile — und keine Zahl ohne Herkunft.
 */
export function pruefeInsightsReport(p: InsightsReportPayload): { ok: boolean; verstoesse: string[] } {
  const verstoesse: string[] = [];

  if (!p.kopf.produktName.trim()) verstoesse.push("Kopf ohne Produktnamen.");
  if (!p.kopf.stand) verstoesse.push("Kein eingefrorener Stand — ein Dokument ohne Datum ist nicht belastbar.");

  const db = p.datenbasis;
  if (db.reviewsAnalysiert === 0 && db.wettbewerberListings === 0 && db.keywordsMitVolumen === 0) {
    verstoesse.push(
      "Keine Datenbasis: weder analysierte Bewertungen noch Wettbewerber-Listings noch Keywords mit Suchvolumen — das Dokument hätte nichts zu belegen.",
    );
  }

  if (p.matrix.length === 0) verstoesse.push("Keine Kaufgründe in der Matrix — ohne sie hat das Dokument keinen Inhalt.");
  for (const z of p.matrix) {
    if (!z.id.trim()) verstoesse.push("Matrix-Zeile ohne ID — der Handlungsplan könnte nicht darauf verweisen.");
    if (z.quellen.length === 0) verstoesse.push(`„${z.resultat}“ ohne Beleg-Quelle.`);
    if (z.relevanz < 1 || z.relevanz > 5) verstoesse.push(`„${z.resultat}“ mit unmöglicher Relevanz ${z.relevanz}.`);
  }

  // Jede Maßnahme MUSS auf eine Matrix-Zeile verweisen — sonst entsteht genau die
  // zweite, unverbundene Liste, die dieses Dokument vermeiden soll.
  const ids = new Set(p.matrix.map((z) => z.id));
  for (const m of [...p.handlungsplan.text, ...p.handlungsplan.bild]) {
    if (m.driverIds.length === 0 || m.driverIds.some((x) => !ids.has(x))) {
      verstoesse.push(`Maßnahme ohne gültige Kaufgrund-Referenz: „${m.massnahme.slice(0, 60)}“.`);
    }
  }

  // D271 (Nutzer-Befund 01.08., Screenshot INS-01): Die Untergrenze stand auf 1,
  // weil „0 = nicht bewertbar“ als Falschaussage galt (D70). Das war ein
  // Denkfehler: „nicht bewertbar“ trägt bereits `measured=false` und kommt hier
  // als `null` an (siehe Projektion oben). Eine 0 in diesem Feld ist eine ECHTE
  // Messung — `scoreFromIssues` (listingAudit.ts) klemmt bei 0, und ab vier
  // Fehlern in einer Dimension ist 0 der korrekte Wert. Ergebnis: Genau die
  // Listings mit dem größten Optimierungsbedarf konnten kein Kunden-Dokument
  // bekommen. Erlaubt ist jetzt der volle Messbereich 0–100.
  for (const dim of p.listing.dimensionen) {
    if (dim.score !== null && (dim.score < 0 || dim.score > 100)) {
      verstoesse.push(`Dimension „${dim.label}“ mit unmöglichem Score ${dim.score}.`);
    }
  }

  return { ok: verstoesse.length === 0, verstoesse };
}
