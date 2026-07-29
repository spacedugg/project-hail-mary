/**
 * SP-API-Endpunkte und Consent-Hosts je Region (D263).
 *
 * Warum überhaupt Regionen: Ein Seller-Account hängt an genau einer Region, und
 * ein Refresh Token gilt nur dort. Ruft man den falschen Endpunkt, kommt kein
 * hilfreicher Fehler, sondern „nicht gefunden" — deshalb wird die Region
 * gespeichert und vor jedem Aufruf geprüft, statt sie zu erraten.
 *
 * Sandbox vs. Produktion: Amazon führt beides als GETRENNTE App-Registrierungen
 * mit eigenen LWA-Credentials. Umgeschaltet wird über `AMAZON_SP_API_ENV` —
 * lokal/Preview „sandbox", in Produktion „production". Der Default ist
 * absichtlich „sandbox": ein vergessener Schalter darf nie versehentlich echte
 * Kundenlistings anfassen.
 */

import type { AmazonRegion, Marketplace } from "@/db/schema";
import { MARKTPLAETZE } from "@/lib/amazon/marketplaces";

export type SpApiUmgebung = "sandbox" | "production";

const HOSTS: Record<AmazonRegion, { produktion: string; sandbox: string }> = {
  eu: {
    produktion: "https://sellingpartnerapi-eu.amazon.com",
    sandbox: "https://sandbox.sellingpartnerapi-eu.amazon.com",
  },
  na: {
    produktion: "https://sellingpartnerapi-na.amazon.com",
    sandbox: "https://sandbox.sellingpartnerapi-na.amazon.com",
  },
  fe: {
    produktion: "https://sellingpartnerapi-fe.amazon.com",
    sandbox: "https://sandbox.sellingpartnerapi-fe.amazon.com",
  },
};

/** Login-with-Amazon-Tokenendpunkt — global, unabhängig von der Region. */
export const LWA_TOKEN_URL = "https://api.amazon.com/auth/o2/token";

/**
 * Aktive Umgebung. Alles außer explizit „production" gilt als Sandbox —
 * fail-safe in Richtung „nichts Echtes anfassen".
 */
export function umgebung(): SpApiUmgebung {
  return process.env.AMAZON_SP_API_ENV === "production" ? "production" : "sandbox";
}

/** Basis-URL für SP-API-Aufrufe dieser Region in der aktiven Umgebung. */
export function spApiBasis(region: AmazonRegion): string {
  const eintrag = HOSTS[region];
  if (!eintrag) throw new Error(`Unbekannte Amazon-Region „${region}".`);
  return umgebung() === "production" ? eintrag.produktion : eintrag.sandbox;
}

/**
 * Zu welcher Region gehört ein Marktplatz? Ableitung aus unserer eigenen
 * Marktplatz-Tabelle, damit es genau EINE Wahrheit gibt (D7). `us` ist der
 * einzige Nicht-EU-Marktplatz, den das Tool heute kennt.
 */
export function regionVonMarktplatz(mp: Marketplace): AmazonRegion {
  return mp === "us" ? "na" : "eu";
}

/**
 * Prüft, ob ein Marktplatz zur Region einer Verbindung passt. Muss VOR jedem
 * Aufruf laufen — sonst schickt man einen EU-Token gegen einen US-Endpunkt und
 * rätselt über die Fehlermeldung.
 */
export function marktplatzPasstZuRegion(mp: Marketplace, region: AmazonRegion): boolean {
  return regionVonMarktplatz(mp) === region;
}

/**
 * Consent-URL für die Autorisierung durch den Kunden.
 *
 * `version=beta` ist Pflicht, solange die App im Draft-Status ist — und laut
 * Amazon-Doku ist Draft für unseren Fall der Dauerzustand: eine Listung im
 * Selling Partner Appstore ist nicht erforderlich, um vertraute Selling Partner
 * zu autorisieren. `AMAZON_SP_API_APP_PUBLISHED=true` schaltet den Parameter ab,
 * falls die App doch einmal veröffentlicht wird.
 *
 * Der Host ist die Seller-Central-Domain des Marktplatzes, auf dem der Kunde
 * verkauft — nicht unsere Domain und nicht pauschal amazon.com.
 */
export function consentUrl(args: {
  applicationId: string;
  state: string;
  marktplatz: Marketplace;
}): string {
  // amazon.de → sellercentral.amazon.de, amazon.co.uk → sellercentral.amazon.co.uk
  const domain = MARKTPLAETZE[args.marktplatz]?.domain ?? MARKTPLAETZE.de.domain;
  const url = new URL("/apps/authorize/consent", `https://sellercentral.${domain}`);
  url.searchParams.set("application_id", args.applicationId);
  url.searchParams.set("state", args.state);
  if (process.env.AMAZON_SP_API_APP_PUBLISHED !== "true") {
    url.searchParams.set("version", "beta");
  }
  return url.toString();
}
