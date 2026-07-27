import { eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { products } from "@/db/schema";
import { pruefeFamilie, type FamilieVerstoss, type FamilieKontraktInput } from "./family";

/**
 * Manuelles Gruppieren geladener ASINs zu einer Variations-Familie (D221).
 *
 * Der Fundament-Pfad, unabhängig von jeder Quelle: geladene Produkte (standalone)
 * werden zu Parent + Childs verknüpft. Parent entsteht wahlweise als nicht-kaufbarer
 * Container (Default) oder aus einer bereits importierten Parent-ASIN (Nutzer-Wahl 27.07.).
 * Genau diese Felder befüllen später Scraper/SP-API vor — EIN Pfad, kein Doppelbau.
 *
 * Kern-Funktion (testbar, nimmt `db`): validiert Envelope (D183) + Familien-Kontrakt
 * und schreibt in einer Transaktion — nie eine halb angelegte Familie.
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

/** Envelope-Validierung (D183): FORM des Inputs prüfen, bevor irgendetwas dereferenziert wird. */
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
  return null;
}

export async function gruppiereZuFamilieKern(db: Db, input: GruppierenInput): Promise<GruppierenErgebnis> {
  const envelopeFehler = pruefeEnvelope(input);
  if (envelopeFehler) return { ok: false, fehler: envelopeFehler };

  const kinderIds = input.children.map((c) => c.productId);
  if (kinderIds.length === 0) return { ok: false, fehler: "Keine Childs angegeben." };
  if (new Set(kinderIds).size !== kinderIds.length) return { ok: false, fehler: "Ein Produkt ist doppelt als Child gelistet." };

  const alleIds = input.parent.modus === "vorhanden" ? [...kinderIds, input.parent.productId] : kinderIds;
  const geladen = await db.query.products.findMany({ where: inArray(products.id, alleIds) });
  const byId = new Map(geladen.map((p) => [p.id, p]));

  // Existenz + Marke + Rolle je Child. Nur STANDALONE-Produkte dürfen gruppiert
  // werden — ein bereits verknüpftes Child würde sonst kommentarlos umgehängt und
  // ließe seine Alt-Familie verwaist zurück (Re-Grouping-Bug). Erst auflösen.
  for (const c of input.children) {
    const prod = byId.get(c.productId);
    if (!prod) return { ok: false, fehler: `Produkt ${c.productId} nicht gefunden.` };
    if (prod.brandId !== input.brandId) return { ok: false, fehler: `Produkt ${c.productId} gehört nicht zu dieser Marke.` };
    if (prod.variantRole !== "standalone")
      return { ok: false, fehler: `Produkt ${c.productId} ist bereits Teil einer Familie (${prod.variantRole}) — erst auflösen.` };
    if (!prod.asin || !prod.asin.trim())
      return { ok: false, fehler: `Produkt ${c.productId} hat keine ASIN — kaufbare Varianten brauchen eine ASIN.` };
  }

  // Eine Familie lebt in EINEM Marktplatz und trägt EINE Marke
  const marktplaetze = new Set(input.children.map((c) => byId.get(c.productId)!.marketplace));
  if (marktplaetze.size > 1) return { ok: false, fehler: "Alle Childs müssen denselben Marktplatz haben." };
  const marketplace = [...marktplaetze][0];
  const marken = new Set(input.children.map((c) => (byId.get(c.productId)!.marke ?? "").trim()).filter(Boolean));
  if (marken.size > 1) return { ok: false, fehler: "Alle Childs müssen dieselbe Marke haben." };

  // Parent auflösen (Container später anlegen; vorhandenen jetzt prüfen)
  let parentAsin: string | null = null;
  let vorhandenerParentId: string | null = null;
  if (input.parent.modus === "vorhanden") {
    const vp = byId.get(input.parent.productId);
    if (!vp) return { ok: false, fehler: "Parent-Produkt nicht gefunden." };
    if (vp.brandId !== input.brandId) return { ok: false, fehler: "Parent gehört nicht zu dieser Marke." };
    if (vp.marketplace !== marketplace) return { ok: false, fehler: "Parent hat einen anderen Marktplatz als die Childs." };
    if (vp.variantRole !== "standalone") return { ok: false, fehler: "Der gewählte Parent ist bereits Teil einer Familie — erst auflösen." };
    if (kinderIds.includes(vp.id)) return { ok: false, fehler: "Parent darf nicht zugleich ein Child sein." };
    parentAsin = vp.asin ?? null;
    vorhandenerParentId = vp.id;
  }

  // Familien-Kontrakt (D183) — dieselbe Grenze wie für Scraper/SP-API-Prefill
  const kontrakt: FamilieKontraktInput = {
    parentAsin,
    variationTheme: input.theme,
    children: input.children.map((c) => ({ asin: byId.get(c.productId)!.asin ?? "", axisValues: c.axisValues, productId: c.productId })),
  };
  const verstoesse = pruefeFamilie(kontrakt);
  if (verstoesse.length > 0) return { ok: false, fehler: "Familien-Kontrakt verletzt.", verstoesse };

  const marke = [...marken][0] ?? null;

  const parentId = await db.transaction(async (tx) => {
    let pid: string;
    if (input.parent.modus === "container") {
      pid = uuid();
      await tx.insert(products).values({
        id: pid,
        brandId: input.brandId,
        name: input.parent.name.trim() || `${marke ?? "Familie"} (Parent)`,
        marke,
        asin: null, // nicht kaufbar; wird erst bei Publish/SP-API real
        marketplace,
        variantRole: "parent",
        variantParentContainer: true, // vom Tool angelegt → beim Auflösen löschen
        variationTheme: input.theme,
      });
    } else {
      pid = vorhandenerParentId!;
      await tx
        .update(products)
        .set({ variantRole: "parent", variantParentContainer: false, variationTheme: input.theme, parentProductId: null, variantAxisValues: null })
        .where(eq(products.id, pid));
    }
    for (const c of input.children) {
      await tx
        .update(products)
        .set({ variantRole: "child", parentProductId: pid, variantAxisValues: c.axisValues })
        .where(eq(products.id, c.productId));
    }
    return pid;
  });

  return { ok: true, parentId };
}

/**
 * Familie auflösen: alle Childs zurück auf standalone. Weil `PRAGMA foreign_keys`
 * aus ist (D221), setzt DIESE Funktion die Verweise explizit zurück. Ob der Parent
 * gelöscht (Tool-Container) oder nur zurückgesetzt wird (designierte ASIN), steht
 * EXPLIZIT in `variantParentContainer` — nicht aus asin==null geraten (Datenverlust-Fix).
 */
export async function loeseFamilieAufKern(db: Db, parentId: string): Promise<{ ok: boolean; fehler?: string }> {
  const parent = await db.query.products.findFirst({ where: eq(products.id, parentId) });
  if (!parent) return { ok: false, fehler: "Parent nicht gefunden." };
  if (parent.variantRole !== "parent") return { ok: false, fehler: "Produkt ist kein Parent." };
  const kinder = await db.query.products.findMany({ where: eq(products.parentProductId, parentId) });

  await db.transaction(async (tx) => {
    for (const k of kinder)
      await tx
        .update(products)
        .set({ variantRole: "standalone", parentProductId: null, variantAxisValues: null })
        .where(eq(products.id, k.id));
    if (parent.variantParentContainer) {
      await tx.delete(products).where(eq(products.id, parentId)); // Tool-Container entfernen
    } else {
      await tx
        .update(products)
        .set({ variantRole: "standalone", variationTheme: null, contentMaster: null })
        .where(eq(products.id, parentId));
    }
  });
  return { ok: true };
}
