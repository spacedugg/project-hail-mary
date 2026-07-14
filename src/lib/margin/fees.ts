/**
 * Amazon.de-Gebühren-Tabellen — 1:1 portiert aus reporting-main
 * (dort reverse-engineered aus dem Margenkalkulation-Workbook des Kunden).
 * Auto-Defaults des Hybrid-Rechners: jeder Wert per Eingabe überschreibbar.
 */

/** Flat-Verkaufsgebühr (Referral) je Kategorie — Anteil vom BRUTTO-VK. */
const FLAT_REFERRAL: Record<string, number> = {
  "Alles andere": 0.08,
  "Bekleidung & Schuhe": 0.15,
  "Elektronik-Zubehör": 0.15,
  "Computer-Zubehör": 0.15,
  Schmuck: 0.2,
  Baumarkt: 0.13,
  Materialtransportprodukte: 0.12,
  "Musikinstrumente & DJ-Equipment": 0.12,
  "Industrielle Werkzeuge & Instrumente": 0.12,
  "Industrielle Elektroinstallation": 0.12,
  "Schleifmittel & Veredlungsprodukte": 0.12,
  "Zubehör für erneuerbare Energien": 0.12,
  "Zubehör für Landwirtschaftliche Geräte": 0.12,
  "Bier Wein und Spirituosen": 0.1,
  Reifen: 0.1,
  Fahrräder: 0.1,
  Fahrradzubehör: 0.08,
  "Elektro-Großgeräte": 0.07,
  Elektronik: 0.07,
  Computer: 0.07,
};

/** Preisabhängige Staffeln: 10-€-Schwelle Drogerie/Baby/Beauty, 50-€-Schwelle Auto. */
const TIERED = ["Drogerie & Körperpflege", "Baby", "Beauty", "Auto & Motorrad"] as const;

export const AMAZON_CATEGORIES = [...Object.keys(FLAT_REFERRAL), ...TIERED].sort();

export function referralRate(category: string, grossPrice: number): number {
  if (category === "Drogerie & Körperpflege" || category === "Baby" || category === "Beauty") {
    return grossPrice <= 10 ? 0.08 : 0.15;
  }
  if (category === "Auto & Motorrad") return grossPrice > 50 ? 0.09 : 0.15;
  return FLAT_REFERRAL[category] ?? 0; // unbekannte Kategorie → 0 (Fallback)
}

/** Lager: Monatssatz €/m³, pauschal 2 Monate je Einheit; Bekleidung billiger. */
const STORAGE_MONTHS = 2;
export function storageFeePerUnit(dimsCm: { l: number; w: number; h: number }, category: string): number {
  const rate = category === "Bekleidung & Schuhe" ? 19.5475 : 33.5425;
  const m3 = (dimsCm.l / 100) * (dimsCm.w / 100) * (dimsCm.h / 100);
  return m3 * rate * STORAGE_MONTHS;
}

/** Entsorgung je Stück: [Gewicht-g-EXKLUSIV-Untergrenze, Gebühr €], erste Übereinstimmung gewinnt. */
const DISPOSAL_STANDARD: Array<[number, number]> = [
  [5000, 2.1], [4000, 1.7], [3000, 1.3], [2000, 0.9], [1000, 0.5], [500, 0.45], [200, 0.3], [-1, 0.25],
];
const DISPOSAL_OVERSIZE: Array<[number, number]> = [
  [25000, 11.4], [24000, 11.0], [23000, 10.6], [22000, 10.2], [21000, 9.8], [20000, 9.4],
  [19000, 9.0], [18000, 8.6], [17000, 8.2], [16000, 7.8], [15000, 7.4], [14000, 7.0],
  [13000, 6.6], [12000, 6.2], [11000, 5.8], [10000, 5.4], [9000, 5.0], [8000, 4.6],
  [7000, 3.8], [6000, 3.4], [5000, 3.0], [2000, 2.5], [1000, 1.5], [500, 1.0], [-1, 0.5],
];

export function disposalFeePerUnit(weightG: number, dimsCm?: { l: number; w: number; h: number } | null): number {
  // Oversize, sobald IRGENDEINE Seite ≥ 46 cm
  const oversize = dimsCm ? [dimsCm.l, dimsCm.w, dimsCm.h].some((s) => s >= 46) : false;
  const table = oversize ? DISPOSAL_OVERSIZE : DISPOSAL_STANDARD;
  for (const [min, fee] of table) if (weightG > min) return fee;
  return table[table.length - 1][1];
}
