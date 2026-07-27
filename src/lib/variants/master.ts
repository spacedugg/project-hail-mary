/**
 * Content-Master-Engine (D221).
 *
 * Aus dem freigegebenen Content EINES Childs wird ein Template abgeleitet, aus dem
 * die Geschwister-Childs entstehen. Jeder Slot (Titel · je Bullet · je Beschreibungs-
 * Absatz) trägt eine von drei Rollen:
 *   - "locked"     : für ALLE Childs wortgleich (z. B. „zuckerfrei", „vegan", Markenstory).
 *   - "token"      : enthält nur den Achsenwert als Platzhalter ({{flavor}}) → reiner Code-Tausch.
 *   - "regenerate" : Sprache hängt semantisch vom Achsenwert ab → das LLM textet je Variante neu.
 *
 * Grundgesetz (D184): Alles Entscheidbare entscheidet Code — Zerlegung, Token-Erkennung,
 * Einsetzen, Wiederzusammenbau, Konsistenz-Prüfung. Das LLM ist nur an zwei klar
 * umrissenen Nahtstellen beteiligt, beide als injizierbare Funktionen (mockbar, D-Demo):
 *   (1) `SlotKlassifikator` — schlägt vor, welche Slots „regenerate" sind (Nutzer bestätigt).
 *   (2) `SlotRegenerator`   — textet einen einzelnen regenerate-Slot je Achsenwert neu.
 * Die reale LLM-Verdrahtung liegt in einer separaten Adapter-Datei; dieses Modul bleibt rein.
 */

export type MasterContent = { title: string; bullets: string[]; description: string };

export type SlotKind = "locked" | "token" | "regenerate";
export type SlotQuelle = "title" | "bullet" | "description";

export type MasterSlot = {
  /** Stabile ID: "title" | "bullet.1"… | "desc.1"… */
  id: string;
  quelle: SlotQuelle;
  /** Position innerhalb der Quelle (Titel: 0; Bullet/Absatz: 1-basiert). */
  index: number;
  kind: SlotKind;
  /** locked: wortgleicher Text · token: Text mit {{achse}} · regenerate: Referenztext (Base-Child). */
  template: string;
  /** Achsen, von denen dieser Slot abhängt (⊆ theme). Leer bei locked. */
  achsen: string[];
};

export type ContentMaster = {
  /** ASIN des Childs, aus dessen freigegebenem Content der Master abgeleitet wurde. */
  baseChildAsin: string;
  theme: string[];
  slots: MasterSlot[];
};

/** Ein Slot nach Auflösung für ein konkretes Child (Text final eingesetzt/regeneriert). */
export type AufgeloesterSlot = { id: string; quelle: SlotQuelle; index: number; kind: SlotKind; text: string };

// ── Helfer ───────────────────────────────────────────────────────────────────

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Wort-/Zahl-Zeichen inkl. Umlaute/Akzente UND Ziffern — für Token-Grenzen.
 * JS-\b versagt bei ä/ö/ü/ß; Ziffern MÜSSEN rein, sonst matcht der Achsenwert
 * „500 g" fälschlich innerhalb von „1500 g" (Review-Finding).
 */
const WORTZEICHEN = "0-9A-Za-zÀ-ÿ";

const platzhalter = (achse: string) => `{{${achse}}}`;

/**
 * Ersetzt freistehende Vorkommen von `wert` durch den Platzhalter (case-insensitiv,
 * nur an Wortgrenzen). „Erdbeere 500 g" → „{{flavor}} 500 g"; „Erdbeergeschmack"
 * wird NICHT angefasst (kein Wortende) und bleibt dem LLM/Nutzer als regenerate-Kandidat.
 */
function ersetzeWertDurchToken(text: string, wert: string, achse: string): { text: string; getroffen: boolean } {
  const w = wert.trim();
  if (!w) return { text, getroffen: false };
  const re = new RegExp(`(?<![${WORTZEICHEN}])${escapeRegExp(w)}(?![${WORTZEICHEN}])`, "giu");
  let getroffen = false;
  const out = text.replace(re, () => {
    getroffen = true;
    return platzhalter(achse);
  });
  return { text: out, getroffen };
}

/**
 * Beschreibung in Absätze zerlegen — NUR an Leerzeilen (Blockgrenzen). Einfache
 * Umbrüche bleiben innerhalb eines Absatzes erhalten, damit der Wiederzusammenbau
 * (`join("\n\n")`) den freigegebenen Text nicht still umschreibt (Round-Trip-Treue).
 */
function absaetze(description: string): string[] {
  const teile = description
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return teile.length > 0 ? teile : [description.trim()];
}

// ── (1) Zerlegung + deterministische Token-Erkennung ──────────────────────────

/**
 * Zerlegt freigegebenen Content in Slots und erkennt rein deterministisch die
 * Token-Slots (Achsenwert wörtlich enthalten). Jeder Slot startet als "locked"
 * oder "token"; die Anhebung einzelner Slots auf "regenerate" ist ein separater
 * Schritt (Klassifikator-Vorschlag + Nutzer-Bestätigung).
 */
