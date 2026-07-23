import { byteLength, charLength, normalizeToken } from "@/lib/text/bytes";
import { RULES } from "./rules";
import type { ValidationIssue, ValidationReport, ProductFacts } from "@/db/schema";

/**
 * Deterministisches Validation-Gate für Text-Content.
 * Jede Regel referenziert knowledge/content/*.md. Evidenz-Klasse: "deterministic".
 * Wichtig (seo-os-Lehre): Leere/fehlende Inhalte sind FEHLER, nie stille Bestehen.
 */

type Ctx = {
  facts?: ProductFacts;
  primaryKeywords?: string[]; // 3–4, aus Analyse
  /** ALLE Keywords (alle Tiers) — Basis des Keyword-Echo-Checks (D181/D184). */
  alleKeywords?: string[];
  competitorBrands?: string[]; // Blacklist
  /**
   * Zahlen-Herkunfts-Check (D114): Quelltext, aus dem JEDE Zahl im
   * generierten Text belegbar sein muss (Produkt-Wahrheit + eigenes
   * Listing-IST + Zusatz-Infos + Keywords — NIE Reviews, die können von
   * fremden Produkten stammen). Fehlt der Kontext, prüft die Regel nicht.
   */
  zahlenQuellen?: string;
};

// ── Zahlen-Herkunfts-Check (D114) ────────────────────────────────────────────
// Wurzel des Northpoint-Falls: „Drei AA-Batterien" (Quelle: 4 x LR6 AA),
// erfundene „6500 K" und „interne Falltests". Keine Batterie-Sonderregel,
// sondern generisch: Zahl + Kontextwort im Text müssen in den Quellen
// vorkommen; steht das Kontextwort in der Quelle bei einer ANDEREN Zahl,
// ist es ein Widerspruch (Fehler).

const ZAHLWORT: Record<string, string> = {
  zwei: "2", drei: "3", vier: "4", fuenf: "5", fünf: "5", sechs: "6",
  sieben: "7", acht: "8", neun: "9", zehn: "10", elf: "11", zwoelf: "12", zwölf: "12",
};
const EINS_ARTIKEL = /^ein(e|em|er|en|es)?$/; // nur vor Einheiten werten (sonst Artikel-Rauschen)
const EINHEITEN = /^(meter|metern|zentimeter|millimeter|kilometer|stunde|stunden|minute|minuten|sekunde|sekunden|tag|tagen|woche|wochen|monat|monaten|jahr|jahre|jahren|kg|kilogramm|gramm|liter|milliliter|watt|volt|lumen|prozent|grad|kelvin)$/;

const normZahl = (s: string) => s.replace(",", ".").replace(/\.0+$/, "");

/** Zahl-Claims (Zahl + bis zu 2 Folgewörter) aus einem Text ziehen. */
function zahlClaims(text: string): Array<{ zahl: string; kontext: string[]; roh: string }> {
  const tokens = text.split(/[\s/()„“"«»;:–—]+/).filter(Boolean);
  const claims: Array<{ zahl: string; kontext: string[]; roh: string }> = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].toLowerCase().replace(/[.!?,]+$/, "");
    let zahl: string | null = null;
    const mDigit = t.match(/^(\d+(?:[.,]\d+)?)/);
    if (mDigit) zahl = normZahl(mDigit[1]);
    else if (ZAHLWORT[t]) zahl = ZAHLWORT[t];
    else if (EINS_ARTIKEL.test(t)) {
      const next = (tokens[i + 1] ?? "").toLowerCase().replace(/[^a-zäöüß]/g, "");
      if (EINHEITEN.test(next)) zahl = "1";
      else continue;
    } else continue;

    const kontext = tokens
      .slice(i + 1, i + 3)
      .flatMap((w) => w.split("-"))
      .map((w) => w.toLowerCase().replace(/[^a-zäöüß]/g, ""))
      .filter((w) => w.length >= 2);
    claims.push({ zahl, kontext, roh: tokens.slice(i, i + 3).join(" ") });
  }
  return claims;
}

