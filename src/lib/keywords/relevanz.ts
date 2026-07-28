import { resolveRecipe } from "@/lib/llm/registry";
import { llmJsonLauf } from "@/lib/llm/qmLauf";

/**
 * Keyword-Relevanz-Filter (D87): irrelevante Keywords fliegen beim Import
 * raus — GEKENNZEICHNET statt gelöscht, damit man prüfen und wieder aufnehmen
 * kann. Drei Regel-Klassen:
 *
 * 1. MASSE (deterministisch): enthält ein Keyword ein Maß (200x150, 750 ml,
 *    1 l, 80 cm …), das von KEINEM bekannten Produkt-Maß gedeckt ist, fliegt
 *    es raus. Bekannte Maße kommen aus Produkt-Fakten (dimensions) + Titel.
 *    Kennt das Tool KEINE Produkt-Maße, filtert diese Regel NICHT (ehrlich
 *    passiv statt raten).
 * 2. ANZAHL (deterministisch): analog für Stückzahlen (10 stück, 20er pack,
 *    3er set …) gegen die bekannte Produkt-Anzahl.
 * 3. MARKEN (LLM + Code erzwingt): Marken-Suchbegriffe (fremde UND eigene
 *    Marke) verzerren die Optimierung — Haiku markiert Kandidaten, der Code
 *    übernimmt nur Keywords, die wirklich in der Liste stehen. Ohne API-Key
 *    wird diese Regel übersprungen (kein Mock-Raten bei Ausschlüssen).
 *
 * Manuelle Entscheidungen (Grund-Präfix „manuell") überschreibt kein Auto-Lauf.
 */

export type RelevanzUrteil = { keyword: string; grund: string | null };

// ── Maße ─────────────────────────────────────────────────────────────────────

type Mass = { a: number; b?: number; einheit: string };

const EINHEIT_NORM: Record<string, { faktor: number; basis: string }> = {
  mm: { faktor: 0.1, basis: "cm" },
  cm: { faktor: 1, basis: "cm" },
  m: { faktor: 100, basis: "cm" },
  ml: { faktor: 1, basis: "ml" },
  l: { faktor: 1000, basis: "ml" },
  liter: { faktor: 1000, basis: "ml" },
  g: { faktor: 1, basis: "g" },
  kg: { faktor: 1000, basis: "g" },
  zoll: { faktor: 2.54, basis: "cm" },
  "\"": { faktor: 2.54, basis: "cm" },
};

const num = (s: string) => parseFloat(s.replace(",", "."));

/** Alle Maße aus einem Text ziehen: Paare (200x150cm) und Einzelwerte (750 ml). */
export function extractMasse(text: string): Mass[] {
  const out: Mass[] = [];
  const t = ` ${text.toLowerCase()} `;

  // Paare: 200x150 cm, 200 × 150, 200*150
  const pair = /(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m|zoll)?\b/g;
  for (const m of t.matchAll(pair)) {
    const einheit = m[3] ?? "cm"; // Amazon-Konvention: Maßpaare ohne Einheit sind cm
    const norm = EINHEIT_NORM[einheit];
    if (!norm || norm.basis !== "cm") continue;
    const [a, b] = [num(m[1]) * norm.faktor, num(m[2]) * norm.faktor].sort((x, y) => y - x);
    out.push({ a, b, einheit: "cm" });
  }

  // Einzelwerte mit Einheit: 750 ml, 1 l, 500g, 80 cm — NICHT Teil eines Paares
  const single = /(?<![x×*]\s*)(?<![\d.,])(\d+(?:[.,]\d+)?)\s*(mm|cm|m|ml|l|liter|g|kg|zoll)\b(?!\s*[x×*])/g;
  for (const m of t.matchAll(single)) {
    const norm = EINHEIT_NORM[m[2]];
    if (!norm) continue;
    out.push({ a: num(m[1]) * norm.faktor, einheit: norm.basis });
  }
  return out;
}

const gleich = (x: number, y: number) => Math.abs(x - y) / Math.max(x, y, 1) <= 0.05; // 5 % Toleranz (Rundungen)

