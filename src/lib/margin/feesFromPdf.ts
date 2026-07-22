/**
 * Gebühren-Update per PDF (D62): Amazon veröffentlicht Gebühren-Änderungen
 * als PDF/Hilfeseite — es gibt KEINE öffentliche Tabellen-API. Weg hier:
 * PDF hochladen → LLM extrahiert die Tabellen → deterministische Validierung
 * + Diff-Vorschau → erst nach Bestätigung wird die Konfiguration wirksam
 * („LLM generiert, Code erzwingt"). Mit der SP-API-Anbindung (D27) kommt
 * später die Gebühren-VORSCHAU je ASIN (getMyFeesEstimate) als Gegenprobe.
 */

import type { FeeConfig } from "./fees";

export type FeeChange = { feld: string; alt: string; neu: string };
export type FeeExtraction = {
  config: FeeConfig;
  changes: FeeChange[];
  warnings: string[];
};

type RawExtract = {
  referralFlat?: Record<string, number>;
  referralTiered?: Array<{ category: string; thresholdEur: number; belowOrEq: number; above: number }>;
  storage?: { standardPerM3Month?: number; apparelPerM3Month?: number; months?: number };
  disposalStandard?: Array<[number, number]>;
  disposalOversize?: Array<[number, number]>;
  oversizeSideCm?: number;
};

const pctStr = (n: number) => `${Math.round(n * 10000) / 100} %`;

/** > 1 heißt: das Modell hat Prozent statt Dezimalanteil geliefert. */
const asRate = (n: number) => (n > 1 ? n / 100 : n);
const plausibleRate = (n: number) => n >= 0.005 && n <= 0.5;

/**
 * Deterministische Validierung + Merge (pur, testbar): nur bekannte
 * Kategorien werden aktualisiert, unplausible Werte fliegen raus,
 * Tabellen werden sortiert und behalten ihren Auffangwert.
 */
export function validateExtractedFees(raw: RawExtract, current: FeeConfig): FeeExtraction {
  const warnings: string[] = [];
  const changes: FeeChange[] = [];
  const config: FeeConfig = structuredClone(current);

  for (const [cat, v] of Object.entries(raw.referralFlat ?? {})) {
    const rate = asRate(v);
    if (!(cat in config.referralFlat)) {
      warnings.push(`Kategorie „${cat}" ist im Tool nicht angelegt — übersprungen (bei Bedarf melden).`);
      continue;
    }
    if (!plausibleRate(rate)) {
      warnings.push(`Unplausibler Satz für „${cat}": ${v} — übersprungen.`);
      continue;
    }
    if (config.referralFlat[cat] !== rate) {
      changes.push({ feld: `Verkaufsgebühr ${cat}`, alt: pctStr(config.referralFlat[cat]), neu: pctStr(rate) });
      config.referralFlat[cat] = rate;
    }
  }

  for (const t of raw.referralTiered ?? []) {
    const idx = config.referralTiered.findIndex((x) => x.category === t.category);
    if (idx === -1) {
      warnings.push(`Staffel-Kategorie „${t.category}" unbekannt — übersprungen.`);
      continue;
    }
    const below = asRate(t.belowOrEq), above = asRate(t.above);
    if (!plausibleRate(below) || !plausibleRate(above) || !(t.thresholdEur > 0 && t.thresholdEur < 1000)) {
      warnings.push(`Unplausible Staffel für „${t.category}" — übersprungen.`);
      continue;
    }
    const cur = config.referralTiered[idx];
    if (cur.thresholdEur !== t.thresholdEur || cur.belowOrEq !== below || cur.above !== above) {
      changes.push({
        feld: `Staffel ${t.category}`,
        alt: `bis ${cur.thresholdEur} € → ${pctStr(cur.belowOrEq)}, darüber ${pctStr(cur.above)}`,
        neu: `bis ${t.thresholdEur} € → ${pctStr(below)}, darüber ${pctStr(above)}`,
      });
      config.referralTiered[idx] = { category: t.category, thresholdEur: t.thresholdEur, belowOrEq: below, above };
    }
  }

  if (raw.storage) {
    const s = raw.storage;
    const upd = (key: "standardPerM3Month" | "apparelPerM3Month" | "months", label: string, max: number) => {
      const v = s[key];
      if (v === undefined) return;
      if (!(v > 0 && v <= max)) {
        warnings.push(`Unplausibler Lager-Wert ${label}: ${v} — übersprungen.`);
        return;
      }
      if (config.storage[key] !== v) {
        changes.push({ feld: `Lager ${label}`, alt: String(config.storage[key]), neu: String(v) });
        config.storage[key] = v;
      }
    };
    upd("standardPerM3Month", "Standard €/m³/Monat", 200);
    upd("apparelPerM3Month", "Bekleidung €/m³/Monat", 200);
    upd("months", "Monate pauschal", 12);
  }

  const table = (key: "disposalStandard" | "disposalOversize", label: string) => {
    const rows = raw[key];
    if (!rows?.length) return;
    const clean = rows
      .filter((r) => Array.isArray(r) && r.length >= 2 && Number.isFinite(r[0]) && Number.isFinite(r[1]) && r[1] >= 0 && r[1] <= 50)
      .map((r) => [r[0], r[1]] as [number, number])
      .sort((a, b) => b[0] - a[0]);
    if (!clean.length) {
      warnings.push(`Entsorgungs-Tabelle ${label}: keine verwertbaren Zeilen — übersprungen.`);
      return;
    }
    if (clean[clean.length - 1][0] > 0) clean.push(config[key][config[key].length - 1]); // Auffangwert behalten
    if (JSON.stringify(clean) !== JSON.stringify(config[key])) {
      changes.push({ feld: `Entsorgung ${label}`, alt: `${config[key].length} Stufen`, neu: `${clean.length} Stufen (ersetzt)` });
      config[key] = clean;
    }
  };
  table("disposalStandard", "Standard");
  table("disposalOversize", "Oversize");

  if (raw.oversizeSideCm !== undefined && raw.oversizeSideCm > 10 && raw.oversizeSideCm < 200 && raw.oversizeSideCm !== config.oversizeSideCm) {
    changes.push({ feld: "Oversize-Schwelle", alt: `${config.oversizeSideCm} cm`, neu: `${raw.oversizeSideCm} cm` });
    config.oversizeSideCm = raw.oversizeSideCm;
  }

  return { config, changes, warnings };
}

