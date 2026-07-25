import { and, eq, inArray, desc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { revalidatePath } from "next/cache";
import {
  AENDERBARE_REGELN,
  SETTINGS_KEY_OVERRIDES,
  SETTINGS_KEY_HISTORIE,
  standardWert,
  wirksameRegeln,
  wirksamerWert,
  pruefeInhalteGegenRegeln,
  type RegelAenderung,
  type RegelOverrides,
  type ZuPruefendesProdukt,
} from "./regelstand";

/**
 * Datenbank-Seite des Regel-Stands: laden und prüfen.
 * Bewusst KEINE Server-Action-Datei — diese Funktionen sind Abfragen, keine
 * Endpunkte, und sollen nicht von außen aufrufbar sein.
 */

const id = () => crypto.randomUUID();

export async function ladeRegelOverrides(): Promise<RegelOverrides> {
  const db = await getDb();
  const row = await db.query.settings.findFirst({ where: eq(schema.settings.key, SETTINGS_KEY_OVERRIDES) });
  return (row?.value as RegelOverrides) ?? {};
}

export async function ladeRegelHistorie(): Promise<RegelAenderung[]> {
  const db = await getDb();
  const row = await db.query.settings.findFirst({ where: eq(schema.settings.key, SETTINGS_KEY_HISTORIE) });
  return ((row?.value as RegelAenderung[]) ?? []).slice().reverse();
}

/**
 * Regel ändern, protokollieren und sofort alle betreuten Marken durchprüfen.
 * Quelle ist Pflicht — eine Grenze ohne Herkunft ist eine Behauptung.
 */

export async function pruefeAlleMarken(): Promise<number> {
  const db = await getDb();
  const regeln = wirksameRegeln(await ladeRegelOverrides());
  const marken = await db.query.brands.findMany();
  let gesamt = 0;

  for (const marke of marken) {
    const produkte = await db.query.products.findMany({ where: eq(schema.products.brandId, marke.id) });
    const pids = produkte.map((p) => p.id);
    if (!pids.length) continue;

    const versionen = await db.query.contentVersions.findMany({
      where: inArray(schema.contentVersions.productId, pids),
      orderBy: desc(schema.contentVersions.createdAt),
    });
    const freigegeben = (pid: string, typ: string) =>
      versionen.find((v) => v.productId === pid && v.type === typ && v.status !== "draft")?.payload as
        | Record<string, unknown>
        | undefined;

    const zuPruefen: ZuPruefendesProdukt[] = produkte.map((p) => ({
      id: p.id,
      name: p.name,
      title: (freigegeben(p.id, "title")?.text as string) ?? null,
      bullets: ((freigegeben(p.id, "bullets")?.items as string[]) ?? []).filter(Boolean),
      description: (freigegeben(p.id, "description")?.text as string) ?? null,
      backendKeywords: (freigegeben(p.id, "backend_keywords")?.text as string) ?? null,
      itemHighlights: (freigegeben(p.id, "item_highlights")?.text as string) ?? null,
    }));

    const verstoesse = pruefeInhalteGegenRegeln(zuPruefen, regeln);
    gesamt += verstoesse.length;

    const offene = await db.query.contentAlerts.findMany({
      where: and(eq(schema.contentAlerts.brandId, marke.id), eq(schema.contentAlerts.status, "offen")),
    });

    // Alerts schließen, die nicht mehr zutreffen — etwa weil die Regel
    // zurückgenommen oder der Text gekürzt wurde. Ein Alert, der nicht mehr
    // stimmt, ist schlimmer als keiner: Er kostet Vertrauen in alle anderen.
    for (const o of offene.filter((a) => a.art === "regel_geaendert")) {
      const trifftNochZu = verstoesse.some(
        (v) => v.productId === o.productId && v.slot === o.slot && o.nachricht.includes(`[${v.alertKey}]`),
      );
      if (!trifftNochZu) {
        await db
          .update(schema.contentAlerts)
          .set({ status: "erledigt", erledigtAt: new Date() })
          .where(eq(schema.contentAlerts.id, o.id));
      }
    }

    for (const v of verstoesse) {
      // Nicht doppelt melden: gleiche Regel, gleicher Platz, gleiches Produkt.
      const schonDa = offene.some(
        (o) => o.productId === v.productId && o.art === "regel_geaendert" && o.slot === v.slot && o.nachricht.includes(`[${v.alertKey}]`),
      );
      if (schonDa) continue;
      await db.insert(schema.contentAlerts).values({
        id: id(),
        brandId: marke.id,
        productId: v.productId,
        art: "regel_geaendert",
        slot: v.slot,
        schwere: "hoch",
        nachricht: `${v.meldung} [${v.alertKey}]`,
      });
    }
    revalidatePath(`/marke/${marke.id}/publish/alerts`);
    revalidatePath(`/marke/${marke.id}/katalog`);
  }
  return gesamt;
}

/** Für die Anzeige: aktueller Wert je änderbarer Regel. */

export async function ladeRegelUebersicht() {
  const overrides = await ladeRegelOverrides();
  const regeln = wirksameRegeln(overrides);
  return AENDERBARE_REGELN.map((r) => ({
    key: r.key,
    label: r.label,
    einheit: r.einheit,
    standard: standardWert(r.key),
    wirksam: wirksamerWert(regeln, r.key),
    geaendert: r.key in overrides,
  }));
}

export const SETTINGS_KEY_WAECHTER = "regel_waechter";

/** Letztes Wächter-Ergebnis (Vorschläge, Hinweise, Zeitpunkt). */
export async function ladeWaechterStand() {
  const db = await getDb();
  const row = await db.query.settings.findFirst({ where: eq(schema.settings.key, SETTINGS_KEY_WAECHTER) });
  return (row?.value as import("./regelwaechter").WaechterErgebnis | undefined) ?? null;
}
