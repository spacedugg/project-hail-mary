/**
 * SP-API-Client (D263) — die EINZIGE Stelle, an der das Tool Amazon anruft.
 *
 * Was hier zusammenläuft, damit es nicht in jeder Operation wiederholt wird:
 * - Mandantenprüfung + Aktiv-Prüfung (über das Verbindungs-Repository)
 * - Region-/Umgebungs-Auflösung (Sandbox vs. Produktion)
 * - Access-Token-Beschaffung inkl. Cache
 * - Wiederholversuche NUR bei wiederholbaren Fehlern
 * - Amazon-Request-ID einsammeln (Anker für Support-Fälle)
 * - Erfolg/Fehler am Verbindungsdatensatz vermerken
 *
 * Die Retry-Regel ist der wichtigste Teil: `mapAmazonError` entscheidet, ob ein
 * erneuter Versuch überhaupt Sinn hat (D184). Bei `invalid_grant` wird NICHT
 * wiederholt — sonst dreht das Tool in einer Endlosschleife, während der Kunde
 * längst neu autorisieren müsste.
 */

import type { Marketplace } from "@/db/schema";
import { mapAmazonError, type AmazonFehler } from "../errors/mapAmazonError";
import { holeAccessToken, LwaFehler, verwerfeAccessToken, type FetchImpl } from "../auth/accessToken";
import { marktplatzPasstZuRegion, spApiBasis } from "../regionen";
import {
  holeRefreshTokenFuerAufruf,
  vermerkeErfolg,
  vermerkeFehler,
} from "../repositories/verbindungen";

/** Zeitlimit je SP-API-Aufruf. Deutlich unter dem Vercel-Budget (D118). */
const SP_API_TIMEOUT_MS = 30_000;

/** Höchstzahl Versuche inkl. Erstversuch. Bewusst klein — Amazon drosselt hart. */
const MAX_VERSUCHE = 3;

export class SpApiFehler extends Error {
  constructor(
    readonly fehler: AmazonFehler,
    message: string,
  ) {
    super(message);
    this.name = "SpApiFehler";
  }
}

export type SpApiAntwort<T> = {
  daten: T;
  amazonRequestId: string | null;
};

export type SpApiAufruf = {
  clientId: string;
  connectionId: string;
  /** Pfad inkl. Version, z. B. "/sellers/v1/marketplaceParticipations". */
  pfad: string;
  methode?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Record<string, string | undefined>;
  body?: unknown;
  /** Wenn gesetzt, wird geprüft, ob der Marktplatz zur Region der Verbindung passt. */
  marktplatz?: Marketplace;
};

export type SpApiOptionen = {
  fetchImpl?: FetchImpl;
  /** Wartefunktion — in Tests durch eine sofort auflösende ersetzt. */
  warte?: (ms: number) => Promise<void>;
};

const schlafen = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Backoff ohne Zufall, damit Tests deterministisch bleiben: 500 ms, 1500 ms. */
const wartezeit = (versuch: number) => 500 * (2 * versuch - 1);

function requestId(headers: Headers): string | null {
  return headers.get("x-amzn-RequestId") ?? headers.get("x-amzn-requestid") ?? null;
}

/**
 * Einen SP-API-Aufruf ausführen.
 *
 * Reihenfolge der Prüfungen ist Absicht und entspricht der Vorgabe: Mandant →
 * Verbindung aktiv → Token → Region/Marktplatz → Aufruf → Ergebnis vermerken.
 * Eine getrennte Verbindung scheitert also schon in Schritt 2, ohne dass
 * überhaupt ein Token entschlüsselt wird.
 */