/**
 * Häufigstes Produkt-Maß gewinnt (D241, Nutzer-Idee 28.07.).
 *
 * Bei Familien-Größentabellen (Variationen) stehen mehrere Maße im Text. Die
 * EIGENE Größe der Variante wiederholt sich über Felder (Titel + Bullets +
 * Attribut-Tabelle + Fakten), fremde Familiengrößen tauchen nur einmal auf.
 * Wir nehmen darum nur das/die häufigste(n) Maß(e) als „Produktgröße" — so
 * lassen sich Bilder/Beschreibung mit Familientabellen gefahrlos mitlesen.
 *
 * Kein klarer Sieger (alles gleich häufig, z. B. genau eine Größe ODER eine
 * reine Tabelle ohne Wiederholung): alle zählen — ehrlich passiv, wir raten
 * nicht, welche EINE Größe gemeint ist.
 */
export function dominanteMasse(alle: Mass[]): Mass[] {
  if (alle.length <= 1) return alle;
  const key = (m: Mass) => `${m.einheit}|${m.a}|${m.b ?? ""}`;
  const gruppen = new Map<string, { m: Mass; n: number }>();
  for (const m of alle) {
    const g = gruppen.get(key(m));
    if (g) g.n += 1;
    else gruppen.set(key(m), { m, n: 1 });
  }
  const max = Math.max(...[...gruppen.values()].map((g) => g.n));
  if (max <= 1) return alle; // keine Wiederholung → nicht raten
  return [...gruppen.values()].filter((g) => g.n === max).map((g) => g.m);
}

function massGedeckt(kw: Mass, produkt: Mass[]): boolean {
  return produkt.some((p) => {
    if (p.einheit !== kw.einheit) return false;
    if (kw.b !== undefined) return p.b !== undefined && gleich(p.a, kw.a) && gleich(p.b, kw.b);
    // Einzelwert im Keyword: gedeckt, wenn er einer Produkt-Seite/-Größe entspricht
    return gleich(p.a, kw.a) || (p.b !== undefined && gleich(p.b, kw.a));
  });
}

// ── Anzahl ───────────────────────────────────────────────────────────────────

/** "20 stück", "10er pack", "3er set", "2x", "4 teilig" → Zahl. */
export function extractAnzahlen(text: string): number[] {
  const out: number[] = [];
  const t = ` ${text.toLowerCase()} `;
  for (const m of t.matchAll(/(\d+)\s*(?:er[\s-]?)?(?:stück|stk|pack|set|teilig|paar|rollen?|beutel)\b/g)) out.push(parseInt(m[1], 10));
  for (const m of t.matchAll(/(\d+)\s*x\s(?![\d])/g)) out.push(parseInt(m[1], 10)); // "2x kabelbinder", nicht "200x150"
  return out.filter((n) => n > 0 && n < 100000);
}

// ── Farben & Formen (D91) ────────────────────────────────────────────────────

/**
 * Farbwort → Farbfamilie. Ton-Varianten (hellgrau/dunkelgrau) zählen zur
 * selben Familie wie die Grundfarbe — konservativ, damit nichts fälschlich
 * fliegt. Wort-Grenzen verhindern Treffer IN Wörtern.
 */
const FARB_FAMILIE: Record<string, string> = {
  weiß: "weiß", weiss: "weiß", schwarz: "schwarz",
  grau: "grau", hellgrau: "grau", dunkelgrau: "grau", anthrazit: "grau",
  beige: "beige", creme: "beige", sand: "beige", natur: "natur",
  braun: "braun", taupe: "braun",
  rosa: "rosa", pink: "rosa", altrosa: "rosa",
  rot: "rot", bordeaux: "rot", weinrot: "rot",
  orange: "orange", terracotta: "orange",
  gelb: "gelb", senf: "gelb", senfgelb: "gelb",
  gold: "gold", silber: "silber",
  grün: "grün", gruen: "grün", mint: "grün", salbei: "grün", oliv: "grün", khaki: "grün",
  blau: "blau", hellblau: "blau", dunkelblau: "blau", navy: "blau", marine: "blau",
  türkis: "türkis", tuerkis: "türkis", petrol: "türkis",
  lila: "lila", violett: "lila", flieder: "lila",
  bunt: "bunt", mehrfarbig: "bunt", regenbogen: "bunt",
};

/** Formwort → Form-Gruppe. eckig/rechteckig/quadratisch = EINE Gruppe (konservativ). */
const FORM_GRUPPE: Record<string, string> = {
  rund: "rund", kreisrund: "rund", kreis: "rund",
  eckig: "eckig", rechteckig: "eckig", quadratisch: "eckig", viereckig: "eckig",
  oval: "oval", halbrund: "halbrund",
  sechseckig: "sechseckig", hexagon: "sechseckig", achteckig: "achteckig",
  dreieckig: "dreieckig",
};

