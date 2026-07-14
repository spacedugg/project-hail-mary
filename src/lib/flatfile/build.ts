import * as XLSX from "xlsx";

/**
 * Flat-File-Modul (D46).
 * Prinzip: Amazon-Kategorievorlagen ändern sich laufend → die Agentur lädt die
 * jeweils NEUSTE Vorlage hoch (xlsx/xlsm/txt aus Seller Central). Wir extrahieren
 * die 3 Header-Zeilen + Feldnamen und erzeugen eine upload-fertige,
 * tab-getrennte TXT-Datei mit den Produktdaten aus dem Tool.
 */

export type TemplateHeaders = {
  sheetName: string | null;
  headerRows: string[][]; // exakt wie in der Vorlage (meist 3 Zeilen)
  fieldNames: string[]; // die maschinenlesbaren Feldnamen (item_sku, item_name, …)
};

const FIELD_MARKERS = ["item_sku", "item_name", "brand_name", "feed_product_type", "external_product_id"];

/** Vorlage parsen (xlsx/xlsm oder tab-getrennte txt). */
export function parseTemplate(buffer: ArrayBuffer, fileName: string): TemplateHeaders {
  if (/\.(txt|tsv)$/i.test(fileName)) {
    const text = new TextDecoder().decode(buffer);
    const rows = text.split(/\r?\n/).slice(0, 6).map((l) => l.split("\t"));
    return fromRows(rows, null);
  }
  const wb = XLSX.read(buffer, { type: "array" });
  // Sheet mit Feldnamen suchen (meist "Vorlage"/"Template", nie die Anleitung)
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[name], { header: 1, defval: "" }) as string[][];
    const probe = rows.slice(0, 6);
    if (probe.some((r) => r.some((c) => FIELD_MARKERS.includes(String(c).trim().toLowerCase()))))
      return fromRows(probe.map((r) => r.map(String)), name);
  }
  throw new Error(
    'Keine Feldnamen-Zeile gefunden (item_sku/item_name/…). Ist das eine Amazon-Kategorievorlage? Unterstützt: .xlsx/.xlsm/.txt.',
  );
}

function fromRows(rows: string[][], sheetName: string | null): TemplateHeaders {
  const fieldRowIdx = rows.findIndex((r) =>
    r.some((c) => FIELD_MARKERS.includes(String(c).trim().toLowerCase())),
  );
  if (fieldRowIdx === -1) throw new Error("Feldnamen-Zeile nicht gefunden.");
  const headerRows = rows.slice(0, fieldRowIdx + 1);
  const fieldNames = rows[fieldRowIdx].map((c) => String(c).trim());
  return { sheetName, headerRows, fieldNames };
}

export type FlatfileProduct = {
  sku: string;
  asin?: string | null;
  brand: string;
  title?: string | null;
  bullets?: string[];
  description?: string | null;
  backendKeywords?: string | null;
  productType?: string | null;
};

/** Produkt → Feldwerte (nach Amazon-Standard-Feldnamen; unbekannte Felder bleiben leer). */
export function mapProductToFields(p: FlatfileProduct): Record<string, string> {
  const f: Record<string, string> = {
    item_sku: p.sku,
    brand_name: p.brand,
    item_name: p.title ?? "",
    product_description: p.description ?? "",
    generic_keywords: p.backendKeywords ?? "",
    feed_product_type: p.productType ?? "",
    update_delete: "Update",
  };
  if (p.asin) {
    f.external_product_id = p.asin;
    f.external_product_id_type = "ASIN";
  }
  (p.bullets ?? []).slice(0, 5).forEach((b, i) => {
    f[`bullet_point${i + 1}`] = b;
  });
  return f;
}

/** Upload-fertige tab-getrennte Datei: Original-Header + gemappte Datenzeilen. */
export function buildFlatfileTxt(tpl: TemplateHeaders, products: FlatfileProduct[]): {
  content: string;
  mappedFields: string[];
  unmappedFields: string[];
} {
  const lower = tpl.fieldNames.map((f) => f.toLowerCase());
  const sample = mapProductToFields(products[0] ?? { sku: "", brand: "" });
  const mappedFields = tpl.fieldNames.filter((_, i) => sample[lower[i]] !== undefined);
  const unmappedFields = tpl.fieldNames.filter((f, i) => f && sample[lower[i]] === undefined);

  const lines = tpl.headerRows.map((r) => r.join("\t"));
  for (const p of products) {
    const values = mapProductToFields(p);
    lines.push(lower.map((f) => (values[f] ?? "").replace(/[\t\r\n]+/g, " ")).join("\t"));
  }
  return { content: lines.join("\r\n"), mappedFields, unmappedFields };
}
