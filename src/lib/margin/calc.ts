/**
 * Margen-Rechen-Engine — Formeln 1:1 aus reporting-main computeMargin
 * (spiegelt das Margenkalkulation-Workbook des Kunden, Zellen D22/D29/D30).
 * Regressionsanker: 1L-Fixture (Marge 1,524022836 € = 18,31906 %,
 * BEP-ACoS 15,394 %) — siehe calc.test.ts.
 */

import { referralRate, storageFeePerUnit, disposalFeePerUnit, DEFAULT_FEE_CONFIG, type FeeConfig } from "./fees";

export type MarginInputs = {
  purchasePrice: number; // Einkauf €/Stk (Pflicht)
  sellingPriceGross: number; // Brutto-VK € (Pflicht)
  orderQty?: number; // Default 1
  vatRate?: number; // Default 0,19
  category?: string; // Default "Alles andere"
  customsRate?: number; // Zollsatz, Default 0
  returnRate?: number; // Retourenquote 0..1, Default 0
  disposalShare?: number; // Anteil der Retouren, der entsorgt wird 0..1, Default 0
  packagingCost?: number; // Verpackung €/Stk
  qualityInspection?: number; // QC €/Stk — NICHT zollpflichtig
  logisticsCost?: number; // Logistik €/Stk (Teil der Warenbestellung, zollpflichtig)
  inboundCost?: number; // Inbound zu FBA €/Stk (separat)
  variableCosts?: number; // sonstige variable Kosten €/Stk
  fbaShippingFee?: number; // FBA-Versand €/Stk — KEIN Auto-Default
  storageFeeOverride?: number; // ersetzt die Maß-Berechnung
  referralRateOverride?: number; // ersetzt den Kategorie-Satz (0..1)
  dims?: { l: number; w: number; h: number } | null; // Kartonmaße cm
  weightG?: number | null;
};

export type MarginResults = {
  goodsCostPerUnit: number; // Warenbestellung/Stück inkl. Zoll
  referralFee: number;
  fbaShippingFee: number;
  storageFee: number;
  returnCostPerUnit: number;
  disposalCostPerUnit: number;
  amazonTotalPerUnit: number;
  netPrice: number;
  marginPerUnit: number;
  marginPct: number; // % von Netto
  roi: number; // %
  payoutPerUnit: number;
  breakEvenAcos: number; // % vom Brutto
  totals: { revenue: number; margin: number; payout: number }; // × Menge
};

export function computeMargin(i: MarginInputs, cfg: FeeConfig = DEFAULT_FEE_CONFIG): MarginResults {
  const qty = i.orderQty ?? 1;
  const vat = i.vatRate ?? 0.19;
  const category = i.category ?? "Alles andere";
  const gross = i.sellingPriceGross;

  // Warenbestellung/Stück: Zoll auf (Einkauf + Verpackung + Logistik), QC zollfrei (Zelle D22)
  const dutiable = i.purchasePrice + (i.packagingCost ?? 0) + (i.logisticsCost ?? 0);
  const customs = dutiable * (i.customsRate ?? 0);
  const goods = dutiable + (i.qualityInspection ?? 0) + customs;

  const referral = (i.referralRateOverride ?? referralRate(category, gross, cfg)) * gross;
  const fba = i.fbaShippingFee ?? 0;
  const storage = i.storageFeeOverride ?? (i.dims ? storageFeePerUnit(i.dims, category, cfg) : 0);
  const variable = i.variableCosts ?? 0;
  const inbound = i.inboundCost ?? 0;
  const isApparel = category === "Bekleidung & Schuhe";

  // Gesamt-Basen für Retouren/Entsorgung (Workbook rechnet auf Bestellmenge)
  const goodsT = goods * qty, fbaT = fba * qty, referralT = referral * qty;
  const inboundT = inbound * qty, variableT = variable * qty, revenueT = gross * qty;

  // Retouren (D29): voller FBA-Versand nochmal + 20 % einbehaltene Verkaufsgebühr
  // + 5 %-Pauschale auf die Kostenbasis; Bekleidung zahlt den Rückversand doppelt
  const q = (i.returnRate ?? 0) * (1 - (i.disposalShare ?? 0));
  const returnsT =
    fbaT * q + referralT * 0.2 * q + (goodsT + fbaT + inboundT + variableT) * 0.05 * q + (isApparel ? fbaT * q : 0);

  // Entsorgung (D30): abgeschriebene Ware + verlorener Umsatz − 80 % erstattete Verkaufsgebühr
  const p = (i.returnRate ?? 0) * (i.disposalShare ?? 0);
  const disposalFee = i.weightG != null ? disposalFeePerUnit(i.weightG, i.dims, cfg) : 0;
  const disposalT =
    qty * p * disposalFee + (goodsT + inboundT + variableT) * p + revenueT * p - referralT * 0.8 * p + (isApparel ? fbaT * p : 0);

  const returnPerUnit = returnsT / qty;
  const disposalPerUnit = disposalT / qty;
  const amazonTotal = referral + fba + storage + returnPerUnit + disposalPerUnit;
  const net = gross / (1 + vat);
  const margin = net - goods - amazonTotal - variable - inbound;
  const payout = gross - amazonTotal;
  const costBase = goods + variable + inbound;

  return {
    goodsCostPerUnit: goods,
    referralFee: referral,
    fbaShippingFee: fba,
    storageFee: storage,
    returnCostPerUnit: returnPerUnit,
    disposalCostPerUnit: disposalPerUnit,
    amazonTotalPerUnit: amazonTotal,
    netPrice: net,
    marginPerUnit: margin,
    marginPct: net > 0 ? (margin / net) * 100 : 0,
    roi: costBase > 0 ? (margin / costBase) * 100 : 0,
    payoutPerUnit: payout,
    breakEvenAcos: gross > 0 ? (margin / gross) * 100 : 0,
    totals: { revenue: revenueT, margin: margin * qty, payout: payout * qty },
  };
}
