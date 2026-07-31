import { resolveRecipe } from "@/lib/llm/registry";
import { llmJsonLauf } from "@/lib/llm/qmLauf";
import { quellTexte, type FeatureQuellen } from "@/lib/analysis/featureRanking";
import type { RoheAspekte } from "@/lib/reviews/verdichtung";
import type { BildBeleg } from "@/lib/analysis/abdeckung";
import { MOTIV_KLASSEN, type MotivKlasse } from "@/lib/analysis/motive";
import { fuegeKandidatenZusammen, type DriverKandidat } from "@/lib/analysis/driverAufbau";
import { DRIVER_QUELLEN, type DriverQuelle } from "@/lib/analysis/driverTypen";

/**
 * Kandidaten-Ernte (D265): Je Quelle eine EIGENE, enge Extraktion — nie ein
 * Sammel-Prompt. Der Vorgänger warf alle Review-Aspekte in einen Lauf und
 * verlangte „4–8 Erkenntnisse"; das Modell sah dabei weder Produkt noch
 * Listing, und eine Mengen-Untergrenze ist eine Aufforderung zum Auffüllen.
 *
 * Fünf Läufe für sieben Quellen: „Produkt-Wahrheit + eigenes Listing +
 * Kategorie" teilen einen Lauf, weil es dasselbe Korpus ist — die Belege
 * unterscheiden die Quelle trotzdem einzeln, und der Code stempelt die
 * erlaubten Quellen je Lauf (D133-Muster: das Modell kann keine Quelle
 * behaupten, die es nicht bekommen hat).
 *
 * Was hier NICHT passiert: zählen, gewichten, auswählen, Titel für Blocker
 * bauen. Das macht `driverAufbau.ts` (D184).
 */

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

type RawBeleg = { quelle?: unknown; fundstelle?: unknown; ref?: unknown };
type RawBaustein = { nutzen?: unknown; features?: unknown; belege?: unknown; usp?: unknown };
type RawKandidat = { resultat?: unknown; motivKlasse?: unknown; motivBegruendung?: unknown; bausteine?: unknown };

const istQuelle = (v: string): v is DriverQuelle => (DRIVER_QUELLEN as readonly string[]).includes(v);
const istKlasse = (v: string): v is MotivKlasse => (MOTIV_KLASSEN as readonly string[]).includes(v);

export type ErnteErgebnis = { kandidaten: DriverKandidat[]; verworfen: number; hinweise: string[] };

/**
 * Struktur erzwingen und Belege verifizieren.
 *
 * - Nur die dem Lauf erlaubten Quellen zählen — alles andere fliegt.
 * - Wo die Quelle Text hat (`verbatimTexte`), muss die Fundstelle wörtlich
 *   darin stehen (D133). Für `reviews_*` und `suchnachfrage` prüft der
 *   Aufbau-Schritt gegen Aspekte bzw. Keyword-Basis — dort wäre eine zweite
 *   Prüfung an dieser Stelle nur eine zweite Wahrheit.
 * - Ein Baustein ohne verifizierten Beleg fliegt; ein Kandidat ohne Baustein
 *   ebenfalls. Beides gezählt, nie still.
 */
