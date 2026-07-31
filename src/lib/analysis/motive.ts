import { normalizeToken } from "@/lib/text/bytes";

/**
 * Kaufmotiv-Modell der Conversion Driver (D265, Nutzer 30.07.).
 *
 * Kern der Umstellung: Ein Conversion Driver ist NICHT ein Feature, NICHT ein
 * USP und NICHT ein häufig genanntes Review-Thema. Er ist das RESULTAT, das der
 * Kunde will — das Produkt ist nur das Mittel dahin. Er entsteht aus einem ODER
 * MEHREREN Features und wird feature-frei formuliert:
 *
 *   RESULTAT (Driver)            „Ohne Rückenbeschwerden durch den Arbeitstag"
 *     └── Nutzen-Baustein        „Sitzen↔Stehen im Wechsel, alltagstauglich"
 *           └── Feature [+USP]   stufenlos 61–126 cm · 3 Speicherplätze · 80 mm/s
 *
 * Zwei Fehler des Vorgänger-Modells, die das behebt:
 *  1. Reviews waren die EINZIGE Quelle. Niemand schreibt „dieser Tisch hat meine
 *     Rückenschmerzen beseitigt", also konnte der wichtigste Driver einer
 *     Kategorie strukturell nicht entstehen. Bewertungen sind post-purchase:
 *     Nennungshäufigkeit misst Erlebnis-Auffälligkeit, nicht Kaufrelevanz —
 *     sonst gewinnen Aufbau und Lieferumfang.
 *  2. Die Relevanz kam vom LLM (verdichtung.ts). Jetzt rechnet sie der Code aus
 *     nachprüfbaren Evidenz-Mengen (D154/D170/D178).
 *
 * Der USP-Flag sitzt am BAUSTEIN, nicht am Driver: Überlegenheit gegenüber dem
 * Wettbewerb steuert, welcher Beweis besonders herausgestellt wird — sie
 * verschiebt aber keine Driver-Rangfolge (ein Driver kann Kategorie-Standard
 * sein und trotzdem der Kaufgrund).
 */

export const MOTIV_KLASSEN = ["kern", "entscheidung", "absicherung", "hygiene"] as const;
export type MotivKlasse = (typeof MOTIV_KLASSEN)[number];

export const MOTIV_LABELS: Record<MotivKlasse, string> = {
  kern: "Kernmotiv — warum diese Produktkategorie überhaupt gekauft wird",
  entscheidung: "Entscheidungsmotiv — warum dieses Produkt statt eines anderen",
  absicherung: "Absicherungsmotiv — was die Angst vor dem Fehlkauf nimmt",
  hygiene: "Hygienefaktor — wird erst nach dem Kauf relevant, treibt keine Conversion",
};

/**
 * Grundpunkte je Motiv-Klasse. Hygienefaktoren (Aufbau, Verpackung,
 * Lieferumfang) bekommen 0 und werden NIE Driver — sie wirken auf Bewertungen
 * und Retouren, nicht auf die Kaufentscheidung.
 */
export const MOTIV_PUNKTE: Record<MotivKlasse, number> = {
  kern: 40,
  entscheidung: 25,
  absicherung: 15,
  hygiene: 0,
};

/**
 * Schwelle statt Quote (Nutzer 30.07.): Die alten Prompts verlangten „4–8
 * Erkenntnisse" bzw. „3–8 Blocker" — eine Untergrenze ist eine Aufforderung
 * zum Auffüllen, und aufgefüllt wird mit Features. Jetzt entscheidet der Score.
 *
 * 45 ist so gesetzt, dass ein Kernmotiv (40) allein NICHT reicht: es braucht
 * mindestens eine bestätigende Evidenz. Ein Entscheidungsmotiv (25) braucht 20
 * Punkte Evidenz, ein Absicherungsmotiv (15) 30 — Vertrauens-Elemente wie TÜV
 * werden also nur zum Driver, wenn Suchnachfrage oder Kundenstimmen sie stützen.
 */
