/**
 * Marken-Kontext für Content (D149, Nutzer-Befund 22.07.: „Listing Optimizer"
 * stand im generierten Titel): Drei verkettete Fehler, drei Regeln —
 * 1. Ein Werkbank-Container-Name ist NIE eine Marke: er kommt nicht in den
 *    MARKE-Slot, sondern auf die Verbotsliste (das Gate flaggt ihn hart).
 * 2. Die Eigenmarke gehört nicht auf die Fremdmarken-Blacklist: Bei
 *    Werkbank-Aufträgen kennt der Relevanz-Filter die echte Marke nicht und
 *    flaggt sie fälschlich als fremd — das erste Wort des Original-Titels
 *    (auf Amazon fast immer die Marke) wird deshalb von der Liste genommen.
 * 3. Der Marken-Kandidat aus dem Original-Listing wird als BELEGTE Quelle in
 *    den Prompt gegeben, statt dass das Modell eine Marke rät.
 */
export function contentMarkenKontext(
  brand: { name: string; kind: "brand" | "workbench" } | undefined,
  originalTitel: string | null | undefined,
  fremdmarkenRoh: string[],
): { marke: string; eigenmarkeAusListing: string; fremdmarken: string[] } {
  const gleich = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const marke = brand && brand.kind === "brand" ? brand.name : "";
  const eigenmarkeAusListing = (originalTitel ?? "").trim().split(/\s+/)[0] ?? "";
  const fremdmarken = fremdmarkenRoh.filter(
    (m) => !(marke && gleich(m, marke)) && !(eigenmarkeAusListing.length > 1 && gleich(m, eigenmarkeAusListing)),
  );
  if (brand && brand.kind === "workbench") fremdmarken.push(brand.name);
  return { marke, eigenmarkeAusListing, fremdmarken };
}
