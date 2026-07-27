import type { VariantRole } from "@/db/schema";

/**
 * Daten-Kontrakt „Variations-Familie" (D221, D183).
 *
 * DIE eine Grenze, die JEDE Quelle einer Parent-Child-Struktur erfüllen muss —
 * egal ob sie aus manuellem Gruppieren im Tool, aus dem Scraper-Prefill oder
 * (mittelfristig) aus der SP-API kommt. Was dieses Schema nicht erfüllt, wird
 * an der Grenze abgewiesen (konkrete deutsche Fehlermeldung), nie stillschweigend
 * weitergereicht.
 *
 * Bewusst ohne externe Schema-Lib und ohne DB-Bezug: eine reine, testbare
 * Funktion. Die persistierende Action ruft sie VOR jedem Schreibzugriff auf.
 *
 * Alles, was Code entscheiden kann, entscheidet hier Code (D184): Achsen-
 * Vollständigkeit, Dubletten-Achsenwerte, ASIN-Eindeutigkeit. Das LLM ist an
 * dieser Stufe nicht beteiligt.
 */

export type FamilieChildInput = {
  /** Amazon-ASIN des Childs (kaufbare Variante). */
  asin: string;
  /** Wert je Achse — MUSS für jede Achse aus variationTheme genau einen Wert tragen. */
  axisValues: Record<string, string>;
  /** Optional: existierende Produkt-ID im Tool (beim Gruppieren bereits geladener ASINs). */
  productId?: string;
};

export type FamilieKontraktInput = {
  /** Amazon-Parent-ASIN, falls bekannt. Parent ist NICHT kaufbar (nur Container). */
  parentAsin?: string | null;
  /** Die Variationsachsen, z. B. ["flavor"] oder ["size","color"]. Reihenfolge = kanonisch. */
  variationTheme: string[];
  /** Die Childs. Eine Familie hat definitionsgemäß ≥ 2 Childs (sonst standalone). */
  children: FamilieChildInput[];
};

export type FamilieVerstoss = { feld: string; problem: string };

function istNichtLeererString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Vergleichsform einer Achse/eines Werts: getrimmt + kleingeschrieben (Dublette „Kiwi" == „kiwi").
 * Nimmt bewusst `unknown`: der Input ist ungeprüftes JSON (manuell/Scraper/SP-API-Prefill) —
 * ein Nicht-String darf NIE crashen, sondern wird zu "" normalisiert und an der zuständigen
 * Stelle als Verstoß gemeldet (D183: sauber abweisen statt 500).
 */