export const DRIVER_SCHWELLE = 45;

/**
 * Notbremse, kein Ziel: Greift sie, ist die Schwelle zu weich justiert —
 * das wird als Hinweis ausgewiesen, damit es auffällt statt sich zu verstecken.
 */
export const DRIVER_NOTBREMSE = 8;

/** Evidenz-Mengen eines Driver-Kandidaten — ausschließlich Zählwerte, die der Code kennt. */
export type DriverEvidenz = {
  motivKlasse: MotivKlasse;
  /**
   * Anteil des Suchvolumens der treffenden Keywords am relevanten Gesamtvolumen
   * (0–1). Der EINZIGE gemessene Vorkauf-Datenpunkt, den wir haben — Suchen
   * passieren vor dem Kauf, Bewertungen danach. null = kein Keyword-Export.
   */
  suchvolumenAnteil: number | null;
  /** Wie viele der vorliegenden Wettbewerber-Listings bewerben dieses Resultat. */
  wettbewerberMit: number;
  wettbewerberGesamt: number;
  /** Verifizierte Fundstellen in EIGENEN Bewertungen (positiv). */
  eigeneNennungen: number;
  /** Analysierte Bewertungen der eigenen ASIN — Bezugsgröße, nie 0 geteilt. */
  stichprobe: number;
  /** Fundstellen in Wettbewerbs-Bewertungen mit Übertragbarkeits-Urteil „ja". */
  fremdeNennungenUebertragbar: number;
  /** Negative Themen, die einen Erwartungsbruch zu genau diesem Resultat zeigen. */
  negativeErwartungsbrueche: number;
  /** Harte Belege (Zahl, Norm, Zertifikat) aus ProductFacts oder Listing. */
  harteFakten: number;
};

export type ScoreAnteil = { quelle: string; punkte: number; beleg: string };

const clamp = (n: number, max: number) => Math.max(0, Math.min(max, Math.round(n)));

/**
 * Driver-Score 0–100, rein deterministisch. Jeder Eingang ist eine Menge oder
 * ein Verhältnis, das der Code besitzt — das LLM liefert nur Klassifizierung
 * und Formulierung. Dieselbe Formel für jedes Produkt: das ist die Bedingung
 * für konstante Qualität über verschiedene Listing-Optimierungen hinweg.
 *
 * Die Gewichte sind bewusst hier zentralisiert und versioniert (Regel-Register),
 * damit sie justierbar sind, ohne die Logik anzufassen.
 */
