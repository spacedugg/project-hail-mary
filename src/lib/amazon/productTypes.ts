/**
 * Amazon-Produkttypen (docs/amazon-content-contract.md §3.3 Regel 4).
 *
 * Die Listings-API verlangt einen TOKEN wie `DRINKING_CUP` — keine menschliche
 * Beschreibung. Verbindliche Quelle ist Amazons Product Type Definitions API
 * (`searchDefinitionsProductTypes`), die je Marktplatz die gültige Liste liefert.
 *
 * Ehrliche Grenze bis zur SP-API-Zulassung: Diese Liste hier ist eine KURATIERTE
 * AUSWAHL häufiger Typen, keine vollständige Amazon-Liste. Deshalb gilt:
 * - Freitext („Doppelwandige Thermogläser") ⇒ FEHLER, der geht sicher nicht durch.
 * - Token in unserer Liste ⇒ in Ordnung.
 * - Token-Form korrekt, aber nicht in unserer Liste ⇒ HINWEIS, kein Fehler —
 *   unsere Liste ist unvollständig, nicht Amazon.
 */

/** Kuratierte Auswahl gängiger Produkttypen (Haushalt, Küche, Textil, Elektronik, Beauty, Sport). */
export const BEKANNTE_PRODUKTTYPEN = [
  "ABIS_DRUGSTORE",
  "AIR_PURIFIER",
  "BACKPACK",
  "BATH_TOWEL",
  "BEAUTY",
  "BED_LINEN_SET",
  "BLANKET",
  "CANDLE",
  "CHAIR",
  "COFFEE_MAKER",
  "COOKWARE",
  "CUTTING_BOARD",
  "DRINKING_CUP",
  "DRINKING_STRAW",
  "ELECTRONIC_CABLE",
  "FLASHLIGHT",
  "FOOD_STORAGE_CONTAINER",
  "HAIR_STYLING_AGENT",
  "HEADPHONES",
  "HEALTH_PERSONAL_CARE",
  "HOME",
  "HOME_BED_AND_BATH",
  "HOME_FURNITURE_AND_DECOR",
  "HOUSEHOLD_CLEANING_PRODUCT",
  "KITCHEN",
  "KNIFE",
  "LAMP",
  "LUGGAGE",
  "MATTRESS",
  "NUTRITIONAL_SUPPLEMENT",
  "OFFICE_PRODUCTS",
  "OUTDOOR_LIVING",
  "PET_SUPPLIES",
  "PILLOW",
  "PORTABLE_ELECTRONIC_DEVICE_COVER",
  "POWER_SUPPLIES_OR_PROTECTION",
  "PROTECTIVE_GLOVE",
  "SHIRT",
  "SHOES",
  "SKIN_CLEANING_AGENT",
  "SKIN_MOISTURIZER",
  "SPORTING_GOODS",
  "STORAGE_BOX",
  "TABLEWARE",
  "TEA",
  "TOOLS",
  "TOYS_AND_GAMES",
  "VACUUM_CLEANER",
  "WATER_BOTTLE",
  "WRISTWATCH",
] as const;

const TOKEN_FORM = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;

export type ProdukttypBefund =
  | { stand: "fehlt" }
  | { stand: "freitext"; wert: string }
  | { stand: "bekannt"; wert: string }
  | { stand: "unbekannt"; wert: string };

/**
 * Deterministische Beurteilung eines Produkttyp-Werts. Bewusst KEIN Raten:
 * Der Code sagt, was er sicher weiß, und wo unsere Liste an ihre Grenze kommt.
 */
export function pruefeProdukttyp(wert: string | null | undefined): ProdukttypBefund {
  const t = (wert ?? "").trim();
  if (!t) return { stand: "fehlt" };
  if (!TOKEN_FORM.test(t)) return { stand: "freitext", wert: t };
  return BEKANNTE_PRODUKTTYPEN.includes(t as (typeof BEKANNTE_PRODUKTTYPEN)[number])
    ? { stand: "bekannt", wert: t }
    : { stand: "unbekannt", wert: t };
}

/**
 * Aus einer menschlichen Beschreibung einen Token-VORSCHLAG ableiten
 * (z. B. „Doppelwandige Thermogläser" → DRINKING_CUP). Nur ein Vorschlag zum
 * Bestätigen — nie automatisch gesetzt, sonst wäre es geraten.
 */
export function schlageProdukttypVor(beschreibung: string | null | undefined): string | null {
  const s = (beschreibung ?? "").toLowerCase();
  if (!s.trim()) return null;
  // Bewusst OHNE Wortgrenzen: Deutsche Komposita („Thermogläser", „Edelstahl-
  // Trinkflasche") würden sonst nie greifen. Reihenfolge = Vorrang, spezifische
  // Begriffe zuerst.
  const treffer: Array<[RegExp, string]> = [
    [/(trinkflasche|wasserflasche|isolierflasche|thermosflasche|water bottle)/, "WATER_BOTTLE"],
    [/(taschenlampe|flashlight)/, "FLASHLIGHT"],
    [/(schneidebrett|cutting board)/, "CUTTING_BOARD"],
    [/(bettwäsche|bettwaesche|bettbezug|spannbettlaken|bed linen)/, "BED_LINEN_SET"],
    [/(handtuch|handtücher|handtuecher|badetuch|towel)/, "BATH_TOWEL"],
    [/(vorratsdose|frischhaltedose|food storage)/, "FOOD_STORAGE_CONTAINER"],
    [/(aufbewahrungsbox|storage box)/, "STORAGE_BOX"],
    [/(kopfhörer|kopfhoerer|headphone)/, "HEADPHONES"],
    [/(gläser|glaeser|glas\b|becher|tasse|tassen|mug|drinking cup)/, "DRINKING_CUP"],
    [/(kissen|pillow)/, "PILLOW"],
    [/(decke|blanket)/, "BLANKET"],
    [/(messer|knife)/, "KNIFE"],
    [/(pfanne|kochtopf|cookware)/, "COOKWARE"],
    [/(kerze|candle)/, "CANDLE"],
    [/(rucksack|backpack)/, "BACKPACK"],
    [/(koffer|luggage|trolley)/, "LUGGAGE"],
    [/(lampe|leuchte|\blamp\b)/, "LAMP"],
    [/(kabel|cable)/, "ELECTRONIC_CABLE"],
    [/(handschuh|glove)/, "PROTECTIVE_GLOVE"],
    [/(geschirr|teller|tableware)/, "TABLEWARE"],
    [/\b(tee|tea)\b/, "TEA"],
  ];
  return treffer.find(([re]) => re.test(s))?.[1] ?? null;
}