function extractAusWoerterbuch(text: string, buch: Record<string, string>): Set<string> {
  const out = new Set<string>();
  for (const wort of ` ${text.toLowerCase()} `.split(/[^a-zäöüß]+/)) {
    const familie = buch[wort];
    if (familie) out.add(familie);
  }
  return out;
}

export const extractFarben = (text: string) => extractAusWoerterbuch(text, FARB_FAMILIE);
export const extractFormen = (text: string) => extractAusWoerterbuch(text, FORM_GRUPPE);

// ── Haupt-Prüfung (deterministisch) ─────────────────────────────────────────

export type ProduktKontext = {
  /** Freitext, aus dem die Produkt-Attribute (Maße, Anzahl, Farbe, Form) gezogen werden. */
  attributText: string;
  produktName: string;
  eigeneMarke: string | null;
};

/** Lockere Sicht auf den Listing-Snapshot — nur die Felder, aus denen sich Specs lesen lassen. */
export type SpecSnapshot = {
  title?: string | null;
  bullets?: string[] | null;
  attributes?: Record<string, string> | null;
  importantInfo?: string | null;
  description?: string | null;
  /** Vision-Auslese der Galeriebilder (Text im Bild + Beschreibung) — D158. */
  bilderText?: Array<{ textImBild?: string[] | null; inhalt?: string | null } | null> | null;
};
/** Lockere Sicht auf die Produkt-Fakten (kein Schema-Import nötig). */
export type SpecFacts = {
  dimensions?: string;
  productType?: string;
  materials?: string[];
  specs?: Record<string, string>;
};

/**
 * Alle bekannten Produkt-Spezifikationen als EIN Text — Grundlage der
 * deterministischen Attribut-Exklusion (Maß/Anzahl/Farbe/Form).
 *
 * Breit (D240/D241, Nutzer 28.07.): Die Größe steht selten im Titel, sondern in
 * Bullets, Attribut-Tabelle, „Wichtigen Informationen", der Beschreibung oder
 * AUF DEN BILDERN (`bilderText`). Vorher las der Filter nur `dimensions + Titel +
 * Name` — darum überlebten bei einem 80×160-Bett „Kinderbett 90×200" etc.
 *
 * Familien-Größentabellen (bei Variationen häufig in Bild/Beschreibung: 80×160 UND
 * 90×200 UND 140×200) sind KEIN Problem mehr: Die Maß-Regel nimmt nur das/die
 * HÄUFIGSTEN Maß(e) als Produktgröße (`dominanteMasse`) — die eigene Größe der
 * Variante wiederholt sich über mehrere Felder, Fremdgrößen tauchen nur einmal auf.
 */
export function produktAttributText(name: string, facts?: SpecFacts | null, snapshot?: SpecSnapshot | null): string {
  const teile: Array<string | null | undefined> = [
    name,
    facts?.dimensions,
    facts?.productType,
    ...(facts?.materials ?? []),
    ...Object.values(facts?.specs ?? {}),
    snapshot?.title,
    ...(snapshot?.bullets ?? []),
    ...Object.values(snapshot?.attributes ?? {}),
    snapshot?.importantInfo,
    snapshot?.description,
    ...(snapshot?.bilderText ?? []).flatMap((b) => [...(b?.textImBild ?? []), b?.inhalt]),
  ];
  return teile.filter(Boolean).join(" · ");
}

/**
 * Deterministische Attribut-Prüfung: Maß, Anzahl, Farbe, Form des Keywords
 * gegen die bekannten Produkt-Attribute. Jede Regel filtert NUR, wenn das
 * Produkt-Attribut bekannt ist (ehrlich passiv statt raten).
 */
