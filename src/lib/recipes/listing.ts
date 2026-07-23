import { generateForRecipe, resolveRecipe } from "@/lib/llm/registry";
import { parseLlmJson } from "@/lib/llm/json";
import { trimToBytesByWord, trimToBytesBySentence } from "@/lib/text/bytes";
import { fixeWhitespace, fixeWhitespaceListe } from "@/lib/text/fixers";
import { pruefeKontrakt } from "@/lib/llm/contracts";
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
export const SECTION_ORDER: ListingSection[] = ["title", "bullets", "highlights", "backend", "description", "qa"];

export type RecipeInputs = {
  brand: string;
  /**
   * Erstes Wort des Original-Listing-Titels (D149) — auf Amazon fast immer
   * die Produktmarke. Wird bei leerem `brand` (Werkbank-Auftrag) als
   * belegter Marken-Kandidat in den Prompt gegeben, statt dass das Modell
   * eine Marke erfindet oder einen Werkzeug-Namen verwendet.
   */
  eigenmarkeAusListing?: string;
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
  /** Zusätzliche Produkt-Infos vom Team (D108) — z. B. fremde Bullets/Titel als Vorbild. */
  zusatzKontext?: string | null;
  /** Content-Sprache (D128) — unabhängig vom Marktplatz; Default Deutsch. */
  sprache?: ContentSprache | null;
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

function contextBlock(inputs: RecipeInputs): string {
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
    const pp = ri.painPoints.slice(0, 5).map((p) => `${p.label}${p.frequencyPct ? ` (${p.frequencyPct}%)` : ""}`);
    const bt = ri.buyingTriggers.slice(0, 5).map((t) => t.label);
    if (pp.length) lines.push(`PAIN POINTS AUS ECHTEN REVIEWS (häufigster zuerst — adressiere ihn prominent): ${pp.join(" | ")}`);
    if (bt.length) lines.push(`KAUFAUSLÖSER: ${bt.join(" | ")}`);
    if (ri.languageToBorrow.length) lines.push(`KUNDENSPRACHE (nah dran formulieren): ${ri.languageToBorrow.slice(0, 6).join(" | ")}`);
    if (ri.languageToAvoid.length) lines.push(`SPRACHE VERMEIDEN: ${ri.languageToAvoid.slice(0, 6).join(" | ")}`);
  }
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
export function sectionPrompt(section: ListingSection, inputs: RecipeInputs, korrektur: ValidationIssue[] = [], vorherigerEntwurf?: string | null): string {
  const parts = [basePrompt(section, inputs)];
  const gesetze = regelnAlsPromptBlock(section);
  if (gesetze)
    parts.push(`GESETZE (Regel-Register — werden maschinell geprüft, jeder Verstoß erzwingt Regenerierung):\n${gesetze}`);
  if (korrektur.length)
    // Korrektur statt Neuwurf (D190): Der vorherige Entwurf steht im Auftrag —
    // ein kompletter Neuwurf würfelt bei jedem Versuch NEUE Verstöße, gezielte
    // Korrektur konvergiert.
    parts.push(
      `KORREKTUR-AUFTRAG: Dein vorheriger Entwurf hat das Qualitäts-Gate NICHT bestanden.${
        vorherigerEntwurf ? `\nVORHERIGER ENTWURF:\n${vorherigerEntwurf}` : ""
      }\nVERLETZTE REGELN:\n${korrektur
        .map((i) => `- [${i.rule}] ${i.message}`)
        .join("\n")}\nKorrigiere MINIMAL-INVASIV: Behebe GENAU diese Verstöße und behalte alles Regelkonforme möglichst wörtlich bei.`,
    );
  return parts.join("\n\n");
}

function basePrompt(section: ListingSection, inputs: RecipeInputs): string {
  const ctx = contextBlock(inputs);
  const kw = inputs.keywords;
  switch (section) {
    case "title":
      return `${ctx}

AUFGABE: Schreibe den Amazon-Produkttitel.
REGELN (knowledge/content/title.md, Amazon-Neuerung 07/2026):
- HART: ${RULES.title.targetMinChars}–${RULES.title.maxChars} Zeichen — PFLICHTBAND, unter ${RULES.title.targetMinChars} ist verschenkter Platz und wird abgewiesen. Zähle sorgfältig.
- HAUPTKEYWORD „${kw.primary[0] ?? ""}" MUSS abgedeckt sein — WORTSTAMM-Abdeckung zählt: Flexion und Komposita sind erlaubt und erwünscht („Ulmenrinde-Drops für Hunde" deckt „ulmenrinde für hunde"). NIE eine Suchphrase wörtlich einkleben, wenn sie ungrammatisch ist — Amazon matcht Wortstämme, geklebte Phrasen bringen NULL Ranking-Vorteil.
- Weitere PRIMARY-Keywords (${kw.primary.slice(1).join(", ") || "keine"}): nur einbauen, was grammatisch natürlich passt — Vollständigkeit ist KEINE Pflicht, Lesbarkeit gewinnt immer. Kein Wortstamm mehrfach.
- Zahlen als Ziffern. Keine Werbephrasen, keine Emojis, keine Versalien-Wörter außer Marke/Norm.
- BEGRÜNDUNG: Erkläre jeden Titelbestandteil — woraus er sich ableitet (Keyword-Analyse, USP, Produkt-Wahrheit, Marke) und warum er das Budget verdient.
JSON: {"title": "...", "rationale": [{"part": "<Bestandteil>", "source": "<Herleitung, z. B. 'Hauptkeyword aus Keyword-Analyse' oder 'USP #1: hält 24 h kalt'>"}]}`;
    case "bullets":
      return `${ctx}

AUFGABE: Schreibe genau ${RULES.bullets.count} Bullet Points.
REGELN (knowledge/content/bullets.md + Blog 07/2026):
- Jeder Bullet: HEADLINE IN VERSALIEN (3–5 Wörter) + Doppelpunkt + max. 3 Sätze.
- DREI-POSITIONEN-ANATOMIE (Schaubild Blog 07/2026) — jeder Bullet in dieser Reihenfolge: POSITION 1 = Benefit zuerst (Headline + erste 5–8 Wörter). POSITION 2 = das Feature dahinter als Beleg, mit dem Secondary Keyword NATÜRLICH integriert. POSITION 3 = Use Case + konkrete Details: für wen/wann geeignet + Material, Maß, Prüfnorm oder Garantie. Beispiel: „Bleibt jahrelang scharf im täglichen Einsatz. Gehärteter Edelstahl mit dreifach geschliffener Klinge. Kein Nachschärfen nötig. 20 cm Klinge. 10 Jahre Garantie."
- DREI JOBS je Bullet: einen wahrscheinlichen Einwand entkräften + einen konkreten Use Case bestätigen + ein Secondary Keyword NATÜRLICH unterbringen. Keyword-Stapeln auf Kosten der Lesbarkeit verliert alle drei — Kunden scannen in 2 Sekunden.
- BUDGET AUSNUTZEN: Ziel ≥${RULES.bullets.utilizationMinBytes} Bytes pro Bullet, hartes Max ${RULES.bullets.hardMaxChars} Zeichen — so viel Substanz wie möglich, kein Füllwort-Padding.
- Slot-Logik: 1 HOOK (stärkster USP) · 2 PROBLEM→BENEFIT (häufigster Pain Point!) · 3 TRUST (Material/Norm mit Beleg) · 4 USAGE · 5 CLOSE (Lieferumfang/Erwartungsmanagement). Häufigster Pain Point darf nach vorn rücken.
- Jede USP aus dem USP-SET genau EINMAL über alle Bullets. Keine Emojis.
- SECONDARY-Keywords natürlich verteilen: ${kw.secondary.join(", ")}
- BEGRÜNDUNG: pro Bullet 1 Eintrag — welcher Slot, welcher Einwand/Use Case/Pain Point/USP/Keyword-Beleg dahintersteht.
JSON: {"bullets": ["...", "...", "...", "...", "..."], "rationale": [{"part": "<Headline>", "source": "<Slot + Herleitung>"}]}`;
    case "highlights":
      return `${ctx}

AUFGABE: Schreibe die Amazon "Item Highlights" (neue Sektion).
REGELN (Ausschöpfungs-Prinzip 07/2026):
- HART: max ${RULES.itemHighlights.maxChars} Zeichen GESAMT; Ziel ${RULES.itemHighlights.targetMinChars}–${RULES.itemHighlights.maxChars} — Budget ausnutzen, sorgfältig zählen.
- Die 2–3 kaufentscheidendsten Fakten, kompakt, konkret, keine Wiederholung des Titels.
- BEGRÜNDUNG: woraus sich jeder Fakt ableitet.
JSON: {"highlights": "...", "rationale": [{"part": "...", "source": "..."}]}`;
    case "backend":
      return `${ctx}

AUFGABE: Backend-Suchbegriffe (generische Keywords).
REGELN (knowledge/content/backend-keywords.md + Blog 07/2026):
- Einzelwörter, Leerzeichen-getrennt, KEINE Kommas, KEINE Satzzeichen (Amazon ignoriert sie — verschwendete Bytes). Max ${RULES.backendKeywords.maxBytes} Bytes UTF-8 — bei Überschreitung ignoriert Amazon das GESAMTE Feld.
- KEIN Wort, das schon in Titel/Bullets sichtbar ist (Main Keywords hier = verschwendeter Platz). Keine Markennamen (Policy + Account Health). Singular ODER Plural, nie beides.
- Priorität (Nutzer-Vorgabe 22.07.): (1) Synonyme/Abkürzungen/andere Formulierungen ZUERST (Titel „Edelstahl Rührschüssel" → Backend „salatschüssel backschüssel teigschüssel prep bowl"), (2) andere Schreibweisen inkl. gängiger Vertipper, (3) ENGLISCHE Suchbegriffe auf amazon.de („mixing bowl" statt „rührschüssel" — die fängt kaum jemand ab), (4) Rest-Long-Tails, (5) Kundensprache/Regionalbegriffe.
- BUDGET AUSNUTZEN: möglichst nah an ${RULES.backendKeywords.maxBytes} Bytes (nie darüber).
- POOL: ${kw.backendPool.join(", ")}
JSON: {"backend": "wort1 wort2 wort3 ...", "rationale": [{"part": "<Wortgruppe>", "source": "<Herleitung: invisible/Long-Tail/Kundensprache>"}]}`;
    case "description":
      return `${ctx}

AUFGABE: Produktbeschreibung.
REGELN (knowledge/content/description.md):
- Max ${RULES.description.maxBytes} Bytes. Struktur: Positionierung → Nutzenargumente mit Belegen → Einwandbehandlung → weicher CTA.
- AEO-tauglich: typische Kundenfragen explizit beantworten (vollständige Sätze).
- BUDGET AUSNUTZEN: möglichst nah an ${RULES.description.maxBytes} Bytes (nie darüber) — maximale Datengrundlage für den Algorithmus, ohne Füllphrasen.
- Bullets NICHT wörtlich wiederholen. TERTIARY-Keywords organisch: ${kw.tertiary.join(", ")}
JSON: {"description": "...", "rationale": [{"part": "<Abschnitt-Kurzname>", "source": "<Herleitung>"}]}`;
    case "qa":
      return `${ctx}

AUFGABE: Schreibe ${RULES.qa.pairs} Q&A-Paare (Kundenfragen + Antworten) — Datengrundlage für KI-Assistenten (Alexa for Shopping).
REGELN (Ausschöpfungs-Prinzip 07/2026):
- Genau ${RULES.qa.pairs} Paare. Frage max ${RULES.qa.questionMaxChars} Zeichen; Antwort max ${RULES.qa.answerMaxChars}, Ziel ≥${RULES.qa.answerUtilizationMinChars} — Budget ausnutzen.
- Echte Kaufhürden-Fragen (aus Pain Points/Reviews, wenn vorhanden), faktenbasierte Antworten aus der Produkt-Wahrheit.
- BEGRÜNDUNG: pro Frage, woraus sie sich ableitet (Pain Point, Review-Zitat, typische Kaufhürde).
JSON: {"pairs": [{"q": "...", "a": "..."}], "rationale": [{"part": "<Frage-Kurzform>", "source": "<Herleitung>"}]}`;
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
      // 70–75-Zeichen-Budget deterministisch füllen: Marke → Hauptkeyword → Attribute → USP-Kürzel
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
        description: `${inputs.brand} ${inputs.productName}: entwickelt für ${f.targetAudience ?? "anspruchsvolle Nutzer"}. ${(f.usps ?? []).join(". ")}. Wie wird es angewendet? Einfach und ohne Vorkenntnisse.${tertiaer.length ? ` Relevante Eigenschaften: ${tertiaer.join(", ")}.` : ""} Alle Details oben im Überblick.`,
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
 * Hart-Block (D182, Nutzer-Entscheid 23.07.): Bleiben nach allen Versuchen
 * Error-Findings, wird KEIN Entwurf sichtbar — dieser Fehler trägt den
 * vollständigen Prüfbericht. Jeder Block ist zugleich ein Bau-Auftrag
 * (neuer Fixer/Check/Input-Pflicht) und wird deshalb strukturiert geloggt.
 */
export class QmBlockFehler extends Error {
  constructor(
    public section: ListingSection,
    public issues: ValidationIssue[],
    public versuche: number,
  ) {
    super(
      `QM-Gate: ${issues.length} Regelverstoß/-verstöße nach ${versuche} Versuch(en) nicht behebbar — Ergebnis wird nicht angezeigt. ` +
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
      const text = fixeWhitespace(String(parsed.title ?? ""));
      return { section, payload: { text, rationale: extractRationale(parsed, text) }, issues: validateTitle(text, ctx), raw, provider: providerName, model };
    }
    case "highlights": {
      const text = fixeWhitespace(String(parsed.highlights ?? ""));
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
      const items = Array.isArray(parsed.bullets) ? fixeWhitespaceListe(parsed.bullets.map(String)) : [];
      return { section, payload: { items, rationale: extractRationale(parsed, items.join(" ")) }, issues: validateBullets(items, ctx), raw, provider: providerName, model };
    }
    case "backend": {
      // Deterministische Byte-Durchsetzung NACH dem LLM (temoa-os-Muster);
      // Satzzeichen raus (Amazon ignoriert sie — verschwendete Bytes, Blog 07/2026)
      const text = trimToBytesByWord(String(parsed.backend ?? "").replace(/[,;.!?:„“‚’"']/g, " ").replace(/\s+/g, " ").trim(), RULES.backendKeywords.maxBytes);
      const visible = [
        typeof inputs.approved?.title === "string" ? inputs.approved.title : "",
        ...(Array.isArray(inputs.approved?.bullets) ? inputs.approved.bullets : []),
      ].join(" ");
      return { section, payload: { text, rationale: extractRationale(parsed, text) }, issues: validateBackendKeywords(text, visible, ctx), raw, provider: providerName, model };
    }
    case "description": {
      const text = trimToBytesBySentence(fixeWhitespace(String(parsed.description ?? "")), RULES.description.maxBytes);
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

/** Datengrundlage für den Prüfer: Fakten + Keywords (für Keyword-/Synonym-/Fakten-Urteile). */
function prueferKontext(inputs: RecipeInputs): string {
  return [
    `MARKE: ${inputs.brand || inputs.eigenmarkeAusListing || "unbekannt"}`,
    `PRODUKT: ${inputs.productName}`,
    `PRODUKT-FAKTEN: ${JSON.stringify(inputs.facts)}`,
    `KEYWORDS (dürfen ausschließlich grammatisch integriert vorkommen): ${Object.values(inputs.keywords).flat().join(", ")}`,
  ].join("\n");
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
    inputs.zusatzKontext ?? "",
    ...Object.values(inputs.keywords).flat(),
    ...Object.values(inputs.approved ?? {}).flatMap((v) => (Array.isArray(v) ? v : [v ?? ""])),
  ].join("\n");

  const ctx = {
    facts: inputs.facts,
    primaryKeywords: inputs.keywords.primary,
    // ALLE Keywords für den Keyword-Echo-Check (D181)
    alleKeywords: Object.values(inputs.keywords).flat(),
    // Erkannte Fremdmarken (Relevanz-Filter) — das Gate flaggt jedes Vorkommen (D97)
    competitorBrands: inputs.competitorBrands ?? [],
    zahlenQuellen,
  };

  // QM-Schleife (D182): generieren → Kontrakt (D183) → Fixer + Gate → LLM-Prüfer
  // → bei Error-Findings Korrektur-Versuch mit konkreter Fehlerliste. Der Mock
  // ist deterministisch — Wiederholen änderte nichts, daher genau 1 Versuch.
  const maxVersuche = provider.name === "mock" ? 1 : MAX_VERSUCHE;
  let findings: ValidationIssue[] = [];
  let letzterEntwurf: string | null = null;

  for (let versuch = 1; versuch <= maxVersuche; versuch++) {
    let parsed: Record<string, unknown>;
    let raw = "";
    if (provider.name === "mock") {
      parsed = templateDraft(section, inputs);
      raw = JSON.stringify(parsed);
    } else {
      const res = await generateForRecipe(recipeKey, {
        system: SYSTEM,
        messages: [{ role: "user", content: sectionPrompt(section, inputs, findings, letzterEntwurf) }],
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

    // Kontrakt-Grenze (D183): Schema-Verstoß wird abgewiesen, nie weitergereicht.
    const kontrakt = pruefeKontrakt(section, parsed);
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

    if (nurErrors(issues).length === 0) return { ...result, issues };
    findings = nurErrors(issues);
    letzterEntwurf = textFuerPruefer(result);
  }

  // Hart blockieren (D182): kein Entwurf mit Regelverstößen wird sichtbar.
  // Log = Bau-Auftrag: welcher Check/Fixer/Input fehlt, damit das nie mehr blockt?
  console.error(`[QM-BLOCK] listing.${section}`, JSON.stringify({ versuche: maxVersuche, findings }));
  throw new QmBlockFehler(section, findings, maxVersuche);
}
