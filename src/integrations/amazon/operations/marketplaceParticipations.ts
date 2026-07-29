/**
 * Marktplatz-Teilnahmen lesen und speichern (D263) — die erste echte
 * SP-API-Operation und zugleich der Beweis, dass die Kette trägt:
 * Autorisierung → Token → Aufruf → Normalisierung → Persistenz → Audit.
 *
 * Quelle: `GET /sellers/v1/marketplaceParticipations`, Rolle „Selling Partner
 * Insights". Antwortform laut SP-API:
 *
 *   { payload: [ { marketplace: { id, countryCode, name, defaultCurrencyCode,
 *                                defaultLanguageCode, domainName },
 *                  participation: { isParticipating, hasSuspendedListings } } ] }
 *
 * D183 (Daten-Kontrakte): Die Antwort wird an der Grenze VALIDIERT, nicht
 * gehofft. Einträge ohne Marketplace-ID oder Ländercode werden verworfen und
 * gezählt, statt halb gefüllte Zeilen zu schreiben — ein fehlender Wert wird
 * nie geschätzt (D114/D115).
 */

import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { spApiAufruf, type SpApiOptionen } from "../clients/spApiClient";
import { schreibeAuditLog } from "../audit";

/** Normalisierter Marktplatz-Eintrag — das Zwischenformat, das Code füllt. */
export type MarktplatzTeilnahme = {
  marketplaceId: string;
  countryCode: string;
  name: string;
  defaultCurrency: string | null;
  defaultLanguage: string | null;
  isParticipating: boolean;
  hasSuspendedListings: boolean;
};

export type TeilnahmeErgebnis = {
  teilnahmen: MarktplatzTeilnahme[];
  /** Wie viele Einträge Amazon lieferte, die den Kontrakt nicht erfüllten. */
  verworfen: number;
  amazonRequestId: string | null;
};

type RohEintrag = {
  marketplace?: {
    id?: unknown;
    countryCode?: unknown;
    name?: unknown;
    defaultCurrencyCode?: unknown;
    defaultLanguageCode?: unknown;
  };
  participation?: { isParticipating?: unknown; hasSuspendedListings?: unknown };
};

const text = (w: unknown): string | null => (typeof w === "string" && w.trim() ? w.trim() : null);
const wahr = (w: unknown): boolean => w === true;

/**
 * Rohantwort → geprüfte Einträge. Bewusst als reine Funktion: so ist der
 * Kontrakt ohne Netz und ohne Datenbank testbar.
 */
export function normalisiereTeilnahmen(roh: unknown): { teilnahmen: MarktplatzTeilnahme[]; verworfen: number } {
  const liste = (roh as { payload?: unknown } | null)?.payload;
  if (!Array.isArray(liste)) return { teilnahmen: [], verworfen: 0 };

  const teilnahmen: MarktplatzTeilnahme[] = [];
  let verworfen = 0;

  for (const eintrag of liste as RohEintrag[]) {
    const marketplaceId = text(eintrag?.marketplace?.id);
    const countryCode = text(eintrag?.marketplace?.countryCode);
    if (!marketplaceId || !countryCode) {
      verworfen++;
      continue;
    }
    teilnahmen.push({
      marketplaceId,
      countryCode,
      // Ohne Namen den Ländercode nehmen statt zu raten — die Spalte ist NOT NULL,
      // und ein leerer Anzeigename wäre in der Oberfläche schlimmer als "DE".
      name: text(eintrag?.marketplace?.name) ?? countryCode,
      defaultCurrency: text(eintrag?.marketplace?.defaultCurrencyCode),
      defaultLanguage: text(eintrag?.marketplace?.defaultLanguageCode),
      isParticipating: wahr(eintrag?.participation?.isParticipating),
      hasSuspendedListings: wahr(eintrag?.participation?.hasSuspendedListings),
    });
  }
  return { teilnahmen, verworfen };
}

/** Marktplatz-Teilnahmen bei Amazon abrufen (lesend, verändert dort nichts). */
export async function getMarketplaceParticipations(
  args: { clientId: string; connectionId: string },
  optionen: SpApiOptionen = {},
): Promise<TeilnahmeErgebnis> {
  const { daten, amazonRequestId } = await spApiAufruf<unknown>(
    { ...args, pfad: "/sellers/v1/marketplaceParticipations" },
    optionen,
  );
  const { teilnahmen, verworfen } = normalisiereTeilnahmen(daten);
  return { teilnahmen, verworfen, amazonRequestId };
}

/**
 * Teilnahmen speichern. Upsert je (connectionId, marketplaceId) — ein zweiter
 * Sync darf keine Dubletten erzeugen, und `lastSyncedAt` soll auch dann
 * hochgezählt werden, wenn sich inhaltlich nichts geändert hat (sonst sieht die
 * Oberfläche „nie synchronisiert" aus, obwohl es lief).
 */
export async function saveMarketplaceParticipations(args: {
  clientId: string;
  connectionId: string;
  teilnahmen: MarktplatzTeilnahme[];
  userId?: string | null;
  amazonRequestId?: string | null;
}): Promise<{ gespeichert: number }> {
  const db = await getDb();
  const jetzt = new Date();

  const vorher = await db.query.amazonMarketplaces.findMany({
    where: eq(schema.amazonMarketplaces.connectionId, args.connectionId),
  });

  for (const t of args.teilnahmen) {
    const bestehend = vorher.find((v) => v.marketplaceId === t.marketplaceId);
    if (bestehend) {
      await db
        .update(schema.amazonMarketplaces)
        .set({
          countryCode: t.countryCode,
          name: t.name,
          defaultCurrency: t.defaultCurrency,
          defaultLanguage: t.defaultLanguage,
          isParticipating: t.isParticipating,
          hasSuspendedListings: t.hasSuspendedListings,
          lastSyncedAt: jetzt,
          updatedAt: jetzt,
        })
        .where(
          and(
            eq(schema.amazonMarketplaces.connectionId, args.connectionId),
            eq(schema.amazonMarketplaces.marketplaceId, t.marketplaceId),
          ),
        );
    } else {
      await db.insert(schema.amazonMarketplaces).values({
        id: crypto.randomUUID(),
        connectionId: args.connectionId,
        marketplaceId: t.marketplaceId,
        countryCode: t.countryCode,
        name: t.name,
        defaultCurrency: t.defaultCurrency,
        defaultLanguage: t.defaultLanguage,
        isParticipating: t.isParticipating,
        hasSuspendedListings: t.hasSuspendedListings,
        lastSyncedAt: jetzt,
      });
    }
  }

  await schreibeAuditLog({
    action: "amazon.marketplaces.synced",
    entityType: "amazon_connection",
    entityId: args.connectionId,
    clientId: args.clientId,
    connectionId: args.connectionId,
    userId: args.userId ?? null,
    vorher: { anzahl: vorher.length, ids: vorher.map((v) => v.marketplaceId) },
    nachher: { anzahl: args.teilnahmen.length, ids: args.teilnahmen.map((t) => t.marketplaceId) },
    amazonRequestId: args.amazonRequestId ?? null,
  });

  return { gespeichert: args.teilnahmen.length };
}

/** Gespeicherte Marktplätze einer Verbindung — für die Oberfläche. */
export async function ladeMarktplaetze(connectionId: string) {
  const db = await getDb();
  return db.query.amazonMarketplaces.findMany({
    where: eq(schema.amazonMarketplaces.connectionId, connectionId),
  });
}