export function pruefeZahlenTreue(text: string, quellen: string, rulePrefix: string): ValidationIssue[] {
  if (!quellen.trim()) return []; // ohne Quellen ehrlich passiv
  const issues: ValidationIssue[] = [];
  const q = quellen.toLowerCase().replace(/,(?=\d)/g, ".");
  const qZahlen = new Set((q.match(/\d+(?:\.\d+)?/g) ?? []).map(normZahl));

  for (const c of zahlClaims(text)) {
    const zahlBekannt = qZahlen.has(c.zahl);
    // Kontextwort-Stämme in den Quellen suchen; Zahlen im Umfeld einsammeln
    const stamm = c.kontext.map((k) => k.slice(0, 6)).find((k) => k.length >= 2 && q.includes(k));
    if (stamm) {
      let kontextTrifftZahl = false;
      const umfeldZahlen = new Set<string>();
      for (let idx = q.indexOf(stamm); idx !== -1; idx = q.indexOf(stamm, idx + 1)) {
        const fenster = q.slice(Math.max(0, idx - 40), idx + stamm.length + 40);
        for (const z of fenster.match(/\d+(?:\.\d+)?/g) ?? []) {
          umfeldZahlen.add(normZahl(z));
          if (normZahl(z) === c.zahl) kontextTrifftZahl = true;
        }
      }
      if (!kontextTrifftZahl && umfeldZahlen.size > 0) {
        issues.push(issue(`${rulePrefix}.zahl-widerspruch`, "error",
          `Zahlen-Widerspruch: Text sagt „${c.roh}", die Quellen nennen dort ${[...umfeldZahlen].slice(0, 3).join("/")} — Spezifikationen NIE verändern.`));
        continue;
      }
      if (kontextTrifftZahl) continue;
    }
    if (!zahlBekannt) {
      issues.push(issue(`${rulePrefix}.zahl-ohne-quelle`, "error",
        `Zahl ohne Quelle: „${c.roh}" kommt in keiner Daten-Quelle vor (Produkt-Wahrheit, Listing, Zusatz-Infos, Keywords) — nichts erfinden.`));
    }
  }
  return issues;
}

function issue(
  rule: string,
  severity: ValidationIssue["severity"],
  message: string,
): ValidationIssue {
  return { rule, severity, message, evidence: "deterministic" };
}

// ── Keyword-Echo-Check (D181, Ulmenrinde-Befund D180) ────────────────────────
// Rohe, kleingeschriebene Suchphrasen mitten im Text („die kot und grasfresser
// drops hund riechen") sind das deterministisch fassbare Ende des Keyword-
// Stuffings. Konservativ: geflaggt wird nur, wenn ALLE Inhaltswörter der im
// Text gefundenen Phrase kleingeschrieben sind (Adjektiv-Keywords wie
// „spülmaschinenfeste Flasche" bleiben straffrei — den Rest beurteilt der
// LLM-Prüfer über sprache.keyword-natuerlich).

const FUNKTIONSWOERTER = new Set([
  "der", "die", "das", "den", "dem", "des", "ein", "eine", "einen", "einem", "einer", "eines",
  "und", "oder", "für", "gegen", "mit", "ohne", "bei", "beim", "im", "in", "am", "an", "auf",
  "zu", "zum", "zur", "von", "vom", "aus", "nach", "über", "unter", "vor", "als", "wie",
]);

/**
 * Wortstamm-Abdeckung (D190): Alle Inhaltswort-Stämme des Keywords kommen im
 * Text vor — Flexion und Komposita zählen. Amazon matcht Wortstämme; eine
 * wörtliche Phrasen-Pflicht würde Keyword-Stuffing ERZWINGEN.
 */
export function keywordStammAbgedeckt(keyword: string, text: string): boolean {
  const normText = text
    .split(/[\s\-–—/,.]+/)
    .map(normalizeToken)
    .filter(Boolean)
    .join(" ");
  // Kompakt-Variante als Rückfallebene: deckt Kompositum-Keywords, die im
  // Text getrennt/mit Bindestrich stehen (und umgekehrt).
  const kompakt = normText.replace(/ /g, "");
  return keyword
    .split(/[\s\-–—/]+/)
    .filter((w) => !FUNKTIONSWOERTER.has(w.toLowerCase()))
    .map(normalizeToken)
    .filter((s) => s.length >= 3)
    .every((s) => normText.includes(s) || kompakt.includes(s));
}

