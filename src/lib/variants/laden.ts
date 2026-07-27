import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { products } from "@/db/schema";
import { leseFreigegebenenContent } from "./masterActions";
import type { ContentMaster } from "./master";

/**
 * Lade-Helfer für die Variations-Familien-UI (D221). Reine Funktionen (nehmen `db`),
 * aus Server-Komponenten via getDb() aufrufbar.
 */

export type GruppierbaresProdukt = { id: string; asin: string | null; name: string; marke: string | null; marketplace: string };

/** Standalone-Produkte einer Marke — die einzigen, die zu einer Familie gruppierbar sind. */
export async function ladeGruppierbar(db: Db, brandId: string): Promise<GruppierbaresProdukt[]> {
  const rows = await db.query.products.findMany({
    where: and(eq(products.brandId, brandId), eq(products.variantRole, "standalone")),
  });
  return rows.map((p) => ({ id: p.id, asin: p.asin, name: p.name, marke: p.marke, marketplace: p.marketplace }));
}

export type FamilienUebersichtEintrag = { id: string; name: string; theme: string[]; hatMaster: boolean; kinderAnzahl: number };

/** Bestehende Familien (Parents) einer Marke — für den Katalog-Überblick. */
export async function ladeFamilienUebersicht(db: Db, brandId: string): Promise<FamilienUebersichtEintrag[]> {
  const parents = await db.query.products.findMany({
    where: and(eq(products.brandId, brandId), eq(products.variantRole, "parent")),
  });
  const out: FamilienUebersichtEintrag[] = [];
  for (const p of parents) {
    const kinder = await db.query.products.findMany({ where: eq(products.parentProductId, p.id) });
    out.push({ id: p.id, name: p.name, theme: p.variationTheme ?? [], hatMaster: !!p.contentMaster, kinderAnzahl: kinder.length });
  }
  return out;
}

export type FamilienKind = { id: string; asin: string | null; name: string; axisValues: Record<string, string>; hatFreigegebenenContent: boolean };
export type FamilienDaten = {
  parentId: string;
  name: string;
  theme: string[];
  hatMaster: boolean;
  master: ContentMaster | null;
  kinder: FamilienKind[];
};

/** Vollständige Familie eines Parents — Basis der Master-Freigabe-UI. */
export async function ladeFamilie(db: Db, parentId: string): Promise<FamilienDaten | null> {
  const parent = await db.query.products.findFirst({ where: eq(products.id, parentId) });
  if (!parent || parent.variantRole !== "parent") return null;
  const kinderRows = await db.query.products.findMany({ where: eq(products.parentProductId, parentId) });
  const kinder: FamilienKind[] = [];
  for (const k of kinderRows) {
    const content = await leseFreigegebenenContent(db, k.id);
    kinder.push({
      id: k.id,
      asin: k.asin,
      name: k.name,
      axisValues: k.variantAxisValues ?? {},
      hatFreigegebenenContent: !!content,
    });
  }
  return {
    parentId,
    name: parent.name,
    theme: parent.variationTheme ?? [],
    hatMaster: !!parent.contentMaster,
    master: parent.contentMaster ?? null,
    kinder,
  };
}