export function normalisiereKandidaten(
  raw: unknown,
  erlaubteQuellen: DriverQuelle[],
  verbatimTexte: Partial<Record<DriverQuelle, string>> = {},
): { kandidaten: DriverKandidat[]; verworfen: number } {
  const o = (raw ?? {}) as Record<string, unknown>;
  const liste = Array.isArray(o.driver) ? (o.driver as RawKandidat[]) : [];
  const erlaubt = new Set(erlaubteQuellen);
  let verworfen = 0;

  const kandidaten: DriverKandidat[] = [];
  for (const kRoh of liste) {
    // Null-Einträge in der Antwort dürfen den Lauf nicht abbrechen — eine
    // kaputte Struktur ist ein zu verwerfender Kandidat, kein Crash.
    const k = (kRoh ?? {}) as RawKandidat;
    const resultat = String(k.resultat ?? "").trim();
    const klasseRoh = String(k.motivKlasse ?? "").trim().toLowerCase();
    if (!resultat || !istKlasse(klasseRoh)) {
      verworfen++;
      continue;
    }

    const bausteine: DriverKandidat["bausteine"] = [];
    for (const bRohNull of Array.isArray(k.bausteine) ? (k.bausteine as RawBaustein[]) : []) {
      const bRoh = (bRohNull ?? {}) as RawBaustein;
      const nutzen = String(bRoh.nutzen ?? "").trim();
      if (!nutzen) continue;

      const belege: DriverKandidat["bausteine"][number]["belege"] = [];
      for (const rRohNull of Array.isArray(bRoh.belege) ? (bRoh.belege as RawBeleg[]) : []) {
        const rRoh = (rRohNull ?? {}) as RawBeleg;
        const quelle = String(rRoh.quelle ?? "").trim().toLowerCase();
        const fundstelle = String(rRoh.fundstelle ?? "").trim();
        if (!istQuelle(quelle) || !erlaubt.has(quelle) || fundstelle.length < 3) continue;
        const text = verbatimTexte[quelle];
        if (text !== undefined && !norm(text).includes(norm(fundstelle))) continue;
        const ref = String(rRoh.ref ?? "").trim();
        if (belege.some((x) => x.quelle === quelle && norm(x.fundstelle) === norm(fundstelle))) continue;
        belege.push({ quelle, fundstelle: fundstelle.slice(0, 300), ...(ref ? { ref: ref.slice(0, 60) } : {}) });
      }
      if (belege.length === 0) continue; // Baustein ohne verifizierten Beleg

      bausteine.push({
        nutzen: nutzen.slice(0, 160),
        features: (Array.isArray(bRoh.features) ? bRoh.features : [])
          .map((f) => String(f ?? "").trim())
          .filter(Boolean)
          .slice(0, 6),
        belege,
        usp: bRoh.usp === true,
      });
    }

    if (bausteine.length === 0) {
      verworfen++;
      continue;
    }

    kandidaten.push({
      resultat: resultat.slice(0, 120),
      motivKlasse: klasseRoh,
      motivBegruendung: String(k.motivBegruendung ?? "").trim().slice(0, 300),
      bausteine,
    });
  }

  return { kandidaten, verworfen };
}

/** Gemeinsame Regeln — wortgleich in jedem Ernte-Prompt, damit die Läufe vergleichbar bleiben. */
const REGELN = `REGELN (gelten in JEDEM Fall):
1. resultat = das ERGEBNIS, das der Kunde will. Feature-frei: KEINE Zahl, KEINE Maßeinheit, KEIN Merkmalsname.
   richtig: "Ohne Rückenbeschwerden durch den Arbeitstag" · falsch: "Stufenlos von 61 bis 126 cm" · falsch: "Leises Verstellen dank Motoren"
2. Ein Resultat entsteht aus EINEM ODER MEHREREN Merkmalen. Die Merkmale gehören in die Bausteine, nie ins resultat.
3. Zwei Resultate sind nur dann getrennt, wenn ein Käufer das eine wollen und beim anderen gleichgültig bleiben kann. Sonst zu EINEM zusammenfassen.
4. KEINE Mindestmenge. Liefere so viele Resultate, wie die Quelle wirklich belegt — oft sind es zwei bis vier, manchmal eines. Nichts auffüllen, kein Merkmal zum Resultat aufwerten.
5. motivKlasse: "kern" (warum diese Produktkategorie überhaupt gekauft wird) · "entscheidung" (warum dieses Produkt statt eines anderen) · "absicherung" (was die Angst vor dem Fehlkauf nimmt) · "hygiene" (wird erst NACH dem Kauf relevant: Aufbau, Verpackung, Lieferumfang). Hygiene-Themen NICHT weglassen, sondern als "hygiene" liefern — der Code sortiert sie aus und weist sie aus.
6. usp: true nur, wenn dieser Baustein dem Wettbewerb nachweislich überlegen ist.
7. Jeder Baustein braucht mindestens einen Beleg. Nichts erfinden.`;

