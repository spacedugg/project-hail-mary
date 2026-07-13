import { generateForRecipe, resolveRecipe } from "@/lib/llm/registry";
import { trimToBytesByWord, trimToBytesBySentence } from "@/lib/text/bytes";
import { RULES } from "@/lib/validation/rules";
import {
  validateTitle,
  validateBullets,
  validateDescription,
  validateBackendKeywords,
} from "@/lib/validation/gate";
import type { ProductFacts, ReviewInsightsPayload, ValidationIssue } from "@/db/schema";

/**
 * Listing-Text-Recipes (Nachfolger von temoa-os buildPrompt, merge-kompatibel D39):
 * sektionsweise Generierung Titel → Bullets → Backend → Beschreibung,
 * freigegebene Sektionen fließen als Kontext in die nächste.
 * Regeln kommen aus knowledge/content/*.md via RULES — Generierung und
 * Validierung teilen sich dieselbe Quelle ("LLM generiert, Code erzwingt").
 */

export type ListingSection = "title" | "bullets" | "backend" | "description";
export const SECTION_ORDER: ListingSection[] = ["title", "bullets", "backend", "description"];

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
};

export type TitleRationale = Array<{ part: string; source: string; verified: boolean }>;

export type SectionResult = {
  section: ListingSection;
  payload: { text?: string; items?: string[]; rationale?: TitleRationale };
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
REGELN (knowledge/content/bullets.md):
- Jeder Bullet: HEADLINE IN VERSALIEN (3–5 Wörter) + Doppelpunkt + max. 2 Sätze. Ziel ${RULES.bullets.targetMinBytes}–${RULES.bullets.targetMaxBytes} Bytes.
- Slot-Logik: 1 HOOK (stärkster USP) · 2 PROBLEM→BENEFIT (häufigster Pain Point!) · 3 TRUST (Material/Norm mit Beleg) · 4 USAGE · 5 CLOSE (Lieferumfang/Erwartungsmanagement). Häufigster Pain Point darf nach vorn rücken.
- Benefit vor Feature. Jede USP aus dem USP-SET genau EINMAL über alle Bullets. Keine Emojis.
- SECONDARY-Keywords natürlich verteilen: ${kw.secondary.join(", ")}
JSON: {"bullets": ["...", "...", "...", "...", "..."]}`;
    case "backend":
      return `${ctx}

AUFGABE: Backend-Suchbegriffe (generische Keywords).
REGELN (knowledge/content/backend-keywords.md):
- Einzelwörter, Leerzeichen-getrennt, KEINE Kommas. Max ${RULES.backendKeywords.maxBytes} Bytes UTF-8.
- KEIN Wort, das schon in Titel/Bullets sichtbar ist. Keine Markennamen. Singular ODER Plural, nie beides.
- Priorität: (1) Invisible-Keywords, (2) Rest-Long-Tails, (3) echte Kundensprache/Synonyme/Regionalbegriffe.
- POOL: ${kw.backendPool.join(", ")}
JSON: {"backend": "wort1 wort2 wort3 ..."}`;
    case "description":
      return `${ctx}

AUFGABE: Produktbeschreibung.
REGELN (knowledge/content/description.md):
- Max ${RULES.description.maxBytes} Bytes. Struktur: Positionierung → Nutzenargumente mit Belegen → Einwandbehandlung → weicher CTA.
- AEO-tauglich: typische Kundenfragen explizit beantworten (vollständige Sätze).
- Bullets NICHT wörtlich wiederholen. TERTIARY-Keywords organisch: ${kw.tertiary.join(", ")}
JSON: {"description": "..."}`;
  }
}

// ── Parsing & deterministische Nachbearbeitung ───────────────────────────────

function parseJson(raw: string): Record<string, unknown> {
  const cleaned = raw.trim().replace(/^```(?:json)?/m, "").replace(/```\s*$/m, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Keine JSON-Antwort erkennbar.");
  return JSON.parse(cleaned.slice(start, end + 1));
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
      };
    }
    case "backend":
      return { backend: trimToBytesByWord(kw.backendPool.join(" "), RULES.backendKeywords.maxBytes) };
    case "description":
      return {
        description: `${inputs.brand} ${inputs.productName}: entwickelt für ${f.targetAudience ?? "anspruchsvolle Nutzer"}. ${(f.usps ?? []).join(". ")}. Wie wird es angewendet? Einfach und ohne Vorkenntnisse. ${kw.tertiary.slice(0, 5).join(", ")} — alle Details oben im Überblick.`,
      };
  }
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
      maxTokens: 1200,
      temperature: 0.4,
    });
    raw = res.text;
    parsed = parseJson(raw);
  }

  const ctx = {
    facts: inputs.facts,
    primaryKeywords: inputs.keywords.primary,
    competitorBrands: [],
  };

  switch (section) {
    case "title": {
      const text = String(parsed.title ?? "").trim();
      // Begründung: LLM-Behauptungen deterministisch verifizieren (steht der Teil wirklich im Titel?)
      const rawRationale = Array.isArray(parsed.rationale) ? (parsed.rationale as Array<{ part?: unknown; source?: unknown }>) : [];
      const rationale: TitleRationale = rawRationale
        .map((r) => ({ part: String(r.part ?? ""), source: String(r.source ?? "") }))
        .filter((r) => r.part)
        .map((r) => ({ ...r, verified: text.toLowerCase().includes(r.part.toLowerCase()) }));
      return { section, payload: { text, rationale }, issues: validateTitle(text, ctx), raw, provider: provider.name, model };
    }
    case "bullets": {
      const items = Array.isArray(parsed.bullets) ? parsed.bullets.map(String) : [];
      return { section, payload: { items }, issues: validateBullets(items, ctx), raw, provider: provider.name, model };
    }
    case "backend": {
      // Deterministische Byte-Durchsetzung NACH dem LLM (temoa-os-Muster)
      const text = trimToBytesByWord(String(parsed.backend ?? "").replace(/,/g, " ").replace(/\s+/g, " ").trim(), RULES.backendKeywords.maxBytes);
      const visible = [
        typeof inputs.approved?.title === "string" ? inputs.approved.title : "",
        ...(Array.isArray(inputs.approved?.bullets) ? inputs.approved.bullets : []),
      ].join(" ");
      return { section, payload: { text }, issues: validateBackendKeywords(text, visible, ctx), raw, provider: provider.name, model };
    }
    case "description": {
      const text = trimToBytesBySentence(String(parsed.description ?? "").trim(), RULES.description.maxBytes);
      const bullets = Array.isArray(inputs.approved?.bullets) ? (inputs.approved.bullets as string[]) : [];
      return { section, payload: { text }, issues: validateDescription(text, bullets, ctx), raw, provider: provider.name, model };
    }
  }
}