export function zerlegeInSlots(
  content: MasterContent,
  baseAxisValues: Record<string, string>,
  theme: string[],
): MasterSlot[] {
  const slots: MasterSlot[] = [];

  const baue = (id: string, quelle: SlotQuelle, index: number, roh: string): MasterSlot => {
    let text = roh;
    const achsen: string[] = [];
    for (const achse of theme) {
      const wert = baseAxisValues[achse];
      if (typeof wert !== "string" || !wert.trim()) continue;
      const r = ersetzeWertDurchToken(text, wert, achse);
      if (r.getroffen) {
        text = r.text;
        achsen.push(achse);
      }
    }
    return {
      id,
      quelle,
      index,
      kind: achsen.length > 0 ? "token" : "locked",
      template: text,
      achsen,
    };
  };

  slots.push(baue("title", "title", 0, content.title));
  content.bullets.forEach((b, i) => slots.push(baue(`bullet.${i + 1}`, "bullet", i + 1, b)));
  absaetze(content.description).forEach((p, i) => slots.push(baue(`desc.${i + 1}`, "description", i + 1, p)));

  return slots;
}

/**
 * Wendet eine (bestätigte) Klassifikation an: hebt die genannten Slots auf "regenerate".
 * Rein mechanisch — der Vorschlag stammt vom LLM, die Entscheidung vom Nutzer.
 * Ein regenerate-Slot ohne erkannte Achse erbt das gesamte theme (Sprache hängt vom Wert ab).
 */
export function wendeKlassifikationAn(slots: MasterSlot[], regenerateIds: Iterable<string>, theme: string[]): MasterSlot[] {
  const ids = new Set(regenerateIds);
  return slots.map((s) =>
    ids.has(s.id) ? { ...s, kind: "regenerate" as const, achsen: s.achsen.length > 0 ? s.achsen : [...theme] } : s,
  );
}

// ── Kontrakt (D183) ────────────────────────────────────────────────────────────

export type MasterVerstoss = { feld: string; problem: string };

export function pruefeMaster(master: ContentMaster): MasterVerstoss[] {
  const v: MasterVerstoss[] = [];
  if (typeof master?.baseChildAsin !== "string" || !master.baseChildAsin.trim())
    v.push({ feld: "baseChildAsin", problem: "muss ein nicht-leerer String sein." });
  if (!Array.isArray(master?.theme) || master.theme.length === 0)
    v.push({ feld: "theme", problem: "muss ein nicht-leeres Achsen-Array sein." });
  if (!Array.isArray(master?.slots) || master.slots.length === 0) {
    v.push({ feld: "slots", problem: "muss mindestens einen Slot enthalten." });
    return v;
  }

  const themeSet = new Set((master.theme ?? []).map((t) => t.toLowerCase()));
  const idsGesehen = new Set<string>();
  master.slots.forEach((s, i) => {
    if (typeof s.id !== "string" || !s.id.trim()) v.push({ feld: `slots[${i}].id`, problem: "fehlt." });
    else if (idsGesehen.has(s.id)) v.push({ feld: `slots[${i}].id`, problem: `Slot-ID „${s.id}" ist doppelt.` });
    else idsGesehen.add(s.id);

    if (typeof s.template !== "string") {
      v.push({ feld: `slots[${i}].template`, problem: "muss ein String sein." });
      return;
    }
    // Platzhalter-NAMEN prüfen, nicht nur „gibt es überhaupt einen": jeder {{name}}
    // muss eine theme-Achse UND in s.achsen deklariert sein — sonst bliebe ein rohes
    // {{groesse}} beim Einsetzen stehen und landete unbemerkt im Child (HIGH-Finding).
    const platzhalterNamen = [...s.template.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1].trim());
    const hatPlatzhalter = platzhalterNamen.length > 0;
    const achsenSet = new Set((s.achsen ?? []).map((a) => a.toLowerCase()));
    for (const a of s.achsen ?? [])
      if (!themeSet.has(a.toLowerCase())) v.push({ feld: `slots[${i}].achsen`, problem: `Achse „${a}" steht nicht im theme.` });
    for (const name of platzhalterNamen) {
      if (!themeSet.has(name.toLowerCase()))
        v.push({ feld: `slots[${i}].template`, problem: `Platzhalter {{${name}}} ist keine Achse aus dem theme.` });
      else if (!achsenSet.has(name.toLowerCase()))
        v.push({ feld: `slots[${i}].achsen`, problem: `Platzhalter {{${name}}} fehlt in achsen.` });
    }

    switch (s.kind) {
      case "locked":
        if (hatPlatzhalter) v.push({ feld: `slots[${i}]`, problem: "locked-Slot darf keinen {{…}}-Platzhalter enthalten." });
        if ((s.achsen ?? []).length > 0) v.push({ feld: `slots[${i}].achsen`, problem: "locked-Slot hat keine Achsen." });
        break;
      case "token":
        if (!hatPlatzhalter) v.push({ feld: `slots[${i}]`, problem: "token-Slot braucht mindestens einen {{achse}}-Platzhalter." });
        if ((s.achsen ?? []).length === 0) v.push({ feld: `slots[${i}].achsen`, problem: "token-Slot braucht ≥ 1 Achse." });
        break;
      case "regenerate":
        if ((s.achsen ?? []).length === 0) v.push({ feld: `slots[${i}].achsen`, problem: "regenerate-Slot braucht ≥ 1 Achse." });
        break;
      default:
        v.push({ feld: `slots[${i}].kind`, problem: `unbekannte Rolle „${String(s.kind)}".` });
    }
  });
  return v;
}