export function pruefeProduktAttribute(keyword: string, ctx: ProduktKontext): string | null {
  const produktMasse = dominanteMasse(extractMasse(ctx.attributText));
  const kwMasse = extractMasse(keyword);
  if (produktMasse.length > 0 && kwMasse.length > 0) {
    const fremd = kwMasse.find((k) => !massGedeckt(k, produktMasse));
    if (fremd) {
      const fmt = (m: Mass) => (m.b !== undefined ? `${m.a}×${m.b} ${m.einheit}` : `${m.a} ${m.einheit}`);
      return `Maß weicht ab: ${fmt(fremd)} (Produkt: ${produktMasse.map(fmt).join(", ")})`;
    }
  }

  const produktAnzahlen = extractAnzahlen(ctx.attributText);
  const kwAnzahlen = extractAnzahlen(keyword);
  if (produktAnzahlen.length > 0 && kwAnzahlen.length > 0) {
    const fremd = kwAnzahlen.find((n) => !produktAnzahlen.includes(n));
    if (fremd !== undefined) return `Anzahl weicht ab: ${fremd} Stück (Produkt: ${produktAnzahlen.join("/")})`;
  }

  const produktFarben = extractFarben(ctx.attributText);
  if (produktFarben.size > 0 && !produktFarben.has("bunt")) {
    const kwFarben = extractFarben(keyword);
    const fremd = [...kwFarben].find((f) => !produktFarben.has(f));
    if (fremd) return `Farbe weicht ab: ${fremd} (Produkt: ${[...produktFarben].join("/")})`;
  }

  const produktFormen = extractFormen(ctx.attributText);
  if (produktFormen.size > 0) {
    const kwFormen = extractFormen(keyword);
    const fremd = [...kwFormen].find((f) => !produktFormen.has(f));
    if (fremd) return `Form weicht ab: ${fremd} (Produkt: ${[...produktFormen].join("/")})`;
  }
  return null;
}

// ── Marken-Erkennung (LLM, Code erzwingt) ────────────────────────────────────

export async function erkenneMarkenKeywords(
  keywords: string[],
  ctx: ProduktKontext,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (keywords.length === 0) return out;
  const { provider } = resolveRecipe("keywords.brands");
  if (provider.name === "mock") return out; // ohne Key keine Marken-Regel — nie raten bei Ausschlüssen

  // Eigene Marke deterministisch (Wort-Grenze), bevor das LLM ran muss
  if (ctx.eigeneMarke) {
    const re = new RegExp(`(^|\\s)${ctx.eigeneMarke.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`);
    for (const kw of keywords) if (re.test(kw.toLowerCase())) out.set(kw.toLowerCase(), `eigene Marke: ${ctx.eigeneMarke}`);
  }

  const offen = keywords.filter((k) => !out.has(k.toLowerCase()));
  // Batches, damit auch große Listen (500+) durchlaufen
  for (let i = 0; i < offen.length; i += 250) {
    const batch = offen.slice(i, i + 250);
    // QM-Lauf (D182/D183): das marken-Array ist Pflicht — sonst Korrektur-Versuch.
    const parsed = await llmJsonLauf<{ marken: Array<{ keyword?: string; marke?: string }> }>({
      recipeKey: "keywords.brands",
      system:
        "Du erkennst Marken-Suchbegriffe in Amazon-Keyword-Listen (DE). Ein Marken-Keyword enthält einen Marken-/Herstellernamen " +
        "(z. B. ‚nuk schnuller', ‚wmf topf'). KEINE Marken sind Gattungsbegriffe, Materialien, Maße. Antworte NUR mit JSON.",
      prompt: `Produkt: ${ctx.produktName}\nKeywords:\n${batch.join("\n")}\n\nGib die Marken-Keywords zurück:\n{"marken": [{"keyword": "exakt wie in der Liste", "marke": "erkannter Markenname"}]}`,
      maxTokens: 4000,
      temperature: 0,
      kontrakt: (p) =>
        Array.isArray(p.marken)
          ? { wert: { marken: p.marken as Array<{ keyword?: string; marke?: string }> } }
          : { verstoesse: ["Feld „marken“ fehlt oder ist kein Array — auch ohne Marken-Treffer ein leeres Array liefern."] },
    });
    const imBatch = new Set(batch.map((k) => k.toLowerCase()));
    for (const m of parsed.marken ?? []) {
      const kw = String(m.keyword ?? "").toLowerCase().trim();
      // Code erzwingt: nur Keywords, die wirklich in der Liste stehen
      if (kw && imBatch.has(kw) && m.marke) out.set(kw, `Marke: ${String(m.marke).trim()}`);
    }
  }
  return out;
}

/**
 * Komplettlauf über eine Keyword-Liste: deterministische Regeln + Marken-LLM.
 * Liefert je Keyword den Ausschluss-Grund oder null (relevant).
 */
export async function pruefeRelevanz(keywords: string[], ctx: ProduktKontext): Promise<RelevanzUrteil[]> {
  const marken = await erkenneMarkenKeywords(keywords, ctx);
  return keywords.map((kw) => ({
    keyword: kw,
    grund: marken.get(kw.toLowerCase()) ?? pruefeProduktAttribute(kw, ctx),
  }));
}
