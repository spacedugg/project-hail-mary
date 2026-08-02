import type { ListingAnalysis } from "@/lib/analysis/listingAudit";
import type { ConversionDriverPayload } from "@/lib/analysis/driverTypen";
import { QUELL_LABEL } from "@/lib/analysis/driverTypen";
import type { AbdeckungsStufe, BildStufe } from "@/lib/analysis/abdeckung";
import type { ReviewInsightsPayload } from "@/db/schema";

/**
 * Insights-Dokument (D267, Kapitel neu geschnitten in D277) — das Kunden-Dokument
 * als DETERMINISTISCHE PROJEKTION vorhandener Analyse-Zeilen. Kein LLM-Aufruf zur
 * Report-Zeit (D184): Es wird kein Kapitel „getextet“. Fehlt eine Etappe, fällt
 * das Kapitel ersatzlos weg — niemals ein Platzhalter, niemals geschätzt.
 *
 * Kapitelfolge (Nutzer-Vorgabe 02.08.2026), vom Befund zur Maßnahme:
 * Titelblock → Findings aus Bewertungen → USPs → Kaufgründe → Blocker →
 * Handlungsplan.
 *
 * NICHT im Dokument (bewusst, Nutzer-Vorgabe): „Grenzen dieser Analyse“,
 * „Erwartungen, die wir ehrlich setzen sollten“ und die Noten-Tabelle der
 * aktuellen Bilder. Alles drei bleibt intern erhalten und im Tool sichtbar —
 * beim Kunden lenkte es von den Befunden ab. Die Bild-Noten wirken weiter, aber
 * nur dort, wo sie handlungsrelevant sind: als „wieBesser“ in den Bild-Maßnahmen.
 *
 * Anti-Redundanz-Prinzip (D267, weiter gültig): Jeder Kaufgrund ist GENAU EINMAL
 * ausformuliert — in der Matrix. Blocker und Handlungsplan referenzieren ihn nur
 * noch über die Driver-ID; das Blocker-Kapitel wiederholt keine Analyse, es
 * bündelt die roten Zeilen.
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
    /** Ein Satz: warum diese Motiv-Klasse — macht den Kaufgrund nachvollziehbar (D278). */
    einordnung: string | null;
  }>;
  /**
   * Was Kunden sagen (D277, Nutzer-Vorgabe 02.08.: „Was natürlich wichtig ist,
   * sind so Findings aus Bewertungen. Da gerne die Aufschlüsselung, was ist gut,
   * was ist schlecht und wie das belegt ist.").
   *
   * Vorher tauchten die Roh-Findings im Kunden-Dokument NICHT auf — nur als
   * einzelnes Zitat in einer Matrix-Zeile. Damit fehlte dem Kunden genau die
   * Ebene, die er selbst nachlesen kann: die Stimmen seiner Käufer.
   */
  findings: {
    positiv: Array<{ label: string; nennungen: number | null; zitat: string | null; nurFremd: boolean }>;
    negativ: Array<{ label: string; nennungen: number | null; zitat: string | null; nurFremd: boolean }>;
  };
  /** Belegbare USPs (D277) — was das Produkt auszeichnet, aus der Produkt-Wahrheit. */
  usps: string[];
  listing: {
    overall: number | null;
    dimensionen: Array<{ label: string; score: number | null; befund: string | null }>;
  };
  /**
   * Conversion-Blocker als EIGENES Kapitel (D277): Bisher waren sie nur implizit
   * im Handlungsplan sichtbar. Der Kunde soll erst sehen, WAS blockiert, dann
   * was wir dagegen tun. `ballast` gehört fachlich dazu — Merkmale, die Platz
   * belegen, ohne einen Kaufgrund zu stützen.
   */
  blocker: Array<{
    titel: string;
    driverId: string;
    resultat: string | null;
    art: "text" | "bild";
    /**
     * Fliesstext (D278): warum das eine Luecke ist und was sie beim Kaeufer
     * ausloest. Derselbe deterministische Text wie im Tool — das Kundendokument
     * war „sehr kurz und vermisst eigentlich saemtliche Informationen"
     * (Nutzer 02.08.), weil hier nur der Titelsatz stand.
     */
    begruendung: string | null;
  }>;
  ballast: Array<{ feature: string; prominent: boolean }>;
  handlungsplan: {
    text: Array<{ massnahme: string; driverIds: string[] }>;
    bild: Array<{ slot: number | null; massnahme: string; driverIds: string[] }>;
  };
};

