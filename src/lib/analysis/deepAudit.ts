import { resolveRecipe } from "@/lib/llm/registry";
import { llmJsonLauf } from "@/lib/llm/qmLauf";
import { normalizeToken } from "@/lib/text/bytes";
import type { DeepAuditDimension, DeepAuditPayload, ReviewInsightsPayload } from "@/db/schema";

/**
 * Tiefen-Audit (D76) — Port der temoa-audit-Spezifikation (SALVAGE §7:
 * 8-Dimensionen-Audit „Aktuell / Probleme / Empfehlung", USPs & Zielgruppe
 * HERGELEITET statt manuell getippt), aber mit unserer Architektur-These:
 * „LLM generiert, Code erzwingt."
 *
 * - Das LLM bewertet NUR Dimensionen, für die echte Daten vorliegen; der Code
 *   bestimmt die bewertbare Menge und setzt alles andere ehrlich auf
 *   „nicht bewertbar" (kein Fassaden-Score, D70).
 * - Pflicht-Datenbasis: Listing-Inhalt + Review-Insights (Bewertungs-Analyse
 *   zuerst — im besten Fall inkl. Wettbewerber-ASINs). Der Aufrufer gated.
 */

export type DeepAuditInput = {
  productName: string;
  asin: string | null;
  title: string;
  bullets: string[];
  description: string;
  backendKeywords: string;
  imageCount: number | null;
  /**
   * Text der EIGENEN Listing-Bilder + A+ + Produktinfo (Vision-Auslese, D231).
   * PFLICHT-Quelle des Audits (D252, Nutzer-Befund): Was auf den Status-quo-Bildern
   * steht (z. B. „ZUBEREITUNG — Mix it, shake it … Portion mit 500 ml Wasser"),
   * IST Listing-Inhalt. Ohne dieses Feld behauptete das Audit, ein Thema fehle,
   * das die Bilder längst beantworten. Leer = nicht ausgelesen (kein API-Key).
   */
  bildBelege: string;
  /**
   * UNVERÄNDERLICHE Eigennamen (D253): Marke + Varianten-Achsenwerte (z. B.
   * „Peach x Black Tea", „Strawberry Shark"). Das sind Produktnamen, keine
   * Textentscheidungen — sie können nicht umbenannt werden. Ohne diese Liste
   * bemängelte das Audit „englischen Slang", der nur der Sortenname ist, und
   * gab damit eine Empfehlung, die nie umsetzbar wäre.
   */
  fixeBegriffe: string[];
  basics: { reviewsTotal: number | null; ratingAvg: number | null; dist: Record<string, number> | null } | null;
  priceEur: number | null;
  reviewInsights: ReviewInsightsPayload;
  primaryKeywords: string[];
  topGaps: Array<{ keyword: string; sv: number; fullRevGap: number }>;
};

export const DIM_LABELS: Record<DeepAuditDimension["key"], string> = {
  title: "Titel",
  bullets: "Bullet Points",
  description: "Beschreibung",
  backend: "Backend-Keywords",
  images: "Bilder",
  aplus: "A+ Content",
  reviews: "Bewertungs-Basis (Sterne-Verteilung)",
  price: "Preisstrategie",
};

/**
 * Welche Dimensionen sind mit den vorliegenden Daten überhaupt bewertbar? Entscheidet der CODE.
 *
 * D214 (Nutzer 27.07.): NUR was ein Scrape wirklich hergibt. Nicht mehr bewertet:
 * - backend  — Backend-Keywords sind von außen unsichtbar, nicht schätzbar.
 * - images   — reine Slot-Zählung war keine Qualität (Bild-Audit läuft separat, D211).
 * - aplus    — A+-Inhalt wird nicht erfasst, nicht schätzbar.
 * - price    — Preisstrategie lässt sich nicht aus einem Scrape raten.
 * Bleiben: title, bullets, description, reviews (Bewertungsbasis, echte Scrape-Zahlen).
 */
