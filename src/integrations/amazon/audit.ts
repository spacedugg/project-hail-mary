/**
 * Audit-Protokoll (D263).
 *
 * Zweck: Jede Zustandsänderung und jeder Amazon-Schreibvorgang muss im Nachhinein
 * beantwortbar machen — wer, wann, was, mit welchem Vorher/Nachher, und unter
 * welcher Amazon-Request-ID. Ohne die Request-ID ist ein Support-Fall bei Amazon
 * praktisch nicht führbar.
 *
 * Harte Regel: `vorher`/`nachher` dürfen keine Tokens und keine personenbezogenen
 * Käuferdaten enthalten. Das ist keine Empfehlung, sondern Bedingung unserer
 * Amazon-Registrierung — deshalb filtert `entferneGeheimnisse()` bekannte
 * Schlüsselnamen heraus, statt sich darauf zu verlassen, dass jeder Aufrufer
 * daran denkt (D184: was Code prüfen kann, prüft Code).
 */

import { getDb, schema } from "@/db/client";

/** Schlüsselnamen, die niemals in einem Audit-Eintrag landen dürfen. */
const GEHEIM = [
  "token",
  "refreshtoken",
  "refresh_token",
  "accesstoken",
  "access_token",
  "encryptedrefreshtoken",
  "encrypted_refresh_token",
  "tokenfingerprint",
  "token_fingerprint",
  "secret",
  "clientsecret",
  "client_secret",
  "password",
  "passwordhash",
  "password_hash",
  "authorization",
  "spapi_oauth_code",
  "statehash",
  "state_hash",
];

const istGeheim = (schluessel: string) => GEHEIM.includes(schluessel.toLowerCase().replace(/[-\s]/g, ""));

/**
 * Rekursiv alle verdächtigen Felder ersetzen. Bewusst kein Löschen, sondern
 * `"[entfernt]"` — so ist im Audit sichtbar, DASS dort etwas stand.
 */
export function entferneGeheimnisse(wert: unknown, tiefe = 0): unknown {
  if (tiefe > 8 || wert === null || typeof wert !== "object") return wert;
  if (Array.isArray(wert)) return wert.map((e) => entferneGeheimnisse(e, tiefe + 1));

  const ergebnis: Record<string, unknown> = {};
  for (const [schluessel, inhalt] of Object.entries(wert as Record<string, unknown>)) {
    ergebnis[schluessel] = istGeheim(schluessel) ? "[entfernt]" : entferneGeheimnisse(inhalt, tiefe + 1);
  }
  return ergebnis;
}

export type AuditEintrag = {
  /** Punktnotation, z. B. "amazon.connection.authorized". */
  action: string;
  entityType: string;
  entityId?: string | null;
  clientId?: string | null;
  brandId?: string | null;
  connectionId?: string | null;
  userId?: string | null;
  vorher?: unknown;
  nachher?: unknown;
  amazonRequestId?: string | null;
};

/**
 * Audit-Eintrag schreiben. Schlägt das fehl, darf es den auslösenden Vorgang
 * NICHT mitreißen — ein verlorener Protokolleintrag ist schlimm, ein wegen
 * Protokollierung abgebrochener Amazon-Aufruf ist schlimmer (halber Zustand bei
 * Amazon, nichts bei uns). Der Fehler geht deshalb nur ins Server-Log.
 */
export async function schreibeAuditLog(eintrag: AuditEintrag): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(schema.auditLogs).values({
      id: crypto.randomUUID(),
      action: eintrag.action,
      entityType: eintrag.entityType,
      entityId: eintrag.entityId ?? null,
      clientId: eintrag.clientId ?? null,
      brandId: eintrag.brandId ?? null,
      connectionId: eintrag.connectionId ?? null,
      userId: eintrag.userId ?? null,
      beforeData: eintrag.vorher === undefined ? null : entferneGeheimnisse(eintrag.vorher),
      afterData: eintrag.nachher === undefined ? null : entferneGeheimnisse(eintrag.nachher),
      amazonRequestId: eintrag.amazonRequestId ?? null,
    });
  } catch (e) {
    console.error("[audit] Eintrag konnte nicht geschrieben werden:", eintrag.action, e);
  }
}