const SCHEMA = `JSON-Schema:
{"driver":[{"resultat":"...","motivKlasse":"kern|entscheidung|absicherung|hygiene","motivBegruendung":"ein Satz","bausteine":[{"nutzen":"...","features":["..."],"usp":false,"belege":[{"quelle":"...","fundstelle":"wörtliches Zitat aus der Quelle","ref":"optional"}]}]}]}`;

const SYSTEM =
  "Du leitest aus Amazon-Produktdaten die Kaufgründe ab: das Resultat, das der Kunde will — nicht die Merkmale des Produkts. " +
  "Antworte AUSSCHLIESSLICH mit validem JSON nach dem geforderten Schema.";

function kontraktFuer(erlaubte: DriverQuelle[], texte: Partial<Record<DriverQuelle, string>>) {
  return (raw: Record<string, unknown>) => {
    const r = normalisiereKandidaten(raw, erlaubte, texte);
    return r.kandidaten.length === 0 && r.verworfen > 0
      ? {
          verstoesse: [
            `Kein Kandidat hatte einen verifizierten Beleg. Zitiere in "fundstelle" WÖRTLICH aus der jeweiligen Quelle und verwende als "quelle" ausschließlich: ${erlaubte.join(", ")}.`,
          ],
        }
      : { wert: r };
  };
}

/**
 * Lauf 1 — Produkt-Wahrheit, eigenes Listing, Kategorie-Kernmotiv.
 * Der Lauf, den es vorher gar nicht gab: hier entsteht das Kernmotiv der
 * Kategorie („warum kauft man überhaupt einen höhenverstellbaren Schreibtisch"),
 * das aus Bewertungen nie hervorgehen kann.
 */
export async function ernteMotive(input: {
  produktName: string;
  kategorie?: string | null;
  faktenText: string;
  quellen: FeatureQuellen;
  sprache?: string;
}): Promise<ErnteErgebnis> {
  const texte = quellTexte(input.quellen);
  const listingText = Object.entries(texte)
    .filter(([, v]) => v.trim())
    .map(([k, v]) => `### ${k}\n${v.slice(0, 3000)}`)
    .join("\n\n");
  const erlaubte: DriverQuelle[] = ["fakten", "listing", "kategorie"];
  const verbatim: Partial<Record<DriverQuelle, string>> = {
    fakten: input.faktenText,
    listing: Object.values(texte).join("\n"),
    // "kategorie" hat keinen Quelltext — das Kernmotiv der Produktart ist
    // Allgemeinwissen über die Kategorie, kein Zitat. Es ist die einzige Quelle
    // ohne Verbatim-Zwang und trägt deshalb allein nur einen Pflicht-Driver.
  };

  const prompt = `PRODUKT: ${input.produktName}${input.kategorie ? ` (Kategorie: ${input.kategorie})` : ""}

PRODUKT-WAHRHEIT (Quelle "fakten"):
${input.faktenText.trim() ? input.faktenText.slice(0, 3000) : "(nicht erfasst)"}

EIGENES LISTING (Quelle "listing"):
${listingText || "(nicht erfasst)"}

AUFGABE (Sprache "${input.sprache ?? "de"}"): Leite die Resultate ab, die ein Käufer mit diesem Produkt erreichen will.
Nutze drei Quellen: "fakten" und "listing" mit wörtlichem Zitat — und "kategorie" für das Kernmotiv der Produktart, wenn es sich aus dem Produkttyp ergibt und weder Fakten noch Listing es benennen (dann steht in "fundstelle" die Produktart, z. B. "höhenverstellbarer Schreibtisch").

${REGELN}

${SCHEMA}`;

  return lauf("driver.motive", prompt, erlaubte, verbatim, input.produktName);
}

