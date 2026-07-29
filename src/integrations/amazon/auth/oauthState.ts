/**
 * OAuth-State für den Amazon-Autorisierungsfluss (D263).
 *
 * Zwei Angriffe werden hier abgewehrt:
 * 1. **CSRF** — jemand schiebt uns einen fremden `spapi_oauth_code` unter. Der
 *    State ist 32 Byte Zufall, wir haben ihn ausgegeben, also gilt nur unser Wert.
 * 2. **Mandantenverwechslung** — der Callback landet beim falschen Kunden. Der
 *    State ist an user_id, client_id UND connection_id gebunden; der Callback
 *    liest den Kunden NICHT aus der URL, sondern aus dem State-Eintrag.
 *
 * Drei Eigenschaften, die im Code (nicht in der Absicht) erzwungen werden:
 * - **Gespeichert wird nur der SHA-256-Hash.** Eine abgeflossene Zeile erlaubt
 *   keinen Replay, weil daraus der State-Wert nicht rekonstruierbar ist.
 * - **Kurze Frist** (10 Minuten). Amazons `spapi_oauth_code` lebt 5 Minuten,
 *   länger brauchen wir nicht.
 * - **Einmalverwendung per bedingtem UPDATE** (`WHERE used_at IS NULL … RETURNING`).
 *   Bei einem Doppel-Callback gewinnt genau einer — das entscheidet die
 *   Datenbank, nicht eine if-Abfrage im Anwendungscode (D184).
 */

import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { getDb, schema } from "@/db/client";

/** Gültigkeit eines State-Werts. Kurz halten — er wird binnen Sekunden benutzt. */
export const STATE_TTL_MS = 10 * 60 * 1000;

export type StateBindung = {
  userId: string;
  clientId: string;
  connectionId: string;
};

export type StateVerbrauch =
  | { ok: true; bindung: StateBindung }
  | { ok: false; grund: "unbekannt" | "abgelaufen" | "bereits_verwendet" };

const hash = (wert: string) => createHash("sha256").update(wert, "utf8").digest("hex");

/**
 * Neuen State erzeugen und binden. Rückgabe ist der KLARTEXT-State — er gehört
 * in die Amazon-Consent-URL und sonst nirgendwohin (nicht ins Log).
 */
export async function erzeugeState(bindung: StateBindung): Promise<string> {
  const db = await getDb();
  const state = randomBytes(32).toString("base64url");
  await db.insert(schema.amazonOauthStates).values({
    id: crypto.randomUUID(),
    stateHash: hash(state),
    userId: bindung.userId,
    clientId: bindung.clientId,
    connectionId: bindung.connectionId,
    expiresAt: new Date(Date.now() + STATE_TTL_MS),
  });
  return state;
}

/**
 * State einlösen. Erfolg heißt: existierte, war nicht abgelaufen, war unbenutzt —
 * und ist ab jetzt verbraucht. Der zurückgegebene Mandant ist die einzige
 * gültige Quelle für „für welchen Kunden gilt dieser Callback".
 */
export async function verbraucheState(state: string): Promise<StateVerbrauch> {
  const db = await getDb();
  const jetzt = new Date();
  const stateHash = hash(state);

  // Ein einziges Statement: markiert und liefert zurück, aber nur wenn noch
  // unbenutzt UND nicht abgelaufen. Ein zweiter, gleichzeitiger Callback bekommt
  // ein leeres Ergebnis und kann nicht ebenfalls „ok" sein.
  const getroffen = await db
    .update(schema.amazonOauthStates)
    .set({ usedAt: jetzt })
    .where(
      and(
        eq(schema.amazonOauthStates.stateHash, stateHash),
        isNull(schema.amazonOauthStates.usedAt),
        // Ablaufprüfung absichtlich in der Datenbank, nicht gegen eine JS-Uhr:
        // bei Serverless laufen Instanzen in getrennten Prozessen, die Datenbank
        // ist die einzige gemeinsame Zeitquelle.
        lt(sql`now()`, schema.amazonOauthStates.expiresAt),
      ),
    )
    .returning({
      userId: schema.amazonOauthStates.userId,
      clientId: schema.amazonOauthStates.clientId,
      connectionId: schema.amazonOauthStates.connectionId,
    });

  if (getroffen.length === 1) return { ok: true, bindung: getroffen[0] };

  // Kein Treffer — für eine brauchbare Fehlermeldung unterscheiden WARUM.
  // Das ist reine Diagnose, die Entscheidung ist oben schon gefallen.
  const zeile = await db.query.amazonOauthStates.findFirst({
    where: eq(schema.amazonOauthStates.stateHash, stateHash),
  });
  if (!zeile) return { ok: false, grund: "unbekannt" };
  if (zeile.usedAt) return { ok: false, grund: "bereits_verwendet" };
  return { ok: false, grund: "abgelaufen" };
}

/**
 * Abgelaufene States aufräumen. Kein Cron nötig — beim Start eines neuen Flows
 * mitlaufen zu lassen reicht, die Tabelle bleibt so von sich aus klein.
 */
export async function raeumeAbgelaufeneStates(): Promise<number> {
  const db = await getDb();
  const weg = await db
    .delete(schema.amazonOauthStates)
    .where(lt(schema.amazonOauthStates.expiresAt, new Date()))
    .returning({ id: schema.amazonOauthStates.id });
  return weg.length;
}