export function assessableDims(input: DeepAuditInput): Set<DeepAuditDimension["key"]> {
  const s = new Set<DeepAuditDimension["key"]>();
  if (input.title.trim()) s.add("title");
  if (input.bullets.some((b) => b.trim())) s.add("bullets");
  if (input.description.trim()) s.add("description");
  if (input.basics && (input.basics.reviewsTotal !== null || input.basics.ratingAvg !== null)) s.add("reviews");
  return s;
}

const NOT_ASSESSABLE: Record<DeepAuditDimension["key"], string> = {
  title: "Kein Titel geladen.",
  bullets: "Keine Bullet Points geladen.",
  description: "Keine Beschreibung geladen.",
  backend: "Backend-Keywords sind von außen nicht sichtbar — erst mit eigener Content-Version bewertbar.",
  images: "Keine Bild-Daten — Original-Listing laden.",
  aplus: "A+-Inhalte werden vom Import (noch) nicht erfasst — Bewertung folgt mit der Bild-Phase.",
  reviews: "Keine Amazon-Gesamtzahlen (Bewertungen, Ø) vorhanden — Listing-Import oder Review-Scrape liefert sie.",
  price: "Kein Preis im Produkt hinterlegt.",
};

const SYSTEM =
  "Du bist Senior-Amazon-Listing-Stratege einer deutschen Agentur. Du bewertest ein Listing NUR anhand der gelieferten Daten — nichts erfinden, keine Annahmen als Fakten ausgeben. " +
  "Antworte AUSSCHLIESSLICH mit validem JSON nach dem geforderten Schema, auf Deutsch, konkret und kundentauglich.";