export function pruefeKeywordEcho(text: string, keywords: string[], rulePrefix: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const lower = text.toLowerCase();
  const gemeldet = new Set<string>();
  for (const kw of keywords) {
    const phrase = kw.trim().toLowerCase();
    if (!phrase || phrase.split(/\s+/).length < 2 || gemeldet.has(phrase)) continue;
    for (let idx = lower.indexOf(phrase); idx !== -1; idx = lower.indexOf(phrase, idx + 1)) {
      // Wortgrenzen: kein Treffer mitten in einem längeren Wort
      const vor = idx === 0 ? " " : text[idx - 1];
      const nach = idx + phrase.length >= text.length ? " " : text[idx + phrase.length];
      if (/[a-zäöüß0-9]/i.test(vor) || /[a-zäöüß0-9]/i.test(nach)) continue;
      const fund = text.slice(idx, idx + phrase.length);
      const inhaltswoerter = fund
        .split(/\s+/)
        .filter((w) => w.length >= 2 && !FUNKTIONSWOERTER.has(w.toLowerCase()) && /[a-zäöüß]/i.test(w));
      if (inhaltswoerter.length >= 2 && inhaltswoerter.every((w) => w[0] === w[0].toLowerCase())) {
        issues.push(issue(`${rulePrefix}.keyword-echo`, "error",
          `Suchphrase roh eingeklebt: „${fund}" — Keywords werden flektiert und großgeschrieben integriert, nie als kleingeschriebene Keyword-Kette.`));
        gemeldet.add(phrase);
        break;
      }
    }
  }
  return issues;
}

// ── Cross-Bullet-Satzdopplung (D181) ─────────────────────────────────────────
// Fast wörtlich wiederholte Aussagen zwischen Bullets („bindet überschüssige
// Magensäure …" in Bullet 1 UND 5) via 5-Wort-Shingles auf Wortstamm-Basis.

const SHINGLE_LAENGE = 5;

