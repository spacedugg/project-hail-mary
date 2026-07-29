/**
 * Login with Amazon (LWA) — Token-Austausch und Access-Token-Cache (D263).
 *
 * Zwei Vorgänge, klar getrennt:
 * 1. **Einmalig bei der Autorisierung:** `spapi_oauth_code` → Refresh Token.
 *    Der Code lebt nur 5 Minuten und ist einmalig verwendbar.
 * 2. **Bei jedem Aufruf:** Refresh Token → Access Token (kurzlebig, ~1 Stunde).
 *
 * Der Access Token wird im Prozess gecacht und bis kurz VOR `expires_at`
 * wiederverwendet. Der Sicherheitsabstand ist Absicht: ein Token, der zwischen
 * Prüfung und Amazon-Aufruf abläuft, produziert einen 401, der wie ein
 * Autorisierungsproblem aussieht — und würde die Verbindung fälschlich auf
 * „reauthorization_required" setzen.
 *
 * Der Cache ist bewusst nur prozesslokal (keine DB, kein Redis): Serverless-
 * Instanzen leben kurz, und ein Access Token in der Datenbank wäre ein zweites
 * Geheimnis mehr, als es sein muss. Im schlechtesten Fall holt eine neue
 * Instanz einen neuen Token — das kostet einen HTTP-Aufruf, nichts weiter.
 */

import { LWA_TOKEN_URL, umgebung } from "../regionen";
import { mapAmazonError, type AmazonFehler } from "../errors/mapAmazonError";

/** Zeitlimit je LWA-Aufruf. Kurz halten — LWA antwortet normal in <1 s. */
const LWA_TIMEOUT_MS = 15_000;

/**
 * Wie lange vor dem echten Ablauf gilt ein Token als verbraucht. 120 s deckt
 * Netzlatenz, Uhren-Drift zwischen Amazon und Vercel und einen langsamen
 * SP-API-Aufruf ab.
 */
const SICHERHEITSABSTAND_MS = 120_000;

export type FetchImpl = typeof fetch;

export class LwaFehler extends Error {
  constructor(
    readonly fehler: AmazonFehler,
    message: string,
  ) {
    super(message);
    this.name = "LwaFehler";
  }
}

type LwaAntwort = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

function credentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.AMAZON_LWA_CLIENT_ID;
  const clientSecret = process.env.AMAZON_LWA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "AMAZON_LWA_CLIENT_ID und AMAZON_LWA_CLIENT_SECRET fehlen. Beide in Vercel unter Settings → Environment Variables setzen (Sandbox und Produktion sind getrennte App-Registrierungen mit eigenen Werten).",
    );
  }
  return { clientId, clientSecret };
}

/**
 * Absolute Redirect-URI. Muss ZEICHENGENAU der in Developer Central
 * registrierten entsprechen, sonst lehnt LWA den Code-Tausch ab. Deshalb aus
 * `APP_URL` und nicht aus `VERCEL_URL`: letztere wechselt bei jedem Deploy.
 */
export function redirectUri(): string {
  const basis = process.env.APP_URL;
  if (!basis) {
    throw new Error(
      "APP_URL fehlt. Die Produktionsadresse des Tools (z. B. https://tool.temoa.de) in Vercel setzen — sie muss exakt der in Amazon Developer Central registrierten OAuth Redirect URI entsprechen.",
    );
  }
  return new URL("/api/amazon/callback", basis).toString();
}