/** PDF → LLM-Extraktion → Validierung. Braucht ANTHROPIC_API_KEY (kein Mock — falsche Gebühren wären gefährlich). */
export async function extractFeeConfigFromPdf(pdfBase64: string, current: FeeConfig): Promise<FeeExtraction> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY fehlt — für die PDF-Extraktion nötig (kein Mock: falsche Gebühren wären gefährlich).");
  const model = process.env.RECIPE_MODEL_FEES ?? "claude-opus-4-8";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model,
      max_tokens: 4000,
      // KEIN temperature: Sonnet 5 lehnt Sampling-Parameter mit 400 ab (D83)
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
            {
              type: "text",
              text:
                "Extrahiere aus diesem Amazon-Gebühren-PDF die Gebühren-Tabellen als JSON. " +
                "Antworte NUR mit einem JSON-Objekt, keine Erklärung. Mögliche Felder (nur aufnehmen, was das PDF EINDEUTIG belegt): " +
                `referralFlat (Objekt Kategorie→Satz als Dezimalanteil, z. B. 0.15; NUR diese Kategorienamen verwenden: ${Object.keys(current.referralFlat).join(", ")}), ` +
                `referralTiered (Array {category, thresholdEur, belowOrEq, above} — nur für: ${current.referralTiered.map((t) => t.category).join(", ")}), ` +
                "storage {standardPerM3Month, apparelPerM3Month, months}, " +
                "disposalStandard und disposalOversize (Array [Gewichtsgrenze_g_exklusiv, Gebühr_EUR], absteigend, letzte Zeile [-1, Auffangwert]), " +
                "oversizeSideCm (Zahl). Wenn eine PDF-Kategorie keiner Tool-Kategorie sicher entspricht, lass sie weg.",
            },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { content: Array<{ type: string; text?: string }> };
  const text = data.content.find((c) => c.type === "text")?.text ?? "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Extraktion lieferte kein JSON — PDF evtl. ohne erkennbare Gebühren-Tabellen.");
  const raw = JSON.parse(match[0]) as RawExtract;
  const result = validateExtractedFees(raw, current);
  if (result.changes.length === 0 && result.warnings.length === 0) {
    result.warnings.push("Keine Abweichungen zum aktuellen Stand gefunden — Tabellen sind aktuell.");
  }
  return result;
}