export function pruefeBulletDopplung(bullets: string[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const gesehen = new Map<string, number>(); // Shingle → Bullet-Index
  const gemeldetePaare = new Set<string>();
  for (const [i, b] of bullets.entries()) {
    const tokens = b.split(/\s+/).map(normalizeToken).filter((t) => t.length >= 2);
    for (let s = 0; s + SHINGLE_LAENGE <= tokens.length; s++) {
      const shingle = tokens.slice(s, s + SHINGLE_LAENGE).join(" ");
      const erster = gesehen.get(shingle);
      if (erster === undefined) {
        gesehen.set(shingle, i);
      } else if (erster !== i) {
        const paar = `${erster}-${i}`;
        if (!gemeldetePaare.has(paar)) {
          gemeldetePaare.add(paar);
          issues.push(issue("bullets.satz-dopplung", "error",
            `Bullet ${erster + 1} und Bullet ${i + 1} wiederholen dieselbe Aussage (u. a. „…${shingle}…") — jede Aussage genau 1×.`));
        }
      }
    }
  }
  return issues;
}

function findBanned(text: string, list: readonly string[], rulePrefix: string): ValidationIssue[] {
  const lower = text.toLowerCase();
  return list
    .filter((p) => lower.includes(p))
    .map((p) => issue(`${rulePrefix}.banned-phrase`, "error", `Verbotene Formulierung: „${p}"`));
}

function findCompetitorBrands(text: string, ctx: Ctx, rulePrefix: string): ValidationIssue[] {
  const lower = text.toLowerCase();
  return (ctx.competitorBrands ?? [])
    .filter((b) => b && lower.includes(b.toLowerCase()))
    .map((b) => issue(`${rulePrefix}.competitor-brand`, "error", `Wettbewerber-Marke im Text: „${b}"`));
}

const EMOJI_RE = /\p{Extended_Pictographic}/gu;

// ── Titel ────────────────────────────────────────────────────────────────────

export function validateTitle(title: string, ctx: Ctx = {}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const t = title.trim();

  if (!t) return [issue("title.empty", "error", "Titel fehlt.")];

  const chars = charLength(t);
  if (chars > RULES.title.maxChars)
    issues.push(issue("title.max-length", "error", `Titel ${chars} Zeichen > ${RULES.title.maxChars} (Amazon-Limit 07/2026).`));
  // Pflichtband 70–75 (Nutzer-Regel 23.07., D190): unter 70 ist verschenkter
  // Platz und damit FEHLER (erzwingt Regenerierung), nicht mehr nur Warnung.
  if (chars < RULES.title.targetMinChars && chars <= RULES.title.maxChars)
    issues.push(issue("title.budget", "error", `Titel nur ${chars} Zeichen — Pflichtband ${RULES.title.targetMinChars}–${RULES.title.maxChars}: das Budget MUSS ausgenutzt werden (weiteres belegtes Attribut/Nutzen ergänzen).`));

  // Hauptkeyword muss ABGEDECKT sein (bei 75 Zeichen ist der ganze Titel das
  // Fenster). Wortstamm-Abdeckung statt wörtlicher Phrase (D190): Amazon
  // matcht Stämme — die alte includes()-Pflicht zwang das Modell, ungrammatische
  // Suchphrasen einzukleben, und kollidierte mit sprache.keyword-natuerlich.
  const primary = ctx.primaryKeywords?.[0];
  if (primary && !keywordStammAbgedeckt(primary, t))
    issues.push(issue("title.keyword-window", "error", `Hauptkeyword „${primary}" ist im Titel nicht abgedeckt — jeder Wortstamm muss vorkommen (Flexion/Komposita zählen: „Ulmenrinde-Drops für Hunde" deckt „ulmenrinde für hunde").`));

  issues.push(...pruefeZahlenTreue(t, ctx.zahlenQuellen ?? "", "title"));

  // Keyword-Wiederholung: kein signifikantes Wort >1× (Stamm-Vergleich); Zahlen/Kurzwörter ok
  const tokens = t.split(/\s+/).map(normalizeToken).filter((w) => w.length >= 4);
  const seen = new Map<string, number>();
  for (const tok of tokens) seen.set(tok, (seen.get(tok) ?? 0) + 1);
  for (const [tok, n] of seen)
    if (n > RULES.title.maxKeywordOccurrence + 1)
      issues.push(issue("title.keyword-repeat", "error", `Wortstamm „${tok}" ${n}× im Titel.`));
    else if (n === RULES.title.maxKeywordOccurrence + 1)
      issues.push(issue("title.keyword-repeat", "warning", `Wortstamm „${tok}" 2× im Titel — nur ok wenn grammatikalisch nötig.`));

  if (EMOJI_RE.test(t)) issues.push(issue("title.emoji", "error", "Emojis im Titel sind verboten."));

  issues.push(...pruefeKeywordEcho(t, ctx.alleKeywords ?? [], "title"));
  issues.push(...findBanned(t, RULES.bannedPhrases, "title"));
  issues.push(...findBanned(t, RULES.bannedClaims, "title"));
  issues.push(...findCompetitorBrands(t, ctx, "title"));
  return issues;
}

// ── Bullets ──────────────────────────────────────────────────────────────────

export function validateBullets(bullets: string[], ctx: Ctx = {}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (bullets.length !== RULES.bullets.count)
    issues.push(issue("bullets.count", "error", `${bullets.length} Bullets statt ${RULES.bullets.count}.`));

  bullets.forEach((b, i) => {
    const n = i + 1;
    const t = b.trim();
    if (!t) {
      issues.push(issue("bullets.empty", "error", `Bullet ${n} ist leer.`));
      return;
    }
    const bytes = byteLength(t);
    if (charLength(t) > RULES.bullets.hardMaxChars)
      issues.push(issue("bullets.hard-max", "error", `Bullet ${n} überschreitet ${RULES.bullets.hardMaxChars} Zeichen.`));
    else if (bytes < RULES.bullets.utilizationMinBytes)
      issues.push(
        issue("bullets.budget", "warning", `Bullet ${n}: nur ${bytes} B — Budget nicht ausgenutzt (Ziel ≥${RULES.bullets.utilizationMinBytes} B, max. ${RULES.bullets.hardMaxChars} Zeichen).`),
      );

    // Headline-Pattern: VERSALIEN (3–5 Wörter) + Doppelpunkt
    const headline = t.split(":")[0] ?? "";
    const headWords = headline.trim().split(/\s+/);
    const isCaps = headline.length > 0 && headline === headline.toUpperCase() && /[A-ZÄÖÜ]/.test(headline);
    if (!t.includes(":") || !isCaps)
      issues.push(issue("bullets.headline", "error", `Bullet ${n}: keine VERSALIEN-Headline mit Doppelpunkt.`));
    else if (headWords.length < 2 || headWords.length > 6)
      issues.push(issue("bullets.headline-length", "warning", `Bullet ${n}: Headline ${headWords.length} Wörter (Ziel 3–5).`));

    // Feature-Headline, deterministisches Ende (D181, Toleranz D194): eine
    // Headline, die mit einer Zahl beginnt („350 G MIT CA. 160 DROPS"), ist
    // eine Mengenangabe ohne Kaufgrund — Warnung (Anatomie ist Best Practice,
    // kein Block-Grund); den semantischen Rest beurteilt der LLM-Prüfer.
    if (/^\s*\d/.test(headline))
      issues.push(issue("bullets.headline-feature", "warning", `Bullet ${n}: Headline beginnt mit einer Zahl — Best Practice ist ein Kaufgrund/Benefit, keine Mengenangabe.`));

    // Headline-Echo, wortgleiches Ende (D181): erster Satz beginnt mit den
    // Headline-Wörtern („BERUHIGT DEN MAGEN …: Beruhigt den Magen …").
    const body = t.split(":").slice(1).join(":").trim();
    const headStamm = headline.trim().split(/\s+/).map(normalizeToken).filter(Boolean);
    const bodyStamm = body.split(/\s+/).map(normalizeToken).filter(Boolean);
    if (headStamm.length >= 3 && headStamm.slice(0, 3).every((w, k) => bodyStamm[k] === w))
      issues.push(issue("bullets.headline-echo-wortgleich", "error", `Bullet ${n}: Der erste Satz wiederholt die Headline wörtlich — er muss stattdessen den Feature-Beleg liefern.`));

    const sentences = (t.split(":").slice(1).join(":").match(/[.!?]+/g) ?? []).length;
    if (sentences > RULES.bullets.maxSentences)
      issues.push(issue("bullets.sentences", "warning", `Bullet ${n}: ${sentences} Sätze (max. ${RULES.bullets.maxSentences}).`));

    const emoji = (t.match(EMOJI_RE) ?? []).length;
    if (emoji > RULES.bullets.maxEmoji)
      issues.push(issue("bullets.emoji", "error", `Bullet ${n}: ${emoji} Emojis (max. ${RULES.bullets.maxEmoji}).`));

    issues.push(...findBanned(t, RULES.bannedPhrases, "bullets"));
    issues.push(...findBanned(t, RULES.bannedClaims, "bullets"));
    issues.push(...findCompetitorBrands(t, ctx, "bullets"));
  });

  // Bullet-genaue Zuordnung (D195): Zahlen- und Echo-Befunde tragen die
  // Bullet-Nummer — sonst kann die bullet-weise Korrektur (D194) nicht
  // sperren und die ganze Liste würde neu gewürfelt.
  bullets.forEach((b, i) => {
    const n = i + 1;
    issues.push(...pruefeZahlenTreue(b, ctx.zahlenQuellen ?? "", "bullets").map((x) => ({ ...x, message: `Bullet ${n}: ${x.message}` })));
    issues.push(...pruefeKeywordEcho(b, ctx.alleKeywords ?? [], "bullets").map((x) => ({ ...x, message: `Bullet ${n}: ${x.message}` })));
  });
  issues.push(...pruefeBulletDopplung(bullets));

  // USP-Einmaligkeit über alle Bullets (Cross-Content-Regel — Kern des USP-Problems)
  const usps = ctx.facts?.usps ?? [];
  for (const usp of usps) {
    const hits = bullets.filter((b) => b.toLowerCase().includes(usp.toLowerCase())).length;
    if (hits > 1)
      issues.push(issue("bullets.usp-duplicate", "error", `USP „${usp}" in ${hits} Bullets — jede USP genau 1×.`));
  }

  return issues;
}

// ── Backend-Keywords ─────────────────────────────────────────────────────────

export function validateBackendKeywords(
  terms: string,
  visibleText: string,
  ctx: Ctx = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const t = terms.trim();
  if (!t) return [issue("backend.empty", "error", "Backend-Keywords fehlen.")];

  const bytes = byteLength(t);
  if (bytes > RULES.backendKeywords.maxBytes)
    issues.push(issue("backend.max-bytes", "error", `${bytes} B > ${RULES.backendKeywords.maxBytes} B (UTF-8).`));
  else if (bytes < RULES.backendKeywords.utilizationMinBytes)
    issues.push(issue("backend.budget", "warning", `Nur ${bytes} von ${RULES.backendKeywords.maxBytes} B genutzt — Budget ausschöpfen.`));
  if (t.includes(","))
    issues.push(issue("backend.commas", "error", "Kommas sind nicht erlaubt — Einzelwörter mit Leerzeichen."));
  // Amazon ignoriert Satzzeichen (Blog 07/2026) — jedes davon ist verschwendetes Byte
  const satzzeichen = t.match(/[;.!?:„“‚’"']/g);
  if (satzzeichen)
    issues.push(issue("backend.punctuation", "warning", `Satzzeichen verschwenden Bytes (Amazon ignoriert sie): ${[...new Set(satzzeichen)].join(" ")}`));

  // Dedup gegen sichtbaren Text (Wortstamm; Bindestrich-Komposita zerlegen)
  const visible = new Set(
    visibleText.split(/[\s\-–—/]+/).map(normalizeToken).filter(Boolean),
  );
  const dupes = [...new Set(t.split(/\s+/).map(normalizeToken))].filter((w) => w && visible.has(w));
  if (dupes.length > 0)
    issues.push(
      issue("backend.visible-duplicate", "warning", `Bereits sichtbar (Platzverschwendung): ${dupes.slice(0, 8).join(", ")}${dupes.length > 8 ? " …" : ""}`),
    );

  // Singular/Plural-Dedup innerhalb des Felds
  const toks = t.toLowerCase().split(/\s+/).filter(Boolean);
  const stems = new Map<string, string[]>();
  for (const tok of toks) {
    const s = normalizeToken(tok);
    stems.set(s, [...(stems.get(s) ?? []), tok]);
  }
  for (const [, variants] of stems)
    if (new Set(variants).size > 1)
      issues.push(issue("backend.stem-duplicate", "warning", `Varianten desselben Stamms: ${[...new Set(variants)].join(" / ")} — eine reicht.`));

  issues.push(...findCompetitorBrands(t, ctx, "backend"));
  return issues;
}

// ── Beschreibung ─────────────────────────────────────────────────────────────

export function validateDescription(description: string, bullets: string[] = [], ctx: Ctx = {}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const t = description.trim();
  if (!t) return [issue("description.empty", "error", "Beschreibung fehlt.")];
  issues.push(...pruefeZahlenTreue(t, ctx.zahlenQuellen ?? "", "description"));
  issues.push(...pruefeKeywordEcho(t, ctx.alleKeywords ?? [], "description"));

  const bytes = byteLength(t);
  if (bytes > RULES.description.maxBytes)
    issues.push(issue("description.max-bytes", "error", `${bytes} B > ${RULES.description.maxBytes} B.`));
  else if (bytes < RULES.description.utilizationMinBytes)
    issues.push(issue("description.budget", "warning", `Nur ${bytes} von ${RULES.description.maxBytes} B genutzt — Budget ausschöpfen.`));

  // Kein 1:1-Bullet-Duplikat (Substring-Heuristik über den Bullet-Body)
  for (const [i, b] of bullets.entries()) {
    const body = (b.split(":").slice(1).join(":") || b).trim();
    if (body.length >= 40 && t.includes(body))
      issues.push(issue("description.bullet-duplicate", "warning", `Beschreibung wiederholt Bullet ${i + 1} wörtlich.`));
  }

  issues.push(...findBanned(t, RULES.bannedPhrases, "description"));
  issues.push(...findBanned(t, RULES.bannedClaims, "description"));
  issues.push(...findCompetitorBrands(t, ctx, "description"));
  return issues;
}

// ── Item Highlights (neue Amazon-Sektion, 125 Zeichen — Nutzer 07/2026) ─────

export function validateItemHighlights(text: string, ctx: Ctx = {}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const t = text.trim();
  if (!t) return [issue("highlights.empty", "error", "Item Highlights fehlen.")];
  issues.push(...pruefeZahlenTreue(t, ctx.zahlenQuellen ?? "", "highlights"));
  issues.push(...pruefeKeywordEcho(t, ctx.alleKeywords ?? [], "highlights"));
  const chars = charLength(t);
  if (chars > RULES.itemHighlights.maxChars)
    issues.push(issue("highlights.max-length", "error", `${chars} Zeichen > ${RULES.itemHighlights.maxChars}.`));
  else if (chars < RULES.itemHighlights.targetMinChars)
    issues.push(issue("highlights.budget", "warning", `Nur ${chars} von ${RULES.itemHighlights.maxChars} Zeichen — Ziel ${RULES.itemHighlights.targetMinChars}–${RULES.itemHighlights.maxChars}.`));
  issues.push(...findBanned(t, RULES.bannedPhrases, "highlights"));
  issues.push(...findBanned(t, RULES.bannedClaims, "highlights"));
  issues.push(...findCompetitorBrands(t, ctx, "highlights"));
  return issues;
}

// ── Q&A (Datengrundlage für Rufus/Alexa-for-Shopping) ───────────────────────

export function validateQa(pairs: Array<{ q: string; a: string }>, ctx: Ctx = {}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (pairs.length !== RULES.qa.pairs)
    issues.push(issue("qa.count", "error", `${pairs.length} Q&A-Paare statt ${RULES.qa.pairs}.`));
  pairs.forEach((p, i) => {
    const n = i + 1;
    if (!p.q.trim() || !p.a.trim()) {
      issues.push(issue("qa.empty", "error", `Q&A ${n}: Frage oder Antwort leer.`));
      return;
    }
    if (charLength(p.q) > RULES.qa.questionMaxChars)
      issues.push(issue("qa.question-max", "error", `Frage ${n}: ${charLength(p.q)} Zeichen > ${RULES.qa.questionMaxChars}.`));
    if (charLength(p.a) > RULES.qa.answerMaxChars)
      issues.push(issue("qa.answer-max", "error", `Antwort ${n}: ${charLength(p.a)} Zeichen > ${RULES.qa.answerMaxChars}.`));
    else if (charLength(p.a) < RULES.qa.answerUtilizationMinChars)
      issues.push(issue("qa.budget", "warning", `Antwort ${n}: nur ${charLength(p.a)} Zeichen — Budget ausschöpfen (Ziel ≥${RULES.qa.answerUtilizationMinChars}).`));
    issues.push(...findBanned(`${p.q} ${p.a}`, RULES.bannedClaims, "qa"));
    issues.push(...findCompetitorBrands(`${p.q} ${p.a}`, ctx, "qa"));
  });
  issues.push(...pruefeZahlenTreue(pairs.map((p) => `${p.q} ${p.a}`).join("\n"), ctx.zahlenQuellen ?? "", "qa"));
  return issues;
}

// ── Gesamt-Gate ──────────────────────────────────────────────────────────────

export type ListingDraft = {
  title: string;
  bullets: string[];
  description: string;
  backendKeywords: string;
};

export function validateListing(draft: ListingDraft, ctx: Ctx = {}): ValidationReport {
  const visible = [draft.title, ...draft.bullets, draft.description].join(" ");
  const issues = [
    ...validateTitle(draft.title, ctx),
    ...validateBullets(draft.bullets, ctx),
    ...validateDescription(draft.description, draft.bullets, ctx),
    ...validateBackendKeywords(draft.backendKeywords, visible, ctx),
  ];
  return {
    passed: !issues.some((i) => i.severity === "error"),
    issues,
    checkedAt: new Date().toISOString(),
  };
}