/**
 * Harte Obergrenzen (Nutzer-Vorgabe): das Dokument darf mit der Datenmenge nicht
 * mitwachsen. `findings` folgt dem Anzeige-Deckel aus D273 — acht je Seite sind
 * die Grenze, ab der niemand mehr weiß, was wirklich wichtig ist.
 */
export const GRENZEN = {
  matrix: 10,
  textMassnahmen: 6,
  bildMassnahmen: 5,
  findings: 8,
  usps: 6,
  blocker: 8,
  ballast: 6,
} as const;

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
  /** Belegbare USPs aus der Produkt-Wahrheit (D277) — eigenes Kapitel im Dokument. */
  usps: string[];
  amazonTotals: { reviewsTotal: number | null; ratingAvg: number | null } | null;
  wettbewerberAsins: number;
  /**
   * Bild-Audit — NUR noch als Quelle für „wieBesser“ in den Bild-Maßnahmen.
   * Die Noten-Tabelle je Bild ist aus dem Dokument raus (D277, Nutzer: „Auch die
   * Analyse der aktuellen Bilder muss nicht zu finden sein“); die Empfehlung,
   * die daraus folgt, bleibt — sie ist der handlungsrelevante Teil.
   */
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
      // D278: Der Kaufgrund braucht im Dokument mehr als eine Zeile — die
      // Motiv-Einordnung erklaert, WARUM er als Kaufgrund gilt.
      einordnung: drv.motivBegruendung?.trim() || null,
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

  /**
   * Roh-Findings fürs Kunden-Dokument (D277). Ausgewählt wie im Tool (D273):
   * die wichtigsten nach verifizierten Fundstellen, der Code entscheidet.
   * `nurFremd` markiert Befunde, die es NUR bei Wettbewerbern gibt (D275) —
   * beim Kunden ist das ein Marktsignal, kein Vorwurf an sein Produkt.
   */
  const findingsAus = (liste: ReviewInsightsPayload["painPoints"]) =>
    [...liste]
      .map((f, i) => ({ f, i }))
      .sort((a, b) => (b.f.mentionCount ?? -1) - (a.f.mentionCount ?? -1) || a.i - b.i)
      .slice(0, GRENZEN.findings)
      .map(({ f }) => ({
        label: f.label,
        nennungen: f.mentionCount,
        zitat: f.quotes.find((q) => q.trim())?.trim().slice(0, 180) ?? null,
        nurFremd: Boolean(f.herkunft && f.herkunft.eigene === 0 && f.herkunft.fremde > 0),
      }));

  // Blocker als eigenes Kapitel: der Resultat-Text macht aus einer ID einen Satz,
  // den ein Kunde ohne Matrix-Blick versteht.
  const resultatVon = new Map(d.driver.map((drv) => [drv.id, drv.resultat]));
  const blocker = d.blocker.slice(0, GRENZEN.blocker).map((b) => ({
    titel: b.titel,
    driverId: b.driverId,
    resultat: resultatVon.get(b.driverId) ?? null,
    art: (istBildFall(b.fall) ? "bild" : "text") as "text" | "bild",
    begruendung: b.begruendung?.trim() || null,
  }));

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
    findings: {
      positiv: findingsAus(e.insights?.buyingTriggers ?? []),
      negativ: findingsAus(e.insights?.painPoints ?? []),
    },
    usps: e.usps.map((u) => u.trim()).filter(Boolean).slice(0, GRENZEN.usps),
    matrix,
    listing: {
      overall: e.analysis?.overall ?? null,
      // Nicht messbare Dimensionen tragen score null — „nicht bewertbar“ statt 0 (D70).
      dimensionen: (e.analysis?.dimensions ?? []).map((dim) => ({
        label: dim.label,
        score: dim.measured ? dim.score : null,
        befund: dim.findings[0] ?? null,
      })),
    },
    blocker,
    ballast: d.ballast.slice(0, GRENZEN.ballast).map((b) => ({ feature: b.feature, prominent: b.fundstelle === "prominent" })),
    handlungsplan: { text: textMassnahmen, bild: bildMassnahmen },
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
