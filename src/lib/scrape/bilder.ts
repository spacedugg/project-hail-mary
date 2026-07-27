/**
 * Bild-URL-Bereinigung (D216, Nutzer-Befund 27.07.).
 *
 * Amazon liefert dasselbe Galerie-Bild in MEHREREN Größen-Varianten — gleiche
 * Bild-ID, unterschiedliche Größen-Endung (`._AC_SL1500_.jpg` vs `._SX300_.jpg`).
 * Der Scrape-Actor packt solche Varianten teils alle in `imageUrlList`. Ungefiltert
 * entstehen daraus Geister-Slots (Slot 8/9), deren winzige Variante zu klein für die
 * Vision-Auslese ist → „nicht auslesbar" + verpixelt angezeigt, obwohl dasselbe Bild
 * längst in Slot 1/2 in groß steht.
 *
 * Fix an der Quelle: je Bild-ID nur EINE Variante behalten — die größte. Reihenfolge
 * des ersten Auftretens bleibt erhalten. Nicht-Amazon-URLs werden nur exakt entdoppelt.
 */

/** Amazon-Bild-ID (Teil vor der ersten Größen-/Format-Endung), sonst die URL ohne Query. */
function bildId(u: string): string {
  const m = u.match(/\/images\/I\/([^./]+)\./);
  return m ? m[1] : u.split("?")[0];
}

/** Größte in der URL deklarierte Kantenlänge (SL/SX/SY/UL/UX/UY-Token); 0 wenn keine. */
function variantenGroesse(u: string): number {
  let max = 0;
  for (const m of u.matchAll(/_(?:S[LXY]|U[LXY])(\d+)_/g)) max = Math.max(max, Number(m[1]));
  return max;
}

export function bereinigeBildUrls(urls: string[]): string[] {
  const best = new Map<string, { url: string; size: number; order: number }>();
  urls.forEach((u, i) => {
    if (!u) return;
    const key = bildId(u);
    const size = variantenGroesse(u);
    const vorhanden = best.get(key);
    if (!vorhanden) best.set(key, { url: u, size, order: i });
    else if (size > vorhanden.size) best.set(key, { url: u, size, order: vorhanden.order }); // größere Variante, Erst-Reihenfolge behalten
  });
  return [...best.values()].sort((a, b) => a.order - b.order).map((v) => v.url);
}