export async function spApiAufruf<T>(
  aufruf: SpApiAufruf,
  optionen: SpApiOptionen = {},
): Promise<SpApiAntwort<T>> {
  const fetchImpl = optionen.fetchImpl ?? fetch;
  const warte = optionen.warte ?? schlafen;

  // 1./2./3. Mandant, Aktiv-Status und Token — alles im Repository gebündelt.
  const { zeile, refreshToken } = await holeRefreshTokenFuerAufruf(aufruf.clientId, aufruf.connectionId);

  // 4. Region/Marktplatz VOR dem Aufruf prüfen. Sonst schickt man einen
  // EU-Token gegen einen US-Endpunkt und rätselt über „not found".
  if (aufruf.marktplatz && !marktplatzPasstZuRegion(aufruf.marktplatz, zeile.region)) {
    const fehler = mapAmazonError({ httpStatus: 400 });
    throw new SpApiFehler(
      fehler,
      `Marktplatz „${aufruf.marktplatz}" gehört nicht zur Region „${zeile.region}" dieser Amazon-Verbindung. Dafür ist eine eigene Verbindung nötig.`,
    );
  }

  const url = new URL(aufruf.pfad, spApiBasis(zeile.region));
  for (const [k, v] of Object.entries(aufruf.query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, v);
  }

  let letzterFehler: AmazonFehler | null = null;

  for (let versuch = 1; versuch <= MAX_VERSUCHE; versuch++) {
    // Der Token-Austausch gehört in DIESE Schleife und in dieselbe
    // Fehlerbehandlung wie der SP-API-Aufruf. Sonst fliegt ein entwerteter
    // Refresh Token an `vermerkeFehler` vorbei, die Verbindung bleibt auf
    // „active" stehen und das Tool probiert bei jeder Nutzeraktion erneut —
    // genau die Endlosschleife, die verhindert werden soll.
    let accessToken: string;
    try {
      accessToken = await holeAccessToken(aufruf.connectionId, refreshToken, fetchImpl);
    } catch (e) {
      if (!(e instanceof LwaFehler)) {
        // Fehlende Env-Variablen sind unser Konfigurationsfehler und dürfen
        // nicht als Amazon-Fehler am Kundendatensatz landen.
        throw e;
      }
      letzterFehler = e.fehler;
      if (e.fehler.wiederholbar && versuch < MAX_VERSUCHE) {
        await warte(wartezeit(versuch));
        continue;
      }
      break;
    }

    let res: Response;
    try {
      res = await fetchImpl(url.toString(), {
        method: aufruf.methode ?? "GET",
        headers: {
          "x-amz-access-token": accessToken,
          accept: "application/json",
          ...(aufruf.body ? { "content-type": "application/json" } : {}),
        },
        body: aufruf.body ? JSON.stringify(aufruf.body) : undefined,
        signal: AbortSignal.timeout(SP_API_TIMEOUT_MS),
      });
    } catch (e) {
      letzterFehler = mapAmazonError({ netzwerkFehler: e });
      if (versuch < MAX_VERSUCHE) {
        await warte(wartezeit(versuch));
        continue;
      }
      break;
    }

    if (res.ok) {
      const daten = (await res.json().catch(() => null)) as T;
      await vermerkeErfolg(aufruf.clientId, aufruf.connectionId);
      return { daten, amazonRequestId: requestId(res.headers) };
    }

    const body = await res.json().catch(() => null);
    letzterFehler = mapAmazonError({ httpStatus: res.status, body, headers: res.headers });

    // 401: der gecachte Token ist tot. Einmal verwerfen und neu holen — das ist
    // der einzige Fall, in dem ein nicht-„wiederholbarer" Fehler doch einen
    // zweiten Versuch bekommt, und nur genau einmal.
    if (res.status === 401 && versuch === 1) {
      verwerfeAccessToken(aufruf.connectionId);
      continue;
    }

    if (!letzterFehler.wiederholbar || versuch === MAX_VERSUCHE) break;
    await warte(wartezeit(versuch));
  }

  const fehler = letzterFehler ?? mapAmazonError({});
  await vermerkeFehler(aufruf.clientId, aufruf.connectionId, fehler);
  throw new SpApiFehler(fehler, fehler.meldung);
}