function buildPrompt(input: DeepAuditInput, dims: Set<DeepAuditDimension["key"]>): string {
  const ri = input.reviewInsights;
  const pains = ri.painPoints.slice(0, 8).map((p) => `- ${p.label}${p.frequencyPct ? ` (${p.frequencyPct} %)` : ""}${p.quotes[0] ? ` — „${p.quotes[0]}"` : ""}`).join("\n");
  const trigs = ri.buyingTriggers.slice(0, 8).map((t) => `- ${t.label}${t.frequencyPct ? ` (${t.frequencyPct} %)` : ""}${t.quotes[0] ? ` — „${t.quotes[0]}"` : ""}`).join("\n");
  const dimList = [...dims].map((k) => `"${k}" (${DIM_LABELS[k]})`).join(", ");
  return `PRODUKT: ${input.productName}${input.asin ? ` (${input.asin})` : ""}

LISTING (Ist-Stand):
TITEL: ${input.title || "(fehlt)"}
BULLETS:
${input.bullets.map((b) => `• ${b}`).join("\n") || "(fehlen)"}
BESCHREIBUNG: ${input.description.slice(0, 3000) || "(fehlt)"}
${input.backendKeywords ? `BACKEND-KEYWORDS: ${input.backendKeywords}` : ""}
BILDER: ${input.imageCount !== null ? `${input.imageCount} Slots belegt (die Bild-QUALITÄT bewertet der Code, NICHT du — der Bild-INHALT unten ist aber Listing-Inhalt und zählt als vorhanden)` : "unbekannt"}
${input.bildBelege ? `INHALT DER BILDER / A+ / PRODUKTINFO (ausgelesen — ZÄHLT ALS TEIL DES LISTINGS):\n${input.bildBelege.slice(0, 3000)}` : "INHALT DER BILDER: (nicht ausgelesen — UNBEKANNT, nicht leer: behaupte NICHT, ein Thema fehle, das dort beantwortet sein könnte)"}
BEWERTUNGS-BASIS: ${input.basics ? `${input.basics.reviewsTotal ?? "?"} Bewertungen · Ø ${input.basics.ratingAvg ?? "?"} ★${input.basics.dist ? ` · Verteilung ${Object.entries(input.basics.dist).map(([s, p]) => `${s}★ ${p}%`).join(", ")}` : ""}` : "unbekannt"}
${input.priceEur !== null ? `PREIS: ${input.priceEur} €` : ""}

KUNDENSTIMMEN (aus der Bewertungs-Analyse — Primärquelle für USPs & Zielgruppe):
Pain Points:
${pains || "(keine)"}
Kaufauslöser:
${trigs || "(keine)"}
Kundensprache: ${ri.languageToBorrow.slice(0, 8).map((w) => `„${w}"`).join(", ") || "—"}

${input.primaryKeywords.length ? `PRIMÄR-KEYWORDS: ${input.primaryKeywords.slice(0, 15).join(", ")}` : ""}
${input.topGaps.length ? `TOP-UMSATZLÜCKEN (SOV): ${input.topGaps.slice(0, 5).map((g) => `„${g.keyword}" (SV ${g.sv}, ~${Math.round(g.fullRevGap)} €/Mo)`).join("; ")}` : ""}

BEWERTUNGS-REGELN (Nutzer-Feedback 21.07. — Verstöße machen das Audit unglaubwürdig):
- SYNONYME ZÄHLEN: Ein Kaufargument gilt als abgedeckt, wenn es sinngemäß im Text steht („kabellos" deckt „Batteriebetrieb" ab, „Werkstatt" deckt „Garage" ab). Kritisiere NIE das Fehlen eines Wortes, dessen Bedeutung bereits da ist.
- VOR JEDER FEHLT-BEHAUPTUNG: Lies den gelieferten Text wörtlich nach. Behaupte nur „X fehlt", wenn X wirklich nirgends steht (auch nicht als Wortstamm, Kompositum oder Synonym) — und setze den fehlenden Begriff in „Anführungszeichen".
${input.fixeBegriffe.length ? `- FESTE EIGENNAMEN (D253): ${input.fixeBegriffe.map((b) => `„${b}"`).join(", ")} sind Marke bzw. Varianten-/Sortenname — VORGEGEBEN und unveränderlich. Bewerte sie NICHT: keine Kritik an Sprache/Anglizismen/Sprachmix, keine Empfehlung zum Umbenennen, Übersetzen oder Weglassen. Sie zählen als vorhanden und korrekt. Beurteile ausschließlich die frei formulierbaren Textteile drumherum.` : ""}
- BILDER SIND LISTING-INHALT (D252): Ein Thema, das im ausgelesenen Bild-/A+-/Produktinfo-Text beantwortet ist (z. B. Zubereitung, Dosierung, Anwendung), gilt als ABGEDECKT — es darf nicht als „fehlt" bemängelt und nicht als Maßnahme vorgeschlagen werden. Wenn ein Pain Point dort schon adressiert ist, ist die einzig zulässige Aussage, ihn ZUSÄTZLICH in den Text zu heben — niemals „wird nicht adressiert". Ist der Bild-Inhalt nicht ausgelesen, gilt er als UNBEKANNT, nicht als leer.
- EIN SYSTEM: Titel, Bullets und Beschreibung arbeiten zusammen — bewusste NICHT-Duplizierung ist richtig. Ein Kaufargument, das prominent in einer anderen Sektion steht, senkt den Score dieser Sektion NICHT (Beispiel: „Batteriebetrieb" prägnant in den Bullets reicht; der Titel darf andere kaufrelevante Keywords tragen).
- SPRACHE: Behaupte „Text ist nicht auf Deutsch" nur, wenn der Text tatsächlich überwiegend fremdsprachig ist.

AUFGABE:
1. LEITE aus Listing + Kundenstimmen her (nicht erfinden): 3–6 USPs (belegbare Produkteigenschaften aus Listing/Daten — NICHT bloß umformulierte Kaufauslöser, die existieren separat als eigene Liste), Zielgruppe (wer kauft wirklich, laut Reviews), Positionierung (1 Satz: wofür steht das Produkt im Markt).
2. Bewerte NUR diese Dimensionen: ${dimList}. Je Dimension: score10 (0–10, ehrlich), aktuell (2–3 Sätze Ist-Stand), probleme (2–4 konkrete Punkte, mit Bezug auf Keywords/Pain Points wo passend), empfehlung (1–2 Sätze, umsetzbar).
   Für die Bewertungs-Basis gilt: Benenne Sterne-Klassen IMMER explizit (negativ = 1–2 ★, neutral = 3 ★, positiv = 4–5 ★) und nutze ausschließlich die gelieferte Verteilung — keine Prozentwerte erfinden oder zusammenfassen, ohne zu sagen, welche Klassen gemeint sind.
3. topActions: die 3–5 wichtigsten Maßnahmen über alle Dimensionen, priorisiert nach Hebel.

JSON-Schema:
{"derived":{"usps":["..."],"zielgruppe":"...","positionierung":"..."},
 "dimensions":[{"key":"title","score10":N,"aktuell":"...","probleme":["..."],"empfehlung":"..."}],
 "topActions":["..."]}`;
}

/** Deterministische Durchsetzung: nur bewertbare Keys, Scores geklemmt, Rest ehrlich null. */
export function enforceDeepAudit(
  raw: Partial<DeepAuditPayload>,
  dims: Set<DeepAuditDimension["key"]>,
): DeepAuditPayload {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const strs = (v: unknown, max: number) => (Array.isArray(v) ? v.map(str).filter(Boolean).slice(0, max) : []);
  const byKey = new Map<string, DeepAuditDimension>();
  for (const d of Array.isArray(raw.dimensions) ? raw.dimensions : []) {
    if (!d || typeof d !== "object" || !dims.has(d.key)) continue; // nie mehr bewerten, als Daten da sind
    byKey.set(d.key, {
      key: d.key,
      label: DIM_LABELS[d.key],
      score10: typeof d.score10 === "number" ? Math.max(0, Math.min(10, Math.round(d.score10 * 10) / 10)) : null,
      aktuell: str(d.aktuell),
      probleme: strs(d.probleme, 4),
      empfehlung: str(d.empfehlung),
    });
  }
  const order: DeepAuditDimension["key"][] = ["title", "bullets", "description", "reviews"];
  const dimensions: DeepAuditDimension[] = order.map(
    (key) =>
      byKey.get(key) ?? {
        key,
        label: DIM_LABELS[key],
        score10: null,
        aktuell: dims.has(key) ? "Vom Modell nicht bewertet." : NOT_ASSESSABLE[key],
        probleme: [],
        empfehlung: "",
      },
  );
  return {
    derived: {
      usps: strs(raw.derived?.usps, 6),
      zielgruppe: str(raw.derived?.zielgruppe),
      positionierung: str(raw.derived?.positionierung),
    },
    dimensions,
    topActions: strs(raw.topActions, 5),
  };
}

// ── Wahrheits-Filter (D126): falsche Audit-Behauptungen deterministisch entfernen ──
// Nutzer-Befunde 21.07.: „fehlende Anwendungs-Keywords wie Camping" — obwohl
// „Camping" wörtlich im Titel stand; „Text ist nicht auf Deutsch" — obwohl die
// Beschreibung zu 100 % deutsch war. Prompt-Regeln allein reichen nicht:
// nachprüfbare Behauptungen werden HIER gegen den echten Text geprüft.

const stamm = (w: string) => normalizeToken(w);

/** Kommt der Begriff (wortstamm- & komposita-bewusst) im Text vor? */
function begriffImText(begriff: string, textStaemme: Set<string>, staemmeListe?: string[]): boolean {
  const woerter = begriff.split(/[\s\-/]+/).map(stamm).filter((s) => s.length >= 3);
  if (woerter.length === 0) return false;
  const liste = staemmeListe ?? [...textStaemme]; // Review-Fix: Set nicht pro Wort spreaden
  return woerter.every((w) =>
    liste.some((t) => t === w || (w.length >= 4 && t.includes(w)) || (t.length >= 4 && w.includes(t))),
  );
}

/**
 * Zitierte Begriffe aus einer KI-Behauptung ziehen.
 *
 * Einfache Anführungszeichen NUR mit Wortgrenze davor/danach (Review-Fix D254):
 * ein Apostroph mitten im Wort („wie's geht") eröffnete sonst ein Phantom-Zitat,
 * verschluckte das ECHTE Zitat und ließ die Behauptung fälschlich als „belegt"
 * gelten. Doppelte Anführungszeichen bleiben ohne Grenz-Bedingung.
 */
const ZITAT_RE = /[„“"]([^„“"”]{2,})[”“"]|(?<![\p{L}\p{N}])['‚‘]([^'‘’]{2,})['’](?![\p{L}\p{N}])/gu;
const zitateAus = (s: string) => [...s.matchAll(ZITAT_RE)].map((m) => m[1] ?? m[2]).filter(Boolean);

/**
 * ABSENZ-Formulierungen: die Behauptung ist, dass etwas GAR NICHT vorkommt.
 * Nur solche Aussagen darf ein Zitat-Beleg widerlegen.
 *
 * Bewusst NICHT enthalten (Review-Fix D254): „verpasst", „nicht kommuniziert",
 * „keine Angabe/Aussage/Information". Die zielen auf die QUALITÄT der Nutzung
 * („Der Nutzen von „Koffein" wird nicht kommuniziert") — dass das Wort im Text
 * steht, widerlegt sie NICHT. Sie zu filtern löschte berechtigte Kritik.
 */
const FEHLT_MUSTER =
  /fehlt|fehlen|fehlend|nirgends|ohne bezug auf|keine erwähnung|nicht erwähnt|nicht enthalten|nicht vorhanden|nicht genannt|nicht auffindbar|kein(?:e|en|em|er|es)?\s+[^.!?;]{0,60}?(?:keyword|begriff|nennung|erwähnung)/i;
/**
 * Sprach-/Anglizismus-Kritik (D253). Trifft sie NUR feste Eigennamen (Marke,
 * Sorten-/Variantenname), ist sie nicht umsetzbar und damit falsch — der Name
 * ist vorgegeben. Deterministischer Backstop zur Prompt-Regel.
 */
const SPRACH_KRITIK_MUSTER = /englisch|anglizism|sprachmix|slang|misch\w*\s+(englisch|deutsch)|deutsch\s*\/\s*englisch|englisch\s*\/\s*deutsch|fremdsprach|eindeutschen|übersetz/i;

/** Handlungs-Aufforderungen in topActions („X adressieren/einarbeiten/aufnehmen"). */
const MASSNAHME_MUSTER =
  /adressier|einarbeit|aufnehm|ergänz|hervorheb|kommunizier|integrier|prominent|platzier|benenn|betonen|herausstell/i;
const NICHT_DEUTSCH_MUSTER = /(nicht|kein[e]?)\s+(auf\s+)?deutsch|komplett\s+englisch|text\s+ist\s+englisch|auf\s+englisch\s+verfasst/i;
const DEUTSCH_SIGNAL = new Set(["der", "die", "das", "und", "ist", "mit", "für", "ein", "eine", "einen", "dem", "den", "nicht", "auf", "im", "sich", "auch", "bei", "aus", "wird", "werden", "von", "zu", "zum", "zur", "über", "nach", "durch", "oder", "wie", "sowie", "dank", "ihre", "ihr", "bis"]);

export function istDeutsch(text: string): boolean {
  const woerter = text.toLowerCase().split(/[^a-zäöüß]+/).filter(Boolean);
  if (woerter.length < 5) return false; // zu kurz für ein Urteil — Behauptung nicht filtern
  const treffer = woerter.filter((w) => DEUTSCH_SIGNAL.has(w)).length;
  return treffer >= 3 || treffer / woerter.length >= 0.08;
}

/**
 * Entfernt nachweislich falsche Problem-Behauptungen:
 * 1. „X fehlt" mit zitiertem Begriff, der im GESAMTEN Listing vorkommt
 *    (auch Cross-Sektion — ein Argument in den Bullets senkt den Titel nicht).
 * 2. „Text ist nicht auf Deutsch", obwohl die Sektion deutsch ist.
 * Gefilterte Behauptungen werden ehrlich als Hinweis ausgewiesen, nie still.
 *
 * D252: Der Vergleichstext enthält jetzt auch den BILD-/A+-/Produktinfo-Text —
 * sonst überlebt eine „fehlt"-Behauptung, die die Status-quo-Bilder widerlegen.
 * Und `topActions` läuft durch DENSELBEN Filter (lief vorher ganz ungeprüft durch,
 * daher stand ein längst adressierter Pain Point als Maßnahme Nr. 1).
 *
 * D253: Sprach-/Anglizismus-Kritik, die NUR feste Eigennamen trifft (Marke,
 * Sorten-/Variantenname), fliegt ebenfalls — sie ist nicht umsetzbar.
 */
export function pruefeAuditBehauptungen(payload: DeepAuditPayload, input: DeepAuditInput): DeepAuditPayload {
  // Getrennte Beleg-Räume (Review-Fix D254): Der SICHTBARE TEXT ist der einzige
  // Raum, der eine „fehlt im Text"-Behauptung widerlegen darf. Bild-/A+-Text ist
  // Listing-INHALT, aber kein Text — eine Aussage wie „steht nur im Bild, nicht im
  // Titel" ist WAHR und darf niemals gelöscht werden (sie ist genau der Befund,
  // den das Tool liefern soll). Bild-Belege korrigieren daher nur die Prämisse.
  const zerlege = (s: string) => s.split(/[\s\-–—/,.;:!?()•·]+/).map(stamm).filter((x) => x.length >= 3);
  const textStaemme = new Set(zerlege([input.title, ...input.bullets, input.description, input.backendKeywords].join(" ")));
  const bildStaemme = new Set(zerlege(input.bildBelege));
  const textListe = [...textStaemme];
  const bildListe = [...bildStaemme];

  /**
   * Beleg-Lage einer Behauptung anhand IHRER EIGENEN Zitate:
   *  "text" → alle Zitate stehen im sichtbaren Text → Absenz-Behauptung ist falsch.
   *  "bild" → alle Zitate belegt, aber mindestens eines nur über Bild/A+ → Prämisse
   *           korrigieren („steht im Bild"), NIE löschen.
   *  "nein" → nicht (vollständig) belegt → Behauptung bleibt unangetastet.
   * Ein durch die Längen-Grenze VERSTÜMMELTES Zitat-Set gilt als "nein" (Review-Fix):
   * sonst reichte ein kurzes belegtes Zitat, um ein langes unbelegtes mitzulöschen.
   */
  const belegLage = (behauptung: string): "text" | "bild" | "nein" => {
    const alle = zitateAus(behauptung);
    const kurz = alle.filter((z) => z.length <= 60);
    if (kurz.length === 0 || kurz.length !== alle.length) return "nein";
    if (kurz.every((z) => begriffImText(z, textStaemme, textListe))) return "text";
    if (kurz.every((z) => begriffImText(z, textStaemme, textListe) || begriffImText(z, bildStaemme, bildListe))) return "bild";
    return "nein";
  };

  // Feste Eigennamen als TOKEN-Menge, nicht als Substring (Review-Fix D254): Ein
  // kurzer Achsenwert („S", „XL") hätte per Substring fast jedes Zitat getroffen und
  // jede Sprachkritik gelöscht. Und ein Zitat, das den Eigennamen nur ENTHÄLT
  // („Iced Peach x Black Tea Refresher Mix"), kritisiert den freien Text drumherum —
  // das muss stehen bleiben. Verworfen wird nur, was AUSSCHLIESSLICH aus Namens-Tokens besteht.
  const fixTokens = new Set(
    input.fixeBegriffe.flatMap((b) => b.split(/[\s\-–—/]+/)).map(stamm).filter((t) => t.length >= 3),
  );
  const nurEigennamenKritik = (behauptung: string) => {
    if (fixTokens.size === 0 || !SPRACH_KRITIK_MUSTER.test(behauptung)) return false;
    const zitate = zitateAus(behauptung).filter((z) => z.length <= 60);
    if (zitate.length === 0) return false;
    return zitate.every((z) => {
      const toks = z.split(/[\s\-–—/]+/).map(stamm).filter((t) => t.length >= 3);
      return toks.length > 0 && toks.every((t) => fixTokens.has(t));
    });
  };
  const sektionsText: Partial<Record<DeepAuditDimension["key"], string>> = {
    title: input.title,
    bullets: input.bullets.join(" "),
    description: input.description,
    backend: input.backendKeywords,
  };

  const BILD_HINWEIS = "Hinweis: Das Thema steht bereits im Bild-/A+-Inhalt — es geht also nur darum, es ZUSÄTZLICH in den Text zu heben.";
  const gruende: string[] = []; // Log-Spur (D182): jedes Filter-Ereignis ist nachvollziehbar

  const dimensions = payload.dimensions.map((d) => {
    const eigenerText = sektionsText[d.key];
    const entfernt: string[] = [];
    const probleme: string[] = [];
    for (const p of d.probleme) {
      const lage = FEHLT_MUSTER.test(p) ? belegLage(p) : "nein";
      // Fall 1a: Absenz-Behauptung, im sichtbaren TEXT widerlegt → falsch, raus.
      if (lage === "text") {
        entfernt.push(p);
        gruende.push(`probleme/${d.key}: im Text belegt`);
        continue;
      }
      // Fall 1b (Review-Fix D254): nur über Bild/A+ belegt → die Behauptung ist über
      // den TEXT zutreffend. Nicht löschen, sondern die Prämisse ergänzen.
      if (lage === "bild") {
        probleme.push(`${p} — ${BILD_HINWEIS}`);
        gruende.push(`probleme/${d.key}: nur im Bild belegt → Hinweis ergänzt`);
        continue;
      }
      // Fall 2: „nicht auf Deutsch", obwohl die Sektion deutsch ist
      if (eigenerText && NICHT_DEUTSCH_MUSTER.test(p) && istDeutsch(eigenerText)) {
        entfernt.push(p);
        gruende.push(`probleme/${d.key}: Sektion ist deutsch`);
        continue;
      }
      // Fall 3 (D253): Sprach-Kritik, die ausschließlich feste Eigennamen trifft
      if (nurEigennamenKritik(p)) {
        entfernt.push(p);
        gruende.push(`probleme/${d.key}: betrifft nur feste Eigennamen`);
        continue;
      }
      probleme.push(p);
    }
    if (entfernt.length === 0) return { ...d, probleme };
    return {
      ...d,
      probleme,
      aktuell: `${d.aktuell}${d.aktuell ? " " : ""}(${entfernt.length} KI-Behauptung${entfernt.length > 1 ? "en" : ""} entfernt — nachweislich unzutreffend: Begriff steht im Listing-Text, Text ist deutsch, oder die Kritik betraf einen vorgegebenen Eigennamen.)`,
    };
  });

  // topActions (D252/D254): liefen vorher UNGEPRÜFT durch — daher stand ein längst
  // adressierter Pain Point als Maßnahme Nr. 1. Grundsatz jetzt: KORRIGIEREN statt
  // still löschen (Review-Fix) — eine verschwundene Maßnahme ist unsichtbar und
  // verstößt gegen „nie still". Nur eine im Text widerlegte Absenz-Behauptung ODER
  // reine Eigennamen-Kritik fliegt ganz; das wird protokolliert.
  const topActions: string[] = [];
  for (const a of payload.topActions) {
    const lage = belegLage(a);
    if (FEHLT_MUSTER.test(a) && lage === "text") {
      gruende.push("topAction: im Text belegt → entfernt");
      continue;
    }
    if (nurEigennamenKritik(a)) {
      gruende.push("topAction: betrifft nur feste Eigennamen → entfernt");
      continue;
    }
    if (lage === "bild" && (FEHLT_MUSTER.test(a) || MASSNAHME_MUSTER.test(a))) {
      topActions.push(`${a} — ${BILD_HINWEIS}`);
      gruende.push("topAction: nur im Bild belegt → Hinweis ergänzt");
      continue;
    }
    if (MASSNAHME_MUSTER.test(a) && lage === "text") {
      topActions.push(`${a} — Hinweis: Das Thema ist im Listing-Text bereits belegt; es geht höchstens um mehr Prominenz.`);
      gruende.push("topAction: im Text belegt → Hinweis ergänzt");
      continue;
    }
    topActions.push(a);
  }
  if (gruende.length > 0) console.warn("[AUDIT-FILTER]", JSON.stringify({ asin: input.asin, gruende }));
  return { ...payload, dimensions, topActions };
}

export async function buildDeepAudit(input: DeepAuditInput): Promise<DeepAuditPayload> {
  const dims = assessableDims(input);
  const llmDims = dims; // alle bewertbaren Dimensionen bewertet das LLM (Bilder laufen separat, D211/D214)
  const { provider } = resolveRecipe("listing.deep-audit");

  let raw: Partial<DeepAuditPayload>;
  if (provider.name === "mock") {
    raw = {
      derived: {
        usps: ["Mock: hält 24 h kalt (aus Kaufauslösern belegt)", "Mock: passt in Standard-Becherhalter"],
        zielgruppe: "Mock: Pendler & Outdoor-Nutzer, die Zuverlässigkeit über Design stellen.",
        positionierung: "Mock: das Alltags-Arbeitstier unter den Trinkflaschen.",
      },
      dimensions: [...llmDims].map((key) => ({
        key,
        label: DIM_LABELS[key],
        score10: 6,
        aktuell: `Mock-Ist-Stand für ${DIM_LABELS[key]}.`,
        probleme: ["Mock: Haupt-Keyword fehlt vorn", "Mock: Top-Pain-Point wird nicht adressiert"],
        empfehlung: `Mock-Empfehlung für ${DIM_LABELS[key]}.`,
      })),
      topActions: ["Mock: Titel um Haupt-Keyword ergänzen", "Mock: Dichtungs-Einwand in Bullet 1 entkräften"],
    };
  } else {
    // QM-Lauf (D182/D183): kaputtes JSON oder fehlendes dimensions-Array wird
    // mit Korrektur-Auftrag automatisch wiederholt.
    raw = await llmJsonLauf<Record<string, unknown>>({
      recipeKey: "listing.deep-audit",
      system: SYSTEM,
      prompt: buildPrompt(input, llmDims),
      maxTokens: 16000, // Sonnet-5: Denkphase + Antwort teilen sich max_tokens (D106)
      temperature: 0.2,
      kontrakt: (parsed) =>
        Array.isArray(parsed.dimensions) && parsed.dimensions.length > 0
          ? { wert: parsed }
          : { verstoesse: ["Das JSON braucht ein nicht-leeres dimensions-Array — ein Eintrag je angefragter Dimension mit key, score10, aktuell, probleme, empfehlung."] },
    });
  }
  return pruefeAuditBehauptungen(enforceDeepAudit(raw, llmDims), input);
}
