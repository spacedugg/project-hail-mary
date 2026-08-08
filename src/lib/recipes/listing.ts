import { generateForRecipe, resolveRecipe } from "@/lib/llm/registry";
import { parseLlmJson } from "@/lib/llm/json";
import { trimToBytesByWord, trimToBytesBySentence } from "@/lib/text/bytes";
import { fixeWhitespace, fixeWhitespaceListe, fixeTitelLaenge } from "@/lib/text/fixers";
import { keywordStammAbgedeckt, entferneUnbelegteZahlSaetze } from "@/lib/validation/gate";
import { pruefeKontrakt, pruefeRationaleKontrakt } from "@/lib/llm/contracts";
import { regelnAlsPromptBlock } from "@/lib/validation/register";
import { pruefeMitLlm } from "@/lib/validation/pruefer";
import { RULES } from "@/lib/validation/rules";
import {
  validateTitle,
  validateBullets,
  validateDescription,
  validateBackendKeywords,
  validateItemHighlights,
  validateQa,
} from "@/lib/validation/gate";
import type { ContentSprache, ProductFacts, ReviewInsightsPayload, ValidationIssue } from "@/db/schema";
import { amazonDomain, marktplatzFuerSprache, SPRACH_NAMEN } from "@/lib/text/sprache";

/**
 * Listing-Text-Recipes (Nachfolger von temoa-os buildPrompt, merge-kompatibel D39):
 * sektionsweise Generierung Titel → Bullets → Backend → Beschreibung,
 * freigegebene Sektionen fließen als Kontext in die nächste.
 * Regeln kommen aus knowledge/content/*.md via RULES — Generierung und
 * Validierung teilen sich dieselbe Quelle ("LLM generiert, Code erzwingt").
 */

export type ListingSection = "title" | "bullets" | "highlights" | "backend" | "description" | "qa";
/** Ketten-Reihenfolge (D195; Backend VOR Beschreibung ab D204, Nutzer 25.07.): Titel → Item Highlights → Bullets → Backend-Keywords → Beschreibung → Q&A. Backend dedupt damit gegen Titel/Highlights/Bullets (die Beschreibung existiert zu dem Zeitpunkt noch nicht); die Beschreibung erhält das freigegebene Backend als Vorgänger-Kontext. */
export const SECTION_ORDER: ListingSection[] = ["title", "highlights", "bullets", "backend", "description", "qa"];

export type RecipeInputs = {
  brand: string;
  /**
   * Erstes Wort des Original-Listing-Titels (D149) — auf Amazon fast immer
   * die Produktmarke. Wird bei leerem `brand` (Werkbank-Auftrag) als
   * belegter Marken-Kandidat in den Prompt gegeben, statt dass das Modell
   * eine Marke erfindet oder einen Werkzeug-Namen verwendet.
   */
  eigenmarkeAusListing?: string;
  /**
   * Varianten-/Sortenname (D253), z. B. „Peach x Black Tea". VORGEGEBEN und
   * unveränderlich — wortwörtlich übernehmen, nie übersetzen oder eindeutschen.
   */
  variantenName?: string[];
  productName: string;
  marketplace: string; // "de"
  facts: ProductFacts;
  keywords: {
    primary: string[]; // 3–4 → Titel
    secondary: string[]; // 8–12 → Bullets
    tertiary: string[]; // → Beschreibung
    backendPool: string[]; // Rest + invisible + Kundensprache
  };
  reviewInsights?: ReviewInsightsPayload | null;
  voiceTone?: string | null;
  /** Bereits freigegebene Sektionen als Kontext. */
  approved?: Partial<Record<ListingSection, string | string[]>>;
  /**
   * Fremdmarken aus dem Keyword-Relevanz-Filter (D87: grund „Marke: XY") —
   * Amazon-Verbot (knowledge/content/backend-keywords.md). Fließt ins Prompt
   * (Warnung) UND ins Validation-Gate (Code erzwingt), D97.
   */
  competitorBrands?: string[];
  /** IST-Zustand des Listings (letzter Import) — Arbeitsgrundlage, besonders ohne Bewertungs-Analyse (D108). */
  listingIst?: { title?: string | null; bullets?: string[] | null } | null;
  /**
   * Beleg-Text aus den EIGENEN Status-quo-Bildern (Vision-Auslese) + A+ + Produktinfo-Tabelle
   * (D114/D230): Aussagen und Zahlen, die DORT stehen, gelten als BELEGT — z. B. „30 Sekunden",
   * das auf dem Produktbild steht, darf nicht als erfunden markiert werden. Fließt in die
   * Zahlen-Herkunfts-Quellen (Gate) UND in die Beschreibungs-Beleg-Quelle (Prompt).
   */
  bildBelege?: string | null;
  /** Zusätzliche Produkt-Infos vom Team (D108) — z. B. fremde Bullets/Titel als Vorbild. */
  zusatzKontext?: string | null;
  /** Content-Sprache (D128) — unabhängig vom Marktplatz; Default Deutsch. */
  sprache?: ContentSprache | null;
  /**
   * Conversion-Blocker (D167/D194): unbeantwortete Kunden-Themen mit Gewicht —
   * die neuen Texte MÜSSEN sie adressieren, sonst bleibt die Conversion-Lücke.
   *
   * D286: `kaufgrund` kommt dazu, weil die Blocker seit D266 aus dem Driver-Lauf
   * stammen und dort JEDER Blocker an einem Kaufgrund hängt — ohne diesen Bezug
   * schrieb der Generator ins Blaue („Thema erwähnen" statt „diesen Kaufgrund
   * beweisen"). `nutzen` ist der Baustein, an dem die Beweislücke sitzt.
   */
  conversionBlocker?: Array<{ titel: string; beschreibung: string; kaufgrund?: string; nutzen?: string }> | null;
  /**
   * BEFUNDE DES TIEFEN-AUDITS am bisherigen Listing (D286, Nutzer-Audit
   * 04.08.2026): Positionierung plus die konkreten Mängel und Empfehlungen je
   * Sektion sowie die Top-Maßnahmen.
   *
   * Sie erreichten die Generierung NIE: Das Tool sagte dem Kunden „die Bullets
   * bekommen 4/10, weil X fehlt" — und schrieb die neuen Bullets, ohne X zu
   * kennen. Nur `usps` und `zielgruppe` sickerten indirekt durch (sie werden in
   * LEERE Fakten-Felder kopiert).
   */
  listingBefunde?: {
    positionierung?: string | null;
    /**
     * Je Audit-Dimension: was beanstandet wurde und was empfohlen ist. Der Key
     * ist der Dimensions-Key des Audits (title · bullets · description · backend ·
     * images · aplus · reviews · price) — nur die, die einer Content-Sektion
     * entsprechen, werden beim Schreiben dieser Sektion eingeblendet.
     */
    dimensionen?: Array<{ key: string; label: string; score10: number | null; probleme: string[]; empfehlung: string }>;
    topActions?: string[];
  } | null;
  /**
   * Merkmal-Einordnung des Driver-Laufs (D282; verdrahtet D286): Welche Angaben
   * des alten Listings keinen Zweck hatten (nicht wieder aufnehmen) und welche
   * Pflichtangaben sind (müssen irgendwo stehen, aber nie als Kaufargument).
   */
  merkmalEinordnung?: { ohneZweck: string[]; notwendig: string[] } | null;
  /**
   * Übertragbare Wettbewerber-Informationen (D199): Infos, die die Konkurrenz
   * nennt und uns fehlen, geprüft übertragbar gegen unsere Produkt-Wahrheit.
   * urteil „ja" = aufnehmbar · „unbekannt" = Kandidat, nur wo belegt.
   */
  wettbewerbsInfos?: Array<{ info: string; urteil: "ja" | "unbekannt"; grund: string }> | null;
  /**
   * Feature-Ranking (D141/D146; verdrahtet D205): die Features DES LISTINGS nach
   * Kunden-Relevanz (Kunden-Echo aus Reviews, absteigend sortiert). Steuert,
   * welche belegten Features als Nutzen prominent in Bullets/Beschreibung landen;
   * Features ohne Kunden-Echo sind nachrangig (Prüf-Kandidaten, nichts erfinden).
   */
  featureRanking?: Array<{ titel: string; beschreibung: string; relevanz: number; kundenEcho: boolean }> | null;
  /**
   * CONVERSION DRIVER (D265/D278; verdrahtet in D285, Nutzer-Befund 04.08.2026).
   *
   * Die Kern-Kaufgründe — das Ergebnis, wegen dem gekauft wird, nach Relevanz.
   * Sie waren die einzige Analyse-Stufe, die NIE in die Text-Erstellung floss:
   * Der Generator kannte Features, Blocker, Pain Points und Kaufauslöser, aber
   * nicht den Haupt-Nutzen des Produkts. Ergebnis im Referenz-Fall (Solar-
   * Poolheizung): Bullet 1 eröffnete mit „ERWEITERBAR FÜR JEDE POOLGRÖSSE" —
   * einem Zusatz-Feature — statt damit, dass das Produkt den Pool mit
   * Sonnenenergie erwärmt (Nutzer: „Erst mal musst du noch sagen, dass es eine
   * Poolheizung ist, die den Pool warm macht … dann kannst du davon erzählen,
   * dass es erweiterbar ist").
   *
   * `resultat` ist das Kunden-Ergebnis, `nutzen` die belegten Bausteine dahinter.
   * Reihenfolge = Relevanz absteigend; [0] ist das Leitmotiv des Listings.
   */
  conversionDriver?: Array<{ resultat: string; nutzen: string[]; motiv: string; relevanz: number }> | null;
};

export type TitleRationale = Array<{ part: string; source: string; verified: boolean }>;

export type SectionResult = {
  section: ListingSection;
  payload: { text?: string; items?: string[]; pairs?: Array<{ q: string; a: string }>; rationale?: TitleRationale };
  issues: ValidationIssue[];
  raw: string;
  provider: string;
  model: string;
};

// ── Prompt-Bausteine ─────────────────────────────────────────────────────────

const VOICE_DEFAULT =
  "Nüchtern-deutsch, Premium. Kurze Sätze, aktive Verben, konkrete Zahlen. " +
  "Keine englischen Marketing-Floskeln, keine unbelegten Superlative — statt 'hochwertig' das konkrete Material/die Zahl nennen.";

/**
 * Ein-Seiten-Zuordnung (D196, Nutzer 23.07.: „wenn ein Thema auf beiden Seiten
 * steht, können wir damit nicht arbeiten"): Themen, die als Pain Point UND
 * Kaufauslöser auftreten (über die Erkenntnis-Karten verknüpft), werden per
 * code-gezähltem Mehrheits-Entscheid EINER Arbeits-Seite zugeschlagen — die
 * Minderheits-Seite fällt aus den Prompt-Listen. Gleichstand → negativ
 * (konservativ: einen Einwand zu adressieren schadet nie, unbelegtes Loben schon).
 */