// ── (2) Propagierung ────────────────────────────────────────────────────────────

/** Setzt Achsenwerte in ein Token-Template ein. Unbekannte Platzhalter bleiben stehen (fällt im QM auf). */
export function fuelleTokens(template: string, axisValues: Record<string, string>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (ganz, achse: string) => {
    const wert = axisValues[achse.trim()];
    return typeof wert === "string" && wert.trim() ? wert : ganz;
  });
}

/** Signatur für den Regenerator (LLM textet EINEN Slot je Achsenwert neu). Injiziert → mockbar. */
export type SlotRegenerator = (slot: MasterSlot, axisValues: Record<string, string>) => Promise<string>;

/**
 * Leitet den Content eines Geschwister-Childs deterministisch aus dem Master ab.
 * locked → wortgleich · token → Code-Tausch · regenerate → `regenerate()` (LLM).
 * Gibt den zusammengebauten Content UND die aufgelösten Slots zurück (Letztere für
 * die Cross-Child-Konsistenzprüfung).
 */
export async function wendeMasterAn(
  master: ContentMaster,
  axisValues: Record<string, string>,
  regenerate: SlotRegenerator,
): Promise<{ content: MasterContent; slots: AufgeloesterSlot[] }> {
  const aufgeloest: AufgeloesterSlot[] = [];
  for (const s of master.slots) {
    let text: string;
    if (s.kind === "locked") text = s.template;
    else if (s.kind === "token") text = fuelleTokens(s.template, axisValues);
    else text = await regenerate(s, axisValues);
    aufgeloest.push({ id: s.id, quelle: s.quelle, index: s.index, kind: s.kind, text });
  }

  const title = aufgeloest.find((s) => s.quelle === "title")?.text ?? "";
  const bullets = aufgeloest
    .filter((s) => s.quelle === "bullet")
    .sort((a, b) => a.index - b.index)
    .map((s) => s.text);
  const description = aufgeloest
    .filter((s) => s.quelle === "description")
    .sort((a, b) => a.index - b.index)
    .map((s) => s.text)
    .join("\n\n");

  return { content: { title, bullets, description }, slots: aufgeloest };
}

// ── Cross-Child-Gate (D221/D181): locked byte-identisch über alle Childs ─────────

import type { ValidationIssue } from "@/db/schema";

/** Regel-ID im Register (siehe register.ts, Sektion „familie"). */
export const REGEL_LOCKED_KONSISTENT = "familie.locked-konsistent";

/**
 * Deterministischer Backstop: JEDER locked-Slot muss in JEDEM Child byte-identisch
 * zum Master-Template sein. Per Konstruktion erfüllt (Code kopiert wortgleich) —
 * schlägt nur an, wenn ein Bug oder eine manuelle Bearbeitung die Familie zerreißt.
 * Löst das „zuckerfrei/vegan in einem Child, im anderen nicht"-Problem hart.
 */
export function pruefeLockedKonsistenz(
  master: ContentMaster,
  kinder: Array<{ asin: string; slots: AufgeloesterSlot[] }>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  // NFC-Normalisierung: der Backstop greift gerade bei Childs aus ANDERER Quelle
  // (Re-Scrape, manuelle Bearbeitung) — „ü" präkomponiert vs. u+◌̈ darf keinen
  // Falsch-Positiv erzeugen (Review-Finding).
  const nf = (x: string) => x.normalize("NFC");
  const lockedTemplates = new Map(master.slots.filter((s) => s.kind === "locked").map((s) => [s.id, s.template]));

  for (const kind of kinder) {
    const bySlot = new Map(kind.slots.map((s) => [s.id, s.text]));
    for (const [id, template] of lockedTemplates) {
      const ist = bySlot.get(id);
      if (ist === undefined || nf(ist) !== nf(template))
        issues.push({
          rule: REGEL_LOCKED_KONSISTENT,
          severity: "error",
          evidence: "deterministic",
          message:
            ist === undefined
              ? `Child ${kind.asin}: locked-Slot „${id}" fehlt — muss über alle Childs identisch sein.`
              : `Child ${kind.asin}: locked-Slot „${id}" weicht vom Master ab (locked muss byte-identisch sein).`,
        });
    }
  }
  return issues;
}