/** Ein LWA-Aufruf inkl. Fehlerübersetzung. Loggt niemals Body oder Antwort. */
async function lwaAufruf(
  felder: Record<string, string>,
  fetchImpl: FetchImpl,
): Promise<LwaAntwort> {
  const { clientId, clientSecret } = credentials();
  const body = new URLSearchParams({ ...felder, client_id: clientId, client_secret: clientSecret });

  let res: Response;
  try {
    res = await fetchImpl(LWA_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(LWA_TIMEOUT_MS),
    });
  } catch (e) {
    const fehler = mapAmazonError({ netzwerkFehler: e });
    throw new LwaFehler(fehler, fehler.meldung);
  }

  // Body immer lesen: LWA legt den Fehlercode dort ab, nicht in den Header.
  const daten = (await res.json().catch(() => ({}))) as LwaAntwort & { error?: string };
  if (!res.ok) {
    const fehler = mapAmazonError({ httpStatus: res.status, body: daten, headers: res.headers });
    throw new LwaFehler(fehler, fehler.meldung);
  }
  return daten;
}

/**
 * Schritt 1 der Autorisierung: `spapi_oauth_code` → Refresh Token.
 * Rückgabe ist der KLARTEXT-Refresh-Token — er gehört unmittelbar durch
 * `verschluessele()` und sonst nirgendwohin.
 */
export async function tauscheAuthorizationCode(
  code: string,
  fetchImpl: FetchImpl = fetch,
): Promise<{ refreshToken: string }> {
  const daten = await lwaAufruf(
    { grant_type: "authorization_code", code, redirect_uri: redirectUri() },
    fetchImpl,
  );
  if (!daten.refresh_token) {
    throw new LwaFehler(
      mapAmazonError({ httpStatus: 200, body: {} }),
      "Amazon hat beim Autorisieren keinen Refresh Token geliefert. Die Autorisierung muss wiederholt werden.",
    );
  }
  return { refreshToken: daten.refresh_token };
}

// ── Access-Token-Cache ───────────────────────────────────────────────────────

type CacheEintrag = { accessToken: string; gueltigBis: number };

const cache = new Map<string, CacheEintrag>();

/**
 * Cache-Schlüssel schließt die Umgebung ein: Sandbox- und Produktions-Tokens
 * dürfen sich unter keinen Umständen vermischen.
 */
const schluessel = (connectionId: string) => `${umgebung()}:${connectionId}`;

/**
 * Access Token für eine Verbindung holen — aus dem Cache oder frisch von LWA.
 *
 * `refreshToken` kommt aus `holeRefreshTokenFuerAufruf()`; diese Funktion
 * entschlüsselt nichts selbst und speichert den Refresh Token nirgends.
 */
export async function holeAccessToken(
  connectionId: string,
  refreshToken: string,
  fetchImpl: FetchImpl = fetch,
): Promise<string> {
  const key = schluessel(connectionId);
  const vorhanden = cache.get(key);
  if (vorhanden && vorhanden.gueltigBis > Date.now()) return vorhanden.accessToken;

  const daten = await lwaAufruf({ grant_type: "refresh_token", refresh_token: refreshToken }, fetchImpl);
  if (!daten.access_token) {
    throw new LwaFehler(
      mapAmazonError({ httpStatus: 200, body: {} }),
      "Amazon hat keinen Access Token geliefert.",
    );
  }

  // Ohne expires_in konservativ rechnen statt optimistisch: 1 Stunde ist der
  // dokumentierte Normalfall, aber wir wollen keinen Token verwenden, dessen
  // Laufzeit wir nur vermuten.
  const laufzeitMs = (daten.expires_in ?? 3600) * 1000;
  const gueltigBis = Date.now() + Math.max(0, laufzeitMs - SICHERHEITSABSTAND_MS);
  cache.set(key, { accessToken: daten.access_token, gueltigBis });
  return daten.access_token;
}

/**
 * Cache-Eintrag verwerfen. Nach einem 401 aufrufen, damit der nächste Versuch
 * einen frischen Token holt statt denselben abgelehnten erneut zu schicken.
 */
export function verwerfeAccessToken(connectionId: string): void {
  cache.delete(schluessel(connectionId));
}

/** Nur für Tests: kompletten Cache leeren. */
export function leereAccessTokenCache(): void {
  cache.clear();
}