export function driverScore(e: DriverEvidenz): { score: number; anteile: ScoreAnteil[] } {
  const anteile: ScoreAnteil[] = [];

  const motiv = MOTIV_PUNKTE[e.motivKlasse];
  anteile.push({ quelle: "Motiv-Klasse", punkte: motiv, beleg: MOTIV_LABELS[e.motivKlasse] });

  if (e.suchvolumenAnteil !== null) {
    // 50 % des relevanten Suchvolumens → volle 20 Punkte.
    const p = clamp(e.suchvolumenAnteil * 40, 20);
    anteile.push({
      quelle: "Suchnachfrage",
      punkte: p,
      beleg: `${Math.round(e.suchvolumenAnteil * 100)} % des relevanten Suchvolumens (gemessenes Vorkauf-Verhalten)`,
    });
  }

  if (e.wettbewerberGesamt > 0) {
    const p = clamp((e.wettbewerberMit / e.wettbewerberGesamt) * 15, 15);
    anteile.push({
      quelle: "Wettbewerber-Konsens",
      punkte: p,
      beleg: `${e.wettbewerberMit} von ${e.wettbewerberGesamt} Wettbewerber-Listings bewerben dieses Resultat`,
    });
  }

  if (e.stichprobe > 0 && e.eigeneNennungen > 0) {
    // 10 % der analysierten Bewertungen nennen es → volle 15 Punkte.
    const p = clamp((e.eigeneNennungen / e.stichprobe) * 150, 15);
    anteile.push({
      quelle: "Eigene Bewertungen",
      punkte: p,
      beleg: `${e.eigeneNennungen} von ${e.stichprobe} analysierten Bewertungen nennen es`,
    });
  }

  if (e.stichprobe > 0 && e.fremdeNennungenUebertragbar > 0) {
    const p = clamp((e.fremdeNennungenUebertragbar / e.stichprobe) * 100, 10);
    anteile.push({
      quelle: "Wettbewerbs-Bewertungen",
      punkte: p,
      beleg: `${e.fremdeNennungenUebertragbar} übertragbare Fundstellen aus Bewertungen anderer Produkte`,
    });
  }

  if (e.negativeErwartungsbrueche > 0) {
    const p = clamp(e.negativeErwartungsbrueche * 5, 10);
    anteile.push({
      quelle: "Erwartungsbruch",
      punkte: p,
      beleg: `${e.negativeErwartungsbrueche} negative Themen zeigen, dass Kunden genau das erwarten`,
    });
  }

  if (e.harteFakten > 0) {
    anteile.push({ quelle: "Harter Beleg", punkte: 5, beleg: `${e.harteFakten} belegte Angabe(n) aus Produkt-Wahrheit oder Listing` });
  }

  const score = clamp(anteile.reduce((s, a) => s + a.punkte, 0), 100);
  return { score, anteile };
}

/** Relevanz 1–5 aus dem Score — feste Schwellen, keine KI-Einschätzung. */
export function relevanzAusScore(score: number): number {
  if (score >= 80) return 5;
  if (score >= 65) return 4;
  if (score >= 50) return 3;
  if (score >= DRIVER_SCHWELLE) return 2;
  return 1;
}

/**
 * Feature-Freiheits-Test (Nutzer 30.07.): Ein Driver ist ein Resultat. Steht
 * ein Merkmal drin, ist es ein Baustein und kein Driver.
 *
 *  ✓ „Ohne Rückenbeschwerden durch den Arbeitstag"
 *  ✗ „Stufenlos von 61 bis 126 cm"          (Zahl + Einheit)
 *  ✗ „Höhenverstellung in 5 Sekunden"        (Zahl + Einheit)
 *  ✗ „Zwei Motoren für leises Verstellen"    (Feature-Begriff des Bausteins)
 *
 * Deterministisch prüfbar, deshalb Gate statt Prompt-Bitte.
 */
const EINHEITEN = /\b\d+([.,]\d+)?\s*(mm|cm|m|kg|g|l|ml|db|w|v|h|min|sek|s|%|°|zoll)\b/i;

/**
 * Funktionswörter bleiben beim Feature-Abgleich außen vor. Sonst schlägt ein
 * Teilstring-Treffer wie „ohne" gegen einen Feature-Begriff an und blockt einen
 * völlig korrekten Driver-Titel — ein Fehlalarm wäre hier teurer als eine Lücke,
 * weil er das richtige Ergebnis verhindert.
 */
const FUNKTIONSWOERTER = new Set([
  "ohne", "durch", "mehr", "auch", "beim", "eine", "einen", "einem", "dein", "ihre", "ihrem",
  "sich", "nicht", "kein", "mein", "jede", "jeden", "damit", "dabei", "wieder", "immer",
  "ganz", "sehr", "schon", "noch", "statt", "gegen", "uber", "unter", "nach", "vor",
]);

