import { eq, desc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { uploadReport } from "@/app/actions";
import type { BusinessTotals } from "@/lib/reports/business";
import type { AdsTotals } from "@/lib/reports/ads";

export const dynamic = "force-dynamic";

const TYPES = [
  { value: "business", label: "Business Report (Verkäufe & Traffic, nach untergeordnetem Artikel)", active: true },
  { value: "ads", label: "Ads-/Kampagnenbericht (Sponsored Ads, alle Typen)", active: true },
  { value: "searchterm", label: "Search-Term-Report (Sponsored Products Suchbegriffe)", active: true },
  { value: "sqp", label: "Search Query Performance — folgt", active: false },
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
  const input = "input-base";

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">Berichte & Daten</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Geführter Upload: Berichtstyp wählen, Periode taggen, hochladen — das Tool parst, validiert und rechnet KPIs aus Roh-Summen. Später ersetzt die SP-API den Upload, die Bedienung bleibt.
      </p>

      <section className="mt-6 card p-4">
        <h2 className="sect-h">Bericht hochladen</h2>
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
            <button className="btn-primary">
              Hochladen & auswerten
            </button>
          </div>
        </form>
      </section>

      <section className="mt-6">
        <h2 className="sect-h">Upload-Historie</h2>
        <ul className="mt-2 space-y-2">
          {uploads.length === 0 && <li className="text-sm text-neutral-400">Noch keine Berichte hochgeladen.</li>}
          {uploads.map((u) => {
            const t = u.reportType === "business" ? ((u.parsed as { totals?: BusinessTotals })?.totals ?? null) : null;
            const a = u.reportType === "ads" ? ((u.parsed as { totals?: AdsTotals })?.totals ?? null) : null;
            return (
              <li key={u.id} className="card p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="tag uppercase">{u.reportType}</span>
                  <span className="font-medium">{u.fileName}</span>
                  <span className="text-neutral-400">{dateStr(u.periodStart)} – {dateStr(u.periodEnd)}</span>
                  {u.parseStatus === "ok"
                    ? <span className="pill pill-good">✓ ausgewertet</span>
                    : <span className="pill pill-bad">✕ Fehler</span>}
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
                      <div key={l} className="rounded-xl border border-hair p-2">
                        <div className="text-sm font-semibold tabular-nums">{v}</div>
                        <div className="text-[10px] text-neutral-500">{l}</div>
                      </div>
                    ))}
                  </div>
                )}
                {a && (
                  <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {[
                      ["Ad-Spend", `${fmt(Math.round(a.spend))} €`],
                      ["PPC-Umsatz", `${fmt(Math.round(a.sales))} €`],
                      ["ACoS", a.acos !== null ? `${a.acos} %` : "–"],
                      ["Klicks", fmt(a.clicks)],
                      ["PPC-CR", a.cvr !== null ? `${a.cvr} %` : "–"],
                      ["Kampagnen", fmt(a.campaignCount)],
                    ].map(([l, v]) => (
                      <div key={l} className="rounded-xl border border-hair p-2">
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
