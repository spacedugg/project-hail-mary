/**
 * Tool-weite Einstellungen (settings-Tabelle). Wichtigster Key: `fee_config` —
 * der Override der Amazon-Gebühren-Tabellen. Merge-Regel: gespeicherter Stand
 * ersetzt den Default KOMPLETT je Feld (keine Tiefen-Merges — was das
 * Rechenwerk anzeigt, ist exakt das, was gespeichert wurde).
 */

import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { DEFAULT_FEE_CONFIG, type FeeConfig } from "@/lib/margin/fees";

export const FEE_CONFIG_KEY = "fee_config";

export type FeeConfigState = {
  config: FeeConfig;
  source: "default" | "override";
  updatedAt: Date | null;
  updatedBy: string | null;
};

export async function getFeeConfigState(): Promise<FeeConfigState> {
  const db = await getDb();
  const row = await db.query.settings.findFirst({ where: eq(schema.settings.key, FEE_CONFIG_KEY) });
  if (!row) return { config: DEFAULT_FEE_CONFIG, source: "default", updatedAt: null, updatedBy: null };
  const stored = row.value as Partial<FeeConfig>;
  return {
    config: {
      referralFlat: stored.referralFlat ?? DEFAULT_FEE_CONFIG.referralFlat,
      referralTiered: stored.referralTiered ?? DEFAULT_FEE_CONFIG.referralTiered,
      storage: stored.storage ?? DEFAULT_FEE_CONFIG.storage,
      disposalStandard: stored.disposalStandard ?? DEFAULT_FEE_CONFIG.disposalStandard,
      disposalOversize: stored.disposalOversize ?? DEFAULT_FEE_CONFIG.disposalOversize,
      oversizeSideCm: stored.oversizeSideCm ?? DEFAULT_FEE_CONFIG.oversizeSideCm,
    },
    source: "override",
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
  };
}

export async function saveFeeConfig(config: FeeConfig, updatedBy: string): Promise<void> {
  const db = await getDb();
  await db
    .insert(schema.settings)
    .values({ key: FEE_CONFIG_KEY, value: config, updatedBy, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value: config, updatedBy, updatedAt: new Date() },
    });
}

export async function resetFeeConfig(): Promise<void> {
  const db = await getDb();
  await db.delete(schema.settings).where(eq(schema.settings.key, FEE_CONFIG_KEY));
}
