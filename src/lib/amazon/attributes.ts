import type { ContentType } from "@/db/schema";

/**
 * Der Amazon-Content-Kontrakt (docs/amazon-content-contract.md).
 *
 * EIN Slot = ein Platz auf der Produktseite. Diese Tabelle ist die Single Source
 * of Truth für BEIDE Publish-Wege: die Flat File (heute) und die SP-API (Stufe 2).
 * Ein neues Feld wird hier ergänzt — nirgends sonst.
 *
 * Ehrlichkeits-Regel: Slots, die Amazon über KEINEN der Wege annimmt
 * (Item Highlights, Q&A), stehen mit `publishWeg: "manuell"` drin, statt so zu
 * tun, als gingen sie mit.
 */

export type ContentSlot =
  | "title"
  | "bullets"
  | "description"
  | "backend_keywords"
  | "item_highlights"
  | "qa"
  | "main_image"
  | "gallery_1"
  | "gallery_2"
  | "gallery_3"
  | "gallery_4"
  | "gallery_5"
  | "gallery_6"
  | "gallery_7"
  | "gallery_8"
  | "aplus_basic"
  | "aplus_premium";

export type SlotKind = "text" | "image" | "aplus";
export type PublishWeg = "listing" | "aplus" | "manuell";
/** Form, in der Amazon den Wert erwartet (§3.2 des Kontrakts). */
export type ValueShape = "localized_text" | "media_locator" | "content_document" | "keiner";

export type SlotDef = {
  slot: ContentSlot;
  label: string;
  kind: SlotKind;
  /** Attributname in der Listings Items API — null: über diesen Weg nicht publishbar. */
  jsonAttribut: string | null;
  /** Flat-File-Feldnamen in Reihenfolge — leer: über diesen Weg nicht publishbar. */
  flatfileFelder: string[];
  valueShape: ValueShape;
  publishWeg: PublishWeg;
  /** Optimizer-Sektion, aus der das Soll kommt (falls es eine gibt). */
  contentType?: ContentType;
  /** Anzahl Einzelwerte; 1 = Einzelwert. */
  anzahl: number;
  hinweis?: string;
};

export const SLOTS: SlotDef[] = [
  {
    slot: "title",
    label: "Titel",
    kind: "text",
    jsonAttribut: "item_name",
    flatfileFelder: ["item_name"],
    valueShape: "localized_text",
    publishWeg: "listing",
    contentType: "title",
    anzahl: 1,
  },
  {
    slot: "bullets",
    label: "Bullet Points",
    kind: "text",
    jsonAttribut: "bullet_point",
    flatfileFelder: ["bullet_point1", "bullet_point2", "bullet_point3", "bullet_point4", "bullet_point5"],
    valueShape: "localized_text",
    publishWeg: "listing",
    contentType: "bullets",
    anzahl: 5,
    hinweis: "Nur als komplettes 5er-Array patchbar — einzelne Bullets kennt die API nicht.",
  },
  {
    slot: "description",
    label: "Beschreibung",
    kind: "text",
    jsonAttribut: "product_description",
    flatfileFelder: ["product_description"],
    valueShape: "localized_text",
    publishWeg: "listing",
    contentType: "description",
    anzahl: 1,
  },
  {
    slot: "backend_keywords",
    label: "Backend-Keywords",
    kind: "text",
    jsonAttribut: "generic_keyword",
    flatfileFelder: ["generic_keywords"],
    valueShape: "localized_text",
    publishWeg: "listing",
    contentType: "backend_keywords",
    anzahl: 1,
    hinweis: "Nicht auf der Produktseite sichtbar — kein Soll/Ist-Abgleich am Live-Listing möglich.",
  },
  {
    slot: "item_highlights",
    label: "Item Highlights",
    kind: "text",
    jsonAttribut: null,
    flatfileFelder: [],
    valueShape: "keiner",
    publishWeg: "manuell",
    contentType: "item_highlights",
    anzahl: 1,
    hinweis: "Weder Listings-API noch Flat File kennen ein Feld dafür — Pflege in Seller Central.",
  },
  {
    slot: "qa",
    label: "Q&A",
    kind: "text",
    jsonAttribut: null,
    flatfileFelder: [],
    valueShape: "keiner",
    publishWeg: "manuell",
    contentType: "qa",
    anzahl: 5,
    hinweis: "Kein Publish-Feld — Einstellung über die Fragen-Funktion der Produktseite.",
  },
  {
    slot: "main_image",
    label: "Hauptbild",
    kind: "image",
    jsonAttribut: "main_product_image_locator",
    flatfileFelder: ["main_image_url"],
    valueShape: "media_locator",
    publishWeg: "listing",
    anzahl: 1,
    hinweis: "Nur öffentlich erreichbare HTTPS- oder s3://-URL — Amazon lädt das Bild selbst.",
  },
  ...([1, 2, 3, 4, 5, 6, 7, 8] as const).map<SlotDef>((n) => ({
    slot: `gallery_${n}` as ContentSlot,
    label: `Galeriebild ${n}`,
    kind: "image",
    jsonAttribut: `other_product_image_locator_${n}`,
    flatfileFelder: [`other_image_url${n}`],
    valueShape: "media_locator",
    publishWeg: "listing",
    anzahl: 1,
  })),
  {
    slot: "aplus_basic",
    label: "A+ Content (Basic)",
    kind: "aplus",
    jsonAttribut: null,
    flatfileFelder: [],
    valueShape: "content_document",
    publishWeg: "aplus",
    anzahl: 1,
    hinweis: "Eigener Kanal: A+ Content API, contentType EBC — kein Listing-Attribut.",
  },
  {
    slot: "aplus_premium",
    label: "A+ Content (Premium)",
    kind: "aplus",
    jsonAttribut: null,
    flatfileFelder: [],
    valueShape: "content_document",
    publishWeg: "aplus",
    anzahl: 1,
    hinweis: "Eigener Kanal: A+ Content API, contentType EMC — kein Listing-Attribut.",
  },
];

export const SLOT_MAP: Record<string, SlotDef> = Object.fromEntries(SLOTS.map((s) => [s.slot, s]));

export function slotDef(slot: ContentSlot | string): SlotDef | undefined {
  return SLOT_MAP[slot];
}

export const GALERIE_SLOTS = SLOTS.filter((s) => s.slot.startsWith("gallery_")).map((s) => s.slot);

/** Slots, die über die Listings-API/Flat File tatsächlich rausgehen können. */
export const PUBLISHBARE_SLOTS = SLOTS.filter((s) => s.publishWeg === "listing");

/** Slots, deren Ist-Stand am Live-Listing sichtbar und damit abgleichbar ist. */
export const ABGLEICHBARE_SLOTS: ContentSlot[] = ["title", "bullets", "description", "main_image"];
