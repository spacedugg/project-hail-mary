/**
 * Amazon-Fehler in eine EIGENE, geschlossene Fehlerklasse übersetzen (D263).
 *
 * Drei Aufgaben, alle drei wichtig:
 * 1. **Nichts durchsickern lassen.** Amazons Rohantworten enthalten je nach
 *    Operation Request-Details; und LWA-Fehler kommen im selben Payload wie die
 *    Tokens. Nach außen geht nur unser Code + ein deutscher Satz.
 * 2. **Retry-Entscheidung dem Code überlassen** (D184): `wiederholbar` sagt, ob
 *    ein erneuter Versuch überhaupt Sinn hat. Das verhindert die klassische
 *    Endlosschleife auf `invalid_grant` — der wird durch Warten nie besser.
 * 3. **Statuswechsel ableiten.** `folgeStatus` sagt, in welchen Zustand die
 *    Verbindung gehört. Bei entwertetem Token ist das
 *    „reauthorization_required", nicht „error" — sonst versucht das Tool ewig
 *    weiter statt den Kunden um Neu-Autorisierung zu bitten.
 */

import type { AmazonConnectionStatus } from "@/db/schema";

export type AmazonFehlerCode =
  /** Token entwertet/zurückgezogen — nur eine neue Autorisierung hilft. */
  | "auth_ungueltig"
  /** LWA-Credentials der App falsch (Client ID/Secret) — Konfigurationsfehler. */
  | "app_konfiguration"
  /** 403 — Rolle fehlt oder Marktplatz nicht autorisiert. */
  | "keine_berechtigung"
  /** 429 — Drosselung. Wiederholbar. */
  | "gedrosselt"
  /** 400 — unsere Anfrage war fehlerhaft (Payload, Produkttyp, Attribut). */
  | "eingabe_fehlerhaft"
  /** 404 — ASIN/SKU/Ressource existiert dort nicht. */
  | "nicht_gefunden"
  /** 5xx oder Netzfehler. Wiederholbar. */
  | "amazon_nicht_erreichbar"
  /** Alles, was wir nicht einordnen konnten. Nicht wiederholbar. */
  | "unbekannt";

export type AmazonFehler = {
  code: AmazonFehlerCode;
  /** Für den Nutzer sichtbarer Satz — enthält niemals Amazon-Rohtext. */
  meldung: string;
  wiederholbar: boolean;
  /** Zielstatus der Verbindung, oder null wenn der Status unberührt bleibt. */
  folgeStatus: AmazonConnectionStatus | null;
  /** Amazons x-amzn-RequestId, falls vorhanden — der Anker für Support-Tickets. */
  amazonRequestId: string | null;
  /** HTTP-Status, rein zur Diagnose in unseren eigenen Logs. */
  httpStatus: number | null;
};

const MELDUNGEN: Record<AmazonFehlerCode, string> = {
  auth_ungueltig:
    "Amazon hat die Verbindung entwertet. Der Kunde muss die Anwendung in Seller Central erneut autorisieren.",
  app_konfiguration:
    "Die Amazon-Zugangsdaten der Anwendung werden abgelehnt. Das ist ein Konfigurationsfehler auf unserer Seite, keine Aktion beim Kunden.",
  keine_berechtigung:
    "Amazon verweigert den Zugriff. Entweder fehlt der Anwendung die nötige Rolle oder der Marktplatz ist für diese Verbindung nicht autorisiert.",
  gedrosselt: "Amazon hat den Aufruf gedrosselt. Der Vorgang wird automatisch erneut versucht.",
  eingabe_fehlerhaft: "Amazon hat die übergebenen Daten abgelehnt. Die Angaben müssen korrigiert werden.",
  nicht_gefunden: "Amazon kennt den angefragten Eintrag auf diesem Marktplatz nicht.",
  amazon_nicht_erreichbar: "Amazon war nicht erreichbar. Der Vorgang wird automatisch erneut versucht.",
  unbekannt: "Der Amazon-Aufruf ist mit einem unerwarteten Fehler gescheitert.",
};

const WIEDERHOLBAR: ReadonlySet<AmazonFehlerCode> = new Set<AmazonFehlerCode>([
  "gedrosselt",
  "amazon_nicht_erreichbar",
]);

const FOLGE_STATUS: Partial<Record<AmazonFehlerCode, AmazonConnectionStatus>> = {
  auth_ungueltig: "reauthorization_required",
  keine_berechtigung: "error",
  unbekannt: "error",
  eingabe_fehlerhaft: "error",
};

/** Rohform, wie sie aus einem fetch gegen LWA oder SP-API zurückkommt. */
export type AmazonRohFehler = {
  httpStatus?: number | null;
  /** Bereits geparster Body, falls vorhanden. */
  body?: unknown;
  /** Response-Header (für x-amzn-RequestId). */
  headers?: Headers | Record<string, string> | null;
  /** Netzwerk-/Timeout-Fehler ohne HTTP-Antwort. */
  netzwerkFehler?: unknown;
};

function requestId(headers: AmazonRohFehler["headers"]): string | null {
  if (!headers) return null;
  const lesen = (name: string) =>
    headers instanceof Headers ? headers.get(name) : (headers[name] ?? headers[name.toLowerCase()]);
  return lesen("x-amzn-RequestId") ?? lesen("x-amzn-requestid") ?? null;
}

/**
 * LWA-Fehlercodes aus dem Body ziehen. LWA antwortet mit
 * `{ error: "invalid_grant" | "invalid_client" | … }` — das ist die einzige
 * Stelle, an der wir Amazons Codes überhaupt auswerten.
 */
function lwaCode(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const wert = (body as { error?: unknown }).error;
  return typeof wert === "string" ? wert : null;
}

export function mapAmazonError(roh: AmazonRohFehler): AmazonFehler {
  const httpStatus = roh.httpStatus ?? null;
  const amazonRequestId = requestId(roh.headers);

  const bauen = (code: AmazonFehlerCode): AmazonFehler => ({
    code,
    meldung: MELDUNGEN[code],
    wiederholbar: WIEDERHOLBAR.has(code),
    folgeStatus: FOLGE_STATUS[code] ?? null,
    amazonRequestId,
    httpStatus,
  });

  // Kein HTTP-Kontakt zustande gekommen: Netz, DNS, Timeout.
  if (roh.netzwerkFehler !== undefined && httpStatus === null) {
    return bauen("amazon_nicht_erreichbar");
  }

  // LWA-Codes gewinnen vor dem HTTP-Status: ein 400 mit invalid_grant ist kein
  // Eingabefehler, sondern das Ende der Verbindung.
  switch (lwaCode(roh.body)) {
    case "invalid_grant":
    case "unauthorized_client":
      return bauen("auth_ungueltig");
    case "invalid_client":
    case "unsupported_grant_type":
      return bauen("app_konfiguration");
  }

  if (httpStatus === null) return bauen("unbekannt");
  if (httpStatus === 401) return bauen("auth_ungueltig");
  if (httpStatus === 403) return bauen("keine_berechtigung");
  if (httpStatus === 404) return bauen("nicht_gefunden");
  if (httpStatus === 429) return bauen("gedrosselt");
  if (httpStatus >= 500) return bauen("amazon_nicht_erreichbar");
  if (httpStatus >= 400) return bauen("eingabe_fehlerhaft");
  return bauen("unbekannt");
}
