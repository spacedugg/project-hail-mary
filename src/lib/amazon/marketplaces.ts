import type { Marketplace } from "@/db/schema";

/**
 * Marktplatz-Kennungen für SP-API-Payloads (docs/amazon-content-contract.md §7).
 * Quelle: SP-API „Marketplace IDs". `language_tag` ist die Standard-Locale des
 * jeweiligen Marktplatzes — jeder lokalisierte Attributwert braucht BEIDE.
 */
export const MARKTPLAETZE: Record<Marketplace, { id: string; languageTag: string; land: string; domain: string }> = {
  de: { id: "A1PA6795UKMFR9", languageTag: "de_DE", land: "Deutschland", domain: "amazon.de" },
  uk: { id: "A1F83G8C2ARO7P", languageTag: "en_GB", land: "Vereinigtes Königreich", domain: "amazon.co.uk" },
  fr: { id: "A13V1IB3VIYZZH", languageTag: "fr_FR", land: "Frankreich", domain: "amazon.fr" },
  it: { id: "APJ6JRA9NG5V4", languageTag: "it_IT", land: "Italien", domain: "amazon.it" },
  es: { id: "A1RKKUPIHCS9HS", languageTag: "es_ES", land: "Spanien", domain: "amazon.es" },
  nl: { id: "A1805IZSGTT6HS", languageTag: "nl_NL", land: "Niederlande", domain: "amazon.nl" },
  us: { id: "ATVPDKIKX0DER", languageTag: "en_US", land: "USA", domain: "amazon.com" },
};

export function marktplatz(mp: Marketplace) {
  return MARKTPLAETZE[mp] ?? MARKTPLAETZE.de;
}
