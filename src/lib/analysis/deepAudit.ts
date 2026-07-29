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
function begriffImText(begriff: string, textStaemme: Set<string>): boolean {
  const woerter = begriff.split(/[\s\-/]+/).map(stamm).filter((s) => s.length >= 3);
  if (woerter.length === 0) return false;
  return woerter.every((w) =>
    [...textStaemme].some((t) => t === w || (w.length >= 4 && t.includes(w)) || (t.length >= 4 && w.includes(t))),
  );
}

/**
 * Zitierte Begriffe aus einer KI-Behauptung ziehen. Auch EINFACHE Anführungszeichen
 * (D252): das Modell schreibt in der Praxis oft 'schnell löslich' statt „schnell löslich".
 */
const ZITAT_RE = /[„“"'‚‘]([^„“"'‚‘’]{2,})[”“"'’‘]/g;

/**
 * „Etwas fehlt"-Formulierungen. Bewusst BREIT (D252): Das Muster löst nur die
 * Beleg-PRÜFUNG der zitierten Begriffe aus — verworfen wird eine Behauptung erst,
 * wenn ihre Zitate nachweislich im Listing stehen. Zu eng heißt: echte Falsch-
 * Behauptungen überleben. Der Nutzer-Screenshot („Kein klar erkennbares
 * Löslichkeits-/Zubereitungs-Keyword …") wurde vom alten Muster NICHT erfasst.
 */
const FEHLT_MUSTER =
  /fehlt|fehlen|fehlend|nirgends|ohne bezug auf|keine erwähnung|nicht erwähnt|nicht enthalten|nicht vorhanden|nicht erkennbar|nicht adressiert|unadressiert|nicht aufgegriffen|nicht genannt|nicht kommuniziert|verpasst|kein(?:e|en|em|er|es)?\s+[^.!?;]{0,60}?(?:keyword|begriff|hinweis|signal|angabe|nennung|erwähnung|aussage|information)/i;
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
  const gesamtText = [input.title, ...input.bullets, input.description, input.backendKeywords, input.bildBelege].join(" ");
  const textStaemme = new Set(gesamtText.split(/[\s\-–—/,.;:!?()•·]+/).map(stamm).filter((s) => s.length >= 3));

  // Zitate, die (Teil) eines festen Eigennamens sind — beidseitig geprüft, damit
  // sowohl „Peach x Black Tea" als auch das Teilzitat „Peach" erkannt wird.
  const fix = input.fixeBegriffe.map((b) => b.toLowerCase().trim()).filter(Boolean);
  const istFesterName = (zitat: string) => {
    const z = zitat.toLowerCase().trim();
    return z.length >= 2 && fix.some((f) => f.includes(z) || z.includes(f));
  };
  const nurEigennamenKritik = (behauptung: string) => {
    if (fix.length === 0 || !SPRACH_KRITIK_MUSTER.test(behauptung)) return false;
    const zitate = [...behauptung.matchAll(ZITAT_RE)].map((m) => m[1]).filter((z) => z.length <= 60);
    return zitate.length > 0 && zitate.every(istFesterName);
  };
  const sektionsText: Partial<Record<DeepAuditDimension["key"], string>> = {
    title: input.title,
    bullets: input.bullets.join(" "),
    description: input.description,
    backend: input.backendKeywords,
  };

  const dimensions = payload.dimensions.map((d) => {
    const eigenerText = sektionsText[d.key];
    const entfernt: string[] = [];
    const probleme = d.probleme.filter((p) => {
      // Fall 1: Fehlt-Behauptung mit zitierten Begriffen, die nachweislich da sind
      if (FEHLT_MUSTER.test(p)) {
        const zitate = [...p.matchAll(ZITAT_RE)].map((m) => m[1]).filter((z) => z.length <= 60);
        if (zitate.length > 0 && zitate.every((z) => begriffImText(z, textStaemme))) {
          entfernt.push(p);
          return false;
        }
      }
      // Fall 2: „nicht auf Deutsch", obwohl die Sektion deutsch ist
      if (eigenerText && NICHT_DEUTSCH_MUSTER.test(p) && istDeutsch(eigenerText)) {
        entfernt.push(p);
        return false;
      }
      // Fall 3 (D253): Sprach-Kritik, die ausschließlich feste Eigennamen trifft
      if (nurEigennamenKritik(p)) {
        entfernt.push(p);
        return false;
      }
      return true;
    });
    if (entfernt.length === 0) return d;
    return {
      ...d,
      probleme,
      aktuell: `${d.aktuell}${d.aktuell ? " " : ""}(${entfernt.length} KI-Behauptung${entfernt.length > 1 ? "en" : ""} entfernt — der bemängelte Begriff steht nachweislich im Listing bzw. der Text ist deutsch.)`,
    };
  });

  // topActions (D252): liefen vorher UNGEPRÜFT durch — daher stand ein längst
  // adressierter Pain Point als Maßnahme Nr. 1. Zwei Fälle, je nach Formulierung:
  //  (a) „fehlt"-Behauptung + Begriff nachweislich vorhanden → schlicht FALSCH, raus.
  //  (b) Handlungs-Aufforderung („adressieren"/„einarbeiten") zu einem Thema, das
  //      nachweislich schon im Listing/in den Bildern steht → die Prämisse ist falsch,
  //      die Maßnahme aber nicht wertlos: Sie wird auf die einzig zutreffende Aussage
  //      korrigiert (Thema ist belegt, höchstens zusätzlich in den Text heben) statt
  //      still gelöscht — Nutzer-Vorgabe.
  const belegt = (a: string) => {
    const zitate = [...a.matchAll(ZITAT_RE)].map((m) => m[1]).filter((z) => z.length <= 60);
    return zitate.length > 0 && zitate.every((z) => begriffImText(z, textStaemme));
  };
  const topActions = payload.topActions
    .filter((a) => !(FEHLT_MUSTER.test(a) && belegt(a)) && !nurEigennamenKritik(a))
    .map((a) =>
      MASSNAHME_MUSTER.test(a) && belegt(a)
        ? `${a} — Hinweis: Das Thema ist im Listing bzw. in den Bildern/A+ bereits belegt; höchstens zusätzlich in den Text heben.`
        : a,
    );
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
