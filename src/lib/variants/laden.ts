import { and, eq, desc } from "drizzle-orm";
import type { Db } from "@/db/client";
import { products, listingSnapshots, contentVersions } from "@/db/schema";
import { leseFreigegebenenContent, umfangAusPlan } from "./masterActions";
import type { ContentMaster } from "./master";

/**
 * Content-Pieces, die im Familien-Baum je ASIN als Häkchen angezeigt werden (D236).
 * Reihenfolge = Anzeigereihenfolge.
 */
export const TREE_PIECES = ["title", "bullets", "description", "backend_keywords", "qa"] as const;
export type TreePiece = (typeof TREE_PIECES)[number];
export const TREE_PIECE_LABEL: Record<TreePiece, string> = {
  title: "Titel",
  bullets: "Bullet Points",
  description: "Beschreibung",
  backend_keywords: "Backend-Keywords",
  qa: "Q&A",
};
/**
 * Bausteine, die die Master-Propagierung STRUKTURELL abdecken kann. Der wirklich
 * propagierte Umfang ergibt sich zusätzlich aus dem Content-Plan des Parents
 * (D257/D258) — siehe `FamilienDaten.plan`. Backend-Keywords und Q&A werden
 * bewusst nicht kopiert: sie sind je Variante eigenständig.
 */
export const PROPAGIERBARE_PIECES: TreePiece[] = ["title", "bullets", "description"];
export type PieceStatus = "approved" | "draft" | "none";

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
  marketplace: string; // für den „auf Amazon öffnen"-Link (D241)
  titel: string | null;
  bildUrl: string | null; // Hauptbild (Thumbnail in der Familien-Tabelle, D231)
  axisValues: Record<string, string>;
  hatFreigegebenenContent: boolean;
  istKopf: boolean; // true = Representative (Parent, der zugleich kaufbare Variante ist)
  /** Status je Content-Piece — Basis der Häkchen im Familien-Baum (D236). */
  pieces: Record<TreePiece, PieceStatus>;
};

/** Status jedes Tree-Pieces eines Produkts: freigegeben > Entwurf > nichts. */
async function lesePieceStatus(db: Db, productId: string): Promise<Record<TreePiece, PieceStatus>> {
  const versions = await db.query.contentVersions.findMany({
    where: eq(contentVersions.productId, productId),
    orderBy: desc(contentVersions.createdAt),
  });
  const status = (t: TreePiece): PieceStatus => {
    const rel = versions.filter((v) => v.type === t);
    if (rel.some((v) => v.status === "approved")) return "approved";
    return rel.length > 0 ? "draft" : "none";
  };
  return Object.fromEntries(TREE_PIECES.map((p) => [p, status(p)])) as Record<TreePiece, PieceStatus>;
}
/** Content-Plan → propagierte Tree-Pieces (D258). Kein Plan ⇒ alles Propagierbare. */
export function propagierterUmfang(plan: readonly string[] | null | undefined): TreePiece[] {
  if (!plan || plan.length === 0) return [...PROPAGIERBARE_PIECES];
  const gewaehlt = new Set(plan);
  const treffer = PROPAGIERBARE_PIECES.filter((p) => gewaehlt.has(p));
  return treffer.length > 0 ? treffer : [...PROPAGIERBARE_PIECES];
}

export type FamilienDaten = {
  parentId: string;
  brandId: string;
  name: string;
  theme: string[];
  istContainer: boolean;
  hatMaster: boolean;
  master: ContentMaster | null;
  /**
   * Tatsächlich propagierter Umfang (D258): Content-Plan des Parents ∩ strukturell
   * propagierbare Bausteine. Steuert die Häkchen im Baum — vorher stand dort eine
   * fest verdrahtete Liste, unabhängig davon, was der Nutzer wollte.
   */
  plan: TreePiece[];
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

  // Base-Tauglichkeit gegen den PLAN prüfen (D258): Wer keine Beschreibung geplant
  // hat, soll eine Variante mit Titel+Bullets als „freigegeben" sehen.
  const umfangPlan = umfangAusPlan(parent.contentPlan);
  const kinder: FamilienKind[] = [];
  for (const k of varianten) {
    const content = await leseFreigegebenenContent(db, k.id, umfangPlan);
    kinder.push({
      id: k.id,
      asin: k.asin,
      name: k.name,
      marketplace: k.marketplace,
      titel: snaps.get(k.id)?.titel ?? (k.name && k.name !== k.asin ? k.name : null),
      bildUrl: snaps.get(k.id)?.bildUrl ?? null,
      axisValues: k.variantAxisValues ?? {},
      hatFreigegebenenContent: !!content,
      istKopf: k.id === parentId,
      pieces: await lesePieceStatus(db, k.id),
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
    plan: propagierterUmfang(parent.contentPlan),
    kinder,
  };
}

