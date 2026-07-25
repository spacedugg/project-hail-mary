import type { Marketplace } from "@/db/schema";
import { marktplatz } from "./marketplaces";
import { GALERIE_SLOTS, slotDef, type ContentSlot } from "./attributes";

/**
 * Payload-Bau für die SP-API Listings Items 2021-08-01
 * (docs/amazon-content-contract.md §3).
 *
 * Der Code erzeugt den Payload heute schon vollständig — auch OHNE API-Zugang.
 * Das ist Absicht: Der Payload ist prüfbar, exportierbar und im Kundengespräch
 * vorzeigbar; sobald die Zulassung da ist, wird er nur noch abgeschickt.
 */

export type PublishInput = {
  /** Verkäufer-SKU — der Schlüssel, an dem Amazon das Listing findet. */
  sku: string;
  /** true, wenn ersatzweise die ASIN als SKU einspringt (keine echte SKU hinterlegt). */
  skuIstNotbehelf?: boolean;
  /**
   * Plätze, die bei strenger Marke noch die Kundenfreigabe brauchen.
   * Leer/undefined = keine Pflicht oder alles abgesichert.
   */
  ohneKundenfreigabe?: string[];
  asin?: string | null;
  /** Amazon-Produkttyp als TOKEN (feed_product_type). Pflicht für die API. */
  productType?: string | null;
  marketplace: Marketplace;
  title?: string | null;
  bullets?: string[];
  description?: string | null;
  backendKeywords?: string | null;
  mainImageUrl?: string | null;
  /** Index 0 = Galeriebild 1. */
  galleryImageUrls?: string[];
};

export type LokalisierterWert = { value: string; marketplace_id: string; language_tag: string };
export type MedienWert = { media_location: string; marketplace_id: string };

export type PatchOperation = {
  op: "replace" | "add" | "delete" | "merge";
  path: string;
  value?: unknown;
};

export type ListingsPatchRequest = {
  productType: string;
  patches: PatchOperation[];
};

/** Query-Parameter des PATCH-Aufrufs — VALIDATION_PREVIEW ist der Pflicht-Trockenlauf. */
export type ListingsRequestMeta = {
  method: "PATCH";
  path: string;
  query: Record<string, string>;
};

const leer = (s?: string | null) => !s || !s.trim();

export function lokalisiert(text: string, mp: Marketplace): LokalisierterWert {
  const m = marktplatz(mp);
  return { value: text.trim(), marketplace_id: m.id, language_tag: m.languageTag };
}

export function medien(url: string, mp: Marketplace): MedienWert {
  // Locator-Attribute tragen KEIN language_tag (Kontrakt §3.3 Regel 2).
  return { media_location: url.trim(), marketplace_id: marktplatz(mp).id };
}

/**
 * JSON-Patch-Request bauen. Nur befüllte Slots erzeugen eine Operation —
 * ein leerer Slot darf NIE als leerer Wert rausgehen (das würde den Live-Wert
 * löschen; gleiche Logik wie `PartialUpdate` bei der Flat File).
 */
export function buildListingsPatchRequest(input: PublishInput): ListingsPatchRequest {
  const mp = input.marketplace;
  const patches: PatchOperation[] = [];
  const add = (slot: ContentSlot, value: unknown) => {
    const def = slotDef(slot);
    if (!def?.jsonAttribut) return;
    patches.push({ op: "replace", path: `/attributes/${def.jsonAttribut}`, value });
  };

  if (!leer(input.title)) add("title", [lokalisiert(input.title!, mp)]);

  const bullets = (input.bullets ?? []).filter((b) => !leer(b));
  // bullet_point geht immer als komplettes Array raus (Kontrakt §3.3 Regel 3).
  if (bullets.length) add("bullets", bullets.slice(0, 5).map((b) => lokalisiert(b, mp)));

  if (!leer(input.description)) add("description", [lokalisiert(input.description!, mp)]);
  if (!leer(input.backendKeywords)) add("backend_keywords", [lokalisiert(input.backendKeywords!, mp)]);
  if (!leer(input.mainImageUrl)) add("main_image", [medien(input.mainImageUrl!, mp)]);

  (input.galleryImageUrls ?? []).forEach((url, i) => {
    if (leer(url) || i >= GALERIE_SLOTS.length) return;
    add(GALERIE_SLOTS[i] as ContentSlot, [medien(url, mp)]);
  });

  // Kein Ersatzwert: Ein erfundener Produkttyp („PRODUCT") würde von Amazon
  // abgelehnt und im Payload wie ein gültiger Wert aussehen. Fehlt er, bleibt
  // das Feld leer und sichtbar — das Publish-Gate blockt ohnehin.
  return { productType: (input.productType ?? "").trim(), patches };
}

/**
 * Der vollständige Aufruf inkl. Query — `mode` ist bewusst ein Pflicht-Argument,
 * damit ein echter Push nie versehentlich als Default passiert.
 */
export function buildListingsRequestMeta(
  sellerId: string,
  input: PublishInput,
  mode: "VALIDATION_PREVIEW" | "PUBLISH",
): ListingsRequestMeta {
  const m = marktplatz(input.marketplace);
  const query: Record<string, string> = {
    marketplaceIds: m.id,
    issueLocale: m.languageTag,
  };
  if (mode === "VALIDATION_PREVIEW") query.mode = "VALIDATION_PREVIEW";
  return {
    method: "PATCH",
    path: `/listings/2021-08-01/items/${sellerId}/${encodeURIComponent(input.sku)}`,
    query,
  };
}

/** Menschlich lesbare cURL-Vorschau — für Kundengespräch, Doku und Fehlersuche. */
export function alsCurl(sellerId: string, input: PublishInput, mode: "VALIDATION_PREVIEW" | "PUBLISH"): string {
  const meta = buildListingsRequestMeta(sellerId, input, mode);
  const qs = new URLSearchParams(meta.query).toString();
  const body = JSON.stringify(buildListingsPatchRequest(input), null, 2);
  return [
    `curl -X ${meta.method} "https://sellingpartnerapi-eu.amazon.com${meta.path}?${qs}" \\`,
    `  -H "x-amz-access-token: $LWA_TOKEN" \\`,
    `  -H "content-type: application/json" \\`,
    `  -d '${body}'`,
  ].join("\n");
}