export function pruefeResultatFeatureFrei(
  resultat: string,
  featureBegriffe: string[],
): { ok: boolean; verstoesse: string[] } {
  const verstoesse: string[] = [];
  if (/\d/.test(resultat)) verstoesse.push("enthält eine Zahl — Zahlen sind Beweise, keine Resultate");
  if (EINHEITEN.test(resultat)) verstoesse.push("enthält eine Maßeinheit — das ist ein Merkmal, kein Resultat");

  const tokens = new Set(
    resultat
      .split(/[\s\-–—/,.;:()"„“]+/)
      .map(normalizeToken)
      .filter((t) => t.length >= 4 && !FUNKTIONSWOERTER.has(t)),
  );
  for (const begriff of featureBegriffe) {
    for (const w of begriff.split(/[\s\-–—/,]+/)) {
      const stamm = normalizeToken(w);
      if (stamm.length < 4) continue;
      if ([...tokens].some((t) => t === stamm || t.includes(stamm) || stamm.includes(t))) {
        verstoesse.push(`enthält den Feature-Begriff „${w}" — gehört in einen Nutzen-Baustein`);
        break;
      }
    }
  }
  return { ok: verstoesse.length === 0, verstoesse: [...new Set(verstoesse)] };
}

export type DriverAuswahl<T> = {
  gewaehlt: T[];
  /** Kandidaten unter der Schwelle — gezählt, nie still (D133). */
  verworfen: number;
  /**
   * true = der oberste Driver hat die Schwelle NICHT erreicht und ist nur als
   * Pflicht-Mindest-Driver drin. Er trägt seine dünne Evidenz sichtbar mit.
   */
  mindestDriver: boolean;
  hinweise: string[];
};

/**
 * Auswahl: Schwelle, Notbremse, Pflicht-Minimum.
 *
 * Mindestens EIN Driver ist Pflicht (Nutzer 30.07.): Gäbe es keinen Grund, das
 * Produkt zu kaufen, müsste es das Produkt nicht geben. Das Minimum ist auch
 * immer erfüllbar, weil das Kernmotiv der Kategorie bekannt ist, sobald wir
 * wissen, WAS das Produkt ist. Damit daraus keine Quote durch die Hintertür
 * wird, gilt es NUR für den ersten Driver — jeder weitere muss die Schwelle aus
 * eigener Kraft erreichen — und der Mindest-Driver wird als solcher markiert.
 */
export function waehleDriver<T extends { score: number }>(kandidaten: T[]): DriverAuswahl<T> {
  const sortiert = [...kandidaten].sort((a, b) => b.score - a.score);
  const hinweise: string[] = [];
  if (sortiert.length === 0) {
    return {
      gewaehlt: [],
      verworfen: 0,
      mindestDriver: false,
      hinweise: [
        "Kein Driver-Kandidat vorhanden — das ist ein Datenfehler, kein Analyse-Ergebnis: ohne Produktnamen und Kategorie lässt sich kein Kernmotiv herleiten.",
      ],
    };
  }

  const ueberSchwelle = sortiert.filter((k) => k.score >= DRIVER_SCHWELLE);
  const mindestDriver = ueberSchwelle.length === 0;
  let gewaehlt = mindestDriver ? sortiert.slice(0, 1) : ueberSchwelle;

  if (mindestDriver) {
    hinweise.push(
      `Kein Kandidat erreicht die Driver-Schwelle (${DRIVER_SCHWELLE} Punkte). Der stärkste bleibt als Pflicht-Driver stehen und trägt seine dünne Evidenz sichtbar — Datenbasis nachschärfen (Wettbewerber-ASINs, Keyword-Export, Bewertungen).`,
    );
  }
  if (gewaehlt.length > DRIVER_NOTBREMSE) {
    hinweise.push(
      `Notbremse: ${gewaehlt.length} Kandidaten über der Schwelle, gezeigt werden ${DRIVER_NOTBREMSE}. So viele echte Kaufgründe hat ein Produkt selten — die Schwelle ist zu weich justiert (Bau-Auftrag, D182).`,
    );
    gewaehlt = gewaehlt.slice(0, DRIVER_NOTBREMSE);
  }

  return { gewaehlt, verworfen: sortiert.length - gewaehlt.length, mindestDriver, hinweise };
}
