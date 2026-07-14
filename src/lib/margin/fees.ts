/**
 * Amazon.de-Gebühren-Tabellen — Default 1:1 portiert aus reporting-main
 * (dort reverse-engineered aus dem Margenkalkulation-Workbook des Kunden).
 * Die Tabellen sind KONFIGURATION, kein fester Code: das Rechenwerk
 * (Einstellungen → Rechenwerk) zeigt den wirksamen Stand an und erlaubt,
 * sie gegen eine aktuellere Version auszutauschen (settings.fee_config) —
 * jede Änderung rechnet sofort. Anti-Blackbox-Prinzip (D61).
 */

export type FeeConfig = {
  /** Verkaufsgebühr (Referral) je Kategorie — Anteil vom BRUTTO-VK. */
  referralFlat: Record<string, number>;
  /** Preisabhängige Staffeln: bis inkl. Schwelle gilt belowOrEq, darüber above. */
  referralTiered: Array<{ category: string; thresholdEur: number; belowOrEq: number; above: number }>;
  /** Lager: €/m³/Monat, pauschale Monate je Einheit. */
  storage: { standardPerM3Month: number; apparelPerM3Month: number; months: number };
  /** Entsorgung je Stück: [Gewicht-g-EXKLUSIV-Untergrenze, Gebühr €], absteigend. */
  disposalStandard: Array<[number, number]>;
  disposalOversize: Array<[number, number]>;
  /** Oversize, sobald IRGENDEINE Seite ≥ dieser cm-Wert. */
  oversizeSideCm: number;
};

export const DEFAULT_FEE_CONFIG: FeeConfig = {
  referralFlat: {
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
  },
  referralTiered: [
    { category: "Drogerie & Körperpflege", thresholdEur: 10, belowOrEq: 0.08, above: 0.15 },
    { category: "Baby", thresholdEur: 10, belowOrEq: 0.08, above: 0.15 },
    { category: "Beauty", thresholdEur: 10, belowOrEq: 0.08, above: 0.15 },
    { category: "Auto & Motorrad", thresholdEur: 50, belowOrEq: 0.15, above: 0.09 },
  ],
  storage: { standardPerM3Month: 33.5425, apparelPerM3Month: 19.5475, months: 2 },
  disposalStandard: [
    [5000, 2.1], [4000, 1.7], [3000, 1.3], [2000, 0.9], [1000, 0.5], [500, 0.45], [200, 0.3], [-1, 0.25],
  ],
  disposalOversize: [
    [25000, 11.4], [24000, 11.0], [23000, 10.6], [22000, 10.2], [21000, 9.8], [20000, 9.4],
    [19000, 9.0], [18000, 8.6], [17000, 8.2], [16000, 7.8], [15000, 7.4], [14000, 7.0],
    [13000, 6.6], [12000, 6.2], [11000, 5.8], [10000, 5.4], [9000, 5.0], [8000, 4.6],
    [7000, 3.8], [6000, 3.4], [5000, 3.0], [2000, 2.5], [1000, 1.5], [500, 1.0], [-1, 0.5],
  ],
  oversizeSideCm: 46,
};

export function categoriesOf(cfg: FeeConfig = DEFAULT_FEE_CONFIG): string[] {
  return [...Object.keys(cfg.referralFlat), ...cfg.referralTiered.map((t) => t.category)].sort();
}
export const AMAZON_CATEGORIES = categoriesOf();

export function referralRate(category: string, grossPrice: number, cfg: FeeConfig = DEFAULT_FEE_CONFIG): number {
  const tier = cfg.referralTiered.find((t) => t.category === category);
  if (tier) return grossPrice <= tier.thresholdEur ? tier.belowOrEq : tier.above;
  return cfg.referralFlat[category] ?? 0; // unbekannte Kategorie → 0 (Fallback)
}

export function storageFeePerUnit(
  dimsCm: { l: number; w: number; h: number },
  category: string,
  cfg: FeeConfig = DEFAULT_FEE_CONFIG,
): number {
  const rate = category === "Bekleidung & Schuhe" ? cfg.storage.apparelPerM3Month : cfg.storage.standardPerM3Month;
  const m3 = (dimsCm.l / 100) * (dimsCm.w / 100) * (dimsCm.h / 100);
  return m3 * rate * cfg.storage.months;
}

export function disposalFeePerUnit(
  weightG: number,
  dimsCm?: { l: number; w: number; h: number } | null,
  cfg: FeeConfig = DEFAULT_FEE_CONFIG,
): number {
  const oversize = dimsCm ? [dimsCm.l, dimsCm.w, dimsCm.h].some((s) => s >= cfg.oversizeSideCm) : false;
  const table = oversize ? cfg.disposalOversize : cfg.disposalStandard;
  for (const [min, fee] of table) if (weightG > min) return fee;
  return table[table.length - 1]?.[1] ?? 0;
}
