import { and, eq, desc } from "drizzle-orm";
import type { Db } from "@/db/client";
import { products, listingSnapshots } from "@/db/schema";
import { leseFreigegebenenContent } from "./masterActions";
import type { ContentMaster } from "./master";

/**
 * Lade-Helfer für die Variations-Familien-UI (D221). Reine Funktionen (nehmen `db`),
 * aus Server-Komponenten via getDb() aufrufbar.
 */

/** Aktuellster Snapshot je Produkt: Live-Titel + Hauptbild — für Anzeige neben der ASIN. */
async function snapMap(db: Db, produktIds: string[]): Promise<Map<string, { titel: string | null; bildUrl: string | null }>> {
  const map = new Map<string, { titel: string | null; bildUrl: string | null }>();
  for (const pid of produktIds) {
    const snap = await db.query.listingSnapshots.findFirst({
      where: eq(listingSnapshots.productId, pid),
      orderBy: desc(listingSnapshots.createdAt),
    });
    map.set(pid, { titel: snap?.title ?? null, bildUrl: snap?.imageUrls?.[0] ?? null });
  }
  return map;
}

export type GruppierbaresProdukt = { id: string; asin: string | null; name: string; titel: string | null; marke: string | null; marketplace: string };

/** Standalone-Produkte einer Marke — die einzigen, die zu einer Familie gruppierbar sind. */
export async function ladeGruppierbar(db: Db, brandId: string): Promise<GruppierbaresProdukt[]> {
  const rows = await db.query.products.findMany({
    where: and(eq(products.brandId, brandId), eq(products.variantRole, "standalone")),
  });
  const snaps = await snapMap(db, rows.map((r) => r.id));
  return rows.map((p) => ({
    id: p.id,
    asin: p.asin,
    name: p.name,
    // Titel = Live-Titel; Fallback name, aber nur wenn er nicht bloß die ASIN ist.
    titel: snaps.get(p.id)?.titel ?? (p.name && p.name !== p.asin ? p.name : null),
    marke: p.marke,
    marketplace: p.marketplace,
  }));
}

export type FamilienKind = {
  id: string;
  asin: string | null;
  name: string;
  titel: string | null;
  bildUrl: string | null; // Hauptbild (Thumbnail in der Familien-Tabelle, D231)
  axisValues: Record<string, string>;
  hatFreigegebenenContent: boolean;
  istKopf: boolean; // true = Representative (Parent, der zugleich kaufbare Variante ist)
};
export type FamilienDaten = {
  parentId: string;
  brandId: string;
  name: string;
  theme: string[];
  istContainer: boolean;
  hatMaster: boolean;
  master: ContentMaster | null;
  kinder: FamilienKind[];
};

/** Vollständige Familie eines Parents — Basis der Master-Freigabe-UI. */
export async function ladeFamilie(db: Db, parentId: string): Promise<FamilienDaten | null> {
  const parent = await db.query.products.findFirst({ where: eq(products.id, parentId) });
  if (!parent || parent.variantRole !== "parent") return null;

  const childRows = await db.query.products.findMany({ where: eq(products.parentProductId, parentId) });
  // Representative-Parent ist selbst eine kaufbare Variante → als Kopf-Kind mit anzeigen.
  const varianten = parent.variantParentContainer ? childRows : [parent, ...childRows];
  const snaps = await snapMap(db, varianten.map((v) => v.id));

  const kinder: FamilienKind[] = [];
  for (const k of varianten) {
    const content = await leseFreigegebenenContent(db, k.id);
    kinder.push({
      id: k.id,
      asin: k.asin,
      name: k.name,
      titel: snaps.get(k.id)?.titel ?? (k.name && k.name !== k.asin ? k.name : null),
      bildUrl: snaps.get(k.id)?.bildUrl ?? null,
      axisValues: k.variantAxisValues ?? {},
      hatFreigegebenenContent: !!content,
      istKopf: k.id === parentId,
    });
  }
  return {
    parentId,
    brandId: parent.brandId,
    name: parent.name,
    theme: parent.variationTheme ?? [],
    istContainer: parent.variantParentContainer,
    hatMaster: !!parent.contentMaster,
    master: parent.contentMaster ?? null,
    kinder,
  };
}