/** Lauf 2 — Wettbewerber-Listings: welche Resultate bewirbt die Kategorie? */
export async function ernteWettbewerb(input: {
  listings: Array<{ asin: string; title?: string | null; bullets?: string[] | null; description?: string | null }>;
  sprache?: string;
}): Promise<ErnteErgebnis> {
  if (input.listings.length === 0) {
    return { kandidaten: [], verworfen: 0, hinweise: ["Keine Wettbewerber-Listings vorhanden — Kategorie-Konsens nicht bewertbar."] };
  }
  const block = input.listings
    .map((l) => `### ASIN ${l.asin}\n${[l.title, ...(l.bullets ?? []), l.description].filter(Boolean).join("\n").slice(0, 2500)}`)
    .join("\n\n");
  const erlaubte: DriverQuelle[] = ["wettbewerber_listing"];

  const prompt = `WETTBEWERBER-LISTINGS (Quelle "wettbewerber_listing" — "ref" ist die ASIN):
${block}

AUFGABE (Sprache "${input.sprache ?? "de"}"): Welche RESULTATE bewerben diese Listings? Nur was mehrere oder besonders prominent bewerben, ist ein Kategorie-Signal.
Übernimm KEINE fremden Spezifikationen und keine Markennamen — nur das Resultat und das wörtliche Zitat, das es belegt.

${REGELN}

${SCHEMA}`;

  return lauf("driver.wettbewerb", prompt, erlaubte, { wettbewerber_listing: block }, "Wettbewerber");
}

/**
 * Lauf 3 — Bewertungen. Bewertungen dürfen ein Resultat ALLEIN tragen: was
 * Käufer nennen und kein Listing der Kategorie erwähnt, ist der wertvollste
 * Fund. `fundstelle` ist das WORTGLEICHE Aspekt-Label — die Zählwerte und die
 * Herkunft (eigene/fremde ASIN) löst der Aufbau-Schritt deterministisch auf.
 */
export async function ernteReviews(input: { aspekte: RoheAspekte; sprache?: string }): Promise<ErnteErgebnis> {
  const zeilen = [
    ...input.aspekte.buyingTriggers.map((a) => `- [Kaufauslöser] "${a.label}"${a.mentionCount !== null ? ` (${a.mentionCount}× belegt)` : ""}`),
    ...input.aspekte.painPoints.map((a) => `- [Pain Point] "${a.label}"${a.mentionCount !== null ? ` (${a.mentionCount}× belegt)` : ""}`),
  ];
  if (zeilen.length === 0) {
    return { kandidaten: [], verworfen: 0, hinweise: ["Keine bereinigten Kunden-Themen vorhanden — Bewertungen tragen keinen Kandidaten."] };
  }
  const erlaubte: DriverQuelle[] = ["reviews_eigene", "reviews_fremde"];

  const prompt = `KUNDEN-THEMEN AUS DEN BEWERTUNGEN (bereits ausgezählt und um Versand-/Zustell-Themen bereinigt):
${zeilen.join("\n")}

AUFGABE (Sprache "${input.sprache ?? "de"}"): Welche RESULTATE stehen hinter diesen Themen?
WICHTIG zur Gewichtung: Bewertungen entstehen NACH dem Kauf. Häufigkeit sagt, was im Alltag auffällt, nicht was zum Kauf geführt hat — ein oft genanntes Hygiene-Thema (Aufbau, Verpackung, Lieferumfang) ist deshalb als "hygiene" zu liefern, nicht als Kaufgrund.
Ein Pain Point wird NICHT in ein Versprechen umgedreht. Er belegt, dass Kunden dieses Resultat erwarten — das Resultat selbst muss ein Ergebnis sein, keine Beschwerde-Umkehrung.
In "fundstelle" steht das WORTGLEICHE Label von oben, in "quelle" bei Themen der eigenen Bewertungen "reviews_eigene", bei Themen aus Wettbewerbs-Bewertungen "reviews_fremde".

${REGELN}

${SCHEMA}`;

  // Kein Verbatim-Text: Labels werden im Aufbau gegen die echten Aspekte aufgelöst.
  return lauf("driver.reviews", prompt, erlaubte, {}, "Bewertungen");
}