export function einseitigeAspekte(ri: ReviewInsightsPayload): {
  painPoints: ReviewInsightsPayload["painPoints"];
  buyingTriggers: ReviewInsightsPayload["buyingTriggers"];
} {
  const minderheit = new Set<string>();
  for (const card of ri.insightCards ?? []) {
    const neg = card.belegAspekte.filter((b) => b.typ === "painPoint");
    const pos = card.belegAspekte.filter((b) => b.typ === "buyingTrigger");
    if (neg.length === 0 || pos.length === 0) continue; // kein geteiltes Thema
    const nNeg = neg.reduce((s, b) => s + (b.mentionCount ?? 0), 0);
    const nPos = pos.reduce((s, b) => s + (b.mentionCount ?? 0), 0);
    for (const b of nPos > nNeg ? neg : pos) minderheit.add(`${b.typ}:${b.label}`);
  }
  return {
    painPoints: ri.painPoints.filter((a) => !minderheit.has(`painPoint:${a.label}`)),
    buyingTriggers: ri.buyingTriggers.filter((a) => !minderheit.has(`buyingTrigger:${a.label}`)),
  };
}

/** Herkunfts-Klasse eines Aspekts aus den code-gezählten Fundstellen (D196). */
function herkunftsKlasse(a: { herkunft?: { eigene: number; fremde: number } }): "eigen" | "wettbewerb" | "kategorie" | "unbekannt" {
  if (!a.herkunft) return "unbekannt";
  if (a.herkunft.fremde > a.herkunft.eigene) return "wettbewerb";
  if (a.herkunft.eigene > a.herkunft.fremde) return "eigen";
  return "kategorie";
}

/**
 * Kontext-Block. `section` steuert nur, WELCHE Audit-Befunde gezeigt werden
 * (D286) — die Befunde zur eigenen Sektion sind Auftrag, der Rest wäre Rauschen.
 */