function norm(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

/**
 * Kanonische Signatur der Achsenwerte eines Childs in Theme-Reihenfolge —
 * Grundlage der Dubletten-Prüfung (zwei Childs dürfen nicht dieselbe
 * Achsen-Kombination tragen, z. B. beide „Erdbeere").
 */
export function achsenSignatur(child: FamilieChildInput, theme: string[]): string {
  // JSON-kodiert statt per Trennzeichen gejoint: ein Achsenwert, der selbst „ | " enthält,
  // kann so keine falsche (oder verpasste) Dublette erzeugen (Review D221).
  return JSON.stringify(theme.map((achse) => norm(child.axisValues?.[achse])));
}

/** Parent ist nicht kaufbar; nur Container. Child/Standalone sind kaufbar. */
export function istKaufbar(role: VariantRole): boolean {
  return role !== "parent";
}

/**
 * Prüft die Familien-Deklaration gegen den Kontrakt.
 * Leeres Ergebnis = gültig. Jeder Eintrag ist eine präzise, dem Aufrufer
 * (UI oder Prefill-Quelle) zurückspielbare Abweisung.
 */
export function pruefeFamilie(input: FamilieKontraktInput): FamilieVerstoss[] {
  const verstoesse: FamilieVerstoss[] = [];

  // ── Theme: nicht-leere, eindeutige Achsen ────────────────────────────────
  const theme = input.variationTheme;
  if (!Array.isArray(theme) || theme.length === 0) {
    verstoesse.push({
      feld: "variationTheme",
      problem: "muss ein nicht-leeres Array von Achsen sein (z. B. [\"flavor\"] oder [\"size\",\"color\"]).",
    });
  } else {
    const gesehen = new Set<string>();
    theme.forEach((achse, i) => {
      if (!istNichtLeererString(achse)) {
        verstoesse.push({ feld: `variationTheme[${i}]`, problem: "muss ein nicht-leerer String sein." });
        return;
      }
      const n = norm(achse);
      if (gesehen.has(n)) verstoesse.push({ feld: `variationTheme[${i}]`, problem: `Achse „${achse}" ist doppelt.` });
      gesehen.add(n);
    });
  }
  const themeAchsenNorm = Array.isArray(theme) ? theme.filter(istNichtLeererString).map(norm) : [];
  const themeGueltig =
    Array.isArray(theme) &&
    theme.length > 0 &&
    theme.every(istNichtLeererString) &&
    new Set(themeAchsenNorm).size === themeAchsenNorm.length; // Doppelachse macht Theme ungültig → kein Folge-Rauschen

  // ── Childs: ≥ 2 ──────────────────────────────────────────────────────────
  if (!Array.isArray(input.children)) {
    verstoesse.push({ feld: "children", problem: "muss ein Array sein." });
    return verstoesse;
  }
  if (input.children.length < 2) {
    verstoesse.push({
      feld: "children",
      problem: `enthält ${input.children.length} Child(s) — eine Familie braucht ≥ 2 (sonst ist die ASIN standalone).`,
    });
  }

  // ── Je Child: ASIN + Achsenwert für JEDE Achse, keine Fremd-Achsen ───────
  const asinsGesehen = new Map<string, number>();
  const signaturen = new Map<string, number>();
  input.children.forEach((child, i) => {
    if (!child || typeof child !== "object") {
      verstoesse.push({ feld: `children[${i}]`, problem: "muss ein Objekt { asin, axisValues } sein." });
      return;
    }

    if (!istNichtLeererString(child.asin)) {
      verstoesse.push({ feld: `children[${i}].asin`, problem: "muss ein nicht-leerer String sein." });
    } else {
      const key = norm(child.asin);
      const vorher = asinsGesehen.get(key);
      if (vorher !== undefined)
        verstoesse.push({ feld: `children[${i}].asin`, problem: `ASIN „${child.asin}" ist bereits Child #${vorher + 1}.` });
      else asinsGesehen.set(key, i);
    }

    const werte = child.axisValues;
    if (!werte || typeof werte !== "object" || Array.isArray(werte)) {
      verstoesse.push({ feld: `children[${i}].axisValues`, problem: "muss ein Objekt { achse: wert } sein." });
      return;
    }

    if (themeGueltig) {
      // Jede Theme-Achse braucht genau einen nicht-leeren STRING-Wert …
      for (const achse of theme) {
        const wert = werte[achse];
        if (wert === undefined || wert === null || (typeof wert === "string" && wert.trim() === "")) {
          verstoesse.push({
            feld: `children[${i}].axisValues.${achse}`,
            problem: `fehlt — jedes Child muss für jede Achse (${theme.join(", ")}) einen Wert tragen.`,
          });
        } else if (typeof wert !== "string") {
          verstoesse.push({
            feld: `children[${i}].axisValues.${achse}`,
            problem: `muss ein String sein (war ${typeof wert}).`,
          });
        }
      }
      // … und keine Achse außerhalb des Themes.
      for (const key of Object.keys(werte)) {
        if (!theme.some((a) => norm(a) === norm(key)))
          verstoesse.push({
            feld: `children[${i}].axisValues.${key}`,
            problem: `Achse „${key}" steht nicht im variationTheme.`,
          });
      }
      // Dublette nur prüfen, wenn ALLE Achsenwerte gültige, nicht-leere Strings sind — sonst
      // ist die Signatur nicht aussagekräftig (und der Wert wurde oben bereits moniert).
      const alleWerteGueltig = theme.every((a) => istNichtLeererString(werte[a]));
      if (alleWerteGueltig) {
        const sig = achsenSignatur(child, theme);
        const vorher = signaturen.get(sig);
        if (vorher !== undefined)
          verstoesse.push({
            feld: `children[${i}].axisValues`,
            problem: `identische Achsen-Kombination wie Child #${vorher + 1} — jede Variante muss sich unterscheiden.`,
          });
        else signaturen.set(sig, i);
      }
    }
  });

  // ── Parent-ASIN darf keine Child-ASIN sein ───────────────────────────────
  if (input.parentAsin != null && input.parentAsin !== "") {
    if (!istNichtLeererString(input.parentAsin)) {
      verstoesse.push({ feld: "parentAsin", problem: "muss ein nicht-leerer String sein (oder ganz weggelassen)." });
    } else if (asinsGesehen.has(norm(input.parentAsin))) {
      verstoesse.push({ feld: "parentAsin", problem: "darf nicht zugleich eine Child-ASIN sein (Parent ist nicht kaufbar)." });
    }
  }

  return verstoesse;
}

/** Convenience: gültig, wenn keine Verstöße. */
export function istFamilieGueltig(input: FamilieKontraktInput): boolean {
  return pruefeFamilie(input).length === 0;
}