/** Lauf 4 — eigene Bilder: welches Resultat behauptet das Bildset heute? */
export async function ernteBilder(input: { bilder: BildBeleg[]; sprache?: string }): Promise<ErnteErgebnis> {
  const vorhanden = input.bilder.filter((b) => b.text.trim());
  if (vorhanden.length === 0) {
    return { kandidaten: [], verworfen: 0, hinweise: ["Keine Bildanalyse vorhanden — Bilder tragen keinen Kandidaten."] };
  }
  const block = vorhanden.map((b) => `### Bild ${b.slot} (Quelle "bilder", "ref" = ${b.slot})\n${b.text.slice(0, 800)}`).join("\n\n");
  const erlaubte: DriverQuelle[] = ["bilder"];

  const prompt = `AUSGELESENE BILDER DES EIGENEN LISTINGS:
${block}

AUFGABE (Sprache "${input.sprache ?? "de"}"): Welche RESULTATE behauptet dieses Bildset? Nur was wirklich zu sehen oder zu lesen ist — nichts hineindeuten.

${REGELN}

${SCHEMA}`;

  return lauf("driver.bilder", prompt, erlaubte, { bilder: block }, "Bilder");
}

/**
 * Lauf 5 — Keyword-Zuordnung. Läuft NACH der Verschmelzung: das Modell ordnet
 * Suchbegriffe den fertigen Resultaten zu (eine Klassifizierung), der Code
 * summiert das Suchvolumen und rechnet den Anteil (D184). Suchen passieren VOR
 * dem Kauf — das ist der einzige gemessene Vorkauf-Datenpunkt, den wir haben.
 */
export async function ordneKeywordsZu(input: {
  resultate: string[];
  keywords: Array<{ keyword: string; searchVolume: number | null }>;
  sprache?: string;
}): Promise<{ zuordnung: Array<{ resultat: string; keywords: string[] }>; hinweise: string[] }> {
  const mitVolumen = input.keywords.filter((k) => (k.searchVolume ?? 0) > 0).slice(0, 120);
  if (input.resultate.length === 0 || mitVolumen.length === 0) {
    return { zuordnung: [], hinweise: mitVolumen.length === 0 ? ["Keine Keyword-Basis mit Suchvolumen — Suchnachfrage floss nicht in die Gewichtung ein."] : [] };
  }

  const { provider } = resolveRecipe("driver.keywords");
  if (provider.name === "mock") return { zuordnung: [], hinweise: ["Mock-Lauf: keine Keyword-Zuordnung."] };

  const prompt = `RESULTATE:
${input.resultate.map((r, i) => `${i + 1}. ${r}`).join("\n")}

SUCHBEGRIFFE (mit monatlichem Suchvolumen):
${mitVolumen.map((k) => `- ${k.keyword} (${k.searchVolume})`).join("\n")}

AUFGABE (Sprache "${input.sprache ?? "de"}"): Ordne jeden Suchbegriff dem Resultat zu, dessen Kaufmotiv er ausdrückt. Ein Suchbegriff gehört zu HÖCHSTENS einem Resultat; Begriffe ohne klaren Motiv-Bezug (reine Produktart-, Marken- oder Farbsuchen) bleiben UNZUGEORDNET. Übernimm die Suchbegriffe WORTGLEICH.

JSON-Schema:
{"zuordnung":[{"resultat":"wortgleich aus der Liste","keywords":["..."]}]}`;

  const roh = await llmJsonLauf<Array<{ resultat: string; keywords: string[] }>>({
    recipeKey: "driver.keywords",
    system: "Du ordnest Amazon-Suchbegriffe den Kaufmotiven zu, die sie ausdrücken. Antworte AUSSCHLIESSLICH mit validem JSON.",
    prompt,
    maxTokens: 4000,
    temperature: 0,
    kontrakt: (raw) => {
      const liste = Array.isArray(raw.zuordnung) ? raw.zuordnung : [];
      const bekannt = new Map(input.resultate.map((r) => [norm(r), r]));
      const zuordnung = liste
        .map((z) => {
          const o = (z ?? {}) as Record<string, unknown>;
          const resultat = bekannt.get(norm(String(o.resultat ?? "")));
          const keywords = (Array.isArray(o.keywords) ? o.keywords : []).map((k) => String(k ?? "").trim()).filter(Boolean);
          return resultat && keywords.length ? { resultat, keywords } : null;
        })
        .filter((z): z is { resultat: string; keywords: string[] } => z !== null);
      return zuordnung.length === 0
        ? { verstoesse: ["Keine Zuordnung war einem gelisteten Resultat zuzuordnen — verwende die Resultate WORTGLEICH aus der Liste."] }
        : { wert: zuordnung };
    },
  });

  return { zuordnung: roh, hinweise: [] };
}

