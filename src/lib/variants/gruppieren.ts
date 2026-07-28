import { eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { products } from "@/db/schema";
import { pruefeFamilie, type FamilieVerstoss, type FamilieKontraktInput } from "./family";

/**
 * Manuelles Gruppieren geladener ASINs zu einer Variations-Familie (D221).
 *
 * Zwei Parent-Modi (Nutzer-Korrektur 27.07.):
 *  - "container": Tool legt einen NICHT kaufbaren Container-Parent an (eigene Zeile, asin=null).
 *  - "vorhanden": eine der ausgewählten ASINs wird zum Familienkopf ERKLÄRT, bleibt dabei aber
 *    eine kaufbare + bearbeitbare Variante (Parent UND Child zugleich — wie Amazons Modell, wo
 *    eine Geschmacksrichtung den Parent bildet und trotzdem als Child kaufbar ist). Sie darf
 *    NIE aus dem System verschwinden.
 *
 * In BEIDEN Modi ist `children` die vollständige Variantenliste (inkl. des Representative);
 * jede Variante trägt ihre Achsenwerte. Der Kern validiert über den Familien-Kontrakt (D183)
 * und schreibt in einer Transaktion.
 */

const uuid = () => crypto.randomUUID();

export type ParentWahl =
  | { modus: "container"; name: string }
  | { modus: "vorhanden"; productId: string };

export type GruppierenInput = {
  brandId: string;
  parent: ParentWahl;
  theme: string[];
  children: Array<{ productId: string; axisValues: Record<string, string> }>;
};

export type GruppierenErgebnis =
  | { ok: true; parentId: string }
  | { ok: false; fehler: string; verstoesse?: FamilieVerstoss[] };

function pruefeEnvelope(input: GruppierenInput): string | null {
  if (!input || typeof input !== "object") return "Ungültige Eingabe.";
  if (typeof input.brandId !== "string" || !input.brandId.trim()) return "brandId fehlt.";
  if (!Array.isArray(input.theme)) return "theme muss ein Array sein.";
  if (!Array.isArray(input.children)) return "children muss ein Array sein.";
  const p = input.parent;
  if (!p || (p.modus !== "container" && p.modus !== "vorhanden")) return 'parent.modus muss "container" oder "vorhanden" sein.';
  if (p.modus === "container" && typeof p.name !== "string") return "Container-Parent braucht einen Namen.";
  if (p.modus === "vorhanden" && (typeof p.productId !== "string" || !p.productId.trim())) return "vorhandener Parent braucht eine productId.";
  for (const [i, c] of input.children.entries()) {
    if (!c || typeof c.productId !== "string" || !c.productId.trim()) return `children[${i}].productId fehlt.`;
    if (!c.axisValues || typeof c.axisValues !== "object" || Array.isArray(c.axisValues)) return `children[${i}].axisValues muss ein Objekt sein.`;
  }
  // Representative MUSS unter den Varianten sein (er ist auch Child).
  if (p.modus === "vorhanden" && !input.children.some((c) => c.productId === p.productId))
    return "Der als Parent gewählte Artikel muss auch als Variante ausgewählt sein (er ist Parent UND Child).";
  return null;
}

export async function gruppiereZuFamilieKern(db: Db, input: GruppierenInput): Promise<GruppierenErgebnis> {
  const envelopeFehler = pruefeEnvelope(input);
  if (envelopeFehler) return { ok: false, fehler: envelopeFehler };

  const kinderIds = input.children.map((c) => c.productId);
  if (kinderIds.length === 0) return { ok: false, fehler: "Keine Varianten angegeben." };
  if (new Set(kinderIds).size !== kinderIds.length) return { ok: false, fehler: "Eine Variante ist doppelt gelistet." };

  const geladen = await db.query.products.findMany({ where: inArray(products.id, kinderIds) });
  const byId = new Map(geladen.map((p) => [p.id, p]));

  // Nur STANDALONE-Produkte gruppierbar — sonst würde eine Alt-Familie verwaisen.
  for (const c of input.children) {
    const prod = byId.get(c.productId);
    if (!prod) return { ok: false, fehler: `Produkt ${c.productId} nicht gefunden.` };
    if (prod.brandId !== input.brandId) return { ok: false, fehler: `Produkt ${c.productId} gehört nicht zu dieser Marke.` };
    if (prod.variantRole !== "standalone")
      return { ok: false, fehler: `Produkt ${c.productId} ist bereits Teil einer Familie (${prod.variantRole}) — erst auflösen.` };
    if (!prod.asin || !prod.asin.trim())
      return { ok: false, fehler: `Produkt ${c.productId} hat keine ASIN — kaufbare Varianten brauchen eine ASIN.` };
  }

  const marktplaetze = new Set(input.children.map((c) => byId.get(c.productId)!.marketplace));
  if (marktplaetze.size > 1) return { ok: false, fehler: "Alle Varianten müssen denselben Marktplatz haben." };
  const marketplace = [...marktplaetze][0];
  const marken = new Set(input.children.map((c) => (byId.get(c.productId)!.marke ?? "").trim()).filter(Boolean));
  if (marken.size > 1) return { ok: false, fehler: "Alle Varianten müssen dieselbe Marke haben." };
  const marke = [...marken][0] ?? null;

  // Familien-Kontrakt (D183): alle Varianten (inkl. Representative). Kein separater
  // parentAsin — der Representative IST eine der Varianten, keine Kollision.
  const kontrakt: FamilieKontraktInput = {
    variationTheme: input.theme,
    children: input.children.map((c) => ({ asin: byId.get(c.productId)!.asin ?? "", axisValues: c.axisValues, productId: c.productId })),
  };
  const verstoesse = pruefeFamilie(kontrakt);
  if (verstoesse.length > 0) return { ok: false, fehler: "Familien-Kontrakt verletzt.", verstoesse };

  const axisFuer = (pid: string) => input.children.find((c) => c.productId === pid)!.axisValues;

  const parentId = await db.transaction(async (tx) => {
    if (input.parent.modus === "container") {
      const pid = uuid();
      await tx.insert(products).values({
        id: pid,
        brandId: input.brandId,
        name: input.parent.name.trim() || `${marke ?? "Familie"} (Parent)`,
        marke,
        asin: null, // nicht kaufbar; wird erst bei Publish/SP-API real
        marketplace,
        variantRole: "parent",
        variantParentContainer: true,
        variationTheme: input.theme,
      });
      for (const c of input.children)
        await tx.update(products).set({ variantRole: "child", parentProductId: pid, variantAxisValues: c.axisValues }).where(eq(products.id, c.productId));
      return pid;
    }

    // "vorhanden": Representative wird Kopf UND bleibt kaufbare Variante.
    const repId = input.parent.productId;
    await tx
      .update(products)
      .set({ variantRole: "parent", variantParentContainer: false, variationTheme: input.theme, parentProductId: null, variantAxisValues: axisFuer(repId) })
      .where(eq(products.id, repId));
    for (const c of input.children) {
      if (c.productId === repId) continue; // Representative ist der Kopf, kein eigener Child-Verweis
      await tx.update(products).set({ variantRole: "child", parentProductId: repId, variantAxisValues: c.axisValues }).where(eq(products.id, c.productId));
    }
    return repId;
  });

  return { ok: true, parentId };
}

/**
 * Familie auflösen: alle Varianten zurück auf standalone. Ein Tool-Container
 * (variantParentContainer=true) wird gelöscht; ein Representative-Parent
 * (=false) wird nur zurückgesetzt und bleibt als kaufbares Produkt erhalten.
 */
export async function loeseFamilieAufKern(db: Db, parentId: string): Promise<{ ok: boolean; fehler?: string }> {
  const parent = await db.query.products.findFirst({ where: eq(products.id, parentId) });
  if (!parent) return { ok: false, fehler: "Parent nicht gefunden." };
  if (parent.variantRole !== "parent") return { ok: false, fehler: "Produkt ist kein Parent." };
  const kinder = await db.query.products.findMany({ where: eq(products.parentProductId, parentId) });

  await db.transaction(async (tx) => {
    for (const k of kinder)
      await tx.update(products).set({ variantRole: "standalone", parentProductId: null, variantAxisValues: null }).where(eq(products.id, k.id));
    if (parent.variantParentContainer) {
      await tx.delete(products).where(eq(products.id, parentId)); // Tool-Container entfernen
    } else {
      await tx
        .update(products)
        .set({ variantRole: "standalone", variationTheme: null, contentMaster: null, variantAxisValues: null })
        .where(eq(products.id, parentId)); // Representative bleibt erhalten
    }
  });
  return { ok: true };
}

/**
 * Achsenwerte einer Familie nachträglich korrigieren (D233) — z. B. Tippfehler oder
 * ein zunächst leerer Parent-Achsenwert. GESPERRT, sobald ein Content-Master existiert:
 * danach hängt der Token-Tausch an den Werten, eine Änderung würde den Content desynchronisieren.
 * `werte`: productId → { achse: wert } (nur die geänderten Varianten müssen enthalten sein).
 */
export async function aktualisiereAchsenwerteKern(
  db: Db,
  parentId: string,
  werte: Record<string, Record<string, string>>,
): Promise<{ ok: true } | { ok: false; fehler: string; verstoesse?: FamilieVerstoss[] }> {
  const parent = await db.query.products.findFirst({ where: eq(products.id, parentId) });
  if (!parent || parent.variantRole !== "parent") return { ok: false, fehler: "Kein Parent." };
  if (parent.contentMaster) return { ok: false, fehler: "Achsenwerte gesperrt — es existiert bereits ein Content-Master. Erst Master zurücksetzen." };
  const theme = parent.variationTheme ?? [];
  if (theme.length === 0) return { ok: false, fehler: "Parent hat kein variationTheme." };

  const childRows = await db.query.products.findMany({ where: eq(products.parentProductId, parentId) });
  const varianten = parent.variantParentContainer ? childRows : [parent, ...childRows];

  // Zusammengeführte Achsenwerte je Variante (bestehende + geänderte) gegen den Kontrakt prüfen.
  const zusammengefuehrt = new Map(varianten.map((v) => [v.id, { ...(v.variantAxisValues ?? {}), ...(werte[v.id] ?? {}) }]));
  const verstoesse = pruefeFamilie({
    variationTheme: theme,
    children: varianten.map((v) => ({ asin: v.asin ?? "", axisValues: zusammengefuehrt.get(v.id)!, productId: v.id })),
  });
  if (verstoesse.length > 0) return { ok: false, fehler: "Achsenwerte verletzen den Familien-Kontrakt.", verstoesse };

  await db.transaction(async (tx) => {
    for (const v of varianten)
      await tx.update(products).set({ variantAxisValues: zusammengefuehrt.get(v.id)! }).where(eq(products.id, v.id));
  });
  return { ok: true };
}
