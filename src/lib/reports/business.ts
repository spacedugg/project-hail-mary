/**
 * Business-Report-Parser („Verkäufe & Traffic nach untergeordnetem Artikel").
 * Portiert nach den reporting-main-Prinzipien (knowledge/sources §4):
 * - Header-Aliasing DE/EN, tolerant gegen Layout-Varianten
 * - Zahlenformat aus den DATEN erkannt (deutsch "1.234,56" vs. US "1,234.56")
 * - Alle Raten aus Roh-Summen re-berechnet, NIE aus der Datei übernommen
 * - Buybox sitzungsgewichtet; Orders = Bestellposten (Fallback Einheiten) —
 *   die im Bestand gefundene Doppel-Definition wird hier EINMAL festgelegt.
 */

export type BusinessRow = {
  asin: string;
  title: string;
  sessions: number;
  pageViews: number;
  buyBoxPct: number | null; // %
  units: number;
  orderItems: number | null; // Bestellposten
  revenue: number; // €
};

export type BusinessTotals = {
  sessions: number;
  pageViews: number;
  units: number;
  orders: number; // Bestellposten, Fallback Einheiten
  revenue: number;
  cvr: number | null; // orders / sessions
  unitCvr: number | null; // units / sessions
  buyBoxPct: number | null; // sitzungsgewichtet
  rowCount: number;
};

function parseCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Zahlformat aus Geld-Zellen erkennen (reporting-main-Muster), dann tolerant parsen. */
function makeNumParser(sampleCells: string[]): (s: string | undefined) => number {
  const sample = sampleCells.join(" ");
  // deutsch: 1.234,56 — US: 1,234.56. Entscheider: letztes Trennzeichen vor Dezimalstellen.
  const german = /\d,\d{2}(\D|$)/.test(sample) || (!/\d\.\d{2}(\D|$)/.test(sample) && sample.includes(","));
  return (s) => {
    if (!s) return 0;
    let t = s.replace(/[€%\s ]/g, "");
    if (german) t = t.replace(/\./g, "").replace(",", ".");
    else t = t.replace(/,/g, "");
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : 0;
  };
}

export function parseBusinessReport(text: string): { rows: BusinessRow[]; totals: BusinessTotals } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error("Report zu kurz — Header + Datenzeilen erwartet.");
  const sep = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const header = parseCsvLine(lines[0], sep).map((h) => h.toLowerCase().trim());

  const find = (...needles: string[]) => {
    for (const n of needles) {
      const i = header.findIndex((h) => h.includes(n));
      if (i >= 0) return i;
    }
    return -1;
  };
  const asinIdx = find("untergeordnete", "child asin", "(child)", "asin");
  if (asinIdx === -1) throw new Error('Keine ASIN-Spalte gefunden — ist das der Business Report „nach untergeordnetem Artikel"?');
  const titleIdx = find("titel", "title");
  const sessIdx = find("sitzungen – gesamt", "sitzungen - gesamt", "sitzungen – summe", "sessions - total", "sitzungen", "sessions");
  const pvIdx = find("seitenaufrufe", "page views");
  const bbIdx = find("einkaufswagen", "buy box", "featured offer");
  const unitsIdx = find("bestellte einheiten", "units ordered");
  const itemsIdx = find("bestellposten", "total order items");
  const revIdx = find("umsätze", "erzielter umsatz", "ordered product sales", "umsatz");
  if (sessIdx === -1 || unitsIdx === -1 || revIdx === -1)
    throw new Error("Pflicht-Spalten fehlen (Sitzungen / Bestellte Einheiten / Umsatz).");

  const dataLines = lines.slice(1).map((l) => parseCsvLine(l, sep));
  const num = makeNumParser(dataLines.slice(0, 20).map((c) => `${c[revIdx] ?? ""} ${c[bbIdx] ?? ""}`));

  const rows: BusinessRow[] = dataLines
    .map((c) => ({
      asin: (c[asinIdx] ?? "").trim().toUpperCase(),
      title: titleIdx >= 0 ? (c[titleIdx] ?? "").trim() : "",
      sessions: Math.round(num(c[sessIdx])),
      pageViews: pvIdx >= 0 ? Math.round(num(c[pvIdx])) : 0,
      buyBoxPct: bbIdx >= 0 && (c[bbIdx] ?? "").trim() !== "" ? num(c[bbIdx]) : null,
      units: Math.round(num(c[unitsIdx])),
      orderItems: itemsIdx >= 0 && (c[itemsIdx] ?? "").trim() !== "" ? Math.round(num(c[itemsIdx])) : null,
      revenue: num(c[revIdx]),
    }))
    .filter((r) => /^B[A-Z0-9]{9}$/.test(r.asin));
  if (rows.length === 0) throw new Error("Keine Datenzeilen mit gültiger ASIN gefunden.");

  const sum = (f: (r: BusinessRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  const sessions = sum((r) => r.sessions);
  const units = sum((r) => r.units);
  const orders = rows.some((r) => r.orderItems !== null) ? sum((r) => r.orderItems ?? 0) : units;
  const bbRows = rows.filter((r) => r.buyBoxPct !== null && r.sessions > 0);
  const bbWeighted = bbRows.length
    ? bbRows.reduce((s, r) => s + (r.buyBoxPct ?? 0) * r.sessions, 0) / bbRows.reduce((s, r) => s + r.sessions, 0)
    : null;

  return {
    rows,
    totals: {
      sessions,
      pageViews: sum((r) => r.pageViews),
      units,
      orders,
      revenue: Math.round(sum((r) => r.revenue) * 100) / 100,
      cvr: sessions > 0 ? Math.round((orders / sessions) * 1000) / 10 : null,
      unitCvr: sessions > 0 ? Math.round((units / sessions) * 1000) / 10 : null,
      buyBoxPct: bbWeighted !== null ? Math.round(bbWeighted * 10) / 10 : null,
      rowCount: rows.length,
    },
  };
}
