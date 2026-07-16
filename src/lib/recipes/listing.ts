import { generateForRecipe, resolveRecipe } from "@/lib/llm/registry";
import { parseLlmJson } from "@/lib/llm/json";
import { trimToBytesByWord, trimToBytesBySentence } from "@/lib/text/bytes";
import { RULES } from "@/lib/validation/rules";
import {
  validateTitle,
  validateBullets,
  validateDescription,
  validateBackendKeywords,
  validateItemHighlights,
  validateQa,
} from "@/lib/validation/gate";
import type { ProductFacts, ReviewInsightsPayload, ValidationIssue } from "@/db/schema";

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
  const lines: string[] = [
    `MARKE: ${inputs.brand}`,
    `PRODUKT: ${inputs.productName}`,
    `MARKTPLATZ: amazon.${inputs.marketplace}`,
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
  ];
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

function sectionPrompt(section: ListingSection, inputs: RecipeInputs): string {
  const ctx = contextBlock(inputs);
  const kw = inputs.keywords;
  switch (section) {
    case "title":
      return `${ctx}

AUFGABE: Schreibe den Amazon-Produkttitel.
REGELN (knowledge/content/title.md, Amazon-Neuerung 07/2026):
- HART: ${RULES.title.targetMinChars}–${RULES.title.maxChars} Zeichen — das 75er-Budget bestmöglich ausnutzen, NIE überschreiten. Zähle sorgfältig.
- Struktur (gekürzt fürs Budget): Marke → Produkttyp (=Hauptkeyword) → 1–2 stärkste kaufentscheidende Attribute (Maß/Menge/Material) → ggf. Kernnutzen-Kürzel.
- Hauptkeyword „${kw.primary[0] ?? ""}" MUSS vorkommen. PRIMARY-Keywords (je max. 1×): ${kw.primary.join(", ")}
- Zahlen als Ziffern. Keine Werbephrasen, keine Emojis, keine Versalien-Wörter außer Marke/Norm.
- BEGRÜNDUNG: Erkläre jeden Titelbestandteil — woraus er sich ableitet (Keyword-Analyse, USP, Produkt-Wahrheit, Marke) und warum er das Budget verdient.
JSON: {"title": "...", "rationale": [{"part": "<Bestandteil>", "source": "<Herleitung, z. B. 'Hauptkeyword aus Keyword-Analyse' oder 'USP #1: hält 24 h kalt'>"}]}`;
    case "bullets":
      return `${ctx}

AUFGABE: Schreibe genau ${RULES.bullets.count} Bullet Points.
REGELN (knowledge/content/bullets.md, Ausschöpfungs-Prinzip 07/2026):
- Jeder Bullet: HEADLINE IN VERSALIEN (3–5 Wörter) + Doppelpunkt + max. 3 Sätze.
- BUDGET AUSNUTZEN: Ziel ≥${RULES.bullets.utilizationMinBytes} Bytes pro Bullet, hartes Max ${RULES.bullets.hardMaxChars} Zeichen — so viel Substanz wie möglich, kein Füllwort-Padding.
- Slot-Logik: 1 HOOK (stärkster USP) · 2 PROBLEM→BENEFIT (häufigster Pain Point!) · 3 TRUST (Material/Norm mit Beleg) · 4 USAGE · 5 CLOSE (Lieferumfang/Erwartungsmanagement). Häufigster Pain Point darf nach vorn rücken.
- Benefit vor Feature. Jede USP aus dem USP-SET genau EINMAL über alle Bullets. Keine Emojis.
- SECONDARY-Keywords natürlich verteilen: ${kw.secondary.join(", ")}
- BEGRÜNDUNG: pro Bullet 1 Eintrag — welcher Slot, welcher Pain Point/USP/Keyword-Beleg dahintersteht.
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
REGELN (knowledge/content/backend-keywords.md):
- Einzelwörter, Leerzeichen-getrennt, KEINE Kommas. Max ${RULES.backendKeywords.maxBytes} Bytes UTF-8.
- KEIN Wort, das schon in Titel/Bullets sichtbar ist. Keine Markennamen. Singular ODER Plural, nie beides.
- Priorität: (1) Invisible-Keywords, (2) Rest-Long-Tails, (3) echte Kundensprache/Synonyme/Regionalbegriffe.
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
      return {
        bullets: heads.map((h, i) => {
          const usp = usps[i] ? `${usps[i]}. ` : "";
          const kwHint = kw.secondary[i] ? ` Ideal als ${kw.secondary[i]}.` : "";
          return `${h}: ${usp}Konkreter Nutzen für ${f.targetAudience ?? "den Alltag"} — ohne leere Versprechen, mit klaren Fakten beschrieben.${kwHint}`;
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
    case "description":
      return {
        description: `${inputs.brand} ${inputs.productName}: entwickelt für ${f.targetAudience ?? "anspruchsvolle Nutzer"}. ${(f.usps ?? []).join(". ")}. Wie wird es angewendet? Einfach und ohne Vorkenntnisse. ${kw.tertiary.slice(0, 5).join(", ")} — alle Details oben im Überblick.`,
        rationale: [{ part: "Aufbau", source: "Positionierung → Nutzen → Q&A-Denke (Template)" }],
      };
    case "qa": {
      const pains = inputs.reviewInsights?.painPoints?.slice(0, 5) ?? [];
      const pairs = Array.from({ length: RULES.qa.pairs }, (_, i) => ({
        q: pains[i] ? `Ist das Problem "${pains[i].label}" gelöst?` : `Typische Frage ${i + 1} zu ${f.productType ?? inputs.productName}?`,
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

// ── Öffentliche API ──────────────────────────────────────────────────────────

export async function generateSection(
  section: ListingSection,
  inputs: RecipeInputs,
): Promise<SectionResult> {
  const recipeKey = `listing.${section === "backend" ? "backend" : section}`;
  const { provider, model } = resolveRecipe(recipeKey);

  let parsed: Record<string, unknown>;
  let raw = "";
  if (provider.name === "mock") {
    parsed = templateDraft(section, inputs);
    raw = JSON.stringify(parsed);
  } else {
    const res = await generateForRecipe(recipeKey, {
      system: SYSTEM,
      messages: [{ role: "user", content: sectionPrompt(section, inputs) }],
      maxTokens: 3000, // Q&A/Beschreibung + Begründung sprengten 1200 → abgeschnittenes JSON (D81)
      temperature: 0.4,
    });
    raw = res.text;
    parsed = parseJson(raw);
  }

  const ctx = {
    facts: inputs.facts,
    primaryKeywords: inputs.keywords.primary,
    // Erkannte Fremdmarken (Relevanz-Filter) — das Gate flaggt jedes Vorkommen (D97)
    competitorBrands: inputs.competitorBrands ?? [],
  };

  switch (section) {
    case "title": {
      const text = String(parsed.title ?? "").trim();
      return { section, payload: { text, rationale: extractRationale(parsed, text) }, issues: validateTitle(text, ctx), raw, provider: provider.name, model };
    }
    case "highlights": {
      const text = String(parsed.highlights ?? "").trim();
      return { section, payload: { text, rationale: extractRationale(parsed, text) }, issues: validateItemHighlights(text, ctx), raw, provider: provider.name, model };
    }
    case "qa": {
      const pairs = Array.isArray(parsed.pairs)
        ? (parsed.pairs as Array<{ q?: unknown; a?: unknown }>).map((p) => ({ q: String(p.q ?? "").trim(), a: String(p.a ?? "").trim() }))
        : [];
      const joined = pairs.map((p) => `${p.q} ${p.a}`).join(" ");
      return { section, payload: { pairs, rationale: extractRationale(parsed, joined) }, issues: validateQa(pairs, ctx), raw, provider: provider.name, model };
    }
    case "bullets": {
      const items = Array.isArray(parsed.bullets) ? parsed.bullets.map(String) : [];
      return { section, payload: { items, rationale: extractRationale(parsed, items.join(" ")) }, issues: validateBullets(items, ctx), raw, provider: provider.name, model };
    }
    case "backend": {
      // Deterministische Byte-Durchsetzung NACH dem LLM (temoa-os-Muster)
      const text = trimToBytesByWord(String(parsed.backend ?? "").replace(/,/g, " ").replace(/\s+/g, " ").trim(), RULES.backendKeywords.maxBytes);
      const visible = [
        typeof inputs.approved?.title === "string" ? inputs.approved.title : "",
        ...(Array.isArray(inputs.approved?.bullets) ? inputs.approved.bullets : []),
      ].join(" ");
      return { section, payload: { text, rationale: extractRationale(parsed, text) }, issues: validateBackendKeywords(text, visible, ctx), raw, provider: provider.name, model };
    }
    case "description": {
      const text = trimToBytesBySentence(String(parsed.description ?? "").trim(), RULES.description.maxBytes);
      const bullets = Array.isArray(inputs.approved?.bullets) ? (inputs.approved.bullets as string[]) : [];
      return { section, payload: { text, rationale: extractRationale(parsed, text) }, issues: validateDescription(text, bullets, ctx), raw, provider: provider.name, model };
    }
  }
}
