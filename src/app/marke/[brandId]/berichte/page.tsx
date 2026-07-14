import { eq, desc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { uploadReport } from "@/app/actions";
import type { BusinessTotals } from "@/lib/reports/business";

export const dynamic = "force-dynamic";

const TYPES = [
  { value: "business", label: "Business Report (Verkäufe & Traffic, nach untergeordnetem Artikel)", active: true },
  { value: "sqp", label: "Search Query Performance — folgt", active: false },
  { value: "ads", label: "Ads-/Kampagnenbericht — folgt", active: false },
  { value: "searchterm", label: "Search-Term-Report — folgt", active: false },
];

const fmt = (n: number) => new Intl.NumberFormat("de-DE").format(n);
const dateStr = (d: Date | null) => (d ? d.toLocaleDateString("de-DE") : "–");

/** Berichte & Daten — geführter Upload, getaggt mit Periode; Historie je Marke. */
export default async function BerichtePage({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const db = await getDb();
  const uploads = await db.query.reportUploads.findMany({
    where: eq(schema.reportUploads.brandId, brandId),
    orderBy: desc(schema.reportUploads.createdAt),
  });
  const input = "rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900";

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">Berichte & Daten</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Geführter Upload: Berichtstyp wählen, Periode taggen, hochladen — das Tool parst, validiert und rechnet KPIs aus Roh-Summen. Später ersetzt die SP-API den Upload, die Bedienung bleibt.
      </p>

      <section className="mt-6 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Bericht hochladen</h2>
        <form action={uploadReport} className="mt-3 space-y-2">
          <input type="hidden" name="brandId" value={brandId} />
          <select name="reportType" className={`${input} w-full`} defaultValue="business">
            {TYPES.map((t) => (
              <option key={t.value} value={t.value} disabled={!t.active}>{t.label}</option>
            ))}
          </select>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-neutral-500">Periode</label>
            <input type="date" name="periodStart" required className={input} />
            <span className="text-neutral-400">–</span>
            <input type="date" name="periodEnd" required className={input} />
            <input type="file" name="file" accept=".csv,.txt" required className="text-sm" />
            <button className="rounded bg-teal-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-teal-800">
              Hochladen & auswerten
            </button>
          </div>
        </form>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Upload-Historie</h2>
        <ul className="mt-2 space-y-2">
          {uploads.length === 0 && <li className="text-sm text-neutral-400">Noch keine Berichte hochgeladen.</li>}
          {uploads.map((u) => {
            const t = u.reportType === "business" ? ((u.parsed as { totals?: BusinessTotals })?.totals ?? null) : null;
            return (
              <li key={u.id} className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono uppercase text-neutral-500 dark:bg-neutral-800">{u.reportType}</span>
                  <span className="font-medium">{u.fileName}</span>
                  <span className="text-neutral-400">{dateStr(u.periodStart)} – {dateStr(u.periodEnd)}</span>
                  {u.parseStatus === "ok"
                    ? <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">✓ ausgewertet</span>
                    : <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700 dark:bg-red-950 dark:text-red-400">✕ Fehler</span>}
                </div>
                {u.parseError && <p className="mt-1 text-xs text-red-600">{u.parseError}</p>}
                {t && (
                  <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {[
                      ["Umsatz", `${fmt(Math.round(t.revenue))} €`],
                      ["Einheiten", fmt(t.units)],
                      ["Bestellungen", fmt(t.orders)],
                      ["Sitzungen", fmt(t.sessions)],
                      ["CVR", t.cvr !== null ? `${t.cvr} %` : "–"],
                      ["Buybox", t.buyBoxPct !== null ? `${t.buyBoxPct} %` : "–"],
                    ].map(([l, v]) => (
                      <div key={l} className="rounded border border-neutral-100 p-2 dark:border-neutral-900">
                        <div className="text-sm font-semibold tabular-nums">{v}</div>
                        <div className="text-[10px] text-neutral-500">{l}</div>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