function contextBlock(inputs: RecipeInputs, section?: ListingSection): string {
  const f = inputs.facts;
  const ri = inputs.reviewInsights;
  // MARKE (D149): Ein leerer Marken-Slot heißt Werkbank-Auftrag — dann ist
  // die einzige belegte Marken-Quelle das Original-Listing. NIEMALS darf ein
  // Werkzeug-/Container-Name („Listing Optimizer") als Marke auftauchen.
  const markeZeile = inputs.brand
    ? `MARKE: ${inputs.brand}`
    : inputs.eigenmarkeAusListing
      ? `MARKE: „${inputs.eigenmarkeAusListing}" (aus dem Original-Listing übernommen — wortwörtlich verwenden, KEINE andere Marke erfinden)`
      : "MARKE: unbekannt — der Titel beginnt mit dem PRODUKTTYP. KEINE Marke erfinden, keinen Projekt- oder Werkzeug-Namen verwenden.";
  const lines: string[] = [
    markeZeile,
    // Sorten-/Variantenname (D253): fester Eigenname — wortwörtlich, nicht eindeutschen.
    ...(inputs.variantenName?.length
      ? [`VARIANTE / SORTENNAME: ${inputs.variantenName.map((v) => `„${v}"`).join(", ")} — VORGEGEBENER Eigenname. Wortwörtlich und unverändert übernehmen (auch englische Namen), NICHT übersetzen, eindeutschen oder weglassen. Der Name selbst ist kein Sprachfehler.`]
      : []),
    `PRODUKT: ${inputs.productName}`,
    `MARKTPLATZ: amazon.${inputs.marketplace}`,
    // Zielsprache (D128): lokalisieren, nicht übersetzen — bei Deutsch kein Extra-Block nötig.
    inputs.sprache && inputs.sprache !== "de"
      ? `ZIELSPRACHE: ${SPRACH_NAMEN[inputs.sprache]}. Schreibe ALLE Texte (inkl. Headlines, Backend-Begriffe, Q&A) auf ${SPRACH_NAMEN[inputs.sprache]} auf Muttersprachler-Niveau — lokalisiert für amazon.${amazonDomain(marktplatzFuerSprache(inputs.sprache))}, NICHT aus dem Deutschen übersetzt. Die Regeln unten gelten sinngemäß in der Zielsprache.`
      : "",
    f.productType ? `PRODUKTTYP: ${f.productType}` : "",
    f.materials?.length
      ? `MATERIALIEN (Wahrheits-Anker — NIE idealisieren, Hybride beidseitig nennen): ${f.materials.join(", ")}`
      : "",
    f.dimensions ? `MASSE: ${f.dimensions}` : "",
    f.specs ? `SPECS: ${Object.entries(f.specs).map(([k, v]) => `${k}=${v}`).join("; ")}` : "",
    f.usps?.length ? `USP-SET (jede USP genau EINMAL im gesamten Listing verwenden): ${f.usps.join(" | ")}` : "",
    f.targetAudience ? `ZIELGRUPPE: ${f.targetAudience}` : "",
    f.certifications?.length ? `ZERTIFIKATE/NORMEN (nur diese nennen): ${f.certifications.join(", ")}` : "",
    `TONALITÄT: ${inputs.voiceTone || VOICE_DEFAULT}`,
    inputs.competitorBrands?.length
      ? `FREMDMARKEN (Amazon-Verbot — dürfen NIRGENDS im Text auftauchen, auch nicht im Backend): ${[...new Set(inputs.competitorBrands)].slice(0, 12).join(", ")}`
      : "",
    inputs.listingIst?.title || inputs.listingIst?.bullets?.length
      ? `AKTUELLES LISTING (IST-Zustand — verbessern, nicht kopieren):${inputs.listingIst.title ? `\nTitel: ${inputs.listingIst.title}` : ""}${inputs.listingIst.bullets?.length ? `\nBullets: ${inputs.listingIst.bullets.join(" • ")}` : ""}`
      : "",
    inputs.zusatzKontext?.trim()
      ? `ZUSATZ-INFOS VOM TEAM (Fakten & Vorbilder — verwenden, aber NICHTS darüber hinaus erfinden):\n${inputs.zusatzKontext.trim().slice(0, 4000)}`
      : "",
  ];
  // FAKTEN-SPERRE (D115, Northpoint-Lehre): erfundene Specs sind der
  // schlimmste Fehler — der Zahlen-Herkunfts-Check (D114) blockt sie hart,
  // aber der Prompt soll sie gar nicht erst entstehen lassen.
  lines.push(
    "FAKTEN-SPERRE (WICHTIGSTE REGEL): Jede Zahl, jedes Material, jede Norm und jeder Messwert im Text MUSS wörtlich aus den Angaben dieses Prompts stammen (Produkt-Wahrheit, Listing-IST, Zusatz-Infos, Keywords). Fehlt eine Angabe (z. B. Material, Farbtemperatur, Schutzklasse): WEGLASSEN — niemals schätzen, ableiten oder erfinden. NIEMALS Tests, Prüfungen oder Belege behaupten, die nicht in den Angaben stehen (kein ‚interne Falltests belegen', kein ‚geprüft nach…'). Kundenstimmen liefern Sprache, Prioritäten und Einwände — NIEMALS technische Daten (sie können sich auf andere Produkte beziehen).",
  );
  // Bezeichnungs-Treue (D149, Nutzer-Befund: „Drops" wurde zu „Tropfen"):
  // die etablierte Produktbezeichnung ist Such- und Wiedererkennungs-Anker.
  lines.push(
    "BEZEICHNUNGS-TREUE: Die Produktbezeichnung wortwörtlich aus dem Original-Listing und der Kundensprache übernehmen — NIE übersetzen, eindeutschen oder umbenennen (‚Drops' bleibt ‚Drops' und wird nicht zu ‚Tropfen'). Weicht der PRODUKTTYP im Prompt von der Bezeichnung im Original-Listing ab, gewinnt das Original-Listing.",
  );
  // Ohne Bewertungs-Analyse (D108, nur nach doppelter Bestätigung): ehrlich
  // benennen, worauf die Texte dann bauen — und Kundensprache NICHT erfinden.
  if (!ri) {
    lines.push(
      "HINWEIS: Es liegt KEINE Bewertungs-Analyse vor. Grundlage sind ausschließlich Produkt-Wahrheit, Keywords, Listing-IST und Zusatz-Infos. Erfinde KEINE Kundenzitate, keine Pain Points, keine ‚Kunden sagen…'-Behauptungen.",
    );
  }
  if (ri) {
    // Ein-Seiten-Zuordnung (D196): geteilte Themen erscheinen nur auf ihrer Mehrheits-Seite
    const seiten = einseitigeAspekte(ri);
    const mitAttribution = [...seiten.painPoints, ...seiten.buyingTriggers].some((a) => a.herkunft);
    if (mitAttribution) {
      // Strategische Blöcke (D196): Herkunft × Übertragbarkeit steuert die Verwendung
      const fmt = (a: (typeof seiten.painPoints)[number]) =>
        `${a.label} (eigene ${a.herkunft?.eigene ?? 0}× · Wettbewerb ${a.herkunft?.fremde ?? 0}×${a.uebertragbarkeit ? ` · ${a.uebertragbarkeit.grund}` : ""})`;
      const eigeneBT = seiten.buyingTriggers.filter((a) => herkunftsKlasse(a) !== "wettbewerb").slice(0, 5);
      const wbBTJa = seiten.buyingTriggers.filter((a) => herkunftsKlasse(a) === "wettbewerb" && a.uebertragbarkeit?.urteil === "ja").slice(0, 5);
      const wbBTUnklar = seiten.buyingTriggers.filter((a) => herkunftsKlasse(a) === "wettbewerb" && a.uebertragbarkeit?.urteil !== "ja" && a.uebertragbarkeit?.urteil !== "nein").slice(0, 4);
      const ppRelevant = seiten.painPoints.filter((a) => !(herkunftsKlasse(a) === "wettbewerb" && a.uebertragbarkeit?.urteil === "nein")).slice(0, 5);
      const angriffsLuecken = seiten.painPoints.filter((a) => herkunftsKlasse(a) === "wettbewerb" && a.uebertragbarkeit?.urteil === "nein").slice(0, 4);
      if (eigeneBT.length) lines.push(`KAUFAUSLÖSER EIGENER KUNDEN (Kern-Content — prominent abbilden): ${eigeneBT.map(fmt).join(" | ")}`);
      if (wbBTJa.length)
        lines.push(`ÜBERTRAGBARE WETTBEWERBS-KAUFAUSLÖSER (FEHLENDER KERN-CONTENT: gilt laut Produkt-Wahrheit auch für uns, war bisher nicht abgebildet — abbilden, ausschließlich mit UNSEREN belegten Eigenschaften formuliert): ${wbBTJa.map(fmt).join(" | ")}`);
      if (wbBTUnklar.length)
        lines.push(`WETTBEWERBS-KAUFAUSLÖSER MIT UNKLARER ÜBERTRAGBARKEIT (nur aufgreifen, wo Produkt-Wahrheit/Listing es ausdrücklich deckt — sonst weglassen): ${wbBTUnklar.map(fmt).join(" | ")}`);
      if (ppRelevant.length)
        lines.push(`PAIN POINTS (eigene + übertragbare — adressieren bzw. ehrlich rahmen, häufigster zuerst): ${ppRelevant.map(fmt).join(" | ")}`);
      if (angriffsLuecken.length)
        lines.push(`ANGRIFFS-LÜCKEN (Wettbewerbs-Probleme, die UNS laut Produkt-Wahrheit NICHT treffen — als Stärke besetzen, ausschließlich mit belegten eigenen Eigenschaften): ${angriffsLuecken.map(fmt).join(" | ")}`);
    } else {
      // Alt-Daten ohne Herkunfts-Attribution: bisherige flache Listen
      const pp = seiten.painPoints.slice(0, 5).map((p) => `${p.label}${p.frequencyPct ? ` (${p.frequencyPct}%)` : ""}`);
      const bt = seiten.buyingTriggers.slice(0, 5).map((t) => t.label);
      if (pp.length) lines.push(`PAIN POINTS AUS ECHTEN REVIEWS (häufigster zuerst — adressiere ihn prominent): ${pp.join(" | ")}`);
      if (bt.length) lines.push(`KAUFAUSLÖSER: ${bt.join(" | ")}`);
    }
    if (ri.languageToBorrow.length) lines.push(`KUNDENSPRACHE (nah dran formulieren): ${ri.languageToBorrow.slice(0, 6).join(" | ")}`);
    if (ri.languageToAvoid.length) lines.push(`SPRACHE VERMEIDEN: ${ri.languageToAvoid.slice(0, 6).join(" | ")}`);
    // Quintessenz der Analyse (D194, Nutzer-Befund: lag im Payload, wurde aber
    // nie gerendert): Kern-These + verdichtete Erkenntnisse steuern die Themen.
    if (ri.kernThese) lines.push(`KERN-THESE DER BEWERTUNGS-ANALYSE: ${ri.kernThese}`);
    if (ri.insightCards?.length)
      lines.push(
        `VERDICHTETE ERKENNTNISSE (Quintessenz — Themen-Steuerung für die Texte):\n${ri.insightCards
          .slice(0, 6)
          .map((c) => `- ${c.titel}: ${c.beschreibung.slice(0, 160)}`)
          .join("\n")}`,
      );
  }
  /**
   * KERN-KAUFGRÜNDE ganz oben in den Analyse-Blöcken (D285): Sie sind das
   * Leitmotiv, nicht ein Detail unter vielen. Vorher fehlten sie komplett —
   * der Generator wusste, was das Produkt HAT, aber nicht, wofür man es KAUFT.
   */
  if (inputs.conversionDriver?.length) {
    const d = inputs.conversionDriver;
    lines.push(
      `KERN-KAUFGRÜNDE (Conversion Driver — das ERGEBNIS, wegen dem gekauft wird, wichtigster zuerst):\n${d
        .slice(0, 5)
        .map((x, i) => `${i + 1}. ${x.resultat}${x.nutzen.length ? ` — getragen von: ${x.nutzen.slice(0, 3).join("; ")}` : ""}`)
        .join("\n")}\nDER STÄRKSTE KAUFGRUND IST DAS LEITMOTIV DES LISTINGS: „${d[0].resultat}". Er MUSS im Titel, im ERSTEN Bullet und im Einstieg der Beschreibung tragend vorkommen — ausschließlich mit unseren belegten Eigenschaften formuliert, nie als neue Wirkzusage. Zusatz-Features (Erweiterbarkeit, Kompatibilität, Zubehör, Maße) kommen NACH dem Haupt-Nutzen, nie davor.`,
    );
  }
  if (inputs.featureRanking?.length) {
    const mitEcho = inputs.featureRanking.filter((x) => x.kundenEcho).slice(0, 6);
    const ohneEcho = inputs.featureRanking.filter((x) => !x.kundenEcho).slice(0, 4);
    if (mitEcho.length)
      lines.push(
        `FEATURE-RANKING (belegte Listing-Features nach Kunden-Relevanz, wichtigste zuerst — diese Features als Nutzen PROMINENT in Bullets/Beschreibung abbilden, das oberste zieht am stärksten):\n${mitEcho
          .map((x) => `- ${x.titel}: ${x.beschreibung.slice(0, 160)}`)
          .join("\n")}`,
      );
    if (ohneEcho.length)
      lines.push(
        `FEATURES OHNE KUNDEN-ECHO (im Listing vorhanden, aber in den Reviews nicht erwähnt — nachrangig, nur aufnehmen wenn Budget bleibt; nichts dazuerfinden): ${ohneEcho.map((x) => x.titel).join(" | ")}`,
      );
  }
  if (inputs.conversionBlocker?.length)
    lines.push(
      `CONVERSION-BLOCKER (Beweislücken: Themen, die für die Kaufentscheidung zählen und die das bisherige Listing NICHT beantwortet — die neuen Texte MÜSSEN sie beantworten, D167):\n${inputs.conversionBlocker
        .slice(0, 5)
        .map(
          (b) =>
            `- ${b.titel}: ${b.beschreibung.slice(0, 160)}${b.kaufgrund ? ` [gehört zum Kaufgrund: ${b.kaufgrund}]` : ""}${b.nutzen ? ` [zu beweisen: ${b.nutzen}]` : ""}`,
        )
        .join("\n")}`,
    );
  /**
   * Audit-Befunde am ALTEN Listing (D286): der eigentliche Arbeitsauftrag.
   * Gefiltert auf die Sektion, die gerade geschrieben wird — plus Positionierung
   * und Top-Maßnahmen, die für jede Sektion gelten.
   */
  if (inputs.listingBefunde) {
    const b = inputs.listingBefunde;
    if (b.positionierung?.trim())
      lines.push(`POSITIONIERUNG (aus der Analyse hergeleitet — der Rahmen, in den JEDER Satz passen muss): ${b.positionierung.trim()}`);
    const eigene = (b.dimensionen ?? []).filter((d) => section && d.key === section);
    for (const d of eigene) {
      const mangel = d.probleme.filter(Boolean).slice(0, 4);
      if (mangel.length === 0 && !d.empfehlung.trim()) continue;
      lines.push(
        `BEFUNDE AM BISHERIGEN ${d.label.toUpperCase()} (Bewertung${d.score10 !== null ? ` ${d.score10}/10` : ""} — DIESE Mängel MUSS die neue Fassung beheben, sie sind der Auftrag):\n${mangel
          .map((p) => `- ${p}`)
          .join("\n")}${d.empfehlung.trim() ? `\nEMPFEHLUNG DER ANALYSE: ${d.empfehlung.trim()}` : ""}`,
      );
    }
    if (b.topActions?.length)
      lines.push(
        `TOP-MASSNAHMEN DER ANALYSE (über alle Sektionen, nach Hebel — was hierher gehört, umsetzen):\n${b.topActions
          .slice(0, 5)
          .map((a) => `- ${a}`)
          .join("\n")}`,
      );
  }
  /**
   * Merkmal-Einordnung (D282; verdrahtet D286): Was im alten Listing Platz ohne
   * Zweck belegte, darf nicht zurückkehren; Pflichtangaben müssen bleiben.
   */
  if (inputs.merkmalEinordnung) {
    const m = inputs.merkmalEinordnung;
    if (m.ohneZweck.length)
      lines.push(
        `ANGABEN OHNE ERKENNBAREN ZWECK IM ALTEN LISTING (NICHT wieder aufnehmen — der Platz gehört einem Kaufargument): ${m.ohneZweck.slice(0, 8).join(" | ")}`,
      );
    if (m.notwendig.length)
      lines.push(
        `NOTWENDIGE ANGABEN (Passung, Menge, Material, Anwendung — MÜSSEN im Listing stehen, damit Käufer die Eignung prüfen können, sind aber KEIN Kaufargument: nie als Haupt-Nutzen und nie in einer Headline): ${m.notwendig.slice(0, 8).join(" | ")}`,
      );
  }
  if (inputs.wettbewerbsInfos?.length)
    lines.push(
      `ÜBERTRAGBARE WETTBEWERBER-INFORMATIONEN (D199 — Infos, die die Konkurrenz abbildet und unser Listing NICHT; gegen unsere Produkt-Wahrheit geprüft. Aufnehmen, wo sie zum Produkt passen — aber NUR mit UNSEREN belegten Angaben formulieren, NIE fremde Zahlen/Specs übernehmen. „prüfen" = nur nutzen, wenn die Produkt-Wahrheit es stützt):\n${inputs.wettbewerbsInfos
        .slice(0, 8)
        .map((w) => `- ${w.info}${w.urteil === "unbekannt" ? " (prüfen)" : ""} — ${w.grund}`)
        .join("\n")}`,
    );
  const approved = inputs.approved ?? {};
  for (const [sec, val] of Object.entries(approved)) {
    if (!val) continue;
    lines.push(`BEREITS FREIGEGEBEN — ${sec.toUpperCase()}: ${Array.isArray(val) ? val.join(" • ") : val}`);
  }
  return lines.filter(Boolean).join("\n");
}

const SYSTEM =
  "Du bist Senior-SEO-Texter für Amazon-Listings (DE-Markt) bei temoa. " +
  "Du hältst dich exakt an die Regeln im Prompt. Antworte AUSSCHLIESSLICH mit dem geforderten JSON, ohne Markdown-Zäune, ohne Vorwort.";

/**
 * Prompt = Kontext + Bau-Anleitung (sektionsspezifisch) + GESETZE aus dem
 * Regel-Register (D181: eine Quelle für Prompt, Gate und Prüfer) + optionaler
 * KORREKTUR-AUFTRAG mit den Findings des vorherigen Versuchs (D182).
 */
/**
 * Behebungs-Strategien je Regel (D195, Nutzer: „in Versuch 2 und 3 muss ein
 * ANDERER Ansatz gefunden werden — nicht dreimal dasselbe"): Der Korrektur-
 * Auftrag sagt nicht nur WAS verletzt ist, sondern WIE man es behebt —
 * insbesondere „streichen statt anders erfinden" bei unbelegten Zahlen.
 */
const BEHEBUNGS_STRATEGIEN: Array<[RegExp, string]> = [
  [/zahl-ohne-quelle$/, "Streiche die unbelegte Zahl-/Zeit-/Mengenangabe ERSATZLOS oder ersetze sie durch eine wörtlich belegte Angabe aus den Quellen — erfinde NIE eine andere Zahl als Ersatz."],
  [/zahl-widerspruch$/, "Übernimm die Zahl EXAKT so, wie sie in der Quelle steht — Spezifikationen nie verändern."],
  [/keyword-echo$/, "Flektiere das Keyword grammatisch (Groß-/Kleinschreibung, Bindestriche, Beugung) oder lass es an dieser Stelle weg — Wortstamm-Abdeckung genügt fürs Ranking."],
  [/satz-dopplung$/, "Behalte die Aussage nur im zuerst genannten Bullet; gib dem anderen ein NEUES Kern-Thema aus Erkenntnissen, Kaufauslösern oder Conversion-Blockern."],
  [/keyword-synonyme$/, "Die beanstandeten Begriffe bezeichnen DASSELBE Ding (z. B. „Psyllium Husk“ = „Flohsamenschalen“). Nenne es im gesamten Listing nur EINMAL — optional als „Flohsamenschalen (Psyllium Husk)“ — und STREICHE jede weitere Nennung als eigenständige Zutat/Material/Fakt. Führe niemals dasselbe unter zwei Namen als zwei Dinge. Der frei gewordene Platz nimmt einen ANDEREN belegten Fakt auf."],
  [/kollokation$/, "Ersetze die unpassende Wortverbindung durch die im Deutschen ÜBLICHE Formulierung für diese Eigenschaft — nicht das Adjektiv aus einem fremden Sinnfeld weiterverwenden. Benenne die Eigenschaft direkt (Löslichkeit → „löst sich klümpchenfrei auf“; Geschmack → „schmeckt fruchtig“) statt zwei Sinnfelder zu mischen. Im Zweifel den Satz ganz neu und einfacher formulieren."],
  [/keyword-natuerlich$/, "Flektiere die Suchphrase grammatisch in einen echten Satz (Groß-/Kleinschreibung, Bindestriche, Beugung) statt sie roh einzukleben — oder lass sie an dieser Stelle weg; Wortstamm-Abdeckung genügt fürs Ranking."],
  [/themen-dopplung$/, "Behalte das Thema NUR im zuerst genannten Bullet. Gib dem anderen einen KOMPLETT anderen, bisher ungenutzten Aspekt — wähle aus: Reinheit/Material, Herkunft/Herstellung, Einnahme/Anwendung, Lieferumfang/Menge, Eignung/Zielgruppe, Zertifikat, vegan/frei-von. Dieselbe Aussage, Wirkung oder Mengenangabe (auch als Tages- statt Kapselwert) darf NICHT in zwei Bullets stehen."],
  [/produkt-fokus$/, "Ersetze jede Meta-Aussage über das Listing/die Kennzeichnung/die Produktbilder durch eine belegte PRODUKT-Eigenschaft mit Kundennutzen. Nicht „wir weisen … aus“, sondern der Fakt selbst plus wofür er gut ist."],
  [/headline-benefit$/, "Formuliere die VERSALIEN-Headline als Kaufgrund/Benefit (oder Wirkstoff-/Marken-Versprechen) statt als nackte Menge/Dosierung — die Zahl gehört in den Belegsatz danach, nicht in die Headline."],
  [/headline-echo$/, "Der erste Satz nach dem Doppelpunkt darf die Headline nicht wiederholen — liefere dort sofort den Feature-Beleg für die Headline-Aussage."],
  [/^title\.budget$/, "Ergänze ein weiteres BELEGTES Attribut (Maß, Menge, Material, Eigenschaft) aus Produkt-Wahrheit oder Original-Listing — keine Füllwörter."],
  [/wirkversprechen$/, "Formuliere nur Wirkaussagen, die wörtlich in Original-Listing, Produkt-Wahrheit oder Zusatz-Infos stehen — alles andere streichen."],
  [/titel-dopplung$/, "Ersetze jedes Titel-Echo durch einen NEUEN belegten Fakt (Wirkstoff, Herkunft, Anwendungsdauer, Zertifikat) — die Highlights stehen direkt neben dem Titel und ergänzen ihn."],
  // D285: Bullet 1 muss den Haupt-Nutzen tragen, nicht ein Zusatz-Feature.
  [/hauptnutzen$/, "Schreibe Bullet 1 komplett neu, ausgehend vom STÄRKSTEN Kern-Kaufgrund: Headline = das Ergebnis für den Kunden, erster Satz = die belegte Eigenschaft, die es leistet, dann der Use Case. Das bisherige Thema des ersten Bullets (Erweiterbarkeit, Kompatibilität, Zubehör, Maße, Lieferumfang) wandert in einen der Bullets 2–5 oder fällt weg — der Haupt-Nutzen steht NIE hinter einem Zusatz-Feature."],
  // D285: Ein belegtes Problem wird gerahmt, nicht dementiert.
  [/pain-point-ehrlich$/, "Streiche die pauschale Entwarnung und formuliere den Punkt ehrlich: Nenne die belegte Eigenschaft (Bauteil, Maß, Material, Lieferumfang) UND die Bedingung, unter der sie trägt (Montage, Zubehör, Passung vorab prüfen). Aus „vermeidet undichte Übergänge“ wird „für dauerhaft dichte Verbindungen die mitgelieferten Schlauchschellen an beiden Enden festziehen“. Nie behaupten, das belegte Problem existiere nicht."],
];

function behebungFuer(rule: string): string | null {
  for (const [muster, strategie] of BEHEBUNGS_STRATEGIEN) if (muster.test(rule)) return strategie;
  return null;
}

/** Sektions-Labels für die Begründungs-Phase (D200). */
const SECTION_LABEL: Record<ListingSection, string> = {
  title: "Titel",
  highlights: "Item Highlights",
  bullets: "Bullet Points",
  backend: "Backend-Keywords",
  description: "Beschreibung",
  qa: "Q&A",
};

/**
 * Copy-Schema der ersten Phase (D200, Nutzer 23.07.: „JSON/rationale-Korsett
 * lockern“): NUR die Text-Felder, KEINE rationale. Die Prosa wird so nicht vom
 * gleichzeitigen Selbst-Rechtfertigen abgelenkt (Ursache der Meta-Floskeln im
 * Screenshot). Die Begründung liefert eine separate zweite Phase (rationalePrompt)
 * zum bereits fertigen Text — der zusammengebaute Datensatz trägt rationale wie
 * bisher (D183 unangetastet).
 */
const COPY_SCHEMA: Record<ListingSection, string> = {
  title: `{"title": "<der fertige Titel>"}`,
  highlights: `{"highlights": "<die fertigen Item Highlights>"}`,
  bullets: `{"bullets": ["<Bullet 1>", "<Bullet 2>", "<Bullet 3>", "<Bullet 4>", "<Bullet 5>"]}`,
  backend: `{"backend": "wort1 wort2 wort3 ..."}`,
  description: `{"description": "<die fertige Beschreibung>"}`,
  qa: `{"pairs": [{"q": "...", "a": "..."}]}`,
};

export function sectionPrompt(
  section: ListingSection,
  inputs: RecipeInputs,
  korrektur: ValidationIssue[] = [],
  vorherigerEntwurf?: string | null,
  lauf: { versuch: number; maxVersuche: number } = { versuch: 1, maxVersuche: 1 },
): string {
  const parts = [basePrompt(section, inputs)];
  const gesetze = regelnAlsPromptBlock(section);
  if (gesetze)
    parts.push(`GESETZE (Regel-Register — werden maschinell geprüft, jeder Verstoß erzwingt Regenerierung):\n${gesetze}`);
  if (korrektur.length) {
    // Korrektur statt Neuwurf (D190): Der vorherige Entwurf steht im Auftrag —
    // ein kompletter Neuwurf würfelt bei jedem Versuch NEUE Verstöße, gezielte
    // Korrektur konvergiert.
    parts.push(
      `KORREKTUR-AUFTRAG (Versuch ${lauf.versuch} von ${lauf.maxVersuche}): Dein vorheriger Entwurf hat das Qualitäts-Gate NICHT bestanden.${
        vorherigerEntwurf ? `\nVORHERIGER ENTWURF:\n${vorherigerEntwurf}` : ""
      }\nVERLETZTE REGELN:\n${korrektur
        .map((i) => {
          const behebung = behebungFuer(i.rule);
          return `- [${i.rule}] ${i.message}${behebung ? `\n  → Behebung: ${behebung}` : ""}`;
        })
        .join("\n")}\nKorrigiere MINIMAL-INVASIV: Behebe GENAU diese Verstöße und behalte alles Regelkonforme möglichst wörtlich bei.`,
    );
    // Eskalation über die Versuche (D195, Nutzer: „in Versuch 2 und 3 ein
    // ANDERER Ansatz"): Wiederholt sich derselbe Verstoß, hilft kein leicht
    // variierter Neuwurf — der Auftrag verlangt einen strukturell anderen Ansatz,
    // im letzten Versuch das Weglassen statt der erneuten Dopplung.
    const istLetzter = lauf.versuch >= lauf.maxVersuche;
    parts.push(
      istLetzter
        ? `LETZTER VERSUCH — die bisherigen Anläufe haben denselben Verstoß reproduziert. Variiere NICHT den alten Entwurf, sondern wähle für die beanstandeten Stellen einen STRUKTURELL anderen Ansatz: anderes Kern-Thema, andere Reihenfolge. Wenn sich ein Aspekt nicht eigenständig unterbringen lässt, LASS IHN WEG — ein schlichteres, aber eigenständiges Bullet ist besser als eine erneute Dopplung oder ein Synonym als zweites Ding. Dies ist der letzte Versuch, danach wird nichts angezeigt.`
        : `ANDERER ANSATZ (D195): Wiederhole NICHT den vorigen Entwurf leicht umformuliert — dieselbe Formulierung erzeugt denselben Verstoß. Wähle für die beanstandeten Stellen ein anderes Kern-Thema bzw. eine andere Struktur.`,
    );
  }
  // Copy-Phase (D200): NUR die Text-Felder, KEINE Begründung — die Prosa soll
  // ohne Selbst-Rechtfertigung entstehen. Antworte exakt mit diesem JSON.
  parts.push(`AUSGABE: Antworte AUSSCHLIESSLICH mit diesem JSON — exakt diese Felder, KEINE Begründung, KEIN weiteres Feld, kein Markdown:\n${COPY_SCHEMA[section]}`);
  return parts.join("\n\n");
}

/**
 * Begründungs-Phase (D200): erklärt den BEREITS FERTIGEN Text — verändert ihn
 * nicht. Läuft erst, wenn die Copy alle Error-Checks (Gate + LLM-Prüfer)
 * bestanden hat; kann die geprüfte Copy also nicht mehr verschlechtern.
 */
export function rationalePrompt(section: ListingSection, inputs: RecipeInputs, finalText: string): string {
  return `${contextBlock(inputs, section)}

FERTIGER TEXT — Sektion „${SECTION_LABEL[section]}" (bereits final und geprüft — NICHT verändern, nur erklären):
${finalText}

AUFGABE: Begründe den obigen, fertigen Text. Pro sinntragendem Bestandteil (Titelteil, Bullet-Headline, Highlight-Fakt, Abschnitt) ein Eintrag: WORAUS er sich ableitet — Keyword-Analyse, USP, Produkt-Wahrheit, Slot-Logik (HOOK/PROBLEM→BENEFIT/TRUST/USAGE/CLOSE), Pain Point oder Kaufauslöser. Du schreibst den Text NICHT um.
AUSGABE: Antworte AUSSCHLIESSLICH mit diesem JSON, kein Markdown:
{"rationale": [{"part": "<Bestandteil>", "source": "<Herleitung>"}]}`;
}

function basePrompt(section: ListingSection, inputs: RecipeInputs): string {
  const ctx = contextBlock(inputs, section);
  const kw = inputs.keywords;
  switch (section) {
    case "title":
      return `${ctx}

AUFGABE: Schreibe den Amazon-Produkttitel.
REGELN (knowledge/content/title.md, Amazon-Neuerung 07/2026):
- HART: ${RULES.title.targetMinChars}–${RULES.title.maxChars} Zeichen — PFLICHTBAND, unter ${RULES.title.targetMinChars} ist verschenkter Platz und wird abgewiesen. Zähle sorgfältig.
- HAUPTKEYWORD „${kw.primary[0] ?? ""}" MUSS abgedeckt sein — WORTSTAMM-Abdeckung zählt: Flexion und Komposita sind erlaubt und erwünscht („Ulmenrinde-Drops für Hunde" deckt „ulmenrinde für hunde"). NIE eine Suchphrase wörtlich einkleben, wenn sie ungrammatisch ist — Amazon matcht Wortstämme, geklebte Phrasen bringen NULL Ranking-Vorteil.
- Weitere PRIMARY-Keywords (${kw.primary.slice(1).join(", ") || "keine"}): nur einbauen, was grammatisch natürlich passt — Vollständigkeit ist KEINE Pflicht, Lesbarkeit gewinnt immer. Kein Wortstamm mehrfach.
- Zahlen als Ziffern. Keine Werbephrasen, keine Emojis, keine Versalien-Wörter außer Marke/Norm.`;
    case "bullets":
      return `${ctx}

AUFGABE: Schreibe genau ${RULES.bullets.count} Bullet Points.
REGELN (knowledge/content/bullets.md + Blog 07/2026):
- Jeder Bullet: HEADLINE IN VERSALIEN (3–5 Wörter) + Doppelpunkt + max. 3 Sätze.
- DREI-POSITIONEN-ANATOMIE (Schaubild Blog 07/2026) — jeder Bullet in dieser Reihenfolge: POSITION 1 = Benefit zuerst (Headline + erste 5–8 Wörter). POSITION 2 = das Feature dahinter als Beleg, mit dem Secondary Keyword NATÜRLICH integriert. POSITION 3 = Use Case + konkrete Details: für wen/wann geeignet + Material, Maß, Prüfnorm oder Garantie. Beispiel: „Bleibt jahrelang scharf im täglichen Einsatz. Gehärteter Edelstahl mit dreifach geschliffener Klinge. Kein Nachschärfen nötig. 20 cm Klinge. 10 Jahre Garantie."
- DREI JOBS je Bullet: einen wahrscheinlichen Einwand entkräften + einen konkreten Use Case bestätigen + ein Secondary Keyword NATÜRLICH unterbringen. Keyword-Stapeln auf Kosten der Lesbarkeit verliert alle drei — Kunden scannen in 2 Sekunden.
- LÄNGE, HART GEPRÜFT: Jeder Bullet zählt ZEICHEN INKLUSIVE LEERZEICHEN (Headline, Doppelpunkt und Satzzeichen zählen mit). Hartes Max ${RULES.bullets.hardMaxChars} Zeichen — darüber wird der Bullet abgewiesen. Ziel ${RULES.bullets.utilizationMinChars}–${RULES.bullets.hardMaxChars} Zeichen: so viel Substanz wie möglich, kein Füllwort-Padding. Zähle sorgfältig und bleibe unter der Grenze, statt einen zu langen Satz anzufangen.
- Slot-Logik: 1 HAUPT-NUTZEN (stärkster Kern-Kaufgrund) · 2 PROBLEM→BENEFIT (häufigster Pain Point!) · 3 TRUST (Material/Norm mit Beleg) · 4 USAGE · 5 CLOSE (Lieferumfang/Erwartungsmanagement).
- BULLET 1 = HAUPT-NUTZEN, HARTE REGEL (wird geprüft): Der erste Bullet sagt, WAS das Produkt ist und WAS es für den Kunden TUT — der stärkste Kern-Kaufgrund, in der Headline. Wer nur diesen einen Bullet liest, muss wissen, was er kauft und was er davon hat. VERBOTEN als Bullet 1: Erweiterbarkeit, Kombinierbarkeit, Kompatibilität, Zubehör, Maße, Mengen, Lieferumfang, Montage — das sind Zusatz-Themen und gehören in Bullet 2–5. Auch der Titel erklärt den Nutzen NICHT: er nennt nur Bezeichnung und Attribute.
  FALSCH (Solar-Poolheizung): „ERWEITERBAR FÜR JEDE POOLGRÖSSE: Reicht ein Kollektor nicht aus, lassen sich mehrere Elemente in Serie verbinden." → steigt mit einem Zusatz-Feature ein; der Kaufgrund (warmes Poolwasser durch Sonne) fehlt.
  RICHTIG: „WARMES POOLWASSER ALLEIN DURCH SONNENKRAFT: Der Solarkollektor erwärmt das Wasser Ihres Aufstellpools um 1 bis 3 °C pro Tag, ohne Strom- oder Gasheizung. Angeschlossen an die vorhandene Filterpumpe verlängert er die Badesaison." → Kaufgrund in der Headline, Feature als Beleg, Use Case konkret.
- Jede USP aus dem USP-SET genau EINMAL über alle Bullets. Keine Emojis.
- SECONDARY-Keywords über die fünf Bullets VERTEILEN (je Bullet ein bis drei, KEIN Keyword in zwei Bullets), grammatisch natürlich integriert — die Verteilung folgt den Themen: Keywords und Kunden-Nutzen so aufteilen, dass kein Bullet einen anderen inhaltlich wiederholt: ${kw.secondary.join(", ")}
- PRODUKT-FOKUS (härteste Regel, wird blockierend geprüft): Jeder Satz beschreibt das PRODUKT und seinen konkreten Nutzen — NIE das Listing, die Kennzeichnung/Auszeichnung, die Produktbilder oder euren Anbieter-Standpunkt. Verbotene Meta-Floskeln: „wir weisen … aus“, „ein Foto finden Sie in unseren Produktbildern“, „diese Transparenz ist uns wichtig(er als …)“.
- HEADLINE = KAUFGRUND, nie eine nackte Menge/Dosierung (wird blockierend geprüft). Erlaubt: Benefit-Aussage, Wirkstoff-Kombination, Marken-Versprechen. Falsch: „PRO KAPSEL 610 MG“, „350 G MIT 160 DROPS“.
- PAIN POINTS EHRLICH RAHMEN, NIE DEMENTIEREN (harte Regel, wird geprüft): Ein Problem, das die Reviews belegen, darf NICHT als nicht existent dargestellt werden. Verboten ist die pauschale Entwarnung („dichter Anschluss ohne Adapter-Suche", „vermeidet undichte Übergänge", „passt problemlos", „kein Nachdichten nötig"), wenn genau das der häufigste Pain Point ist — Käufer, die die Bewertungen gelesen haben, erkennen darin eine Lüge, und der Bullet verbrennt Vertrauen statt es aufzubauen.
  SO GEHT ES: (1) benenne, was das Produkt konkret dafür mitbringt (Bauteil, Maß, Material, Lieferumfang), (2) sage, was der Kunde dafür tun oder prüfen muss (Montage, Zubehör, Schlauchschellen, Bypass, Passung vorab prüfen) — Erwartungsmanagement statt Dementi.
  FALSCH: „DICHTER ANSCHLUSS OHNE ADAPTER-SUCHE: Der genormte Anschluss Ø 38 mm … vermeidet undichte Übergänge." (Reviews: undichte Anschlüsse sind das Hauptärgernis)
  RICHTIG: „ANSCHLUSS Ø 38 MM RICHTIG ABDICHTEN: Der genormte Anschluss passt an gängige Filteranlagen; für dauerhaft dichte Verbindungen ziehen Sie die mitgelieferten Schlauchschellen an beiden Enden fest an." → nennt das Feature, verschweigt die Bedingung nicht.
- VORHER→NACHHER — lerne den Unterschied an einem echten Fall:
  SCHLECHT: „PRO KAPSEL 610 MG, KLAR AUSGEWIESEN: Sie wissen genau, was Sie einnehmen. Wir weisen beide Werte getrennt aus.“ → Headline = nur Menge; Text = Meta über die Kennzeichnung; kein Nutzen, kein Keyword, Budget verschenkt.
  GUT: „HOCHDOSIERT FÜR DIE TÄGLICHE BALLASTSTOFFZUFUHR: 610 mg indischer Flohsamen (Psyllium Husk) pro Kapsel liefern konzentrierte Ballaststoffe für eine sanfte Verdauung. Ideal für Erwachsene, die ohne Anrühren von losem Pulver dosieren möchten.“ → Headline = Nutzen; die Zahl 610 mg dient als Beleg; Keyword integriert; konkreter Use Case; Budget genutzt.`;
    case "highlights":
      return `${ctx}

AUFGABE: Schreibe die Amazon "Item Highlights" (neue Sektion).
REGELN (Ausschöpfungs-Prinzip 07/2026):
- HART: max ${RULES.itemHighlights.maxChars} Zeichen GESAMT; Ziel ${RULES.itemHighlights.targetMinChars}–${RULES.itemHighlights.maxChars} — Budget ausnutzen, sorgfältig zählen.
- NULL TITEL-DOPPLUNG (wird maschinell geprüft, D197): Titel und Highlights stehen im Listing DIREKT nebeneinander — kein Wort, kein Fakt, keine Zahl aus dem Titel darf wieder auftauchen.${typeof inputs.approved?.title === "string" ? `\n- FREIGEGEBENER TITEL (NICHTS hieraus wiederholen): "${inputs.approved.title}"` : ""}
- Stattdessen die 2–3 kaufentscheidendsten ZUSÄTZLICHEN Fakten: Wirkstoffe/Materialien, Herkunft/Entwicklung, Anwendungsdauer/-art, Zertifikate — kompakt und konkret aus den belegten Quellen.
- BUDGET AUSNUTZEN: Ziel ${RULES.itemHighlights.targetMinChars}–${RULES.itemHighlights.maxChars} Zeichen — so viele ZUSÄTZLICHE belegte Fakten aufnehmen, wie das Budget fasst, statt früh abzubrechen. Kein Füllwort-Padding.`;
    case "backend":
      return `${ctx}

AUFGABE: Backend-Suchbegriffe (generische Keywords).
REGELN (knowledge/content/backend-keywords.md + Blog 07/2026):
- Einzelwörter, Leerzeichen-getrennt, KEINE Kommas, KEINE Satzzeichen (Amazon ignoriert sie — verschwendete Bytes). Max ${RULES.backendKeywords.maxBytes} Bytes UTF-8 — bei Überschreitung ignoriert Amazon das GESAMTE Feld.
- KEIN Wort, das schon in Titel/Bullets sichtbar ist (Main Keywords hier = verschwendeter Platz). Keine Markennamen (Policy + Account Health). Singular ODER Plural, nie beides.
- Priorität (Nutzer-Vorgabe 22.07.): (1) Synonyme/Abkürzungen/andere Formulierungen ZUERST (Titel „Edelstahl Rührschüssel" → Backend „salatschüssel backschüssel teigschüssel prep bowl"), (2) andere Schreibweisen inkl. gängiger Vertipper, (3) ENGLISCHE Suchbegriffe auf amazon.de („mixing bowl" statt „rührschüssel" — die fängt kaum jemand ab), (4) Rest-Long-Tails, (5) Kundensprache/Regionalbegriffe.
- BUDGET AUSNUTZEN: möglichst nah an ${RULES.backendKeywords.maxBytes} Bytes (nie darüber).
- POOL: ${kw.backendPool.join(", ")}`;
    case "description":
      return `${ctx}

AUFGABE: Produktbeschreibung als zusammenhängender Marketing-Fließtext (2–4 Absätze) — KEIN Frage-Antwort-Schema, kein Aufzählungs-Ersatz.
REGELN (knowledge/content/description.md):
- Max ${RULES.description.maxBytes} Bytes. Aufbau in fließenden Absätzen: (1) Positionierung/Einstieg — für wen und wofür; (2) Nutzenargumente, jeweils mit BELEG aus der Produkt-Wahrheit (Maß, Material, Norm, Zertifikat); (3) Einwandbehandlung (Haltbarkeit, Anwendung, Eignung) als Aussage; (4) weicher Abschluss.
- NUR AUSSAGESÄTZE. Streng verboten: Frage-Sätze, das „Frage? Antwort."-Muster und rhetorische Fragen (kein „?"). AEO-Nutzen entsteht dadurch, dass jeder Satz eine typische Kundenfrage IMPLIZIT beantwortet — als klarer Fakt, NICHT indem die Frage gestellt wird. Beispiel: statt „Wie nehme ich die Kapseln ein? Mit viel Wasser." schreibe „Zur Einnahme genügt eine Kapsel mit reichlich Wasser."
- BUDGET AUSNUTZEN: möglichst nah an ${RULES.description.maxBytes} Bytes (nie darüber) — maximale Datengrundlage für den Algorithmus, ohne Füllphrasen.
- Bullets NICHT wörtlich wiederholen. TERTIARY-Keywords organisch: ${kw.tertiary.join(", ")}
- PRODUKT-FOKUS (wird blockierend geprüft): über das Produkt und seinen Nutzen schreiben — NICHT über das Listing, die Kennzeichnung/Auszeichnung oder die Produktbilder („diese Transparenz ist uns wichtiger als …“, „ein Foto finden Sie in den Produktbildern“ sind verboten).`;
    case "qa":
      return `${ctx}

AUFGABE: Schreibe ${RULES.qa.pairs} Q&A-Paare (Kundenfragen + Antworten) — Datengrundlage für KI-Assistenten (Alexa for Shopping).
REGELN (Ausschöpfungs-Prinzip 07/2026):
- Genau ${RULES.qa.pairs} Paare. Frage max ${RULES.qa.questionMaxChars} Zeichen; Antwort max ${RULES.qa.answerMaxChars}, Ziel ≥${RULES.qa.answerUtilizationMinChars} — Budget ausnutzen.
- Echte Kaufhürden-Fragen (aus Pain Points/Reviews, wenn vorhanden), faktenbasierte Antworten aus der Produkt-Wahrheit.`;
  }
}

// ── Parsing & deterministische Nachbearbeitung ───────────────────────────────

/** Tolerantes Parsen (repariert abgeschnittene LLM-Antworten, D70/D81). */
function parseJson(raw: string): Record<string, unknown> {
  return parseLlmJson<Record<string, unknown>>(raw);
}

/** Deterministischer Fallback ohne LLM-Key (Mock-Modus): baut ein regelkonformes Skelett aus den Inputs. */
function templateDraft(section: ListingSection, inputs: RecipeInputs): Record<string, unknown> {
  const f = inputs.facts;
  const kw = inputs.keywords;
  switch (section) {
    case "title": {
      // 60–75-Zeichen-Budget deterministisch füllen: Marke → Hauptkeyword → Attribute → USP-Kürzel
      const parts: Array<{ text: string; source: string }> = [
        { text: inputs.brand, source: "Marke (Stammdaten)" },
        { text: kw.primary[0] ?? inputs.productName, source: "Hauptkeyword aus Keyword-Analyse" },
      ];
      for (const [i, a] of [f.dimensions, ...(f.materials ?? [])].filter(Boolean).entries())
        parts.push({ text: String(a), source: i === 0 ? "Maß/Menge (Produkt-Wahrheit)" : "Material (Produkt-Wahrheit)" });
      if (f.usps?.[0]) parts.push({ text: f.usps[0], source: "USP #1 (Produkt-Wahrheit/Reviews)" });

      let title = "";
      const used: typeof parts = [];
      for (const p of parts) {
        const candidate = title ? `${title}${used.length === 1 ? " " : ", "}${p.text}` : p.text;
        if (candidate.length > RULES.title.maxChars) break;
        title = candidate;
        used.push(p);
      }
      return { title, rationale: used.map((p) => ({ part: p.text, source: p.source })) };
    }
    case "bullets": {
      const heads = ["STARKER ALLTAGS-NUTZEN", "PROBLEM GELÖST", "GEPRÜFTE QUALITÄT", "EINFACHE ANWENDUNG", "DURCHDACHTER LIEFERUMFANG"];
      const usps = f.usps ?? [];
      // Je Slot ein EIGENER Belegsatz — identische Sätze über Bullets würden
      // (zu Recht) am Satz-Dopplungs-Check des Gates scheitern (D181).
      const slotSaetze = [
        `Konkreter Nutzen für ${f.targetAudience ?? "den Alltag"}, klar belegt statt versprochen.`,
        "Löst das häufigste Problem der Zielgruppe mit nachvollziehbaren Fakten.",
        "Material und Verarbeitung sind belegt, nichts wird geschätzt.",
        "Anwendung ohne Vorkenntnisse, direkt einsatzbereit.",
        "Lieferumfang und Erwartungen ehrlich benannt.",
      ];
      return {
        bullets: heads.map((h, i) => {
          const usp = usps[i] ? `${usps[i]}. ` : "";
          const kwHint = kw.secondary[i] ? ` Ideal als ${kw.secondary[i]}.` : "";
          return `${h}: ${usp}${slotSaetze[i]}${kwHint}`;
        }),
        rationale: heads.map((h, i) => ({
          part: h,
          source: usps[i] ? `Slot ${i + 1} · USP: ${usps[i]} (Template)` : `Slot ${i + 1} (Template)`,
        })),
      };
    }
    case "highlights": {
      const facts = [f.dimensions, f.usps?.[0], f.materials?.[0]].filter(Boolean).join(" · ");
      return { highlights: facts.slice(0, RULES.itemHighlights.maxChars), rationale: [{ part: facts.slice(0, 30), source: "Produkt-Wahrheit (Template)" }] };
    }
    case "backend":
      return { backend: trimToBytesByWord(kw.backendPool.join(" "), RULES.backendKeywords.maxBytes), rationale: [{ part: "Pool-Reihenfolge", source: "Backend-Pool aus Keyword-Analyse (Template)" }] };
    case "description": {
      // Tertiary-Keywords großgeschrieben in einen Trägersatz — roh
      // kleingeschriebene Phrasen scheiterten (zu Recht) am Keyword-Echo-Check.
      const tertiaer = kw.tertiary.slice(0, 5).map((k) => k.charAt(0).toUpperCase() + k.slice(1));
      return {
        description: `${inputs.brand} ${inputs.productName}: entwickelt für ${f.targetAudience ?? "anspruchsvolle Nutzer"}. ${(f.usps ?? []).join(". ")}. Die Anwendung ist einfach und ohne Vorkenntnisse möglich.${tertiaer.length ? ` Relevante Eigenschaften: ${tertiaer.join(", ")}.` : ""} Alle Details oben im Überblick.`,
        rationale: [{ part: "Aufbau", source: "Positionierung → Nutzen → Q&A-Denke (Template)" }],
      };
    }
    case "qa": {
      const pains = inputs.reviewInsights?.painPoints?.slice(0, 5) ?? [];
      // Ordinal-WÖRTER statt Ziffern: „Frage 1 zu …" scheiterte (zu Recht) am
      // Zahlen-Herkunfts-Check des Gates — erfundene Zahlen gibt es auch im Mock nicht.
      const ordinale = ["Erste", "Zweite", "Dritte", "Vierte", "Fünfte"];
      const pairs = Array.from({ length: RULES.qa.pairs }, (_, i) => ({
        q: pains[i] ? `Ist das Problem "${pains[i].label}" gelöst?` : `${ordinale[i] ?? "Weitere"} typische Frage zu ${f.productType ?? inputs.productName}?`,
        a: `Faktenbasierte Antwort aus der Produkt-Wahrheit: ${(f.usps ?? ["konkreter Nutzen"]).join(", ")}. Ausführlich genug formuliert, um das Antwort-Budget sinnvoll zu nutzen und dem Algorithmus Substanz zu geben.`,
      }));
      return { pairs, rationale: pairs.map((p, i) => ({ part: p.q.slice(0, 40), source: pains[i] ? `Pain Point #${i + 1} aus Reviews` : "Typische Kaufhürde (Template)" })) };
    }
  }
}

/**
 * Begründung generisch extrahieren + deterministisch verifizieren:
 * Behauptete Bestandteile müssen im erzeugten Text tatsächlich vorkommen
 * (Wort-Overlap-Heuristik), sonst werden sie als unbelegt markiert.
 */
function extractRationale(parsed: Record<string, unknown>, text: string): TitleRationale {
  const raw = Array.isArray(parsed.rationale) ? (parsed.rationale as Array<{ part?: unknown; source?: unknown }>) : [];
  const lower = text.toLowerCase();
  return raw
    .map((r) => ({ part: String(r.part ?? "").trim(), source: String(r.source ?? "").trim() }))
    .filter((r) => r.part)
    .map((r) => {
      const words = r.part.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
      const hits = words.filter((w) => lower.includes(w)).length;
      return { ...r, verified: words.length === 0 ? false : hits / words.length >= 0.5 };
    });
}

// ── QM-Schleife & öffentliche API (D182: hartes Gate, D183: Kontrakt-Grenze) ─

/**
 * QM-Urteil „nicht bestanden" (D182): Bleiben nach allen Versuchen Error-Findings,
 * ist das Ergebnis NICHT freigabefähig — die Bibliothek signalisiert das durch
 * diesen Fehler mit vollständigem Prüfbericht. Jeder Block ist zugleich ein
 * Bau-Auftrag (neuer Fixer/Check/Input-Pflicht) und wird strukturiert geloggt.
 *
 * `bestesErgebnis` (D202, Nutzer 24.07.): der beste der Versuche (wenigste
 * Error-Findings) wird MITGEGEBEN, damit die App-Schicht entscheiden kann, ihn
 * als klar markierten „Entwurf mit offenen Punkten" anzuzeigen statt einer
 * leeren Wand. `null`, wenn kein einziger Versuch bis zu einem Entwurf kam
 * (nur kaputtes JSON/Schema) — dann gibt es nichts zu zeigen.
 */
export class QmBlockFehler extends Error {
  constructor(
    public section: ListingSection,
    public issues: ValidationIssue[],
    public versuche: number,
    public bestesErgebnis: SectionResult | null = null,
  ) {
    super(
      `QM-Gate: ${issues.length} Regelverstoß/-verstöße nach ${versuche} Versuch(en) nicht behebbar — nicht freigabefähig. ` +
        issues.slice(0, 5).map((i) => `[${i.rule}] ${i.message}`).join(" · "),
    );
  }
}

/** Max. Generier-Versuche je Sektion (1 Erstversuch + 2 Korrektur-Schleifen). */
const MAX_VERSUCHE = 3;

function nurErrors(issues: ValidationIssue[]): ValidationIssue[] {
  return issues.filter((i) => i.severity === "error");
}

/** Extraktion + deterministische Fixer (D184) + deterministisches Gate. */
function baueErgebnis(
  section: ListingSection,
  parsed: Record<string, unknown>,
  inputs: RecipeInputs,
  ctx: Parameters<typeof validateTitle>[1],
  raw: string,
  providerName: string,
  model: string,
): SectionResult {
  switch (section) {
    case "title": {
      // Längen-Fixer (D184/D192): Zeichen zählt und kürzt der CODE — ein zu
      // langer Titel geht nie zurück ans LLM (das nicht zählen kann), sondern
      // wird verlustarm von hinten gekürzt; Hauptkeyword-Abdeckung bleibt Pflicht.
      const primary = inputs.keywords.primary[0];
      const text = fixeTitelLaenge(fixeWhitespace(String(parsed.title ?? "")), {
        max: RULES.title.maxChars,
        min: RULES.title.targetMinChars,
        istZulaessig: (s) => !primary || keywordStammAbgedeckt(primary, s),
      });
      return { section, payload: { text, rationale: extractRationale(parsed, text) }, issues: validateTitle(text, ctx), raw, provider: providerName, model };
    }
    case "highlights": {
      // Fakten-Fixer (D198): erfundene Zahl-Sätze streichen, bevor das Gate prüft
      const text = entferneUnbelegteZahlSaetze(fixeWhitespace(String(parsed.highlights ?? "")), ctx?.zahlenQuellen ?? "").text;
      return { section, payload: { text, rationale: extractRationale(parsed, text) }, issues: validateItemHighlights(text, ctx), raw, provider: providerName, model };
    }
    case "qa": {
      const pairs = Array.isArray(parsed.pairs)
        ? (parsed.pairs as Array<{ q?: unknown; a?: unknown }>).map((p) => ({ q: fixeWhitespace(String(p.q ?? "")), a: fixeWhitespace(String(p.a ?? "")) }))
        : [];
      const joined = pairs.map((p) => `${p.q} ${p.a}`).join(" ");
      return { section, payload: { pairs, rationale: extractRationale(parsed, joined) }, issues: validateQa(pairs, ctx), raw, provider: providerName, model };
    }
    case "bullets": {
      // Fakten-Fixer je Bullet (D198): erfundene Zahl-Sätze streichen, bevor das Gate prüft
      const items = Array.isArray(parsed.bullets)
        ? fixeWhitespaceListe(parsed.bullets.map(String)).map((b) => entferneUnbelegteZahlSaetze(b, ctx?.zahlenQuellen ?? "").text)
        : [];
      return { section, payload: { items, rationale: extractRationale(parsed, items.join(" ")) }, issues: validateBullets(items, ctx), raw, provider: providerName, model };
    }
    case "backend": {
      // Deterministische Byte-Durchsetzung NACH dem LLM (temoa-os-Muster);
      // Satzzeichen raus (Amazon ignoriert sie — verschwendete Bytes, Blog 07/2026)
      const text = trimToBytesByWord(String(parsed.backend ?? "").replace(/[,;.!?:„“‚’"']/g, " ").replace(/\s+/g, " ").trim(), RULES.backendKeywords.maxBytes);
      // Dedup gegen den sichtbaren Platz (D195; Reihenfolge D204): Backend läuft
      // VOR der Beschreibung — Titel, Highlights und Bullets sind freigegeben und
      // zählen als belegter Platz. Die Beschreibung existiert hier noch nicht
      // (approved.description ist leer) und wird bewusst nicht abgewartet.
      const visible = [
        typeof inputs.approved?.title === "string" ? inputs.approved.title : "",
        typeof inputs.approved?.highlights === "string" ? inputs.approved.highlights : "",
        ...(Array.isArray(inputs.approved?.bullets) ? inputs.approved.bullets : []),
        typeof inputs.approved?.description === "string" ? inputs.approved.description : "",
      ].join(" ");
      return { section, payload: { text, rationale: extractRationale(parsed, text) }, issues: validateBackendKeywords(text, visible, ctx), raw, provider: providerName, model };
    }
    case "description": {
      // Fakten-Fixer (D198) VOR dem Byte-Trim: erfundene Zahl-Sätze streichen
      const gefixt = entferneUnbelegteZahlSaetze(fixeWhitespace(String(parsed.description ?? "")), ctx?.zahlenQuellen ?? "").text;
      const text = trimToBytesBySentence(gefixt, RULES.description.maxBytes);
      const bullets = Array.isArray(inputs.approved?.bullets) ? (inputs.approved.bullets as string[]) : [];
      return { section, payload: { text, rationale: extractRationale(parsed, text) }, issues: validateDescription(text, bullets, ctx), raw, provider: providerName, model };
    }
  }
}

/** Der Text, den der LLM-Prüfer zu sehen bekommt (payload-form-unabhängig). */
function textFuerPruefer(result: SectionResult): string {
  if (result.payload.items) return result.payload.items.map((b, i) => `Bullet ${i + 1}: ${b}`).join("\n");
  if (result.payload.pairs) return result.payload.pairs.map((p, i) => `Q${i + 1}: ${p.q}\nA${i + 1}: ${p.a}`).join("\n");
  return result.payload.text ?? "";
}

/**
 * Datengrundlage für den Prüfer: Fakten + Keywords + BELEG-QUELLEN.
 * Original-Listing und Zusatz-Infos sind Pflicht-Kontext (D194): ohne sie
 * konnte der Prüfer belegte Wirkaussagen („gegen Sodbrennen" steht im
 * Original-Titel) nicht von erfundenen unterscheiden und flaggte Belegtes.
 */
export function prueferKontext(inputs: RecipeInputs): string {
  const ri = inputs.reviewInsights;
  // Ein-Seiten-Zuordnung wie im Autor-Prompt (D196): Der Prüfer muss dieselben
  // Listen sehen wie der Autor, sonst beurteilt er gegen andere Daten.
  const seiten = ri ? einseitigeAspekte(ri) : null;
  return [
    `MARKE: ${inputs.brand || inputs.eigenmarkeAusListing || "unbekannt"}`,
    `PRODUKT: ${inputs.productName}`,
    `PRODUKT-FAKTEN (Beleg-Quelle): ${JSON.stringify(inputs.facts)}`,
    /**
     * Bewertungs-Analyse für den Prüfer (D285, Nutzer-Befund 04.08.2026).
     *
     * Sie fehlte hier komplett — der Prüfer konnte deshalb NICHT erkennen, dass
     * ein Bullet ein belegtes Problem dementiert („dichter Anschluss ohne
     * Adapter-Suche", während undichte Anschlüsse der häufigste Pain Point
     * waren). Ohne diesen Block sind `inhalt.pain-point-ehrlich` und
     * `bullets.hauptnutzen` nicht prüfbar.
     */
    seiten?.painPoints.length
      ? `PAIN POINTS AUS ECHTEN REVIEWS (belegte Probleme — eine pauschale Entwarnung zu einem dieser Themen ist ein Dementi und damit ein Verstoß):\n${seiten.painPoints
          .slice(0, 6)
          .map((p) => `- ${p.label}${p.mentionCount !== null ? ` (${p.mentionCount}× belegt)` : ""}`)
          .join("\n")}`
      : "",
    seiten?.buyingTriggers.length
      ? `KAUFAUSLÖSER AUS ECHTEN REVIEWS: ${seiten.buyingTriggers.slice(0, 6).map((t) => t.label).join(" | ")}`
      : "",
    inputs.conversionDriver?.length
      ? `KERN-KAUFGRÜNDE (wichtigster zuerst — der erste Bullet muss den STÄRKSTEN tragen):\n${inputs.conversionDriver
          .slice(0, 5)
          .map((d, i) => `${i + 1}. ${d.resultat}`)
          .join("\n")}`
      : "",
    inputs.listingIst?.title || inputs.listingIst?.bullets?.length
      ? `ORIGINAL-LISTING (Beleg-Quelle — dort stehende Aussagen und Wirkangaben gelten als BELEGT):${inputs.listingIst.title ? `\nTitel: ${inputs.listingIst.title}` : ""}${inputs.listingIst.bullets?.length ? `\nBullets: ${inputs.listingIst.bullets.join(" • ")}` : ""}`
      : "",
    inputs.bildBelege?.trim()
      ? `BILDER / A+ / PRODUKTINFO (Beleg-Quelle — dort stehende Aussagen & Zahlen gelten als BELEGT):\n${inputs.bildBelege.trim().slice(0, 3000)}`
      : "",
    inputs.zusatzKontext?.trim() ? `ZUSATZ-INFOS (Beleg-Quelle):\n${inputs.zusatzKontext.trim().slice(0, 2000)}` : "",
    `KEYWORDS (dürfen ausschließlich grammatisch integriert vorkommen): ${Object.values(inputs.keywords).flat().join(", ")}`,
  ].filter(Boolean).join("\n");
}

/**
 * Bullet-weise Korrektur (D194, Nutzer 23.07.: „wenn ein Bullet passt, wird
 * nicht das gesamte Konzept neu gewürfelt — nur der fehlerhafte Bullet wird
 * neu geschrieben"): Aus den Error-Findings die betroffenen Bullet-Indizes
 * lesen; Findings ohne Bullet-Bezug gelten als global (alle betroffen).
 */
export function betroffeneBullets(findings: ValidationIssue[], anzahl: number): Set<number> {
  const betroffen = new Set<number>();
  let global = false;
  for (const f of findings) {
    const treffer = [...f.message.matchAll(/Bullet\s+(\d+)/gi)];
    if (treffer.length === 0) global = true;
    for (const m of treffer) {
      const i = parseInt(m[1], 10) - 1;
      if (i >= 0 && i < anzahl) betroffen.add(i);
    }
  }
  if (global || betroffen.size === 0) return new Set(Array.from({ length: anzahl }, (_, i) => i));
  return betroffen;
}

/**
 * Zweite Phase (D200): Begründung zum bereits geprüften Text ergänzen.
 * Die geprüfte Copy wird NICHT mehr verändert — schlägt die Begründungs-Phase
 * fehl, bleibt das Ergebnis gültig (rationale ist Zusatz-Metadatum, kein
 * Sperrgrund für bereits bestandene Copy). Im Mock-Modus liefert templateDraft
 * die rationale bereits mit → kein zusätzlicher Call.
 */
async function ergaenzeRationale(result: SectionResult, inputs: RecipeInputs): Promise<SectionResult> {
  if (result.provider === "mock") return result;
  if (result.payload.rationale && result.payload.rationale.length > 0) return result;
  const finalText = textFuerPruefer(result);
  const recipeKey = `listing.${result.section === "backend" ? "backend" : result.section}`;
  try {
    const res = await generateForRecipe(recipeKey, {
      system: SYSTEM,
      messages: [{ role: "user", content: rationalePrompt(result.section, inputs, finalText) }],
      maxTokens: 4000,
      temperature: 0,
    });
    const parsed = parseJson(res.text);
    // Kontrakt der Begründungs-Grenze (D183): nur eine schema-gültige rationale
    // wird übernommen — sonst bleibt das Feld leer statt halb-kaputt.
    if (pruefeRationaleKontrakt(parsed).length === 0) {
      result.payload.rationale = extractRationale(parsed, finalText);
    }
  } catch {
    // Begründung optional — die Copy ist bereits vollständig geprüft.
  }
  return result;
}

export async function generateSection(
  section: ListingSection,
  inputs: RecipeInputs,
): Promise<SectionResult> {
  const recipeKey = `listing.${section === "backend" ? "backend" : section}`;
  const { provider, model } = resolveRecipe(recipeKey);

  // Zahlen-Herkunfts-Quellen (D114): NUR eigene Wahrheit — Produkt-Fakten,
  // eigenes Listing-IST, Zusatz-Infos, Keywords, bereits freigegebene eigene
  // Sektionen. Reviews bewusst NICHT (können von fremden Produkten stammen).
  const zahlenQuellen = [
    inputs.brand,
    inputs.productName,
    JSON.stringify(inputs.facts),
    inputs.listingIst?.title ?? "",
    ...(inputs.listingIst?.bullets ?? []),
    inputs.bildBelege ?? "", // D230: Zahlen/Aussagen aus den eigenen Bildern/A+/Produktinfo gelten als belegt
    inputs.zusatzKontext ?? "",
    ...Object.values(inputs.keywords).flat(),
    ...Object.values(inputs.approved ?? {}).flatMap((v) => (Array.isArray(v) ? v : [v ?? ""])),
  ].join("\n");

  const ctx = {
    facts: inputs.facts,
    primaryKeywords: inputs.keywords.primary,
    // ALLE Keywords für den Keyword-Echo-Check (D181)
    alleKeywords: Object.values(inputs.keywords).flat(),
    // Freigegebener Titel für den Titel-Dopplungs-Check der Highlights (D197)
    freigegebenerTitel: typeof inputs.approved?.title === "string" ? inputs.approved.title : undefined,
    // Erkannte Fremdmarken (Relevanz-Filter) — das Gate flaggt jedes Vorkommen (D97)
    competitorBrands: inputs.competitorBrands ?? [],
    zahlenQuellen,
    // Haupt-Nutzen-Check für Bullet 1 (D285): der stärkste Kern-Kaufgrund.
    kernKaufgrund: inputs.conversionDriver?.length
      ? { resultat: inputs.conversionDriver[0].resultat, nutzen: inputs.conversionDriver[0].nutzen }
      : null,
  };

  // QM-Schleife (D182): generieren → Kontrakt (D183) → Fixer + Gate → LLM-Prüfer
  // → bei Error-Findings Korrektur-Versuch mit konkreter Fehlerliste. Der Mock
  // ist deterministisch — Wiederholen änderte nichts, daher genau 1 Versuch.
  const maxVersuche = provider.name === "mock" ? 1 : MAX_VERSUCHE;
  let findings: ValidationIssue[] = [];
  let letzterEntwurf: string | null = null;
  /** Regelkonforme Bullets aus dem Vorversuch — der Code erzwingt ihre wörtliche Übernahme (D184/D194). */
  let gesperrteBullets: Map<number, string> | null = null;
  /** Bester Versuch (wenigste Error-Findings) für die markierte Anzeige bei Block (D202). */
  let bestesErgebnis: SectionResult | null = null;
  let besteFehlerzahl = Infinity;

  for (let versuch = 1; versuch <= maxVersuche; versuch++) {
    let parsed: Record<string, unknown>;
    let raw = "";
    if (provider.name === "mock") {
      parsed = templateDraft(section, inputs);
      raw = JSON.stringify(parsed);
    } else {
      const res = await generateForRecipe(recipeKey, {
        system: SYSTEM,
        messages: [{ role: "user", content: sectionPrompt(section, inputs, findings, letzterEntwurf, { versuch, maxVersuche }) }],
        // 16000 statt 3000 (D106): Sonnet-5 denkt automatisch (adaptive thinking)
        // und max_tokens deckelt Denken + Antwort GEMEINSAM. Mit 3000 fraß die
        // Denkphase bei komplexen Prompts (Bullets seit D98) das ganze Budget —
        // Antwort leer → „KI-Antwort enthielt kein JSON" (Nutzer-Screenshot).
        maxTokens: 16000,
        temperature: 0.4,
      });
      raw = res.text;
      try {
        parsed = parseJson(raw);
      } catch (e) {
        findings = [{ rule: `${section}.kontrakt`, severity: "error", message: e instanceof Error ? e.message : String(e), evidence: "deterministic" }];
        continue;
      }
    }

    // Gesperrte Bullets erzwingen (D184/D194): Was den Vorversuch bestanden
    // hat, wird wörtlich übernommen — egal, was das Modell zurückliefert.
    // Kein Neuwürfeln regelkonformer Bullets.
    if (section === "bullets" && gesperrteBullets && Array.isArray(parsed.bullets)) {
      const items = (parsed.bullets as unknown[]).map(String);
      for (const [i, text] of gesperrteBullets) if (i < items.length) items[i] = text;
      parsed = { ...parsed, bullets: items };
    }

    // Kontrakt-Grenze (D183): Schema-Verstoß wird abgewiesen, nie weitergereicht.
    // Copy-Phase (D200): rationale ist hier NICHT Pflicht — sie kommt aus der
    // zweiten Phase; der finale Datensatz trägt sie dann wieder.
    const kontrakt = pruefeKontrakt(section, parsed, { rationaleOptional: true });
    if (kontrakt.length > 0) {
      findings = kontrakt.map((v) => ({
        rule: `${section}.kontrakt`,
        severity: "error" as const,
        message: `Feld „${v.feld}": ${v.problem}`,
        evidence: "deterministic" as const,
      }));
      continue;
    }

    const result = baueErgebnis(section, parsed, inputs, ctx, raw, provider.name, model);
    let issues = result.issues;

    // Immer-LLM-Prüfer (D182): Kein Ergebnis wird ohne bestandene LLM-Prüfung
    // sichtbar. Bei deterministischen Errors wird ohne Prüfer-Call regeneriert
    // (das Ergebnis wird ohnehin verworfen) — das FINALE Ergebnis hat die
    // Prüfung immer durchlaufen. Im Mock-Modus ehrlich ungeprüft (pruefer.ts).
    if (nurErrors(issues).length === 0) {
      issues = [...issues, ...(await pruefeMitLlm(section, textFuerPruefer(result), prueferKontext(inputs)))];
    }

    if (nurErrors(issues).length === 0) return await ergaenzeRationale({ ...result, issues }, inputs);
    findings = nurErrors(issues);
    // Besten Entwurf merken (D202): der Versuch mit den wenigsten Error-Findings
    // wird bei einem Block als markierter Entwurf angezeigt, statt nichts zu zeigen.
    if (findings.length < besteFehlerzahl) {
      besteFehlerzahl = findings.length;
      bestesErgebnis = { ...result, issues };
    }
    letzterEntwurf = textFuerPruefer(result);

    // Bullet-weise Korrektur (D194): regelkonforme Bullets sperren, im
    // Korrektur-Auftrag markieren — nur die betroffenen werden neu geschrieben.
    if (section === "bullets" && result.payload.items?.length) {
      const items = result.payload.items;
      const betroffen = betroffeneBullets(findings, items.length);
      gesperrteBullets = new Map(items.map((t, i) => [i, t] as const).filter(([i]) => !betroffen.has(i)));
      if (gesperrteBullets.size === 0) gesperrteBullets = null;
      letzterEntwurf = items
        .map((b, i) => `Bullet ${i + 1} (${betroffen.has(i) ? "NEU SCHREIBEN — siehe Verstöße" : "FREIGEGEBEN — wörtlich unverändert übernehmen"}): ${b}`)
        .join("\n");
    }
  }

  // QM-Urteil „nicht bestanden" (D182): Log = Bau-Auftrag (welcher Check/Fixer/
  // Input fehlt?). Der beste Entwurf wird mitgegeben — die App zeigt ihn markiert
  // an, statt nichts zu zeigen (D202), oder blockt hart, wenn kein Entwurf entstand.
  console.error(`[QM-BLOCK] listing.${section}`, JSON.stringify({ versuche: maxVersuche, findings }));
  throw new QmBlockFehler(section, findings, maxVersuche, bestesErgebnis);
}
