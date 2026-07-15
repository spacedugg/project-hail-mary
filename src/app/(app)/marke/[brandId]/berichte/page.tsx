import { eq, desc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { uploadReport } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";

export const dynamic = "force-dynamic";

const TYPES = [
  { value: "business", label: "Business Report (Verkäufe & Traffic, nach untergeordnetem Artikel)", active: true },
  { value: "ads", label: "Ads-/Kampagnenbericht (Sponsored Ads, alle Typen)", active: true },
  { value: "searchterm", label: "Search-Term-Report (Sponsored Products Suchbegriffe)", active: true },
  { value: "sqp", label: "Search Query Performance (Markenanalysen → Suchanfragenleistung)", active: true },
];

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
    <main className="w-full p-8">
      <h1 className="page-title">Berichte & Daten</h1>
      <p className="page-sub">
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
            <SubmitButton className="btn-primary" pendingLabel="Parst & rechnet…" progress>
              Hochladen & auswerten
            </SubmitButton>
          </div>
        </form>
      </section>

      {/* Perioden-Abdeckung: WAS liegt vor, WO fehlt etwas — die KPIs selbst leben im Cockpit/Advertising. */}
      <section className="mt-6 card p-4">
        <h2 className="sect-h">Perioden-Abdeckung</h2>
        <p className="mt-1 text-xs text-muted">Je Periode und Berichtstyp: ✓ ausgewertet · ✕ Fehler · – fehlt. Die Kennzahlen dazu stehen im Cockpit, unter Advertising und Sichtbarkeit.</p>
        {(() => {
          const withPeriod = uploads.filter((u) => u.periodStart && u.periodEnd && u.reportType !== "cerebro");
          if (withPeriod.length === 0) return <p className="mt-3 text-sm text-neutral-400">Noch keine Berichte hochgeladen.</p>;
          const keys = [...new Set(withPeriod.map((u) => `${u.periodStart!.getTime()}|${u.periodEnd!.getTime()}`))]
            .sort((a, b) => Number(b.split("|")[0]) - Number(a.split("|")[0]));
          const types = ["business", "ads", "searchterm", "sqp"] as const;
          const label: Record<string, string> = { business: "Business", ads: "Ads", searchterm: "Search-Term", sqp: "SQP" };
          return (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hair text-left text-[11px] uppercase text-neutral-500">
                    <th className="py-1 pr-3">Periode</th>
                    {types.map((t) => <th key={t} className="pr-3">{label[t]}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => {
                    const [s, e] = k.split("|").map(Number);
                    return (
                      <tr key={k} className="border-b border-hair last:border-0">
                        <td className="py-1.5 pr-3 font-medium tabular-nums">{dateStr(new Date(s))} – {dateStr(new Date(e))}</td>
                        {types.map((t) => {
                          const hits = withPeriod.filter((u) => u.reportType === t && u.periodStart!.getTime() === s && u.periodEnd!.getTime() === e);
                          const ok = hits.find((u) => u.parseStatus === "ok");
                          const err = !ok && hits.find((u) => u.parseStatus === "error");
                          return (
                            <td key={t} className="pr-3">
                              {ok ? (
                                <span className="pill pill-good" title={ok.fileName}>✓</span>
                              ) : err ? (
                                <span className="pill pill-bad" title={err.parseError ?? err.fileName}>✕</span>
                              ) : (
                                <span className="text-neutral-300">–</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })()}
        {uploads.some((u) => u.parseStatus === "error") && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-bad">Fehlgeschlagene Uploads ({uploads.filter((u) => u.parseStatus === "error").length})</summary>
            <ul className="mt-1 space-y-0.5">
              {uploads.filter((u) => u.parseStatus === "error").map((u) => (
                <li key={u.id} className="text-xs text-muted"><span className="tag uppercase">{u.reportType}</span> {u.fileName}: {u.parseError}</li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </main>
  );
}