/** Ein Ernte-Lauf mit QM-Schleife; im Mock-Modus ohne erfundene Inhalte. */
async function lauf(
  recipeKey: string,
  prompt: string,
  erlaubte: DriverQuelle[],
  verbatim: Partial<Record<DriverQuelle, string>>,
  mockBezug: string,
): Promise<ErnteErgebnis> {
  const { provider } = resolveRecipe(recipeKey);
  if (provider.name === "mock") {
    return {
      kandidaten: [],
      verworfen: 0,
      hinweise: [`Mock-Lauf (kein API-Key): Ernte „${mockBezug}" liefert keine Kandidaten — Platzhalter-Kaufgründe wären wertlos.`],
    };
  }
  const { kandidaten, verworfen } = await llmJsonLauf<ReturnType<typeof normalisiereKandidaten>>({
    recipeKey,
    system: SYSTEM,
    prompt,
    maxTokens: 6000,
    temperature: 0,
    kontrakt: kontraktFuer(erlaubte, verbatim),
  });
  const hinweise = verworfen
    ? [`Ernte „${mockBezug}": ${verworfen} Kandidat(en) ohne verifizierten Beleg verworfen.`]
    : [];
  return { kandidaten, verworfen, hinweise };
}

/**
 * Alle Läufe der Ernte, dann Verschmelzung, dann Keyword-Zuordnung auf die
 * verschmolzenen Resultate. Ergebnis ist die Eingabe von `baueDriver()`.
 */
export async function ernteDriverKandidaten(input: {
  produktName: string;
  kategorie?: string | null;
  faktenText: string;
  quellen: FeatureQuellen;
  wettbewerberListings: Parameters<typeof ernteWettbewerb>[0]["listings"];
  aspekte: RoheAspekte;
  bilder: BildBeleg[];
  keywords: Array<{ keyword: string; searchVolume: number | null }>;
  sprache?: string;
}): Promise<ErnteErgebnis> {
  const sprache = input.sprache ?? "de";
  // Sequenziell statt parallel: jeder Lauf hat seine eigene QM-Schleife, und
  // vier gleichzeitige Korrektur-Schleifen reißen das Zeitbudget einer Etappe.
  const laeufe: ErnteErgebnis[] = [];
  laeufe.push(await ernteMotive({ ...input, sprache }));
  laeufe.push(await ernteWettbewerb({ listings: input.wettbewerberListings, sprache }));
  laeufe.push(await ernteReviews({ aspekte: input.aspekte, sprache }));
  laeufe.push(await ernteBilder({ bilder: input.bilder, sprache }));

  const hinweise = laeufe.flatMap((l) => l.hinweise);
  const verworfen = laeufe.reduce((s, l) => s + l.verworfen, 0);
  const kandidaten = fuegeKandidatenZusammen(laeufe.flatMap((l) => l.kandidaten));

  const kw = await ordneKeywordsZu({ resultate: kandidaten.map((k) => k.resultat), keywords: input.keywords, sprache });
  hinweise.push(...kw.hinweise);
  for (const z of kw.zuordnung) {
    const kandidat = kandidaten.find((k) => norm(k.resultat) === norm(z.resultat));
    if (!kandidat || kandidat.bausteine.length === 0) continue;
    // Suchnachfrage belegt das RESULTAT, nicht einen einzelnen Baustein —
    // sie hängt deshalb am ersten Baustein und wird im Score einmal gezählt.
    for (const wort of z.keywords)
      kandidat.bausteine[0].belege.push({ quelle: "suchnachfrage", fundstelle: wort, ref: wort });
  }

  return { kandidaten, verworfen, hinweise };
}
