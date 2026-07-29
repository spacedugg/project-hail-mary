/**
 * Zugriffsschicht für Amazon-Verbindungen (D263) — und der Ort, an dem die
 * Mandantentrennung DURCHGESETZT wird.
 *
 * Warum hier und nicht per Row Level Security: Das Tool spricht Postgres über
 * eine Direktverbindung als Tabellen-Eigentümer an, und der umgeht RLS-Policies.
 * Policies wären wirkungslos, würden aber Sicherheit suggerieren (D262). Also
 * gilt: JEDER Weg zu einer Verbindung führt durch dieses Modul, und jede
 * Funktion hier verlangt die `clientId` als Pflichtargument — nicht als Filter,
 * den man vergessen kann, sondern als Teil der Signatur.
 *
 * Zweite Regel: `encryptedRefreshToken` und `tokenFingerprint` verlassen dieses
 * Modul nicht. Alles, was nach außen geht, läuft durch `oeffentlicheSicht()`.
 */

import { and, eq, isNull, desc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { AmazonConnectionStatus, AmazonRegion } from "@/db/schema";
import { entschluessele } from "../auth/tokenCrypto";

/** Was die Oberfläche und jede API-Antwort sehen darf — bewusst ohne Token-Felder. */
export type VerbindungSicht = {
  id: string;
  clientId: string;
  label: string | null;
  sellingPartnerId: string | null;
  region: AmazonRegion;
  status: AmazonConnectionStatus;
  hatToken: boolean;
  authorizedAt: Date | null;
  reauthorizationDueAt: Date | null;
  revokedAt: Date | null;
  lastSuccessAt: Date | null;
  lastErrorAt: Date | null;
  lastErrorCode: string | null;
  archivedAt: Date | null;
};

type VerbindungZeile = typeof schema.amazonConnections.$inferSelect;

export class VerbindungFehler extends Error {
  constructor(
    readonly grund: "nicht_gefunden" | "fremder_mandant" | "nicht_aktiv" | "kein_token",
    message: string,
  ) {
    super(message);
    this.name = "VerbindungFehler";
  }
}

/**
 * Datenbankzeile → nach außen zeigbare Sicht. `hatToken` ersetzt den Token
 * selbst: die Oberfläche muss wissen, OB autorisiert wurde, nie WOMIT.
 */
export function oeffentlicheSicht(zeile: VerbindungZeile): VerbindungSicht {
  return {
    id: zeile.id,
    clientId: zeile.clientId,
    label: zeile.label,
    sellingPartnerId: zeile.sellingPartnerId,
    region: zeile.region,
    status: zeile.status,
    hatToken: Boolean(zeile.encryptedRefreshToken),
    authorizedAt: zeile.authorizedAt,
    reauthorizationDueAt: zeile.reauthorizationDueAt,
    revokedAt: zeile.revokedAt,
    lastSuccessAt: zeile.lastSuccessAt,
    lastErrorAt: zeile.lastErrorAt,
    lastErrorCode: zeile.lastErrorCode,
    archivedAt: zeile.archivedAt,
  };
}

/** Alle nicht archivierten Verbindungen eines Kunden. */
export async function listeVerbindungen(clientId: string): Promise<VerbindungSicht[]> {
  const db = await getDb();
  const zeilen = await db.query.amazonConnections.findMany({
    where: and(
      eq(schema.amazonConnections.clientId, clientId),
      isNull(schema.amazonConnections.archivedAt),
    ),
    orderBy: [desc(schema.amazonConnections.createdAt)],
  });
  return zeilen.map(oeffentlicheSicht);
}

/**
 * Verbindung laden — **immer** über Kunde UND Verbindungs-ID. Eine geratene oder
 * durchgereichte connectionId eines fremden Kunden führt hier zu
 * „fremder_mandant" statt zu einem Treffer. Genau deshalb ist `clientId` kein
 * optionales Argument.
 */
async function ladeZeile(clientId: string, connectionId: string): Promise<VerbindungZeile> {
  const db = await getDb();
  const zeile = await db.query.amazonConnections.findFirst({
    where: eq(schema.amazonConnections.id, connectionId),
  });
  if (!zeile) {
    throw new VerbindungFehler("nicht_gefunden", "Diese Amazon-Verbindung existiert nicht.");
  }
  if (zeile.clientId !== clientId) {
    // Absichtlich dieselbe Meldung wie „nicht gefunden": ob eine fremde ID
    // existiert, ist selbst schon eine Information.
    throw new VerbindungFehler("fremder_mandant", "Diese Amazon-Verbindung existiert nicht.");
  }
  return zeile;
}

/** Öffentliche Sicht einer einzelnen Verbindung. */
export async function ladeVerbindung(clientId: string, connectionId: string): Promise<VerbindungSicht> {
  return oeffentlicheSicht(await ladeZeile(clientId, connectionId));
}

/**
 * Der Torwächter vor JEDEM Amazon-Aufruf: liefert den entschlüsselten Refresh
 * Token — aber nur, wenn die Verbindung dem Kunden gehört, aktiv, nicht
 * archiviert und nicht widerrufen ist.
 *
 * Die Reihenfolge der Prüfungen ist Absicht: Mandant zuerst, dann Zustand, dann
 * Token. Nach einem `disconnectVerbindung` ist hier per Konstruktion Endstation,
 * weil sowohl Status als auch Token-Spalte geleert wurden — es gibt keinen Pfad,
 * der eine getrennte Verbindung „aus Versehen" wiederbelebt.
 */
export async function holeRefreshTokenFuerAufruf(
  clientId: string,
  connectionId: string,
): Promise<{ zeile: VerbindungZeile; refreshToken: string }> {
  const zeile = await ladeZeile(clientId, connectionId);

  if (zeile.archivedAt || zeile.revokedAt) {
    throw new VerbindungFehler(
      "nicht_aktiv",
      "Diese Amazon-Verbindung ist getrennt. Für neue Aufrufe muss der Kunde erneut autorisieren.",
    );
  }
  if (zeile.status !== "active" && zeile.status !== "error") {
    throw new VerbindungFehler(
      "nicht_aktiv",
      zeile.status === "reauthorization_required"
        ? "Diese Amazon-Verbindung muss erneut autorisiert werden."
        : "Diese Amazon-Verbindung ist noch nicht autorisiert.",
    );
  }
  if (!zeile.encryptedRefreshToken) {
    throw new VerbindungFehler("kein_token", "Für diese Amazon-Verbindung liegt keine Autorisierung vor.");
  }

  return { zeile, refreshToken: entschluessele(zeile.encryptedRefreshToken) };
}

/** Neue, noch nicht autorisierte Verbindung anlegen (Status „pending"). */
export async function erstelleVerbindung(args: {
  clientId: string;
  label?: string | null;
  region?: AmazonRegion;
}): Promise<VerbindungSicht> {
  const db = await getDb();
  const [zeile] = await db
    .insert(schema.amazonConnections)
    .values({
      id: crypto.randomUUID(),
      clientId: args.clientId,
      label: args.label ?? null,
      region: args.region ?? "eu",
      status: "pending",
    })
    .returning();
  return oeffentlicheSicht(zeile);
}

/**
 * Erfolg vermerken. Setzt bewusst auch `status: "active"` zurück: ein
 * geglückter Aufruf ist der einzige verlässliche Beweis, dass ein vorheriger
 * „error" vorbei ist.
 */
export async function vermerkeErfolg(clientId: string, connectionId: string): Promise<void> {
  await ladeZeile(clientId, connectionId);
  const db = await getDb();
  const jetzt = new Date();
  await db
    .update(schema.amazonConnections)
    .set({ status: "active", lastSuccessAt: jetzt, lastErrorCode: null, updatedAt: jetzt })
    .where(eq(schema.amazonConnections.id, connectionId));
}

/**
 * Fehler vermerken. `folgeStatus` kommt aus mapAmazonError — der Code entscheidet
 * den Zustandswechsel, nicht der Aufrufer (D184). `null` heißt: Status bleibt,
 * nur der Zeitstempel wird gesetzt (z. B. bei Drosselung).
 */
export async function vermerkeFehler(
  clientId: string,
  connectionId: string,
  fehler: { code: string; folgeStatus: AmazonConnectionStatus | null },
): Promise<void> {
  await ladeZeile(clientId, connectionId);
  const db = await getDb();
  const jetzt = new Date();
  await db
    .update(schema.amazonConnections)
    .set({
      ...(fehler.folgeStatus ? { status: fehler.folgeStatus } : {}),
      lastErrorAt: jetzt,
      lastErrorCode: fehler.code,
      updatedAt: jetzt,
    })
    .where(eq(schema.amazonConnections.id, connectionId));
}

/**
 * Verbindung trennen. Der Refresh Token wird GELÖSCHT, nicht nur der Status
 * geändert — „disconnected" mit noch liegendem Token wäre eine Zeitbombe. Die
 * Metadaten (Seller-ID, Marktplätze, Fehlerhistorie) bleiben für die
 * Nachvollziehbarkeit stehen; das Audit-Log schreibt der Aufrufer.
 */
export async function trenneVerbindung(clientId: string, connectionId: string): Promise<VerbindungSicht> {
  const vorher = await ladeZeile(clientId, connectionId);
  const db = await getDb();
  const jetzt = new Date();
  const [zeile] = await db
    .update(schema.amazonConnections)
    .set({
      status: "disconnected",
      encryptedRefreshToken: null,
      tokenFingerprint: null,
      revokedAt: vorher.revokedAt ?? jetzt,
      updatedAt: jetzt,
    })
    .where(eq(schema.amazonConnections.id, connectionId))
    .returning();
  return oeffentlicheSicht(zeile);
}

/**
 * Rohzeile inkl. Token-Spalten — nur für den OAuth-Callback (Fingerprint-Vergleich)
 * und Tests. Bewusst sperrig benannt, damit ein Aufruf im Review auffällt; die
 * Mandantenprüfung läuft trotzdem mit.
 */
export async function ladeRohzeileMitMandantenpruefung(
  clientId: string,
  connectionId: string,
): Promise<VerbindungZeile> {
  return ladeZeile(clientId, connectionId);
}
